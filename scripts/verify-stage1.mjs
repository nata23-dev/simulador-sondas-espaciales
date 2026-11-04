import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { VOYAGER_HISTORICAL_EVENTS } from '../src/science/VoyagerHistoricalEvents.js';
import { HITOS_RECORRIDO_GUIADO } from '../src/ui/HistoricalGuidedTour.js';

const output = process.env.EVIDENCE_DIR || 'evidencias/etapa-01/Despues';
await fs.mkdir(output, { recursive: true });
const tabs = await fetch('http://127.0.0.1:9338/json').then(response => response.json());
const tab = tabs.find(item => item.type === 'page' && item.url.includes('5173'));
assert.ok(tab, 'Se requiere Chrome con depuración CDP en el puerto 9338 y Vite en el 5173');
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(resolve => { ws.onopen = resolve; });
let seq = 0;
const pending = new Map();
const errors = [];
const checks = [];
const captures = [];
ws.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const task = pending.get(message.id);
    if (message.error) task?.reject(Error(JSON.stringify(message.error)));
    else task?.resolve(message.result);
    pending.delete(message.id);
  }
  if (message.method === 'Runtime.exceptionThrown') {
    const detail = message.params.exceptionDetails;
    errors.push({ kind: 'javascript', text: detail.exception?.description || detail.text, url: detail.url, line: detail.lineNumber, stack: detail.stackTrace?.callFrames?.slice(0, 2) });
  }
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push({ kind: 'log', text: message.params.entry.text });
  if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) errors.push({ kind: 'http', url: message.params.response.url, status: message.params.response.status });
};
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function evalInPage(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function verify(name, expression, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evalInPage(expression) === true) {
      checks.push(name);
      console.log('PASS', name);
      return;
    }
    await pause(150);
  }
  throw Error(`No se cumplió: ${name}`);
}
async function click(selector) {
  const center = await evalInPage(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) throw Error('Falta ${selector}');
    node.scrollIntoView({ block: 'nearest' });
    const rect = node.getBoundingClientRect();
    if (!rect.width || !rect.height) throw Error('Control oculto: ${selector}');
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    if (!node.contains(document.elementFromPoint(x, y))) throw Error('Control obstruido: ${selector}');
    return { x, y };
  })()`);
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...center, button: 'left', clickCount: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...center, button: 'left', clickCount: 1 });
  await pause(180);
}
async function selectEvent(id) {
  if (await evalInPage(`!document.querySelector('#historical-events-panel').open`)) await click('#historical-events-panel > summary');
  await click(`.historical-event-list button[data-event-id="${id}"]`);
}
async function capture(name) {
  await pause(500);
  const png = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await fs.writeFile(`${output}/${name}.png`, Buffer.from(png.data, 'base64'));
  captures.push({ name, file: `Despues/${name}.png`, state: await evalInPage(`(() => ({
    width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
    mode: window.__SIMULADOR_DIAGNOSTICO__?.obtenerModoOperacion(),
    inspector: document.querySelector('#context-inspector')?.dataset.state,
    tab: document.querySelector('[data-inspector-tab][aria-selected="true"]')?.dataset.inspectorTab,
    event: document.querySelector('#historical-event-select')?.value,
    step: document.querySelector('#tour-step-counter')?.textContent,
    date: document.querySelector('#hist-clock-utc')?.textContent,
    camera: window.__SIMULADOR_DIAGNOSTICO__?.obtenerEstadoCamaraHistorica()?.modo,
    comparatorOpen: !document.querySelector('#photo-comparator-panel')?.hidden,
    photoLoaded: document.querySelector('#comp-photo-img')?.naturalWidth > 0
  }))()`)});
  console.log('CAPTURE', name);
}
async function resize(width, height) {
  await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await pause(350);
}
async function tabSelect(id) {
  if (await evalInPage(`document.querySelector('#context-inspector').dataset.state === 'closed'`)) await click('#inspector-toggle');
  await click(`[data-inspector-tab="${id}"]`);
}

try {
  for (const domain of ['Page', 'Runtime', 'Network', 'Log']) await call(`${domain}.enable`);
  await call('Page.bringToFront');
  await resize(1920, 1080);
  await call('Page.navigate', { url: 'http://127.0.0.1:5173/?mode=historical' });
  await verify('Modo histórico cargado', `window.__SIMULADOR_DIAGNOSTICO__?.obtenerModoOperacion() === 'historico' && !!window.__SIMULADOR_DIAGNOSTICO__?.obtenerSnapshotHistorico()`, 30000);
  if (await evalInPage(`!document.querySelector('#historical-welcome-modal').hidden`)) {
    await capture('01-entrada-historica');
    await click('#welcome-explore-free');
  }
  await verify('Acceso principal visible', `document.querySelector('#hist-start-tour-btn').getBoundingClientRect().height >= 44 && document.querySelector('#hist-start-tour-btn').textContent.includes('Iniciar recorrido')`);
  await capture('02-acceso-recorrido');
  await click('#hist-start-tour-btn');
  await verify('Paso inicial en Historia', `document.querySelector('#tour-step-counter').textContent.startsWith('Paso 1 de 12') && document.querySelector('[aria-selected="true"]').dataset.inspectorTab === 'history'`);
  await capture('03-recorrido-paso-01');
  await verify('Anterior deshabilitado al inicio', `document.querySelector('#tour-prev-btn').disabled`);
  for (let index = 1; index < HITOS_RECORRIDO_GUIADO.length; index++) {
    await click('#tour-play-btn');
    const hito = HITOS_RECORRIDO_GUIADO[index];
    await verify(`Paso ${index + 1} de 12`, `document.querySelector('#tour-step-counter').textContent.startsWith('Paso ${index + 1} de 12') && document.querySelector('#historical-event-select').value === ${JSON.stringify(hito.idEvento)}`);
    if ([5, 11].includes(index)) await capture(`recorrido-paso-${String(index + 1).padStart(2, '0')}`);
  }
  await verify('Finalización explícita al final', `document.querySelector('#tour-play-btn').textContent === 'Finalizar recorrido' && !document.querySelector('#tour-play-btn').disabled`);
  await click('#tour-prev-btn');
  await verify('Retroceso desde el final', `document.querySelector('#tour-step-counter').textContent.startsWith('Paso 11 de 12')`);
  await click('#tour-play-btn');
  await tabSelect('telemetry');
  await capture('04-informacion-desde-recorrido');
  await tabSelect('history');
  await verify('Progreso conservado entre secciones', `document.querySelector('#tour-step-counter').textContent.startsWith('Paso 12 de 12')`);
  await tabSelect('history');
  await click('#historical-events-panel > summary');
  await verify('Catálogo único de 14', `document.querySelectorAll('.historical-event-list button').length === 14 && document.querySelector('.hist-decade-bar').hidden && document.querySelector('#historical-events-panel').open`);
  await verify('Nombres completos multilínea', `[...document.querySelectorAll('.historical-event-list button')].every(button => button.scrollWidth <= button.clientWidth + 1)`);
  await capture('05-catalogo-14');
  for (const event of VOYAGER_HISTORICAL_EVENTS) {
    await selectEvent(event.id);
    await verify(`Catálogo ${event.id}`, `document.querySelector('[aria-selected="true"]').dataset.inspectorTab === 'history' && document.querySelector('#historical-event-select').value === ${JSON.stringify(event.id)} && document.querySelector('#hist-clock-utc').textContent.includes(${JSON.stringify(event.dateUtc.slice(0, 10))}) && document.querySelector('#historical-journey-status').textContent.includes(${JSON.stringify(event.probeName)})`);
  }
  await capture('06-catalogo-seleccion');
  const extra = VOYAGER_HISTORICAL_EVENTS.find(event => !HITOS_RECORRIDO_GUIADO.some(hito => hito.idEvento === event.id));
  assert.ok(extra);
  await selectEvent(extra.id);
  await verify('Acontecimiento adicional sin paso falso', `document.querySelector('#historical-journey-status').textContent.includes('Exploración libre') && document.querySelector('#tour-step-counter').textContent.startsWith('Paso 12 de 12')`);
  await capture('07-acontecimiento-adicional');
  await tabSelect('explore');
  await click('#hist-start-tour-btn');
  await verify('Retorno al paso narrativo', `document.querySelector('#historical-event-select').value === ${JSON.stringify(HITOS_RECORRIDO_GUIADO[11].idEvento)} && document.querySelector('#tour-step-counter').textContent.startsWith('Paso 12 de 12')`);
  await tabSelect('navigation');
  await capture('08-camaras');
  await tabSelect('photos');
  await capture('09-fotografias');
  await tabSelect('history');
  await selectEvent('v1-jupiter-1979');
  await tabSelect('navigation');
  await click('#hist-cam-fp-btn');
  await verify('Primera persona Voyager accesible', `window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica().modo === 'first_person'`);
  await capture('11-primera-persona');
  await click('#hist-cam-exterior-btn');
  await verify('Regreso a cámara exterior', `window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica().modo === 'exterior'`);
  await tabSelect('photos');
  await click('#hist-photo-list [data-photo-id]:not([hidden]) [data-photo-act="zoom"]');
  await verify('Fotografía NASA ampliada', `!document.querySelector('#photo-lightbox-modal').hidden && document.querySelector('#lightbox-img').complete && document.querySelector('#lightbox-img').naturalWidth > 0`);
  await capture('12-fotografia-nasa');
  await click('#lightbox-compare-btn');
  await verify('Comparador NASA y 3D activo', `!document.querySelector('#photo-comparator-panel').hidden && document.querySelector('#comp-photo-img').naturalWidth > 0 && window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica().modo === 'photo_recreation'`);
  await capture('13-comparador-nasa-3d');
  await click('#comp-close-btn');
  await verify('Comparador cerrado y cámara exterior', `document.querySelector('#photo-comparator-panel').hidden && window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica().modo === 'exterior'`);
  const jdAntes = await evalInPage(`window.__SIMULADOR_DIAGNOSTICO__.obtenerSnapshotHistorico().jdTdb`);
  await click('#hist-play-btn');
  await pause(900);
  await click('#hist-play-btn');
  await verify('Reproducción temporal independiente', `window.__SIMULADOR_DIAGNOSTICO__.obtenerSnapshotHistorico().jdTdb > ${jdAntes}`);
  await verify('Tiempo libre sin acontecimiento contradictorio', `document.querySelector('#historical-journey-status').textContent.startsWith('Tiempo libre')`);
  await click('#historical-time-options > summary');
  await verify('Tiempo separado del catálogo', `document.querySelector('#historical-time-options > summary').textContent.startsWith('Tiempo') && !!document.querySelector('.temporal-open-catalog')`);
  await capture('10-tiempo');
  await click('.temporal-open-catalog');
  await verify('Acceso temporal abre el catálogo', `document.querySelector('[aria-selected="true"]').dataset.inspectorTab === 'history'`);
  for (const [width, height] of [[1366, 768], [768, 1024], [390, 844]]) {
    await resize(width, height);
    await verify(`Sin desbordamiento horizontal ${width}`, `document.documentElement.scrollWidth <= innerWidth`);
    await capture(`responsive-${width}x${height}`);
  }
  await selectEvent('v2-uranus-1986');
  await verify('Catálogo operable en móvil', `document.querySelector('#historical-event-select').value === 'v2-uranus-1986' && document.querySelector('#hist-clock-utc').textContent.includes('1986-01-24')`);
  await tabSelect('history');
  await verify('Recorrido operable en móvil', `document.querySelector('#tour-step-counter').textContent.startsWith('Paso 7 de 12')`);
  await capture('responsive-390x844-recorrido');
  await call('Page.navigate', { url: 'http://127.0.0.1:5173/?mode=historical' });
  await verify('Entrada histórica móvil cargada', `window.__SIMULADOR_DIAGNOSTICO__?.obtenerModoOperacion() === 'historico' && !!window.__SIMULADOR_DIAGNOSTICO__?.obtenerSnapshotHistorico()`, 30000);
  if (await evalInPage(`!document.querySelector('#historical-welcome-modal').hidden`)) await click('#welcome-explore-free');
  await tabSelect('explore');
  await verify('Acceso al recorrido visible en móvil', `(() => { const b = document.querySelector('#hist-start-tour-btn'); b.scrollIntoView({block:'nearest'}); const r = b.getBoundingClientRect(); return r.top >= 96 && r.bottom <= innerHeight - 170 && b.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)); })()`);
  await capture('responsive-390x844-acceso');
  await click('[data-mode-btn="experimental"]');
  await verify('Modo Experimental disponible', `window.__SIMULADOR_DIAGNOSTICO__.obtenerModoOperacion() === 'experimental'`);
  await click('[data-mode-btn="exploracion"]');
  await verify('Modo Sistema Solar disponible', `window.__SIMULADOR_DIAGNOSTICO__.obtenerModoOperacion() === 'exploracion'`);
  await click('[data-mode-btn="historico"]');
  await verify('Regreso a Misiones históricas', `window.__SIMULADOR_DIAGNOSTICO__.obtenerModoOperacion() === 'historico' && !!window.__SIMULADOR_DIAGNOSTICO__.obtenerSnapshotHistorico()`);
  assert.deepEqual(errors, [], 'Errores de consola o recursos');
  console.log('COMPLETE', checks.length, 'checks', captures.length, 'captures');
} catch (error) {
  errors.push({ kind: 'test', text: error.stack || String(error) });
  console.error(error);
  process.exitCode = 1;
  try { await capture('fallo'); } catch {}
} finally {
  await fs.writeFile(`${output}/manifest.json`, JSON.stringify({ checks, errors, captures }, null, 2));
  ws.close();
}
