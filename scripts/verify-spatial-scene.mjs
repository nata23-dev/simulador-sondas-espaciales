// Run Vite and a dedicated headless Chrome with remote debugging on port 9340.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const folder = 'capturas/escala-proporcional-2026-10-10';
const tabs = await fetch('http://127.0.0.1:9340/json').then(response => response.json());
const socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
await new Promise(resolve => { socket.onopen = resolve; });
let sequence = 0;
const pending = new Map();
const errors = [];
const checks = [];
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const promise = pending.get(message.id);
    if (message.error) promise?.reject(new Error(JSON.stringify(message.error)));
    else promise?.resolve(message.result);
    pending.delete(message.id);
  }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry);
  if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
    errors.push({ url: message.params.response.url, status: message.params.response.status });
  }
};
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
async function check(name, expression) {
  let result = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    result = await evaluate(expression);
    if (result === true) break;
    await wait(200);
  }
  assert.equal(result, true, name);
  checks.push(name);
  console.log('PASS', name);
}
async function click(selector) {
  const point = await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    const rect = element.getBoundingClientRect();
    const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
    if (!element.contains(document.elementFromPoint(x, y))) throw Error('Control cubierto: ${selector}');
    return { x, y };
  })()`);
  await mouseClick(point.x, point.y);
}
async function mouseClick(x, y) {
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await wait(100);
}
async function change(selector, value) {
  await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});
    e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
}
async function screenshot(name) {
  const result = await call('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(`${folder}/${name}.png`, Buffer.from(result.data, 'base64'));
}
async function load(width, height) {
  await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: 'http://127.0.0.1:5173' });
  for (let i = 0; i < 40; i++) {
    await wait(200);
    if (await evaluate('!!document.querySelector("#planet-select") && !document.querySelector("#planet-select").disabled')) break;
  }
  await wait(1300);
}
async function select(name, label) {
  await click('#destination-menu > summary');
  await change('#planet-select', name);
  await check(`destino ${label}`, `document.querySelector('#destination-current').textContent === ${JSON.stringify(label)}`);
  await wait(6700);
  await check(`viaje completado a ${label}`, `document.querySelector('#info-title').textContent === ${JSON.stringify(label)} && !document.querySelector('#planet-info').hidden`);
}

try {
  for (const domain of ['Runtime', 'Page', 'Log', 'Network']) await call(`${domain}.enable`);
  await load(1366, 768);
  await check('vista científica y canvas completo 1366', `document.querySelector('#planet-info').hidden && document.querySelector('canvas').clientWidth === 1366 && document.querySelector('#perspective-button').getAttribute('aria-pressed') === 'false'`);
  await screenshot('despues-general-1366');
  await click('#perspective-button');
  await check('cine sin selección elige Saturno', `document.querySelector('#perspective-button').getAttribute('aria-pressed') === 'true' && document.querySelector('#info-title').textContent === 'Saturno'`);
  await wait(6700);
  await screenshot('despues-cine-saturno-1366');
  await change('#date-input', '2026-10-15');
  await wait(1000);
  await check('fecha mientras sigue Saturno', `document.querySelector('#info-date').textContent.includes('2026-10-15') && document.querySelector('#info-title').textContent === 'Saturno'`);
  await screenshot('despues-seguimiento-fecha-1366');
  await click('#planet-info > summary');
  await check('contraer ficha', `!document.querySelector('#planet-info').open`);
  await click('#planet-info > summary');
  await click('#view-menu > summary');
  await click('#show-orbits');
  await check('capas operativas', `!document.querySelector('#show-orbits').checked`);
  await click('#show-orbits');
  await click('#view-menu > summary');
  await click('#immersive-button');
  await check('HUD inmersivo', `document.querySelector('#app').classList.contains('is-immersive')`);
  await click('#immersive-button');

  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: 695, y: 398, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 8; i++) {
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 695 + i * 10, y: 398 + i * 5, button: 'left', buttons: 1 });
  }
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 775, y: 438, button: 'left', clickCount: 1 });
  await wait(500);
  await call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 700, y: 395, deltaX: 0, deltaY: -160 });
  await wait(500);
  await screenshot('despues-saturno-navegacion-manual');
  checks.push('rotación y zoom tras el viaje, inspección de capturas');

  await select('Jupiter', 'Júpiter');
  await screenshot('despues-cine-jupiter-1366');
  await select('Tierra', 'Tierra');
  await screenshot('despues-cine-tierra-1366');
  await click('#destination-menu > summary');
  await change('#planet-select', 'Neptuno');
  await wait(350);
  await click('#destination-menu > summary');
  await change('#planet-select', 'Marte');
  await wait(6600);
  await check('interrupción del viaje hacia Marte', `document.querySelector('#info-title').textContent === 'Marte' && document.querySelector('#destination-current').textContent === 'Marte'`);
  await screenshot('despues-viaje-interrumpido');
  await click('#reset-button');
  await wait(2400);
  await check('restablecer vista científica', `document.querySelector('#planet-info').hidden && document.querySelector('#perspective-button').getAttribute('aria-pressed') === 'false'`);
  await screenshot('despues-regreso-general-1366');

  // Hit the actual rendered Jupiter disk from its label. A single canvas
  // pointer click selects; the next click at the same point starts the trip.
  const label = await evaluate(`(() => {const e=[...document.querySelectorAll('.planet-label')].find(x=>x.textContent==='Júpiter');return {x:parseFloat(e.style.left),y:parseFloat(e.style.top)};})()`);
  let clickedPlanet = false;
  for (const offset of [10, 14, 18, 22, 26, 30]) {
    await mouseClick(label.x, label.y + offset);
    if (await evaluate(`document.querySelector('#info-title').textContent === 'Júpiter' && !document.querySelector('#planet-info').hidden`)) {
      await mouseClick(label.x, label.y + offset);
      clickedPlanet = true;
      break;
    }
  }
  assert.equal(clickedPlanet, true, 'selección por clic sobre la malla');
  checks.push('clic sobre la malla selecciona y doble clic viaja');
  await wait(6500);
  await screenshot('despues-doble-clic-jupiter');

  await load(1920, 1080);
  await check('canvas completo 1920', `document.querySelector('canvas').clientWidth === 1920 && document.querySelector('canvas').clientHeight === 1080`);
  await screenshot('despues-general-1920');
  await click('#perspective-button');
  await wait(6700);
  await check('cine Saturno 1920', `document.querySelector('#info-title').textContent === 'Saturno'`);
  await screenshot('despues-cine-saturno-1920');
  await select('Jupiter', 'Júpiter');
  await screenshot('despues-cine-jupiter-1920');
  await select('Tierra', 'Tierra');
  await screenshot('despues-cine-tierra-1920');

  assert.deepEqual(errors, [], 'Errores JavaScript, consola o HTTP');
  checks.push('sin excepciones JavaScript, errores de consola ni HTTP');
  await fs.writeFile(`${folder}/verificacion.json`, JSON.stringify({ checks, errors }, null, 2));
  console.log(`Completed ${checks.length} checks.`);
} finally {
  socket.close();
}
