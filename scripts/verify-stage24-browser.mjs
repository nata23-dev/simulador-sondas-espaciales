// Etapa 24 — verificación en Chrome de la experiencia de uso del Centro de Misión con la misión guiada A1 (Cassini → Marte):
// atajos de teclado, marcas agrupadas y zoom temporal, órbita final y misión real en «Resultados», unidades km/AU, fecha con
// explicación UTC/TDB, encabezados, rótulos que esquivan los controles de la vista inmersiva y hoja inferior en el teléfono.
// Uso: GPU=1 node scripts/verify-stage24-browser.mjs → capturas y registro en evidence/stage24/ (o EVIDENCE_DIR).
// Una sola instancia de Chrome y de Vite a la vez. Solo lee y pulsa la interfaz.
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const playwrightPath = path.join(process.env.LOCALAPPDATA ?? '', 'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const out = path.resolve(process.env.EVIDENCE_DIR ?? 'evidence/stage24');
await fs.mkdir(out, { recursive: true });
const PORT = 5194;
const server = await createServer({ server: { port: PORT, strictPort: true }, configFile: path.resolve('vite.config.js'), logLevel: 'error' });
await server.listen();
const gpu = process.env.GPU === '1';
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: gpu ? ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-sandbox'] });
const log = { gpu, startedAt: new Date().toISOString(), shots: [], checks: {}, errors: [], warnings: [] };

async function session(width, height, prefix, fn) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', e => log.errors.push(`${prefix}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') log.errors.push(`${prefix}: ${m.text()}`); else if (m.type() === 'warning') log.warnings.push(`${prefix}: ${m.text().slice(0, 160)}`); });
  let nudge = 0;
  const wait = async ms => { const end = Date.now() + ms; while (Date.now() < end) { await page.mouse.move(4 + (nudge ^= 1), 4); await page.waitForTimeout(Math.max(0, Math.min(200, end - Date.now()))); } };
  // Clic real en el centro del control tras comprobar que es visible y que nada lo tapa.
  const click = async (selector, timeout = 30000) => {
    const until = Date.now() + timeout; let last = 'no encontrado';
    while (Date.now() < until) {
      const hit = await page.evaluate(sel => {
        const el = document.querySelector(sel); if (!el) return { ok: false, why: 'no encontrado' };
        if (el.disabled) return { ok: false, why: 'desactivado' };
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
        const r = el.getBoundingClientRect(); if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') return { ok: false, why: 'no visible' };
        const x = r.x + r.width / 2, y = r.y + r.height / 2, top = document.elementFromPoint(x, y);
        return top === el || el.contains(top) ? { ok: true, x, y } : { ok: false, why: `tapado por ${top?.id || top?.className || top?.tagName}` };
      }, selector);
      if (hit.ok) { await page.mouse.click(hit.x, hit.y); return; }
      last = hit.why; await wait(250);
    }
    throw new Error(`clic en ${selector}: ${last}`);
  };
  const shot = async name => { await wait(500); const file = `${prefix}_${name}.png`; await page.screenshot({ path: path.join(out, file) }); log.shots.push(file); };
  const text = sel => page.evaluate(s => document.querySelector(s)?.textContent?.trim() ?? null, sel);
  const state = () => page.evaluate(() => { const c = document.querySelector('#lab-mission-center'), lab = document.querySelector('#experimental-lab');
    return { immersive: lab.dataset.immersive ?? null, sheet: c.dataset.sheet ?? null, pane: c.dataset.pane, elapsed: document.querySelector('#mc-timeline').value, max: document.querySelector('#mc-timeline').max,
      status: document.querySelector('#mc-stage-status').textContent, selected: document.querySelector('.mc-tick[aria-current="step"]')?.dataset.events ?? null }; });
  const h = { page, wait, click, shot, text, state };
  try {
    await page.addInitScript(() => { try { if (!sessionStorage.getItem('s24')) { localStorage.clear(); sessionStorage.setItem('s24', '1'); } } catch {} });
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await wait(2000);
    await fn(h);
  } catch (error) { log.errors.push(`${prefix}: FALLO DEL GUION: ${error.message.split('\n').slice(0, 4).join(' | ')}`); }
  await page.close();
}

