// Etapa 21 — verificación en Chrome de la salida desde la plataforma con la misión guiada A1 (Cassini → Marte), usando los
// controles del usuario: casilla «Empezar en la plataforma», filas de «Salida desde la plataforma», fases, gráfico geocéntrico,
// reproducción en el Sistema Solar principal (despegue e inyección con la cámara exterior), «Resultados» y la vuelta a la
// salida sin la opción. Uso: GPU=1 node scripts/verify-stage21-browser.mjs → capturas y registro en evidence/stage21/ (o EVIDENCE_DIR).
// Una sola instancia de Chrome y de Vite a la vez. Solo lee y pulsa la interfaz.
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const playwrightPath = path.join(process.env.LOCALAPPDATA ?? '', 'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const out = path.resolve(process.env.EVIDENCE_DIR ?? 'evidence/stage21');
await fs.mkdir(out, { recursive: true });
const PORT = 5197;
const server = await createServer({ server: { port: PORT, strictPort: true }, configFile: path.resolve('vite.config.js'), logLevel: 'error' });
await server.listen();
const gpu = process.env.GPU === '1';
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: gpu ? ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-sandbox'] });
const log = { gpu, startedAt: new Date().toISOString(), shots: [], checks: {}, errors: [], warnings: [] };

try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.on('pageerror', e => log.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') log.errors.push(m.text()); else if (m.type() === 'warning') log.warnings.push(m.text().slice(0, 160)); });
  let nudge = 0;
  const wait = async ms => { const end = Date.now() + ms; while (Date.now() < end) { await page.mouse.move(4 + (nudge ^= 1), 4); await page.waitForTimeout(Math.max(0, Math.min(200, end - Date.now()))); } };
  const click = async (selector, timeout = 30000) => {
    const until = Date.now() + timeout; let last = 'no encontrado';
    while (Date.now() < until) {
      const hit = await page.evaluate(sel => {
        const el = document.querySelector(sel); if (!el) return { ok: false, why: 'no encontrado' };
        if (el.disabled) return { ok: false, why: 'desactivado' };
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
        const r = el.getBoundingClientRect(); if (!r.width || !r.height) return { ok: false, why: 'no visible' };
        const x = r.x + r.width / 2, y = r.y + r.height / 2, top = document.elementFromPoint(x, y);
        return top === el || el.contains(top) ? { ok: true, x, y } : { ok: false, why: `tapado por ${top?.id || top?.className || top?.tagName}` };
      }, selector);
      if (hit.ok) { await page.mouse.click(hit.x, hit.y); return; }
      last = hit.why; await wait(250);
    }
    throw new Error(`clic en ${selector}: ${last}`);
  };
  const shot = async name => { await wait(500); const file = `${name}.png`; await page.screenshot({ path: path.join(out, file) }); log.shots.push(file); };
  const compute = async () => {
    await click('#im-compute');
    await page.waitForFunction(() => !document.querySelector('#im-compute').disabled && !/Calculando/.test(document.querySelector('#im-verdict').textContent), null, { timeout: 200000 });
    await wait(500);
  };
  const readPlanner = () => page.evaluate(() => {
    for (const d of document.querySelectorAll('#lab-integrated details.im-tech')) d.open = true;
    const rows = sel => [...document.querySelectorAll(`${sel} .lab-metric`)].map(r => `${r.firstElementChild.textContent}: ${r.lastElementChild.textContent}`);
    return { verdict: document.querySelector('#im-verdict').textContent.trim(), scenario: document.querySelector('#im-scenario').value, launch: document.querySelector('#im-launch').checked,
      summary: rows('#im-summary'), launchBox: { hidden: document.querySelector('#im-launch-box').hidden, rows: rows('#im-launch-tech'),
        terms: [...document.querySelectorAll('#im-launch-tech [data-term]')].map(e => e.dataset.term) },
      phases: [...document.querySelectorAll('#im-phases .im-phase')].map(p => p.querySelector('strong').textContent).slice(0, 6),
      maneuvers: [...document.querySelectorAll('#im-maneuvers tbody tr')].map(tr => tr.textContent.replace(/\s+/g, ' ').trim()),
      plotEarth: { disabled: document.querySelector('[data-ctx="earth"]').disabled } };
  });
  const hud = () => page.evaluate(() => ({ scene: document.querySelector('#lab-mission-center')?.dataset.scene ?? null, phase: document.querySelector('#mc-hud-phase')?.textContent ?? null,
    elapsed: document.querySelector('#mc-elapsed')?.textContent ?? null, status: document.querySelector('#mc-stage-status')?.textContent ?? null,
    foot: document.querySelector('#mc-foot')?.textContent?.slice(0, 120) ?? null, outcome: document.querySelector('#mc-outcome')?.textContent?.slice(0, 160) ?? null }));
  const seek = seconds => page.evaluate(t => { const i = document.querySelector('#mc-timeline'); i.value = String(t); i.dispatchEvent(new Event('input', { bubbles: true })); }, seconds);

  await page.addInitScript(() => { try { if (!sessionStorage.getItem('s21')) { localStorage.clear(); sessionStorage.setItem('s21', '1'); } } catch {} });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await wait(2000);
  await click('#app-nav-toggle'); await wait(400); await click('#app-nav-panel button[data-area="integrated"]'); await wait(1500);
  await page.waitForFunction(() => !document.querySelector('#experimental-lab').hidden, null, { timeout: 30000 });
  if (await page.locator('#im-scenario').inputValue() !== 'A1') { await page.selectOption('#im-scenario', 'A1'); await wait(300); }

  // 1 · Marcar «Empezar en la plataforma» (el escenario sigue siendo A1) y calcular.
  await click('#im-launch'); await wait(300);
  log.checks.scenarioAfterCheck = await page.locator('#im-scenario').inputValue();
  await compute();
  log.checks.plataforma = await readPlanner();
  await page.evaluate(() => document.querySelector('#im-launch-box')?.scrollIntoView({ block: 'start' })); await shot('01_planificador_salida_plataforma');
  await page.evaluate(() => document.querySelector('#im-phases')?.scrollIntoView({ block: 'start' })); await shot('02_planificador_fases');
  // 2 · Gráfico geocéntrico.
  await click('[data-ctx="earth"]'); await wait(400);
  await page.evaluate(() => document.querySelector('#im-plot')?.scrollIntoView({ block: 'center' })); await shot('03_grafico_tierra');
  // 3 · Centro de Misión: despegue (t = 0) e inyección con la cámara exterior.
  await click('#im-execute'); await wait(1500);
  await page.waitForFunction(() => { const m = document.querySelector('#lab-mission-center').dataset.vehicleModel; return m && m !== 'cargando'; }, null, { timeout: 90000 });
  await wait(2500);
  log.checks.mcAlEntrar = await hud();
  // La reproducción arranca sola: se vuelve al despegue (t = 0) con la línea de tiempo, como haría el usuario.
  await seek(0); await wait(1200);
  log.checks.mcInicio = await hud();
  await shot('04_centro_mision_despegue');
  const injMid = await page.evaluate(() => { const ev = [...document.querySelectorAll('#mc-events li, #mc-events button')].map(e => e.textContent); return ev.filter(t => /inyección|Despegue|aparcamiento|esfera de influencia terrestre/i.test(t)).slice(0, 8); });
  log.checks.eventosSalida = injMid;
  const timeline = await page.evaluate(() => Number(document.querySelector('#mc-timeline').max));
  log.checks.timelineMaxSeconds = timeline;
  // Instante a media inyección: lo da la fila de la tabla de maniobras (duración) y el aparcamiento; se busca por la fase del HUD.
  for (const t of [700, 1500, 3000, 3400]) { await seek(t); await wait(600); const h = await hud(); if (/[Ii]nyecci/.test(h.phase ?? '')) { log.checks.mcInyeccion = { t, ...h }; break; } log.checks[`mcT${t}`] = h; }
  if (await page.locator('button[data-camera="exterior"]').count()) { await click('button[data-camera="exterior"]').catch(() => {}); await wait(1500); }
  await shot('05_centro_mision_inyeccion_exterior');
  await seek(4 * 86400); await wait(800); log.checks.mcCrucero = await hud();
  // 4 · Resultados.
  await click('#lab-tabs [data-lab-tab="results"]'); await wait(800);
  log.checks.resultados = await page.evaluate(() => [...document.querySelectorAll('#lab-mission-center .lab-metric')].map(r => r.textContent.replace(/\s+/g, ' ').trim()).filter(t => /C3|Propelente|Masa final/.test(t)).slice(0, 6));
  await shot('06_resultados');
  // 5 · Volver a planificar sin la opción: la salida vuelve a ser la condición inicial.
  await click('#lab-tabs [data-lab-tab="playback"]').catch(() => {});
  await page.evaluate(() => document.querySelector('#experimental-lab [data-lab-stage="plan"], #lab-rail [data-stage="plan"]')?.click()); await wait(1200);
  await page.waitForFunction(() => document.querySelector('#lab-integrated')?.checkVisibility(), null, { timeout: 30000 });
  await click('#im-launch'); await wait(300);
  await compute();
  log.checks.sinPlataforma = await readPlanner();
  // 6 · Móvil (390 px): la casilla y su explicación se ajustan sin desbordar la página.
  await page.setViewportSize({ width: 390, height: 844 }); await wait(1200);
  await page.evaluate(() => document.querySelector('#im-launch')?.closest('label')?.scrollIntoView({ block: 'center' })); await shot('07_movil_casilla_plataforma');
  log.checks.movil = await page.evaluate(() => { const l = document.querySelector('#im-launch').closest('label').getBoundingClientRect(), h = document.querySelector('#im-launch-hint').getBoundingClientRect();
    return { pageOverflowPx: document.documentElement.scrollWidth - window.innerWidth, label: [Math.round(l.left), Math.round(l.right)], hint: [Math.round(h.left), Math.round(h.right)] }; });
  await page.close();
} catch (error) {
  log.errors.push(`FALLO DEL GUION: ${error.message.split('\n').slice(0, 4).join(' | ')}`);
} finally {
  await browser.close(); await server.close();
  log.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(out, `verify-stage21${gpu ? '-gpu' : ''}.json`), JSON.stringify(log, null, 2));
  console.log(JSON.stringify({ errores: log.errors, capturas: log.shots.length }, null, 2));
}
