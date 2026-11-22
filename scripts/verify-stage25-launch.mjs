// Etapa 25 — revisión en Chrome del lanzamiento 3D de las Voyager: acercamiento a la Tierra en la escena principal, escena de
// LC-41, capturas en instantes de misión clave (con el instante pausado), fotogramas por segundo en reproducción, bytes
// descargados del lanzamiento, controles del panel, errores de consola y vuelta al Sistema Solar.
// Uso: GPU=1 node scripts/verify-stage25-launch.mjs [voyager-1|voyager-2|ambas] → evidence/stage25/ (o EVIDENCE_DIR).
// Una sola instancia de Chrome y de Vite a la vez. Solo lee y pulsa la interfaz (y usa el diagnóstico para saltar instantes).
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import { LANZAMIENTOS_VOYAGER, eventoPorId } from '../src/science/VoyagerLaunchProfile.js';

const playwrightPath = path.join(process.env.LOCALAPPDATA ?? '', 'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const out = path.resolve(process.env.EVIDENCE_DIR ?? 'evidence/stage25');
await fs.mkdir(out, { recursive: true });
const ARG = process.argv[2] ?? 'ambas';
const MISIONES = ARG === 'ambas' ? ['voyager-2', 'voyager-1'] : [ARG];
const ANCHO = Number(process.env.WIDTH ?? 1600), ALTO = Number(process.env.HEIGHT ?? 900);
const PORT = 5191;
const server = process.env.APP_URL ? null : await createServer({ server: { port: PORT, strictPort: true }, configFile: path.resolve('vite.config.js'), logLevel: 'error' });
await server?.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: process.env.GPU === '1' ? ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-sandbox'] });
const URL = process.env.APP_URL ?? `http://localhost:${PORT}/`;
const log = { gpu: process.env.GPU === '1', viewport: [ANCHO, ALTO], startedAt: new Date().toISOString(), misiones: {}, errors: [] };
// Instantes de misión (s desde la ignición de los motores sólidos) a capturar; los acontecimientos se resuelven por id.
const INSTANTES = [
  ['01-aproximacion-inicio', -23.5], ['02-aproximacion-florida', -17], ['03-aproximacion-cabo', -12.5], ['04-plataforma-general', -8],
  ['05-base-cuenta-atras', -2], ['06-ignicion', 0.6], ['07-despegue', 5], ['08-seguimiento', 30], ['09-persecucion', 80],
  ['10-ignicion-etapa1', '@etapa1-ignicion+3'], ['11-separacion-srm', '@srm-separacion+1.5'], ['12-etapa2', '@etapa1-apagado+2'],
  ['13-cofia', '@cofia+1.2'], ['14-separacion-titan', '@etapa2-separacion+4'], ['15-centaur-mes1', '@mes1+20'],
  ['16-aparcamiento', '@meco1+600'], ['17-mes2', '@mes2+30'], ['18-separacion-nave', '@separacion-nave+6'],
  ['19-modulo-propulsion', '@pm-ignicion+15'], ['20-mastiles-nasa', '@mastiles+4'], ['21-final', '@pm-separacion+5']
];

async function revisar(misionId) {
  const reg = { capturas: [], estados: {}, red: { bytesLanzamiento: 0, recursos: [] }, checks: {} };
  log.misiones[misionId] = reg;
  const page = await browser.newPage({ viewport: { width: ANCHO, height: ALTO } });
  page.on('pageerror', e => log.errors.push(`${misionId}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') log.errors.push(`${misionId} [${m.type()}]: ${m.text()}`); });
  page.on('response', async r => {
    const u = r.url();
    if (!/\/launch\/|earth_clouds|Voyager\.glb|VoyagerLaunchDirector|hipparcos|stars/i.test(u)) return;
    try { const b = await r.body(); reg.red.bytesLanzamiento += b.length; reg.red.recursos.push({ url: u.replace(URL, '/'), bytes: b.length, estado: r.status() }); }
    catch { reg.red.recursos.push({ url: u.replace(URL, '/'), bytes: null, estado: r.status() }); }
  });
  let nudge = 0;
  const esperar = async ms => { const fin = Date.now() + ms; while (Date.now() < fin) { await page.mouse.move(4 + (nudge ^= 1), 4); await page.waitForTimeout(Math.min(150, Math.max(0, fin - Date.now()))); } };
  const hasta = async (expr, ms = 30000) => { const fin = Date.now() + ms; while (Date.now() < fin) { if (await page.evaluate(expr).catch(() => false)) return true; await esperar(200); } return false; };
  const diag = 'window.__SIMULADOR_DIAGNOSTICO__';
  const foto = async (nombre, extra = {}) => {
    const archivo = `${misionId}-${nombre}.png`;
    await page.screenshot({ path: path.join(out, archivo) });
    const estado = await page.evaluate(`${diag}.obtenerEstadoLanzamiento()`);
    reg.capturas.push({ archivo, reloj: estado.reloj ?? null, tMision: estado.tMision ?? null, plano: estado.plano ?? null, fase: estado.fase?.id ?? null,
      altitudKm: estado.altitudKm ?? null, velocidadKmS: estado.velocidadKmS ?? null, modeloNasa: estado.modeloNasa ?? null, ...extra });
  };

  // Registro de cambios de modo (con su pila) para detectar vueltas inesperadas al Sistema Solar.
  reg.cambiosModo = [];
  await page.addInitScript(() => {
    const original = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (nombre, valor) {
      if (nombre === 'aria-pressed' && valor === 'true' && this.dataset?.modeBtn) console.debug(`MODO ${this.dataset.modeBtn} ${new Error().stack.split(String.fromCharCode(10)).slice(2, 7).join(' | ')}`);
      return original.call(this, nombre, valor);
    };
  });
  page.on('console', m => { if (m.text().startsWith('MODO ')) reg.cambiosModo.push({ ms: Date.now(), texto: m.text().slice(0, 900) }); });
  await page.goto(URL);
  await hasta(`Boolean(${diag})`, 60000);
  // Espera a que termine la carga inicial (selector de planetas activo) antes de cambiar de modo.
  reg.checks.cargaInicial = await hasta(`!document.querySelector('#planet-select')?.disabled`, 60000);
  await page.click('[data-mode-btn="historico"]');
  await esperar(1500);
  if (await page.evaluate(`!document.querySelector('#welcome-close-btn')?.closest('[hidden]') && Boolean(document.querySelector('#welcome-close-btn')?.offsetParent)`)) await page.click('#welcome-close-btn');
  // En pantallas estrechas el selector de misión está dentro del panel contextual: se abre como lo haría una persona.
  const selectorMision = `[data-mission-choice="${misionId}"]`;
  const selectorVisible = `Boolean(document.querySelector('${selectorMision}')?.checkVisibility({ visibilityProperty: true }))`;
  if (!(await hasta(selectorVisible, 2500)) && (await page.evaluate(`document.querySelector('#context-inspector')?.dataset.state === 'closed'`))) {
    await page.click('#inspector-toggle'); await esperar(600);
    reg.checks.panelContextualAbierto = true;
  }
  await page.click(selectorMision);
  await esperar(1500);

  // El botón está en el inspector (pestaña Explorar → «Lanzamiento y ayuda»), como lo encuentra una persona.
  const abrirBotonLanzamiento = async () => {
    // Un <details> cerrado oculta su contenido con content-visibility: offsetParent no basta para saber si se ve.
    if (!(await page.evaluate(`Boolean(document.querySelector('.historical-experiences')?.open && document.querySelector('#hist-launch-cinematic-btn')?.checkVisibility())`))) {
      if (!(await page.evaluate(`Boolean(document.querySelector('.historical-experiences')?.offsetParent)`))) await page.click('[data-inspector-tab="explore"]');
      if (!(await page.evaluate(`document.querySelector('.historical-experiences').open`))) await page.click('.historical-experiences > summary');
    }
  };
  await abrirBotonLanzamiento();
  await page.screenshot({ path: path.join(out, `${misionId}-00-boton-lanzamiento.png`) });
  reg.red.recursos.length = 0; reg.red.bytesLanzamiento = 0; // solo lo que se descarga desde aquí

  // Acercamiento en la escena principal (capturas a 1,2 s y 2,6 s).
  const t0 = Date.now();
  await page.click('#hist-launch-cinematic-btn');
  reg.checks.modoTrasPulsar = await page.evaluate(`${diag}.obtenerModoOperacion()`);
  await esperar(1200); await page.screenshot({ path: path.join(out, `${misionId}-00a-acercamiento-sistema-solar.png`) });
  await esperar(1400); await page.screenshot({ path: path.join(out, `${misionId}-00b-acercamiento-tierra.png`) });
  reg.checks.panelVisible = await page.evaluate(`!document.querySelector('#launch-cinematic-overlay').hidden`);
  reg.checks.escenaLista = await hasta(`${diag}.obtenerEstadoLanzamiento().cargado && document.querySelector('#launch-loading').hidden && document.querySelector('.launch3d-canvas.is-visible') !== null`, 60000);
  reg.checks.msHastaEscena = Date.now() - t0;
  await esperar(900);
  await page.screenshot({ path: path.join(out, `${misionId}-00c-primer-fotograma-lanzamiento.png`) });

  // Fotogramas por segundo en reproducción a ×1 desde la cuenta atrás hasta T + 12 s.
  await page.evaluate(`${diag}.irALanzamiento(-4)`);
  const fps = await page.evaluate(() => new Promise(res => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 6000) requestAnimationFrame(f); else res(n / ((performance.now() - t) / 1000)); }; requestAnimationFrame(f); }));
  reg.checks.fpsDespegue = Math.round(fps * 10) / 10;

  // Capturas en instantes concretos (pausado).
  await page.evaluate(`${diag}.pausarLanzamiento()`);
  for (const [nombre, instante] of INSTANTES) {
    let t = instante;
    if (typeof instante === 'string') {
      const [, id, mas] = instante.match(/^@([a-z0-9-]+)\+([\d.]+)$/);
      t = eventoPorId(LANZAMIENTOS_VOYAGER[misionId], id).t + Number(mas);
    }
    await page.evaluate(`${diag}.irALanzamiento(${t})`);
    await esperar(1300);
    await foto(nombre, { pedido: t });
  }

  // Controles del panel: siguiente/anterior acontecimiento, velocidad, pausa, marcas de la barra.
  await page.evaluate(`${diag}.irALanzamiento(100)`);
  await esperar(300);
  await page.click('#launch-next-btn'); await esperar(500);
  reg.checks.siguienteEvento = (await page.evaluate(`${diag}.obtenerEstadoLanzamiento()`)).siguiente?.id ?? null;
  await page.click('[data-speed="4"]'); await page.click('#launch-pause-btn'); await esperar(1200);
  const e1 = await page.evaluate(`${diag}.obtenerEstadoLanzamiento()`);
  reg.checks.reanudadoX4 = { pausado: e1.pausado, velocidad: e1.velocidad, rotulo: await page.evaluate(`document.querySelector('#launch-rate').textContent`) };
  reg.checks.marcas = await page.evaluate(`document.querySelectorAll('.launch-tick').length`);
  reg.checks.anuncio = await page.evaluate(`document.querySelector('#launch-live').textContent`);
  await page.click('.launch-fidelity summary'); await esperar(400);
  await page.screenshot({ path: path.join(out, `${misionId}-22-panel-fidelidad.png`) });
  await page.click('.launch-fidelity summary');

  // Vuelta al Sistema Solar.
  await page.click('#launch-skip-btn');
  reg.checks.cerrado = await hasta(`!${diag}.obtenerEstadoLanzamiento().activo && document.querySelector('#launch-cinematic-overlay').hidden && !document.querySelector('.launch3d-canvas')`, 10000);
  await esperar(1500);
  reg.checks.fechaEscena = await page.evaluate(`document.querySelector('#scene-date')?.textContent ?? ''`);
  await page.screenshot({ path: path.join(out, `${misionId}-23-vuelta-sistema-solar.png`) });

  // Reapertura y cancelación durante el acercamiento (Escape), para comprobar que no quedan lienzos ni bucles.
  await abrirBotonLanzamiento();
  await page.click('#hist-launch-cinematic-btn'); await esperar(700);
  await page.keyboard.press('Escape');
  reg.checks.cancelarDuranteAcercamiento = await hasta(`!${diag}.obtenerEstadoLanzamiento().activo && !document.querySelector('.launch3d-canvas')`, 10000);
  await esperar(2500);
  reg.checks.sinLienzoTardio = await page.evaluate(`!document.querySelector('.launch3d-canvas')`);
  await page.close();
}

try {
  for (const m of MISIONES) await revisar(m);
} catch (error) {
  log.errors.push(`fallo del guion: ${error.stack ?? error.message}`);
} finally {
  log.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(out, `verify-stage25-${log.gpu ? 'gpu' : 'swiftshader'}.json`), JSON.stringify(log, null, 2));
  await browser.close();
  await server?.close();
  console.log(JSON.stringify({ errors: log.errors.length, misiones: Object.fromEntries(Object.entries(log.misiones).map(([k, v]) => [k, v.checks])) }, null, 1));
}