// Abre el laboratorio, calcula A1 con Cassini y lo envía al Centro de Misión (mismos controles que el usuario).
async function prepareA1(h) {
  const { page, click, wait } = h;
  await click('#app-nav-toggle'); await wait(400); await click('#app-nav-panel button[data-area="integrated"]'); await wait(1500);
  await page.waitForFunction(() => !document.querySelector('#experimental-lab').hidden, null, { timeout: 30000 });
  if (await page.locator('#im-scenario').inputValue() !== 'A1') { await page.selectOption('#im-scenario', 'A1'); await wait(300); }
  await click('#im-compute');
  await page.waitForFunction(() => !document.querySelector('#im-compute').disabled && !/Calculando/.test(document.querySelector('#im-verdict').textContent), null, { timeout: 200000 });
  const verdict = (await h.text('#im-verdict'));
  await click('#im-execute'); await wait(1500);
  await page.waitForFunction(() => { const m = document.querySelector('#lab-mission-center').dataset.vehicleModel; return m && m !== 'cargando'; }, null, { timeout: 90000 });
  await page.waitForFunction(() => window.__SIMULADOR_DIAGNOSTICO__?.obtenerEstadoMisionEscenaPrincipal?.()?.controlling === true, null, { timeout: 60000 }).catch(() => {});
  await wait(1500);
  return verdict;
}
const pause = async h => { if ((await h.state()).status.includes('REPRODUCCIÓN')) { await h.page.evaluate(() => document.querySelector('#mc-pause').click()); await h.wait(300); } };
const blur = page => page.evaluate(() => { document.activeElement?.blur?.(); });

