import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const output = process.env.EVIDENCE_DIR || 'evidence/stage3-1/Despues';
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
  if (message.method === 'Runtime.exceptionThrown') errors.push({type:'javascript',text:message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text});
  if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) errors.push({type:'http',url:message.params.response.url,status:message.params.response.status});
};
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, {resolve,reject});
  socket.send(JSON.stringify({id,method,params}));
});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', {expression,returnByValue:true,awaitPromise:true});
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function verify(name, expression, timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await evaluate(expression) === true) {checks.push(name);console.log('PASS',name);return;}
    await pause(120);
  }
  throw Error(`No se cumplió: ${name}`);
}
async function click(selector) {
  const point = await evaluate(`(() => {
    const node=document.querySelector(${JSON.stringify(selector)});
    if(!node)throw Error('Falta ${selector}');
    node.scrollIntoView({block:'nearest'});
    const rect=node.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2;
    if(rect.width<30||rect.height<30||x<0||x>=innerWidth||y<0||y>=innerHeight)throw Error('Control fuera de pantalla: ${selector}');
    if(!node.contains(document.elementFromPoint(x,y)))throw Error('Control obstruido: ${selector}');
    return{x,y};
  })()`);
  await call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
  await call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
  await pause(180);
}
async function resize(width,height) {
  await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  await pause(250);
}
async function capture(name) {
  await pause(250);
  const png=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await fs.writeFile(`${output}/${name}.png`,Buffer.from(png.data,'base64'));
  const state=await evaluate(`(() => {
    const d=window.__SIMULADOR_DIAGNOSTICO__,i=document.querySelector('#context-inspector'),b=document.querySelector('#hist-start-tour-btn'),t=document.querySelector('#historical-timeline-panel');
    return {width:innerWidth,height:innerHeight,mode:d.obtenerModoOperacion(),camera:d.obtenerEstadoCamaraHistorica(),
      inspector:i.dataset.state,tab:document.querySelector('[data-inspector-tab][aria-selected=true]')?.dataset.inspectorTab,
      step:document.querySelector('#tour-step-counter').textContent,event:document.querySelector('#historical-event-select').value,
      tourButton:{label:b.textContent.trim(),floating:b.classList.contains('tour-scene-entry'),visible:getComputedStyle(b).display!=='none',rect:b.getBoundingClientRect().toJSON()},
      panelRect:i.getBoundingClientRect().toJSON(),timelineRect:t.getBoundingClientRect().toJSON(),comparatorOpen:!document.querySelector('#photo-comparator-panel').hidden,
      scrollWidth:document.documentElement.scrollWidth};
  })()`);
  captures.push({name,file:`${name}.png`,state});console.log('CAPTURE',name);
}
async function tabSelect(id) {
  if(await evaluate(`document.querySelector('#context-inspector').dataset.state==='closed'`))await click('#inspector-toggle');
  await click(`[data-inspector-tab="${id}"]`);
}
async function selectEvent(id) {
  await tabSelect('history');
  if(await evaluate(`!document.querySelector('#historical-events-panel').open`))await click('#historical-events-panel > summary');
  await click(`.historical-event-list button[data-event-id="${id}"]`);
  await verify(`Acontecimiento ${id}`,`document.querySelector('#historical-event-select').value===${JSON.stringify(id)}`);
}

