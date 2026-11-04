import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { VOYAGER_HISTORICAL_EVENTS } from '../src/science/VoyagerHistoricalEvents.js';
import { RADIOS_FISICOS_KM } from '../src/graphics/ScaleModeConfig.js';

const output = process.env.EVIDENCE_DIR || 'evidencias/etapa-02/Despues';
await fs.mkdir(output, { recursive: true });
const tabs = await fetch('http://127.0.0.1:9338/json').then(response => response.json());
const tab = tabs.find(item => item.type === 'page' && item.url.includes('5173'));
assert.ok(tab, 'Se requiere Chrome CDP en 9338 y Vite en 5173');
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
    errors.push({ kind: 'javascript', text: detail.exception?.description || detail.text, url: detail.url, line: detail.lineNumber });
  }
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
    errors.push({ kind: 'log', text: message.params.entry.text });
  }
  if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
    errors.push({ kind: 'http', url: message.params.response.url, status: message.params.response.status });
  }
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
    await pause(120);
  }
  throw Error(`No se cumplió: ${name}`);
}
async function click(selector) {
  const center = await evalInPage(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) throw Error('Falta ${selector}');
    node.scrollIntoView({ block: 'nearest' });
    const rect = node.getBoundingClientRect();
    if (rect.width < 30 || rect.height < (node.type === 'range' ? 8 : 30)) throw Error('Control demasiado pequeño u oculto: ${selector}');
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    if (x < 0 || x >= innerWidth || y < 0 || y >= innerHeight) throw Error('Control fuera del viewport: ${selector}');
    if (!node.contains(document.elementFromPoint(x, y))) throw Error('Control obstruido: ${selector}');
    return { x, y };
  })()`);
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...center, button: 'left', clickCount: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...center, button: 'left', clickCount: 1 });
  await pause(160);
}
async function capture(name, extra = {}) {
  await pause(300);
  const png = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await fs.writeFile(`${output}/${name}.png`, Buffer.from(png.data, 'base64'));
  const state = await evalInPage(`(() => ({
    width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
    mode: window.__SIMULADOR_DIAGNOSTICO__?.obtenerModoOperacion(),
    inspector: document.querySelector('#context-inspector')?.dataset.state,
    tab: document.querySelector('[data-inspector-tab][aria-selected="true"]')?.dataset.inspectorTab,
    event: document.querySelector('#historical-event-select')?.value,
    step: document.querySelector('#tour-step-counter')?.textContent,
    date: document.querySelector('#hist-clock-utc')?.textContent,
    camera: window.__SIMULADOR_DIAGNOSTICO__?.obtenerEstadoCamaraHistorica(),
    engine: window.__SIMULADOR_DIAGNOSTICO__?.obtenerEstadoMotorHistorico(),
    comparatorOpen: !document.querySelector('#photo-comparator-panel')?.hidden,
    comparatorDateTdb: window.__SIMULADOR_DIAGNOSTICO__?.obtenerSnapshotComparador()?.timeLabels.labelTdb ?? null,
    photoLoaded: document.querySelector('#comp-photo-img')?.naturalWidth > 0
  }))()`);
  captures.push({ name, file: `Despues/${name}.png`, state, ...extra });
  console.log('CAPTURE', name);
}
async function resize(width, height) {
  await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await pause(250);
}
async function tabSelect(id) {
  if (await evalInPage(`document.querySelector('#context-inspector').dataset.state === 'closed'`)) await click('#inspector-toggle');
  await click(`[data-inspector-tab="${id}"]`);
}
async function selectEvent(id) {
  await tabSelect('history');
  if (await evalInPage(`!document.querySelector('#historical-events-panel').open`)) await click('#historical-events-panel > summary');
  await click(`.historical-event-list button[data-event-id="${id}"]`);
  await verify(`Acontecimiento ${id}`, `document.querySelector('#historical-event-select').value === ${JSON.stringify(id)}`);
}
async function geometry() {
  return evalInPage(`(() => {
    const d = window.__SIMULADOR_DIAGNOSTICO__, s = d.obtenerSnapshotHistorico(), c = d.obtenerEstadoCamaraHistorica();
    const probe = s.probes[c.idSondaObservador], targetId = c.objetivoMirada;
    const target = targetId === 'Sol' ? { position: {x:0,y:0,z:0}, visual: {posicionEscena:{x:0,y:0,z:0}} }
      : s.rawPlanets[targetId] ? { position: s.rawPlanets[targetId].state.position, visual: s.planets[targetId] }
      : s.moons[targetId] ? { position: s.moons[targetId].state.position, visual: s.moons[targetId].visual }
      : null;
    if (!probe?.state || !target) return null;
    const p = probe.positionKm, q = target.position, sp = probe.visual.posicionEscena, sq = target.visual.posicionEscena;
    const vectorKm = { x:q.x-p.x, y:q.y-p.y, z:q.z-p.z };
    const vectorEscena = { x:sq.x-sp.x, y:sq.y-sp.y, z:sq.z-sp.z };
    const distanciaKm = Math.hypot(vectorKm.x,vectorKm.y,vectorKm.z);
    const normaEscena = Math.hypot(vectorEscena.x,vectorEscena.y,vectorEscena.z);
    const look = {x:c.objetivoEscena[0]-c.posicionEscena[0], y:c.objetivoEscena[1]-c.posicionEscena[1], z:c.objetivoEscena[2]-c.posicionEscena[2]};
    const lookNorm = Math.hypot(look.x,look.y,look.z);
    const dot = (look.x*vectorEscena.x+look.y*vectorEscena.y+look.z*vectorEscena.z)/(lookNorm*normaEscena);
    const positionErrorScene = Math.hypot(c.posicionEscena[0]-sp.x,c.posicionEscena[1]-sp.y,c.posicionEscena[2]-sp.z);
    return { utc:s.timeLabels.labelUtc, tdb:s.timeLabels.labelTdb, observer:c.idSondaObservador,
      target:targetId, sourceStatus:probe.status, vectorKm, vectorScene:vectorEscena, distanceKm:distanciaKm,
      scenePositionError:positionErrorScene, directionDot:dot,
      fovVerticalDeg:c.fovGrados, fovHorizontalDeg:c.fovHorizontalGrados,
      fovReferenceDeg:c.fovReferenciaGrados, fovKind:c.fovTipo,
      angularDiameterDeg:null };
  })()`);
}
async function cameraScenario(id, target, observer, name, width = 1366) {
  await resize(width, width === 390 ? 844 : width === 768 ? 1024 : 768);
  await selectEvent(id);
  await tabSelect('navigation');
  await click('#hist-cam-fp-btn');
  await verify(`Cámara ${name}`, `(() => {const c=window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica();return c.modo==='first_person' && c.idSondaObservador===${JSON.stringify(observer)} && c.objetivoMirada===${JSON.stringify(target)};})()`);
  const g = await geometry();
  assert.ok(g, `Falta geometría ${name}`);
  assert.ok(g.scenePositionError < 1e-7, `Cámara fuera de Voyager: ${name}: ${g.scenePositionError}`);
  assert.ok(g.directionDot > 0.999999, `Dirección incorrecta: ${name}: ${g.directionDot}`);
  const radius = RADIOS_FISICOS_KM[target];
  if (radius && target !== 'Sol') {
    assert.ok(g.distanceKm > radius, `Observador dentro de ${target}: ${name}`);
    g.angularDiameterDeg = 2 * Math.asin(radius / g.distanceKm) * 180 / Math.PI;
    const frame = await evalInPage(`window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica().encuadreObjetivo`);
    assert.ok(frame && Math.abs(frame.diametroEsferaGrados - g.angularDiameterDeg) < 0.002,
      `Diámetro angular inconsistente: ${name}`);
    if (frame.cabeEnAreaLibre === false) {
      await verify(`Recorte anunciado ${name}`, `document.querySelector('#fp-indicator-target').textContent.includes('encuadre parcial')`);
    } else {
      assert.ok(g.fovVerticalDeg + 0.05 >= frame.fovVerticalNecesarioGrados,
        `Encuadre anunciado completo sin campo suficiente: ${name}`);
    }
    if (target === 'Saturno') assert.equal(frame.incluyeAnillos, true, `Anillos no evaluados: ${name}`);
  }
  await capture(name, { geometry: g });
}

try {
  for (const domain of ['Page', 'Runtime', 'Network', 'Log']) await call(`${domain}.enable`);
  await call('Page.bringToFront');
  await resize(390, 844);
  await call('Page.navigate', { url: 'http://127.0.0.1:5173/?mode=historical' });
  await verify('Modo histórico cargado', `window.__SIMULADOR_DIAGNOSTICO__?.obtenerModoOperacion() === 'historico' && !!window.__SIMULADOR_DIAGNOSTICO__?.obtenerSnapshotHistorico()`, 30000);
  if (await evalInPage(`!document.querySelector('#historical-welcome-modal').hidden`)) await click('#welcome-explore-free');

  await tabSelect('explore');
  await click('#hist-start-tour-btn');
  await verify('Recorrido de 12 pasos', `document.querySelector('#tour-step-counter').textContent.startsWith('Paso 1 de 12')`);
  await verify('Narración desplazable y navegación accesible', `(() => {const p=document.querySelector('#inspector-content'),n=document.querySelector('#tour-navigation');return p.scrollHeight>p.clientHeight && getComputedStyle(n).position==='static';})()`);
  await click('#tour-play-btn');
  await verify('Siguiente pulsado a 390', `document.querySelector('#tour-step-counter').textContent.startsWith('Paso 2 de 12')`);
  await evalInPage(`document.querySelector('#tour-navigation').scrollIntoView({block:'nearest'})`);
  await verify('Navegación móvil completamente visible', `(() => {const p=document.querySelector('#inspector-content').getBoundingClientRect();return ['#tour-prev-btn','#tour-play-btn'].every(q=>{const r=document.querySelector(q).getBoundingClientRect();return r.height>=44&&r.top>=p.top&&r.bottom<=p.bottom&&r.left>=p.left&&r.right<=p.right;});})()`);
  await capture('01-movil-siguiente-pulsado');
  await click('#tour-prev-btn');
  await verify('Anterior pulsado a 390', `document.querySelector('#tour-step-counter').textContent.startsWith('Paso 1 de 12')`);
  await verify('Sin scroll horizontal a 390', `document.documentElement.scrollWidth <= innerWidth + 1`);
  await evalInPage(`document.querySelector('#tour-navigation').scrollIntoView({block:'nearest'})`);
  await capture('02-movil-anterior-pulsado');
  await tabSelect('history');
  await click('#historical-events-panel > summary');
  await verify('Catálogo único de 14 legible', `(() => {const buttons=[...document.querySelectorAll('.historical-event-list button')];return buttons.length===14 && buttons.every(b => b.scrollWidth <= b.clientWidth + 1 && b.querySelector('strong').textContent.length > 8) && document.querySelector('#historical-event-select').type==='hidden';})()`);
  await capture('03-catalogo-movil');
  await tabSelect('history');
  await verify('Progreso conservado entre secciones', `document.querySelector('#tour-step-counter').textContent.startsWith('Paso 1 de 12')`);
  await tabSelect('history');
  for (const ev of VOYAGER_HISTORICAL_EVENTS) await selectEvent(ev.id);
  await verify('Selección sincronizada con recorrido', `document.querySelector('#tour-step-counter').textContent.startsWith('Paso 12 de 12')`);
  await resize(1920,1080);
  await tabSelect('history');
  await verify('Sin scroll horizontal a 1920', `document.documentElement.scrollWidth <= innerWidth + 1`);
  await capture('04-catalogo-escritorio');
  await resize(768,1024);
  await verify('Sin scroll horizontal a 768', `document.documentElement.scrollWidth <= innerWidth + 1`);
  await capture('05-catalogo-tableta');
  await resize(1366,768);
  await verify('Sin scroll horizontal a 1366', `document.documentElement.scrollWidth <= innerWidth + 1`);
  await capture('06-catalogo-portatil');

  const scenarios = [
    ['v1-jupiter-1979','Jupiter','voyager-1','07-v1-jupiter'],
    ['v2-jupiter-1979','Jupiter','voyager-2','08-v2-jupiter'],
    ['v1-saturn-1980','Saturno','voyager-1','09-v1-saturno'],
    ['v2-saturn-1981','Saturno','voyager-2','10-v2-saturno'],
    ['v2-uranus-1986','Urano','voyager-2','11-v2-urano'],
    ['v2-neptune-1989','Neptuno','voyager-2','12-v2-neptuno'],
    ['v1-pale-blue-dot-1990','Tierra','voyager-1','13-pale-blue-dot'],
    ['v1-termination-shock-2004','Sol','voyager-1','14-v1-interestelar'],
    ['v2-heliopause-2018','Sol','voyager-2','15-v2-interestelar']
  ];
  for (const scenario of scenarios) await cameraScenario(...scenario);
  await cameraScenario('v2-neptune-1989','Neptuno','voyager-2','12a-neptuno-movil-panel',390);
  await verify('Neptuno móvil con panel declara recorte', `window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica().encuadreObjetivo.cabeEnAreaLibre===false`);
  await click('#inspector-close');
  await verify('Neptuno móvil sin panel cabe en área libre', `(() => {const c=window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica();return document.querySelector('#context-inspector').dataset.state==='closed'&&c.encuadreObjetivo.cabeEnAreaLibre===true;})()`);
  await capture('12b-neptuno-movil-libre');
  await resize(1366,768);
  await selectEvent('v2-heliopause-2018');
  await tabSelect('navigation');
  await click('[data-fp-probe="voyager-1"]');
  await verify('Cambio a Voyager 1 desde primera persona', `(() => {const d=window.__SIMULADOR_DIAGNOSTICO__,c=d.obtenerEstadoCamaraHistorica(),p=d.obtenerSnapshotHistorico().probes['voyager-1'].visual.posicionEscena;return c.modo==='first_person'&&c.idSondaObservador==='voyager-1'&&Math.hypot(c.posicionEscena[0]-p.x,c.posicionEscena[1]-p.y,c.posicionEscena[2]-p.z)<1e-7;})()`);
  await capture('15a-cambio-observador-v1');
  await click('[data-fp-probe="voyager-2"]');
  await verify('Regreso a Voyager 2', `window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica().idSondaObservador==='voyager-2'`);
  const jdBeforeScrub = await evalInPage(`window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoMotorHistorico().jdTdb`);
  await click('#hist-timeline-range');
  await verify('Seguimiento al cambiar fecha con deslizador', `(() => {const d=window.__SIMULADOR_DIAGNOSTICO__,c=d.obtenerEstadoCamaraHistorica();return Math.abs(d.obtenerEstadoMotorHistorico().jdTdb-${jdBeforeScrub})>1&&c.modo==='first_person'&&c.idSondaObservador==='voyager-2'&&c.objetivoMirada==='Sol';})()`);
  await capture('15b-seguimiento-otra-fecha');
  await selectEvent('v1-jupiter-1979');
  await tabSelect('navigation');
  await click('#hist-cam-fp-btn');
  await click('[data-fp-target="Tierra"]');
  await verify('Cambio manual de objetivo', `window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica().objetivoMirada==='Tierra'`);
  await capture('16-objetivo-manual');
  await click('#fp-reframe-btn');
  await verify('Reencuadre contextual', `window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica().objetivoMirada==='Jupiter'`);
  await pause(400);
  assert.ok((await geometry()).directionDot > 0.999999, 'El reencuadre debe finalizar mirando al centro geométrico');
  await capture('17-reencuadre-jupiter');
  await click('[data-fp-fov="0.424"]');
  await verify('FOV ISS cuadrado', `(() => {const c=window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica();return c.fovTipo==='instrumento_cuadrado'&&Math.abs(c.fovReferenciaGrados-.424)<1e-9&&!document.querySelector('#iss-square-footprint').hidden;})()`);
  await capture('18-fov-iss-nac');
  await resize(390,844);
  await verify('FOV adaptado a retrato', `(() => {const c=window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica();return c.fovGrados>c.fovReferenciaGrados && Math.abs(c.fovHorizontalGrados-c.fovReferenciaGrados)<1e-5;})()`);
  await capture('19-fov-iss-movil');
  await click('[data-fp-fov="18"]');
  await verify('FOV contextual vertical', `(() => {const c=window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica();return c.fovTipo==='contextual_vertical'&&c.fovGrados===18;})()`);
  await capture('20-fov-contextual-movil');
  await click('#fp-exit-btn');
  await verify('Salida a exterior', `window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica().modo==='exterior'`);
  await capture('21-exterior-movil');
  await resize(1366,768);
  await selectEvent('v1-jupiter-1979');
  await capture('22-antes-comparador');
  const before = await evalInPage(`(() => {const d=window.__SIMULADOR_DIAGNOSTICO__;return {motor:d.obtenerEstadoMotorHistorico(),camera:d.obtenerEstadoCamaraHistorica(),event:document.querySelector('#historical-event-select').value,step:document.querySelector('#tour-step-counter').textContent};})()`);
  await click('#hist-ev-photo-btn');
  await verify('Comparador abierto con foto y snapshot local', `(() => {const d=window.__SIMULADOR_DIAGNOSTICO__;return !document.querySelector('#photo-comparator-panel').hidden&&!!d.obtenerSnapshotComparador()&&document.querySelector('#comp-photo-img').naturalWidth>0;})()`,30000);
  await verify('Fecha global no alterada', `Math.abs(window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoMotorHistorico().jdTdb - ${before.motor.jdTdb}) < 1e-10`);
  await capture('23-comparador-iss');
  await click('#comp-fov-ctx-btn');
  await verify('FOV contextual en comparador', `window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica().fovTipo==='contextual_vertical'`);
  await capture('24-comparador-contextual');
  await click('#comp-close-btn');
  await verify('Fecha, misión, cámara y progreso restaurados', `(() => {const d=window.__SIMULADOR_DIAGNOSTICO__,m=d.obtenerEstadoMotorHistorico(),c=d.obtenerEstadoCamaraHistorica();return Math.abs(m.jdTdb-${before.motor.jdTdb})<1e-10&&m.selectedProbeId===${JSON.stringify(before.motor.selectedProbeId)}&&m.visibilityMode===${JSON.stringify(before.motor.visibilityMode)}&&c.modo===${JSON.stringify(before.camera.modo)}&&document.querySelector('#historical-event-select').value===${JSON.stringify(before.event)}&&document.querySelector('#tour-step-counter').textContent===${JSON.stringify(before.step)};})()`);
  await capture('25-despues-comparador');
  await tabSelect('history');
  await verify('Recorrido reanudable', `document.querySelector('#tour-step-counter').textContent===${JSON.stringify(before.step)}`);
  await capture('26-contexto-recuperado');

  await resize(390,844);
  await tabSelect('history');
  if (await evalInPage(`!document.querySelector('#historical-events-panel').open`)) await click('#historical-events-panel > summary');
  await click('#hist-ev-photo-btn');
  await verify('Comparador móvil abierto', `(() => {const d=window.__SIMULADOR_DIAGNOSTICO__;return !document.querySelector('#photo-comparator-panel').hidden&&!!d.obtenerSnapshotComparador();})()`);
  await verify('Comparador móvil legible en bloques verticales', `(() => {const a=document.querySelector('.comparator-card-a').getBoundingClientRect(),b=document.querySelector('.comparator-banner-b').getBoundingClientRect();return a.width>=300&&b.width>=300&&a.bottom<b.top&&b.bottom<=innerHeight-130;})()`);
  await capture('27-comparador-movil');
  await click('#comp-fov-ctx-btn');
  await verify('FOV comparador móvil pulsable', `document.querySelector('#comp-fov-ctx-btn').getAttribute('aria-pressed')==='true'`);
  await click('#comp-close-btn');
  await verify('Comparador móvil cerrado', `document.querySelector('#photo-comparator-panel').hidden`);
  await resize(1366,768);
  await selectEvent('v1-jupiter-1979');
  await click('#hist-play-btn');
  await verify('Reproducción activa antes de comparar', `window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoMotorHistorico().playing===true`);
  await click('#hist-ev-photo-btn');
  await verify('Comparador pausa reproducción sin mover fecha global', `(() => {const d=window.__SIMULADOR_DIAGNOSTICO__;return !!d.obtenerSnapshotComparador()&&!d.obtenerEstadoMotorHistorico().playing;})()`);
  const jdPaused = await evalInPage(`window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoMotorHistorico().jdTdb`);
  await pause(350);
  await verify('Fecha pausada estable durante comparación', `Math.abs(window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoMotorHistorico().jdTdb-${jdPaused})<1e-10`);
  await click('#comp-close-btn');
  await verify('Reproducción recuperada al cerrar', `window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoMotorHistorico().playing===true`);
  await click('#hist-play-btn');
  await verify('Pausa manual posterior', `window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoMotorHistorico().playing===false`);
  await capture('28-reproduccion-recuperada');

  await click('[data-mode-btn="experimental"]');
  await verify('Modo experimental conservado', `window.__SIMULADOR_DIAGNOSTICO__.obtenerModoOperacion()==='experimental'`);
  await capture('29-modo-experimental');
  await click('[data-mode-btn="exploracion"]');
  await verify('Modo exploración conservado', `window.__SIMULADOR_DIAGNOSTICO__.obtenerModoOperacion()==='exploracion'`);
  await capture('30-modo-exploracion');
  await click('[data-mode-btn="historico"]');
  await verify('Modo histórico recuperable', `window.__SIMULADOR_DIAGNOSTICO__.obtenerModoOperacion()==='historico'`);
  await capture('31-modo-historico');

  await fs.writeFile(`${output}/stage2-results.json`, JSON.stringify({ checks, captures, errors, source:'Chrome CDP, clic físico Input.dispatchMouseEvent', timestamp:new Date().toISOString() }, null, 2));
  assert.deepEqual(errors, [], `Errores de consola/red: ${JSON.stringify(errors)}`);
  console.log(`RESULTADO: ${checks.length} comprobaciones, ${captures.length} capturas, ${errors.length} errores`);
} catch (error) {
  await fs.writeFile(`${output}/stage2-results.json`, JSON.stringify({ checks, captures, errors, failure:error.stack, timestamp:new Date().toISOString() }, null, 2));
  console.error(error);
  process.exitCode = 1;
} finally {
  ws.close();
}
