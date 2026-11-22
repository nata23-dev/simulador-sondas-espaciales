// Etapa 20 — verificación en Chrome de la captura apuntada con la misión guiada A1 (Cassini → Marte), usando los controles del
// usuario: filas técnicas del encuentro y de la captura, glosario, ficha «Órbita final» en «Resultados» del Centro de Misión
// (objetivo = alcanzada) y la opción «Captura apuntada» desactivada (resultado de 17.1, escenario «Personalizado»).
// Uso: GPU=1 node scripts/verify-stage20-browser.mjs → capturas y registro en evidence/stage20/ (o EVIDENCE_DIR).
// Una sola instancia de Chrome y de Vite a la vez. Solo lee y pulsa la interfaz.
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const playwrightPath = path.join(process.env.LOCALAPPDATA ?? '', 'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const out = path.resolve(process.env.EVIDENCE_DIR ?? 'evidence/stage20');
await fs.mkdir(out, { recursive: true });
const PORT = 5196;
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
  // Filas técnicas: abre «Encuentro» y «Fases» y lee las filas y el texto de la fase de captura.
  const readPlanner = () => page.evaluate(() => {
    for (const d of document.querySelectorAll('#lab-integrated details.im-tech')) d.open = true;
    const rows = [...document.querySelectorAll('#im-approach .lab-metric')].map(r => `${r.firstElementChild.textContent}: ${r.lastElementChild.textContent}`);
    const phases = document.querySelector('#im-phases')?.textContent ?? '';
    const term = document.querySelector('#im-approach .lab-metric > span[data-term]') ? [...document.querySelectorAll('#im-approach .lab-metric > span[data-term]')].map(s => `${s.textContent}→${s.dataset.term}`) : [];
    return { verdict: document.querySelector('#im-verdict').textContent.trim(), scenario: document.querySelector('#im-scenario').value, compensate: document.querySelector('#im-compensate').checked,
      approach: rows.filter(r => /Periapsis|Captura apuntada/.test(r)), terms: term.filter(t => /Captura|Periapsis/.test(t)),
      capture: (phases.match(/Captura en Marte[\s\S]*?(?=Órbita de captura|$)/)?.[0] ?? '').replace(/\s+/g, ' ').slice(0, 900) };
  });

  await page.addInitScript(() => { try { if (!sessionStorage.getItem('s20')) { localStorage.clear(); sessionStorage.setItem('s20', '1'); } } catch {} });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await wait(2000);
  await click('#app-nav-toggle'); await wait(400); await click('#app-nav-panel button[data-area="integrated"]'); await wait(1500);
  await page.waitForFunction(() => !document.querySelector('#experimental-lab').hidden, null, { timeout: 30000 });
  if (await page.locator('#im-scenario').inputValue() !== 'A1') { await page.selectOption('#im-scenario', 'A1'); await wait(300); }

  // 1 · Con la opción por defecto (captura apuntada).
  await compute();
  log.checks.compensada = await readPlanner();
  await page.evaluate(() => document.querySelector('#im-approach')?.scrollIntoView({ block: 'center' })); await shot('01_planificador_encuentro');
  // 2 · Centro de Misión → Resultados: ficha «Órbita final en Marte».
  await click('#im-execute'); await wait(1500);
  await page.waitForFunction(() => { const m = document.querySelector('#lab-mission-center').dataset.vehicleModel; return m && m !== 'cargando'; }, null, { timeout: 90000 });
  await wait(1500);
  await click('#lab-tabs [data-lab-tab="results"]'); await wait(800);
  log.checks.resultados = await page.evaluate(() => { const cap = document.querySelector('.mc-capture');
    return cap ? { tabla: [...cap.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(c => c.textContent.trim()).join(' | ')), apuntada: cap.querySelector('.mc-capture-aim')?.textContent ?? null,
      elipses: cap.querySelectorAll('svg ellipse').length, aria: cap.querySelector('svg')?.getAttribute('aria-label') } : null; });
  await page.evaluate(() => document.querySelector('.mc-capture')?.scrollIntoView({ block: 'start' })); await shot('02_resultados_orbita_final');
  // 3 · Volver a planificar sin la compensación: resultado de 17.1 y escenario «Personalizado».
  await click('#lab-tabs [data-lab-tab="playback"]').catch(() => {});
  await page.evaluate(() => document.querySelector('#experimental-lab [data-lab-stage="plan"], #lab-rail [data-stage="plan"]')?.click()); await wait(1200);
  await page.waitForFunction(() => document.querySelector('#lab-integrated')?.checkVisibility(), null, { timeout: 30000 });
  await page.evaluate(() => { document.querySelector('#im-advanced').open = true; });
  await click('#im-compensate'); await wait(400);
  await compute();
  log.checks.sinCompensar = await readPlanner();
  await page.evaluate(() => document.querySelector('#im-approach')?.scrollIntoView({ block: 'center' })); await shot('03_planificador_sin_compensar');
  // 4 · Volver al escenario A1 restablece la opción.
  await page.selectOption('#im-scenario', 'A1'); await wait(400);
  log.checks.alVolverA1 = await page.evaluate(() => document.querySelector('#im-compensate').checked);
  await page.close();
} catch (error) {
  log.errors.push(`FALLO DEL GUION: ${error.message.split('\n').slice(0, 4).join(' | ')}`);
} finally {
  await browser.close(); await server.close();
  log.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(out, `verify-stage20${gpu ? '-gpu' : ''}.json`), JSON.stringify(log, null, 2));
  console.log(JSON.stringify({ errores: log.errors, capturas: log.shots.length }, null, 2));
}
