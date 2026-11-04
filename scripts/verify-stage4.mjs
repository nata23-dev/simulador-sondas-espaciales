import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const output = 'evidence/stage4/Despues';
await fs.mkdir(output, { recursive: true });
const tabs = await fetch('http://127.0.0.1:9338/json').then(r => r.json());
const tab = tabs.find(x => x.type === 'page' && x.webSocketDebuggerUrl && x.url.includes('5173'));
assert.ok(tab, 'Chrome CDP 9338 + Vite 5173 required');
const socket = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(resolve => socket.onopen = resolve);
let seq = 0; const pending = new Map(), errors = [], checks = [], captures = [];
socket.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p?.reject(Error(JSON.stringify(m.error))) : p?.resolve(m.result); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) errors.push(`${m.params.response.status} ${m.params.response.url}`);
};
const call = (method, params = {}) => new Promise((resolve,reject) => { const id=++seq; pending.set(id,{resolve,reject}); socket.send(JSON.stringify({id,method,params})); });
const pause = ms => new Promise(r=>setTimeout(r,ms));
async function evalJs(expression) { const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text); return r.result.value; }
async function verify(label, expression, timeout=12000) { const start=Date.now(); while(Date.now()-start<timeout){if(await evalJs(expression)===true){checks.push(label);console.log('PASS',label);return;}await pause(100);}throw Error(label); }
async function capture(name) { await pause(900); const p=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false}); await fs.writeFile(`${output}/${name}.png`,Buffer.from(p.data,'base64')); const state=await evalJs(`({mode:window.__SIMULADOR_DIAGNOSTICO__.obtenerModoOperacion(),moons:window.__SIMULADOR_DIAGNOSTICO__.obtenerLunas(),camera:window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica(),panel:document.querySelector('#context-inspector').dataset.state,width:innerWidth,height:innerHeight})`); captures.push({name,state});console.log('CAPTURE',name); }
async function size(width,height){await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await pause(300);}

