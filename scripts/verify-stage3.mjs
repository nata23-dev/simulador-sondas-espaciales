import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const output = process.env.EVIDENCE_DIR || 'evidence/stage3/Escenarios';
await fs.mkdir(output, { recursive: true });
const tabs = await fetch('http://127.0.0.1:9338/json').then(response => response.json());
const tab = tabs.find(item => item.type === 'page' && item.url.includes('5173'));
assert.ok(tab, 'Se requiere Chrome CDP en 9338 y Vite en 5173');
const socket = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(resolve => { socket.onopen = resolve; });
let sequence = 0;
const pending = new Map();
const checks = [];
const errors = [];
const captures = [];
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const request = pending.get(message.id);
    if (message.error) request?.reject(Error(JSON.stringify(message.error)));
    else request?.resolve(message.result);
    pending.delete(message.id);
  }
  if (message.method === 'Runtime.exceptionThrown') errors.push({ type: 'javascript', text: message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text });
  if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) errors.push({ type: 'http', url: message.params.response.url, status: message.params.response.status });
};
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function verify(name, expression, timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await evaluate(expression) === true) {
      checks.push(name); console.log('PASS', name); return;
    }
    await pause(120);
  }
  throw Error(`No se cumplió: ${name}`);
}
async function click(selector) {
  const point = await evaluate(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) throw Error('Falta ${selector}');
    node.scrollIntoView({block:'nearest'});
    const rect = node.getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    if (rect.width < 30 || rect.height < 30 || x < 0 || x >= innerWidth || y < 0 || y >= innerHeight) throw Error('Control fuera de pantalla: ${selector}');
    if (!node.contains(document.elementFromPoint(x, y))) throw Error('Control obstruido: ${selector}');
    return {x, y};
  })()`);
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  await pause(180);
}
async function resize(width, height) {
  await call('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: false});
  await pause(220);
}
async function capture(name) {
  await pause(240);
  const png = await call('Page.captureScreenshot', {format:'png', captureBeyondViewport:false});
  await fs.writeFile(`${output}/${name}.png`, Buffer.from(png.data, 'base64'));
  const state = await evaluate(`(() => {
    const d=window.__SIMULADOR_DIAGNOSTICO__, c=d.obtenerEstadoCamaraHistorica(), i=document.querySelector('#context-inspector'), t=document.querySelector('#historical-timeline-panel');
    return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,mode:d.obtenerModoOperacion(),camera:c,
      event:document.querySelector('#historical-event-select').value,step:document.querySelector('#tour-step-counter').textContent,
      date:document.querySelector('#hist-clock-utc').textContent,tab:document.querySelector('[data-inspector-tab][aria-selected=true]')?.dataset.inspectorTab,
      inspector:i.dataset.state,inspectorBottom:i.getBoundingClientRect().bottom,timelineTop:t.getBoundingClientRect().top,
      comparatorOpen:!document.querySelector('#photo-comparator-panel').hidden,photoLoaded:document.querySelector('#comp-photo-img')?.naturalWidth>0};
  })()`);
  captures.push({name,file:`${name}.png`,state}); console.log('CAPTURE', name);
}
async function tabSelect(id) {
  if (await evaluate(`document.querySelector('#context-inspector').dataset.state==='closed'`)) await click('#inspector-toggle');
  await click(`[data-inspector-tab="${id}"]`);
}
async function selectEvent(id) {
  await tabSelect('history');
  if (await evaluate(`!document.querySelector('#historical-events-panel').open`)) await click('#historical-events-panel > summary');
  await click(`.historical-event-list button[data-event-id="${id}"]`);
  await verify(`Acontecimiento ${id}`, `document.querySelector('#historical-event-select').value===${JSON.stringify(id)}`);
}

try {
  for (const domain of ['Page','Runtime','Network','Log']) await call(`${domain}.enable`);
  await call('Page.bringToFront');
  await resize(1366,768);
  await call('Page.navigate', {url:'http://127.0.0.1:5173/?mode=historical'});
  await verify('Entrada histórica de usuario nuevo', `window.__SIMULADOR_DIAGNOSTICO__?.obtenerModoOperacion()==='historico' && !!window.__SIMULADOR_DIAGNOSTICO__?.obtenerSnapshotHistorico()`,30000);
  if (await evaluate(`!document.querySelector('#historical-welcome-modal').hidden`)) await click('#welcome-start-guided');
  else { await tabSelect('explore'); await click('#hist-start-tour-btn'); }
  await verify('Guía y catálogo comparten Historia', `document.querySelector('[aria-selected=true]').dataset.inspectorTab==='history' && document.querySelector('#tour-step-counter').textContent.startsWith('Paso 1 de 12') && !document.querySelector('#pane-tour').hidden`);
  await capture('01-recorrido-nuevo-1366');

  await tabSelect('explore');
  await click('[data-mission-choice="voyager-1"]');
  await verify('Voyager 1 seleccionada', `document.querySelector('[data-mission-choice="voyager-1"]').getAttribute('aria-pressed')==='true' && window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoMotorHistorico().visibilityMode==='voyager-1'`);
  await capture('02-voyager-1-1366');
  await click('[data-mission-choice="voyager-2"]');
  await verify('Voyager 2 seleccionada', `document.querySelector('[data-mission-choice="voyager-2"]').getAttribute('aria-pressed')==='true' && window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoMotorHistorico().visibilityMode==='voyager-2'`);
  await capture('03-voyager-2-1366');

  await selectEvent('v2-neptune-1989');
  await tabSelect('navigation');
  await click('#hist-cam-fp-btn');
  await verify('Neptuno desde Voyager 2 con objetivo explícito', `(() => {const c=window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica();return c.modo==='first_person'&&c.idSondaObservador==='voyager-2'&&c.objetivoMirada==='Neptuno'&&document.querySelector('#fp-indicator-probe').textContent.includes('Voyager 2')&&document.querySelector('#camera-context').textContent.includes('sin orientación CK/IK');})()`);
  await capture('04-neptuno-desde-voyager-1366');
  await tabSelect('telemetry');
  await capture('05-datos-sin-perder-camara-1366');
  await tabSelect('navigation');
  await verify('Cámara intacta después de leer datos', `window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica().modo==='first_person'`);
  await click('#inspector-close');
  await verify('Regreso a escena despejada', `document.querySelector('#context-inspector').dataset.state==='closed' && window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica().modo==='first_person'`);
  await capture('06-neptuno-despejado-1366');

  await tabSelect('explore');
  await click('#hist-start-tour-btn');
  const stepBeforeDate = await evaluate(`document.querySelector('#tour-step-counter').textContent`);
  await click('#historical-date-options > summary');
  await evaluate(`(() => {const y=document.querySelector('#hist-year-select');y.value='1987';y.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await verify('Fecha libre conserva el paso del recorrido', `document.querySelector('#hist-clock-utc').textContent.includes('1987') && document.querySelector('#tour-step-counter').textContent===${JSON.stringify(stepBeforeDate)} && document.querySelector('#historical-journey-status').textContent.includes('Tiempo libre')`);
  await capture('07-fecha-libre-1366');
  await tabSelect('explore');
  await click('#hist-start-tour-btn');
  await verify('Continuar vuelve al hito guardado', `document.querySelector('#tour-step-counter').textContent===${JSON.stringify(stepBeforeDate)} && document.querySelector('#hist-clock-utc').textContent.includes('1989-08-25')`);
  await capture('08-recorrido-reanudado-1366');

  await selectEvent('v2-neptune-1989');
  const beforeComparator = await evaluate(`(() => ({date:document.querySelector('#hist-clock-utc').textContent,camera:window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica().modo,step:document.querySelector('#tour-step-counter').textContent,tab:document.querySelector('[aria-selected=true]').dataset.inspectorTab,catalog:document.querySelector('#historical-events-panel').open}))()`);
  await click('#hist-ev-photo-btn');
  await verify('Comparador abierto', `!document.querySelector('#photo-comparator-panel').hidden && document.querySelector('#comp-photo-img').naturalWidth>0`);
  await capture('09-comparador-1366');
  await click('#comp-close-btn');
  await verify('Comparador restaura fecha, cámara y panel', `(() => {const x=${JSON.stringify(beforeComparator)};return document.querySelector('#hist-clock-utc').textContent===x.date&&window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica().modo===x.camera&&document.querySelector('#tour-step-counter').textContent===x.step&&document.querySelector('[aria-selected=true]').dataset.inspectorTab===x.tab&&document.querySelector('#historical-events-panel').open===x.catalog})()`);
  await capture('10-comparador-cerrado-1366');

  await click('[data-mode-btn="exploracion"]');
  await tabSelect('explore');
  await click('[data-destination="Saturno"]');
  await verify('Exploración libre de Saturno', `document.querySelector('#app').dataset.appMode==='exploracion' && document.querySelector('[data-destination="Saturno"]').getAttribute('aria-pressed')==='true'`);
  await capture('11-exploracion-libre-1366');
  await click('#immersive-button');
  await verify('Modo inmersivo reversible', `document.querySelector('#app').classList.contains('is-immersive')`);
  await click('#immersive-button');
  await verify('Regreso desde modo inmersivo', `!document.querySelector('#app').classList.contains('is-immersive') && document.querySelector('#app').dataset.appMode==='exploracion'`);

  await resize(1920,1080);
  await click('[data-mode-btn="historico"]');
  if (await evaluate(`!document.querySelector('#historical-welcome-modal').hidden`)) await click('#welcome-explore-free');
  await selectEvent('v2-neptune-1989');
  await tabSelect('navigation');
  await click('#hist-cam-fp-btn');
  await verify('Escritorio amplio sin desbordamiento', `document.documentElement.scrollWidth<=innerWidth+1`);
  await capture('12-neptuno-1920');

  await resize(390,844);
  await call('Page.navigate', {url:'http://127.0.0.1:5173/?mode=historical'});
  await verify('Entrada móvil cargada', `window.__SIMULADOR_DIAGNOSTICO__?.obtenerModoOperacion()==='historico' && !!window.__SIMULADOR_DIAGNOSTICO__?.obtenerSnapshotHistorico()`,30000);
  if (await evaluate(`!document.querySelector('#historical-welcome-modal').hidden`)) await click('#welcome-explore-free');
  await verify('Móvil inicia con escena despejada', `document.querySelector('#context-inspector').dataset.state==='closed' && document.documentElement.scrollWidth<=innerWidth+1`);
  await capture('13-entrada-movil-despejada');
  await tabSelect('explore');
  await click('#hist-start-tour-btn');
  await verify('Guía móvil accesible', `document.querySelector('[aria-selected=true]').dataset.inspectorTab==='history' && document.querySelector('#tour-play-btn').getBoundingClientRect().height>=44`);
  await capture('14-recorrido-movil');
  await tabSelect('explore');
  await click('[data-mission-choice="voyager-1"]');
  await verify('Cambio móvil a Voyager 1', `document.querySelector('[data-mission-choice="voyager-1"]').getAttribute('aria-pressed')==='true'`);
  await click('[data-mission-choice="voyager-2"]');
  await verify('Cambio móvil a Voyager 2', `document.querySelector('[data-mission-choice="voyager-2"]').getAttribute('aria-pressed')==='true'`);
  await capture('14b-cambio-voyager-movil');
  await selectEvent('v2-neptune-1989');
  await tabSelect('navigation');
  await click('#hist-cam-fp-btn');
  await click('#inspector-close');
  await verify('Vista Voyager móvil despejada y control recuperable', `(() => {const i=document.querySelector('#context-inspector'),f=document.querySelector('#fp-scene-indicator'),r=f.getBoundingClientRect();return i.dataset.state==='closed'&&!f.hidden&&r.right<=innerWidth-45&&document.documentElement.scrollWidth<=innerWidth+1})()`);
  await capture('15-neptuno-movil-despejado');
  await tabSelect('telemetry');
  await verify('Panel móvil separado de línea temporal', `(() => {const i=document.querySelector('#context-inspector').getBoundingClientRect(),t=document.querySelector('#historical-timeline-panel').getBoundingClientRect();return i.bottom<t.top&&i.height<innerHeight*0.5})()`);
  await capture('16-datos-movil');
  await click('#inspector-close');
  await capture('17-retorno-escena-movil');
  await tabSelect('history');
  for (let index=0; index<12 && await evaluate(`!document.querySelector('#tour-play-btn').textContent.includes('Finalizar')`); index++) await click('#tour-play-btn');
  await verify('Último paso ofrece finalizar', `document.querySelector('#tour-step-counter').textContent.startsWith('Paso 12 de 12') && document.querySelector('#tour-play-btn').textContent==='Finalizar recorrido'`);
  await click('#tour-play-btn');
  await verify('Finalización y reinicio explícitos', `document.querySelector('#guided-tour-dock').hidden && document.querySelector('#hist-start-tour-btn').textContent==='Iniciar recorrido'`);
  await tabSelect('explore');
  await click('#hist-start-tour-btn');
  await verify('Nuevo recorrido empieza en el paso 1', `document.querySelector('#tour-step-counter').textContent.startsWith('Paso 1 de 12')`);
  await capture('18-recorrido-reiniciado-movil');
  await click('[data-mode-btn="exploracion"]');
  await tabSelect('explore');
  await click('[data-destination="Jupiter"]');
  await verify('Exploración libre móvil', `document.querySelector('#app').dataset.appMode==='exploracion' && document.querySelector('[data-destination="Jupiter"]').getAttribute('aria-pressed')==='true' && document.documentElement.scrollWidth<=innerWidth+1`);
  await capture('19-planeta-libre-movil');
  assert.deepEqual(errors, [], 'Errores JavaScript o HTTP');
  console.log('RESULTADO:', checks.length, 'comprobaciones,', captures.length, 'capturas,', errors.length, 'errores');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
  try { await capture('fallo'); } catch {}
} finally {
  await fs.writeFile(`${output}/manifest.json`, JSON.stringify({checks,errors,captures},null,2));
  socket.close();
}