try {
  for(const domain of ['Page','Runtime','Network','Log'])await call(`${domain}.enable`);
  await call('Page.bringToFront');
  await resize(390,844);
  await call('Page.navigate',{url:'http://127.0.0.1:5173/?mode=historical'});
  await verify('Entrada histórica móvil',`window.__SIMULADOR_DIAGNOSTICO__?.obtenerModoOperacion()==='historico' && !!window.__SIMULADOR_DIAGNOSTICO__?.obtenerSnapshotHistorico()`,30000);
  if(await evaluate(`!document.querySelector('#historical-welcome-modal').hidden`))await click('#welcome-explore-free');
  await verify('Acceso inicial visible sin menú ni duplicación',`(() => {const b=document.querySelector('#hist-start-tour-btn'),r=b.getBoundingClientRect();return document.querySelector('#context-inspector').dataset.state==='closed'&&document.querySelectorAll('#hist-start-tour-btn').length===1&&b.classList.contains('tour-scene-entry')&&b.textContent.trim()==='Iniciar recorrido'&&r.width>=110&&r.height>=44&&r.bottom<document.querySelector('#historical-timeline-panel').getBoundingClientRect().top})()`);
  await capture('01-entrada-movil');
  await click('#hist-start-tour-btn');
  await verify('Recorrido iniciado desde escena',`document.querySelector('[aria-selected=true]').dataset.inspectorTab==='history'&&document.querySelector('#tour-step-counter').textContent.startsWith('Paso 1 de 12')&&!document.querySelector('#hist-start-tour-btn').classList.contains('tour-scene-entry')`);
  await capture('02-recorrido-movil');
  await click('#tour-play-btn');
  await verify('Avance de hito',`document.querySelector('#tour-step-counter').textContent.startsWith('Paso 2 de 12')`);
  await click('#tour-prev-btn');
  await verify('Retroceso de hito',`document.querySelector('#tour-step-counter').textContent.startsWith('Paso 1 de 12')`);
  const compactHeight=await evaluate(`document.querySelector('#context-inspector').getBoundingClientRect().height`);
  await click('#inspector-expand');
  await verify('Panel ampliado con acción de contraer',`document.querySelector('#context-inspector').dataset.state==='expanded'&&document.querySelector('#inspector-expand').getAttribute('aria-label')==='Contraer panel'&&document.querySelector('#context-inspector').getBoundingClientRect().height>${compactHeight+40}`);
  await click('#inspector-expand');
  await verify('Panel contraído sin perder paso',`document.querySelector('#context-inspector').dataset.state==='half'&&document.querySelector('#tour-step-counter').textContent.startsWith('Paso 1 de 12')&&document.querySelector('#inspector-expand').getAttribute('aria-label')==='Ampliar panel'`);
  await tabSelect('telemetry');
  await verify('Datos móviles legibles y fuera de la línea temporal',`(() => {const i=document.querySelector('#context-inspector').getBoundingClientRect(),t=document.querySelector('#historical-timeline-panel').getBoundingClientRect(),p=document.querySelector('#pane-telemetry');return i.bottom<t.top&&parseFloat(getComputedStyle(p).fontSize)>=12&&document.querySelector('#historical-journey-status').getBoundingClientRect().height===0})()`);
  await click('#inspector-close');
  await verify('Cerrar deja acceso a continuar',`document.querySelector('#context-inspector').dataset.state==='closed'&&document.querySelector('#hist-start-tour-btn').classList.contains('tour-scene-entry')&&document.querySelector('#hist-start-tour-btn').textContent.trim()==='Continuar recorrido'`);
  await click('#hist-start-tour-btn');
  await verify('Reabrir conserva el paso',`document.querySelector('#tour-step-counter').textContent.startsWith('Paso 1 de 12')&&document.querySelector('[aria-selected=true]').dataset.inspectorTab==='history'`);
  await selectEvent('v2-neptune-1989');
  await tabSelect('telemetry');
  await capture('03-datos-movil');
  await tabSelect('navigation');
  await click('#hist-cam-fp-btn');
  await verify('Neptuno desde Voyager 2',`(() => {const c=window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica();return c.modo==='first_person'&&c.idSondaObservador==='voyager-2'&&c.objetivoMirada==='Neptuno'})()`);
  await click('#inspector-close');
  await capture('04-neptuno-movil-despejado');
  await selectEvent('v2-neptune-1989');
  const before=await evaluate(`(() => ({camera:window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica().modo,date:document.querySelector('#hist-clock-utc').textContent,step:document.querySelector('#tour-step-counter').textContent,tab:document.querySelector('[aria-selected=true]').dataset.inspectorTab,catalog:document.querySelector('#historical-events-panel').open}))()`);
  await click('#hist-ev-photo-btn');
  await verify('Comparador abierto con foto',`!document.querySelector('#photo-comparator-panel').hidden&&document.querySelector('#comp-photo-img').naturalWidth>0`);
  await click('#comp-close-btn');
  await verify('Comparador restaura estado anterior',`(() => {const x=${JSON.stringify(before)};return document.querySelector('#photo-comparator-panel').hidden&&window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica().modo===x.camera&&document.querySelector('#hist-clock-utc').textContent===x.date&&document.querySelector('#tour-step-counter').textContent===x.step&&document.querySelector('[aria-selected=true]').dataset.inspectorTab===x.tab&&document.querySelector('#historical-events-panel').open===x.catalog})()`);
  await verify('Iconos diferenciados y con ayuda contextual',`(() => {const a=['#inspector-toggle','#reset-button','#perspective-button','#view-menu > summary','#scale-mode-button','#immersive-button'];return a.every(q=>{const e=document.querySelector(q);return e.getAttribute('title')&&e.getAttribute('aria-label')&&e.getBoundingClientRect().height>=44})&&document.querySelector('#reset-button').title!==document.querySelector('#options-overview-button').title&&document.querySelector('#fp-exit-btn').title!==document.querySelector('#reset-button').title})()`);
  await capture('05-comparador-restaurado-movil');
  const fovBefore=await evaluate(`window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica().fovReferenciaGrados`);
  await click('#reset-button');
  await verify('Reencuadrar mantiene observador, objetivo y FOV',`(() => {const c=window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica();return c.modo==='first_person'&&c.idSondaObservador==='voyager-2'&&c.objetivoMirada==='Neptuno'&&Math.abs(c.fovReferenciaGrados-${fovBefore})<1e-9})()`);
  await click('#fp-exit-btn');
  await verify('Exterior sale de primera persona',`window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica().modo==='exterior'`);
  const exteriorTarget=await evaluate(`window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica().objetivoEscena`);
  await click('#view-menu > summary');
  await click('#options-overview-button');
  await verify('Vista general cambia el encuadre exterior',`(() => {const c=window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica(),x=${JSON.stringify(exteriorTarget)};return c.modo==='exterior'&&Math.hypot(...c.objetivoEscena.map((v,i)=>v-x[i]))>1})()`);
  await resize(1366,768);
  await verify('Escritorio 1366 sin acceso flotante residual',`!document.querySelector('#hist-start-tour-btn').classList.contains('tour-scene-entry')&&document.documentElement.scrollWidth<=innerWidth+1`);
  await capture('06-escritorio-1366');
  await resize(1920,1080);
  await verify('Escritorio 1920 sin desbordamiento',`document.documentElement.scrollWidth<=innerWidth+1`);
  await capture('07-escritorio-1920');
  assert.deepEqual(errors,[],'Errores JavaScript o HTTP');
  console.log('RESULTADO:',checks.length,'comprobaciones,',captures.length,'capturas,',errors.length,'errores');
} catch(error) {
  console.error(error);process.exitCode=1;
  try{await capture('fallo');}catch{}
} finally {
  await fs.writeFile(`${output}/manifest.json`,JSON.stringify({checks,errors,captures},null,2));
  socket.close();
}
