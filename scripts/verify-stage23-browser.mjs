// Etapa 23 — verificación en Chrome de los satélites galileanos en el Sistema Solar principal con la misión guiada C1 (Cassini:
// Júpiter y sobrevuelo de Europa), con los controles del usuario: calcular, «Reproducir en el Centro de Misión», escena principal
// activa, satélites ocultos fuera de su ventana (crucero de 2029), visibles en Júpiter, cámara de destino sobre Europa en la máxima
// aproximación y de vuelta a Júpiter después, distancia nave–Europa en la escena frente a la calculada, restauración al salir y
// la llegada a Marte de A1 (regresión del tamaño de la baliza). Uso: GPU=1 node scripts/verify-stage23-browser.mjs → capturas y
// registro en evidence/stage23/ (o EVIDENCE_DIR). Una sola instancia de Chrome y de Vite a la vez.
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const playwrightPath = path.join(process.env.LOCALAPPDATA ?? '', 'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const out = path.resolve(process.env.EVIDENCE_DIR ?? 'evidence/stage23');
await fs.mkdir(out, { recursive: true });
const PORT = 5199;
const server = await createServer({ server: { port: PORT, strictPort: true }, configFile: path.resolve('vite.config.js'), logLevel: 'error' });
await server.listen();
const gpu = process.env.GPU === '1';
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: gpu ? ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-sandbox'] });
const log = { gpu, startedAt: new Date().toISOString(), shots: [], checks: {}, errors: [], warnings: [] };
const DAY = 86400, KM_PER_UNIT = 149597870.7 / 32, EUROPA_RADIUS_KM = 1560.8;

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
  const shot = async name => { await wait(700); const file = `${name}.png`; await page.screenshot({ path: path.join(out, file) }); log.shots.push(file); };
  const compute = async () => {
    await click('#im-compute');
    await page.waitForFunction(() => !document.querySelector('#im-compute').disabled && !/Calculando/.test(document.querySelector('#im-verdict').textContent), null, { timeout: 200000 });
    await wait(500);
  };
  const seek = seconds => page.evaluate(t => { const i = document.querySelector('#mc-timeline'); i.value = String(t); i.dispatchEvent(new Event('input', { bubbles: true })); }, seconds);
  const camera = async mode => { await click(`.mc-camera-bar button[data-camera="${mode}"]`); await wait(3200); };
  // Estado de la escena: satélites, sonda, cámara y lo que publica la vista de la misión.
  const state = () => page.evaluate(({ KM_PER_UNIT }) => {
    const d = window.__SIMULADOR_DIAGNOSTICO__, mission = d.obtenerEstadoMisionEscenaPrincipal(), scene = d.obtenerDiagnosticoEscena(), lunas = d.obtenerLunas().visibles;
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * KM_PER_UNIT;
    const europa = lunas.Europa;
    return { scene: document.querySelector('#lab-mission-center')?.dataset.scene ?? null, phase: document.querySelector('#mc-hud-phase')?.textContent ?? null,
      foot: document.querySelector('#mc-foot')?.textContent ?? null, valuetext: document.querySelector('#mc-timeline')?.getAttribute('aria-valuetext') ?? null, announcer: document.querySelector('#mc-announcer')?.textContent ?? null, mission: mission && { moon: mission.moon, moonsShown: mission.moonsShown, cameraMode: mission.cameraMode, cameraFocus: mission.cameraFocus, error: mission.error, jdTdb: mission.jdTdb },
      moonsVisible: Object.entries(lunas).filter(([, m]) => m.visible).map(([k]) => k), lunasVisibles: scene.lunasVisibles,
      probeEuropaKm: europa?.visible && scene.sonda.visible ? dist(scene.sonda.posicion, europa.position) : null,
      cameraEuropaKm: europa?.visible ? dist(scene.camara.posicion, europa.position) : null,
      europaJupiterKm: europa?.visible ? dist(europa.position, europa.parentPosition) : null,
      europaScreen: europa?.screen ?? null, selected: scene.camara.seleccionado, probeScale: scene.sonda.escalaVisual,
      infoPanels: ['#moon-info', '#info-panel'].map(s => { const e = document.querySelector(s); if (!e) return `${s}: no existe`; const r = e.getBoundingClientRect(); return `${s}: ${e.hidden || !r.width ? 'oculto' : 'visible'}`; }) };
  }, { KM_PER_UNIT });

  await page.addInitScript(() => { try { if (!sessionStorage.getItem('s23')) { localStorage.clear(); sessionStorage.setItem('s23', '1'); } } catch {} });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await wait(2000);
  log.checks.exploracionInicial = await page.evaluate(() => window.__SIMULADOR_DIAGNOSTICO__.obtenerDiagnosticoEscena().lunasVisibles);
  await click('#app-nav-toggle'); await wait(400); await click('#app-nav-panel button[data-area="integrated"]'); await wait(1500);
  await page.waitForFunction(() => !document.querySelector('#experimental-lab').hidden, null, { timeout: 30000 });
  await page.selectOption('#im-scenario', 'C1'); await wait(400);
  await compute();
  log.checks.planificador = await page.evaluate(() => ({ verdict: document.querySelector('#im-verdict').textContent.trim().slice(0, 140), probe: document.querySelector('#lab-probe-select, select[id*="probe"]')?.selectedOptions?.[0]?.textContent ?? null }));

  // 1 · Centro de Misión: escena principal con la misión C1.
  await click('#im-execute'); await wait(1500);
  await page.waitForFunction(() => document.querySelector('#lab-mission-center')?.dataset.scene === 'main', null, { timeout: 90000 });
  await page.waitForFunction(() => { const m = document.querySelector('#lab-mission-center').dataset.vehicleModel; return m && m !== 'cargando'; }, null, { timeout: 90000 });
  await wait(1500);
  await click('#mc-pause').catch(() => {});
  // 2 · Crucero (día 500, 2030): fuera de la ventana de satélites.
  await seek(500 * DAY); await wait(1200); log.checks.crucero = await state();
  // 3 · Órbita de Júpiter (día 1110): satélites visibles; cámara de destino sobre Júpiter.
  await seek(1110 * DAY); await wait(1200); await camera('destination'); log.checks.jupiter = await state();
  await shot('01_jupiter_satelites_camara_destino');
  await camera('overview'); await seek(1110 * DAY); await wait(2500); log.checks.jupiterGeneral = await state();
  // 4 · Máxima aproximación a Europa: cámara de destino sobre Europa.
  const periapsis = await page.evaluate(() => [...document.querySelectorAll('#mc-events button')].map(b => b.textContent).find(t => /Máxima aproximación a Europa/.test(t)) ?? null);
  log.checks.eventoPeriapsis = periapsis;
  await camera('destination');
  await seek(1148.2661 * DAY); await wait(3500); log.checks.europaDestino = await state();
  await shot('02_europa_maxima_aproximacion_camara_destino');
  await camera('exterior'); await wait(1500); log.checks.europaExterior = await state();
  await shot('03_europa_seguimiento_exterior');
  // 5 · Tras el sobrevuelo (día 1149.5, tramo de Júpiter): la cámara de destino vuelve a Júpiter.
  await camera('destination'); await seek(1149.5 * DAY); await wait(3500); log.checks.trasSobrevuelo = await state();
  // 5b · Desde Europa encuadrada, salto al crucero (fuera de la ventana): Europa deja de dibujarse sin errores y la cámara vuelve a Júpiter.
  await seek(1148.2661 * DAY); await wait(3000); log.checks.antesDelSalto = (await state()).mission;
  await seek(500 * DAY); await wait(3500); log.checks.saltoFueraVentana = await state();
  // 6 · Móvil (390 px) en la máxima aproximación.
  await seek(1148.2661 * DAY); await wait(2500);
  await page.setViewportSize({ width: 390, height: 844 }); await wait(2500); await shot('04_movil_europa');
  log.checks.movil = { ...(await state()), pageOverflowPx: await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) };
  await page.setViewportSize({ width: 1366, height: 768 }); await wait(1500);

  // 7 · Regresión de A1 (Cassini → Marte): llegada con la cámara de destino (tamaño mínimo de la baliza).
  await click('#app-nav-toggle'); await wait(400); await click('#app-nav-panel button[data-area="integrated"]');
  await wait(1500);
  await page.selectOption('#im-scenario', 'A1'); await wait(400); await compute();
  await click('#im-execute'); await wait(1500);
  await page.waitForFunction(() => document.querySelector('#lab-mission-center')?.dataset.scene === 'main', null, { timeout: 90000 });
  await wait(1500); await click('#mc-pause').catch(() => {});
  const maxA1 = await page.evaluate(() => Number(document.querySelector('#mc-timeline').max));
  await camera('destination'); await seek(maxA1 - 0.5 * DAY); await wait(3500); log.checks.a1Llegada = await state();
  await shot('05_regresion_a1_llegada_marte');

  // 8 · Salir del laboratorio: la exploración restaura sus satélites de 2026.
  await click('#app-nav-toggle'); await wait(400);
  await click('#app-nav-panel button[data-area="solar"]');
  await wait(2500);
  log.checks.exploracionRestaurada = await page.evaluate(() => ({ modo: window.__SIMULADOR_DIAGNOSTICO__.obtenerModoOperacion(), lunasVisibles: window.__SIMULADOR_DIAGNOSTICO__.obtenerDiagnosticoEscena().lunasVisibles,
    mision: window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoMisionEscenaPrincipal()?.controlling ?? null }));
  await page.close();
} catch (error) {
  log.errors.push(`FALLO DEL GUION: ${error.message.split('\n').slice(0, 4).join(' | ')}`);
} finally {
  await browser.close(); await server.close();
  log.finishedAt = new Date().toISOString();
  log.europaRadiusKm = EUROPA_RADIUS_KM;
  await fs.writeFile(path.join(out, `verify-stage23${gpu ? '-gpu' : ''}.json`), JSON.stringify(log, null, 2));
  console.log(JSON.stringify({ errores: log.errors, capturas: log.shots.length }, null, 2));
}