try {
  await session(1366, 768, 'd1366', async h => {
    const { page, click, wait, shot, state } = h, c = log.checks.escritorio = {};
    c.veredicto = await prepareA1(h);
    await pause(h); await shot('01_centro_mision');
    // 1 · Atajos de teclado con el foco fuera de los controles.
    await blur(page); await page.keyboard.press('Home'); await wait(400);
    const inicio = await state();
    await page.keyboard.press('ArrowRight'); await wait(500); const siguiente = await state();
    await page.keyboard.press('ArrowRight'); await wait(500); const siguiente2 = await state();
    await page.keyboard.press('ArrowLeft'); await wait(500); const anterior = await state();
    await page.keyboard.press('End'); await wait(500); const fin = await state();
    await page.keyboard.press('Home'); await wait(400);
    await page.keyboard.press(' '); await wait(1200); const reproduciendo = await state();
    await page.keyboard.press(' '); await wait(400); const pausada = await state();
    // Con el foco en el selector de velocidad, las flechas son del control (no saltan de evento).
    await page.evaluate(() => document.querySelector('#mc-rate').focus()); const antesSelect = (await state()).elapsed;
    await page.keyboard.press('ArrowRight'); await wait(400); const enSelect = await state();
    await page.evaluate(() => { const r = document.querySelector('#mc-rate'); r.value = r.querySelector('option[value="auto"]') ? 'auto' : r.value; r.dispatchEvent(new Event('change')); r.blur(); });
    c.teclado = { inicio: inicio.elapsed, siguiente: [siguiente.elapsed, siguiente.selected], siguiente2: [siguiente2.elapsed, siguiente2.selected], anterior: [anterior.elapsed, anterior.selected],
      fin: [fin.elapsed, fin.max], reproduce: reproduciendo.status, pausa: pausada.status, flechaEnSelector: { antes: antesSelect, despues: enSelect.elapsed } };
    // 2 · Marcas agrupadas y zoom temporal.
    const marcas = () => page.evaluate(() => ({ marcas: document.querySelectorAll('.mc-tick').length, grupos: [...document.querySelectorAll('.mc-tick.is-group')].map(t => ({ n: t.dataset.count, title: t.title.slice(0, 140) })),
      eventos: document.querySelectorAll('#mc-events button').length, zoom: document.querySelector('#mc-track').dataset.zoom, salirVisible: !document.querySelector('#mc-zoom-exit').hidden }));
    c.marcas = await marcas();
    if (c.marcas.grupos.length) {
      await click('.mc-tick.is-group'); await wait(700);
      c.zoom = { ...(await marcas()), mensaje: await h.text('#mc-message'), anuncio: await h.text('#mc-announcer') };
      await shot('02_barra_ampliada');
      if (c.zoom.salirVisible) { await click('#mc-zoom-exit'); await wait(400); c.zoomFuera = await marcas(); }
    }
    // 3 · Resultados: órbita final y misión real.
    await click('#lab-tabs [data-lab-tab="results"]'); await wait(700);
    c.resultados = await page.evaluate(() => { const cap = document.querySelector('.mc-capture'), real = document.querySelector('.mc-real');
      return { captura: cap ? { titulo: cap.querySelector('h4').textContent, elipses: cap.querySelectorAll('svg ellipse').length, cuerpo: cap.querySelectorAll('svg .is-body').length, aria: cap.querySelector('svg')?.getAttribute('aria-label'),
        tabla: [...cap.querySelectorAll('tbody tr')].map(tr => tr.textContent.replace(/\s+/g, ' ').trim()), nota: cap.querySelector('.mission-hint')?.textContent } : null,
        real: real ? { resumen: real.querySelector('.mc-real-summary').textContent, hitos: [...real.querySelectorAll('.mc-real-list li')].map(li => li.textContent.trim()), fuente: real.querySelector('.mc-real-source a')?.href } : null }; });
    await page.evaluate(() => document.querySelector('.mc-capture')?.scrollIntoView({ block: 'start' })); await shot('03_resultados_orbita');
    await page.evaluate(() => document.querySelector('.mc-real')?.scrollIntoView({ block: 'start' })); await shot('04_resultados_mision_real');
    // 4 · Unidades km/AU y explicación UTC/TDB.
    await click('#lab-tabs [data-lab-tab="telemetry"]'); await wait(600);
    const fila = label => page.evaluate(l => [...document.querySelectorAll('#mc-derived-metrics .lab-metric, #mc-state-metrics .lab-metric')].find(r => r.firstElementChild.textContent.startsWith(l))?.lastElementChild.textContent ?? null, label);
    const unidades = {};
    for (const u of ['auto', 'au', 'km']) { await click(`[data-unit="${u}"]`); await wait(400); unidades[u] = { sol: await fila('Distancia al Sol'), destino: await fila('Distancia a Marte'), centro: await fila('Distancia al centro') }; }
    await click('[data-unit="auto"]');
    c.unidades = unidades;
    c.tiempo = { tdbMenosUtc: await fila('TDB − UTC'), fechaUtc: await fila('Fecha UTC'), hud: await h.text('#mc-hud-time'), hudTitle: await page.evaluate(() => document.querySelector('#mc-hud-time').title),
      glosario: await page.evaluate(() => [...document.querySelectorAll('#mc-state-metrics .lab-metric > span[data-term]')].map(s => `${s.textContent}→${s.dataset.term}`)) };
    await shot('05_telemetria_unidades');
    // 5 · Encabezados del Centro de Misión.
    c.encabezados = await page.evaluate(() => [...document.querySelectorAll('#experimental-lab :is(h1,h2,h3,h4)')].filter(e => e.checkVisibility({ visibilityProperty: true })).map(e => `${e.tagName}: ${e.textContent.trim().slice(0, 40)}`));
    c.tituloPanel = await page.evaluate(() => document.querySelector('#mc-pane-title').tagName);
    // 6 · Vista inmersiva: ningún rótulo visible de planeta, satélite o sonda se solapa con los controles de la escena.
    await click('#lab-tabs [data-lab-tab="playback"]'); await wait(400);
    await click('.mc-camera-bar [data-camera="overview"]'); await wait(1500);
    await click('[data-mc-panel="immersive"]'); await wait(3500);
    const solapes = () => page.evaluate(() => {
      const obst = [...document.querySelectorAll('.mc-stage .lab-stage-top > :is(.eyebrow, strong, .mc-layout-toggles), .mc-camera-bar, #mc-hud, #mc-transport')].filter(e => e.checkVisibility()).map(e => [e.className || e.id, e.getBoundingClientRect()]);
      const labels = [...document.querySelectorAll('.planet-label, .probe-label')].filter(l => !l.hidden && l.checkVisibility());
      return { rotulos: labels.map(l => l.textContent), solapes: labels.flatMap(l => { const r = l.getBoundingClientRect();
        return obst.filter(([, o]) => r.left < o.right && r.right > o.left && r.top < o.bottom && r.bottom > o.top).map(([n]) => `${l.textContent} × ${n}`); }) };
    });
    c.rotulosInmersiva = await solapes(); await shot('06_inmersiva_rotulos');
    await page.keyboard.press('End'); await wait(2500); c.rotulosInmersivaFinal = await solapes(); await shot('07_inmersiva_llegada');
    await page.keyboard.press('Escape'); await wait(800); c.trasEscape = (await state()).immersive;
  });

  // Anillo de foco del campo de fecha al llegar con el tabulador (pendiente desde la etapa 17).
  await session(1366, 768, 'foco', async h => {
    const { page, click, wait } = h, c = log.checks.focoFecha = {};
    await click('#app-nav-toggle'); await wait(400); await click('#app-nav-panel button[data-area="integrated"]'); await wait(1500);
    await page.waitForFunction(() => !document.querySelector('#experimental-lab').hidden, null, { timeout: 30000 });
    await page.evaluate(() => document.querySelector('#im-scenario').focus());
    for (let i = 0; i < 12 && await page.evaluate(() => document.activeElement?.id) !== 'im-departure'; i++) await page.keyboard.press('Tab');
    c.lectura = await page.evaluate(() => { const el = document.activeElement, cs = getComputedStyle(el);
      return { id: el.id, focusVisible: el.matches(':focus-visible'), outline: `${cs.outlineStyle} ${cs.outlineWidth}`, boxShadow: cs.boxShadow, borderColor: cs.borderTopColor }; });
    c.anillo = c.lectura.id === 'im-departure' && (c.lectura.boxShadow !== 'none' || (c.lectura.outline.split(' ')[0] !== 'none' && parseFloat(c.lectura.outline.split(' ')[1]) > 0));
    await h.page.evaluate(() => document.querySelector('#im-departure').scrollIntoView({ block: 'center' })); await h.shot('01_fecha_enfocada');
    // Caso de la regresión de 17: foco en el campo sin :focus-visible (clic en un subcampo con el ratón).
    await page.evaluate(() => document.activeElement?.blur?.()); await click('#im-departure'); await wait(300);
    c.trasClic = await page.evaluate(() => { const el = document.activeElement, cs = getComputedStyle(el);
      return { id: el.id, focusVisible: el.matches(':focus-visible'), outline: `${cs.outlineStyle} ${cs.outlineWidth}`, boxShadow: cs.boxShadow }; });
    await page.keyboard.press('Escape');
  });

  await session(390, 844, 'm390', async h => {
    const { page, click, wait, shot, state } = h, c = log.checks.telefono = {};
    c.veredicto = await prepareA1(h);
    await pause(h);
    c.alEntrar = await state();
    c.botonPanel = await page.evaluate(() => document.querySelector('[data-mc-panel="sheet"]').checkVisibility({ visibilityProperty: true }));
    await shot('01_inmersiva_por_defecto');
    await click('[data-mc-panel="sheet"]'); await wait(700);
    c.hojaAbierta = { ...(await state()), foco: await page.evaluate(() => document.activeElement?.dataset.sheetPane ?? document.activeElement?.className),
      caja: await page.evaluate(() => { const r = document.querySelector('#mc-drawer').getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), alto: Math.round(r.height), ventana: innerHeight }; }) };
    await shot('02_hoja_inferior');
    await click('[data-sheet-pane="telemetry"]'); await wait(700);
    c.hojaTelemetria = { ...(await state()), pestanaLab: await page.evaluate(() => document.querySelector('#experimental-lab').dataset.tab), filas: await page.evaluate(() => document.querySelectorAll('#mc-state-metrics .lab-metric').length) };
    await shot('03_hoja_telemetria');
    await click('[data-sheet-pane="results"]'); await wait(700);
    await page.evaluate(() => document.querySelector('.mc-capture')?.scrollIntoView({ block: 'start' })); await shot('04_hoja_resultados');
    await page.keyboard.press('Escape'); await wait(600); c.trasEscape = await state();
    await click('[data-mc-panel="exit-immersive"]'); await wait(800); c.trasSalir = await state();
    await page.evaluate(() => document.querySelector('#experimental-lab').scrollTo?.(0, 0));
    await click('#lab-tabs [data-lab-tab="events"]'); await wait(800); c.trasCambiarPestana = await state();
    await shot('05_sin_inmersiva');
    c.desbordeHorizontal = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  });
} finally {
  await browser.close(); await server.close();
  log.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(out, `verify-stage24${gpu ? '-gpu' : ''}.json`), JSON.stringify(log, null, 2));
  console.log(JSON.stringify({ errores: log.errors, capturas: log.shots.length }, null, 2));
}