try {
  for(const d of ['Page','Runtime','Network'])await call(`${d}.enable`);
  await call('Page.bringToFront'); await size(1366,768);
  await call('Page.navigate',{url:'http://127.0.0.1:5173/'});
  await verify('ExploraciÃ³n cargada',`window.__SIMULADOR_DIAGNOSTICO__?.obtenerModoOperacion()==='exploracion'&&window.__SIMULADOR_DIAGNOSTICO__?.obtenerLunas().estados.Europa?.distanceKm>600000`,30000);
  for(const key of ['Luna','Europa','Titan','Titania','Triton']){
    await evalJs(`(()=>{const s=document.querySelector('#planet-select');s.value=${JSON.stringify(key)};s.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
    await verify(`${key}: selecciÃ³n y cÃ¡mara`, `(()=>{const d=window.__SIMULADOR_DIAGNOSTICO__,m=d.obtenerLunas(),c=d.obtenerEstadoCamaraHistorica();return m.seleccionada===${JSON.stringify(key)}&&m.visibles[${JSON.stringify(key)}].visible&&c.objetoExteriorSeleccionado===${JSON.stringify(key)}&&m.visibles[${JSON.stringify(key)}].parentRadiusScene<0.02})()`);
    await verify(`${key}: center and axis mapping`, `(()=>{const m=window.__SIMULADOR_DIAGNOSTICO__.obtenerLunas(),v=m.visibles[${JSON.stringify(key)}],s=m.estados[${JSON.stringify(key)}].positionSceneOffset,delta=v.position.map((n,i)=>n-v.parentPosition[i]);return Math.hypot(delta[0]-s[0],delta[1]-s[2],delta[2]+s[1])<1e-9})()`);
    await pause(1700);
    await verify(`${key}: foco completo`, `(()=>{const m=window.__SIMULADOR_DIAGNOSTICO__.obtenerLunas().visibles[${JSON.stringify(key)}],c=window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica();return Math.hypot(...c.posicionEscena.map((v,i)=>v-m.position[i]))>m.radiusScene*2&&Math.hypot(...c.objetivoEscena.map((v,i)=>v-m.position[i]))<m.radiusScene*0.1})()`);
    if(key==='Titania') {
      const before=await evalJs(`window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica().posicionEscena`);
      const [x,y]=await evalJs(`window.__SIMULADOR_DIAGNOSTICO__.obtenerLunas().visibles.Titania.screen`);
      await call('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
      await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+65,y:y+20,button:'left'});
      await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:x+65,y:y+20,button:'left',clickCount:1});
      await verify('Orbit camera around Titania', `(()=>{const c=window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica(),m=window.__SIMULADOR_DIAGNOSTICO__.obtenerLunas().visibles.Titania;return Math.hypot(...c.posicionEscena.map((v,i)=>v-${JSON.stringify(before)}[i]))>0.0001&&Math.hypot(...c.objetivoEscena.map((v,i)=>v-m.position[i]))<0.001})()`);
    }
    if(['Luna','Titania','Triton'].includes(key)) await capture(`desktop-${key.toLowerCase()}`);
    if(key==='Luna') {
      const screen=await evalJs(`window.__SIMULADOR_DIAGNOSTICO__.obtenerLunas().visibles.Luna.screen`);
      await evalJs(`document.querySelector('#moon-return-parent').click()`);
      await call('Input.dispatchMouseEvent',{type:'mousePressed',x:screen[0],y:screen[1],button:'left',clickCount:1});
      await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:screen[0],y:screen[1],button:'left',clickCount:1});
      await verify('Moon canvas click selects Luna', `window.__SIMULADOR_DIAGNOSTICO__.obtenerLunas().seleccionada==='Luna'`);
    }
    await evalJs(`document.querySelector('#moon-return-parent').click()`);
    await verify(`${key}: volver al planeta`, `window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica().objetoExteriorSeleccionado===${JSON.stringify({Luna:'Tierra',Europa:'Jupiter',Titan:'Saturno',Titania:'Urano',Triton:'Neptuno'}[key])}`);
  }
  await evalJs(`document.querySelector('#overview-button').click()`);
  await verify('Vista general',`window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica().objetoExteriorSeleccionado===null`);
  await evalJs(`(()=>{const s=document.querySelector('#planet-select');s.value='Europa';s.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  await verify('Europa antes de cambiar fecha',`window.__SIMULADOR_DIAGNOSTICO__.obtenerLunas().seleccionada==='Europa'`);
  await verify('Europa arrival before date change', `!window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica().transicionActiva`, 9000);
  const distanceBeforeScale=await evalJs(`window.__SIMULADOR_DIAGNOSTICO__.obtenerLunas().estados.Europa.distanceKm`);
  await evalJs(`document.querySelector('#scale-mode-button').click()`);
  await verify('Exploratory scale keeps physical moon distance and local planet size', `(()=>{const m=window.__SIMULADOR_DIAGNOSTICO__.obtenerLunas();return Math.abs(m.estados.Europa.distanceKm-${distanceBeforeScale})<1e-9&&m.visibles.Europa.parentRadiusScene<0.02})()`);
  await evalJs(`document.querySelector('#scale-mode-button').click()`);
  const europaBefore=await evalJs(`window.__SIMULADOR_DIAGNOSTICO__.obtenerLunas().estados.Europa.distanceKm`);
  await evalJs(`(()=>{const x=document.querySelector('#date-input');x.value='2026-10-11';x.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  await verify('Moon date changes relative vector and camera follows', `(()=>{const d=window.__SIMULADOR_DIAGNOSTICO__.obtenerLunas(),c=window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica(),p=d.visibles.Europa.position;return document.querySelector('#date-input').value==='2026-10-11'&&Math.abs(d.estados.Europa.distanceKm-${europaBefore})>100&&d.seleccionada==='Europa'&&Math.hypot(...c.objetivoEscena.map((v,i)=>v-p[i]))<0.001})()`);
  await size(390,844);
  await verify('MÃ³vil sin desbordamiento',`document.documentElement.scrollWidth<=innerWidth+1`);
  await evalJs(`document.querySelector('#inspector-close').click()`);
  await verify('Mobile scene unobscured', `document.querySelector('#context-inspector').dataset.state==='closed'`);
  await evalJs(`document.querySelector('#inspector-close').blur()`);
  await capture('mobile-europa');
  await evalJs(`document.querySelector('#inspector-toggle').click()`);
  await evalJs(`document.querySelector('[data-inspector-tab=telemetry]').click()`);
  await verify('Panel mÃ³vil de luna',`!document.querySelector('#moon-info').hidden&&document.querySelector('#moon-info-distance').textContent.includes('km')`);
  await capture('mobile-europa-datos');
  await evalJs(`document.querySelector('#moon-return-overview').click()`);
  await verify('Regreso mÃ³vil a vista general',`window.__SIMULADOR_DIAGNOSTICO__.obtenerLunas().seleccionada===null`);
  assert.deepEqual(errors,[]);
  console.log(`RESULTADO: ${checks.length} comprobaciones, ${captures.length} capturas, 0 errores`);
} catch(error) {console.error(error);process.exitCode=1;} finally {await fs.writeFile(`${output}/manifest.json`,JSON.stringify({checks,captures,errors},null,2));socket.close();}
