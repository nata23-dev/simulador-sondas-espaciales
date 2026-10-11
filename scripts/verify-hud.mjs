// Run Vite and a dedicated Chrome instance with --remote-debugging-port=9338.
// Uses Chrome DevTools Protocol; no browser automation dependency is required.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const output = 'capturas/hud-2026-10-10';
const tabs = await fetch('http://127.0.0.1:9338/json').then(r => r.json());
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
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
async function click(selector) {
  const point = await evaluate(`(() => {
    const e = document.querySelector(${JSON.stringify(selector)});
    const r = e.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    if (!e.contains(document.elementFromPoint(x,y))) throw Error('Obstructed control: ' + ${JSON.stringify(selector)});
    return { x, y };
  })()`);
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  await wait(240);
}
async function key(key, code = key) {
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key, code });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key, code });
  await wait(250);
}
async function change(selector, value, event = 'change') {
  await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event(${JSON.stringify(event)}, { bubbles: true })); })()`);
}
async function check(name, expression) {
  // Software WebGL can delay a CSS transition; wait for the observable state.
  let value = false;
  for (let i = 0; i < 15; i++) {
    value = await evaluate(expression);
    if (value === true) break;
    await wait(200);
  }
  assert.equal(value, true, name);
  checks.push(name);
  console.log('PASS', name);
}
async function capture(name) {
  const screenshot = await call('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(`${output}/${name}.png`, Buffer.from(screenshot.data, 'base64'));
}
async function resize(width, height, mobile = false) {
  await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
}
async function load() {
  await call('Page.navigate', { url: 'http://127.0.0.1:5173' });
  for (let i = 0; i < 40; i++) {
    await wait(200);
    if (await evaluate('!!document.querySelector("#planet-select") && !document.querySelector("#planet-select").disabled')) break;
  }
  await wait(1000);
}
async function selectPlanet(name) {
  await click('#destination-menu > summary');
  await change('#planet-select', name);
  await wait(3700);
  await check(`selección y viaje ${name}`, `!document.querySelector('#planet-info').hidden && document.querySelector('#info-title').textContent === ${JSON.stringify(name)} && !document.querySelector('#destination-menu').open`);
}

try {
  for (const domain of ['Page', 'Runtime', 'Log', 'Network']) await call(`${domain}.enable`);
  await resize(1366, 768);
  await load();
  await check('datos iniciales', `document.querySelector('#date-input').value === '2026-10-10'`);
  await capture('general-1366');
  await selectPlanet('Tierra');
  await capture('exploracion-tierra');
  await click('#planet-info > summary');
  await check('contraer ficha', `!document.querySelector('#planet-info').open`);
  await check('etiqueta accesible de ficha contraída', `document.querySelector('#planet-info .collapse-hint').textContent === 'Ver datos'`);
  await click('#planet-info > summary');
  await check('abrir ficha', `document.querySelector('#planet-info').open`);
  await check('etiqueta accesible de ficha abierta', `document.querySelector('#planet-info .collapse-hint').textContent === 'Contraer'`);
  await click('#destination-menu > summary');
  await click('#explore-button');
  await check('cerrar destino al explorar', `!document.querySelector('#destination-menu').open`);
  await wait(2000);
  await selectPlanet('Saturno');
  await capture('exploracion-saturno');
  await change('#date-input', '2026-10-12');
  await check('fecha y ficha sincronizadas', `document.querySelector('#info-date').textContent.includes('2026-10-12') && document.querySelector('#date-input').value === '2026-10-12'`);
  await change('#playback-speed', '2');
  await click('#play-button');
  await wait(650);
  await check('reproducción a 2×', `document.querySelector('#playback-status').textContent.includes('2×') && document.querySelector('#date-input').value > '2026-10-12'`);
  await click('#play-button');
  const pausedDate = await evaluate(`document.querySelector('#date-input').value`);
  await wait(700);
  await check('pausa estable', `document.querySelector('#playback-status').textContent === 'Pausado' && document.querySelector('#date-input').value === ${JSON.stringify(pausedDate)}`);
  await click('#previous-button');
  const previous = await evaluate(`document.querySelector('#date-input').value`);
  assert(previous < pausedDate);
  await click('#next-button');
  assert.equal(await evaluate(`document.querySelector('#date-input').value`), pausedDate);
  checks.push('avance y retroceso diario');
  await change('#timeline-range', '9', 'input');
  await check('barra temporal', `document.querySelector('#date-input').value === '2026-10-10'`);
  await click('#view-menu > summary');
  for (const id of ['show-orbits', 'show-labels', 'show-stars']) {
    await click(`#${id}`);
    await check(`desactivar ${id}`, `!document.querySelector('#${id}').checked`);
  }
  await check('capa de etiquetas oculta', `document.querySelector('.planet-labels').hidden`);
  await capture('capas-desactivadas');
  for (const id of ['show-orbits', 'show-labels', 'show-stars']) await click(`#${id}`);
  await key('Escape');
  await click('#immersive-button');
  await check('modo inmersivo por mouse', `document.querySelector('#app').classList.contains('is-immersive') && [...document.querySelectorAll('.hud-secondary')].every(e => e.inert && getComputedStyle(e).visibility === 'hidden')`);
  await capture('modo-inmersivo');
  await click('#immersive-button');
  await check('recuperación por mouse', `!document.querySelector('#app').classList.contains('is-immersive')`);
  await key('i', 'KeyI');
  await check('modo inmersivo por teclado', `document.querySelector('#app').classList.contains('is-immersive')`);
  await key('Escape');
  await check('recuperación con Escape', `!document.querySelector('#app').classList.contains('is-immersive')`);
  await click('#reset-button');
  await wait(1900);
  await check('restablecer cámara y selección', `document.querySelector('#planet-info').hidden && document.querySelector('#planet-select').value === ''`);
  await capture('regreso-general');
  const labelsBefore = await evaluate(`[...document.querySelectorAll('.planet-label')].map(e => e.style.cssText)`);
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: 650, y: 350, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 8; i++) {
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 650 + i * 12, y: 350 + i * 4, button: 'left', buttons: 1 });
  }
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 746, y: 382, button: 'left', clickCount: 1 });
  await wait(650);
  const labelsAfter = await evaluate(`[...document.querySelectorAll('.planet-label')].map(e => e.style.cssText)`);
  assert.notDeepEqual(labelsBefore, labelsAfter, 'OrbitControls debe rotar la cámara');
  await call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 700, y: 400, deltaX: 0, deltaY: -200 });
  await wait(650);
  assert.notDeepEqual(labelsAfter, await evaluate(`[...document.querySelectorAll('.planet-label')].map(e => e.style.cssText)`), 'La rueda debe acercar la cámara');
  checks.push('rotación y zoom con mouse sobre el canvas');
  await click('#reset-button');
  await wait(1900);
  await click('#perspective-button');
  await wait(2000);
  await check('vista cinematográfica conservada', `document.querySelector('#perspective-button').getAttribute('aria-pressed') === 'true'`);
  await click('#destination-menu > summary');
  await click('#overview-button');
  await wait(1800);
  await check('regreso mediante Vista general', `document.querySelector('#perspective-button').getAttribute('aria-pressed') === 'false'`);

  for (const [width, height] of [[1920, 1080], [1366, 768], [1280, 720], [390, 844], [320, 568]]) {
    await resize(width, height, width <= 760);
    await load();
    await check(`canvas completo y sin scroll ${width}×${height}`, `(() => { const c = document.querySelector('canvas').getBoundingClientRect(); return c.width === innerWidth && c.height === innerHeight && document.documentElement.scrollWidth === innerWidth && document.documentElement.scrollHeight === innerHeight; })()`);
    await check(`TDB visible ${width}`, `getComputedStyle(document.querySelector('.timeline-heading > div')).display !== 'none'`);
    await capture(`general-${width}`);
    await click('#destination-menu > summary');
    await check(`selector accesible ${width}`, `(() => { const r = document.querySelector('#planet-select').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; })()`);
    await change('#planet-select', 'Tierra');
    await wait(3700);
    await capture(`tierra-${width}`);
    if (width <= 760) {
      await check(`ficha móvil compacta ${width}`, `!document.querySelector('#planet-info').open && !document.querySelector('#planet-info').hidden`);
      await click('#planet-info > summary');
      await check(`ficha móvil desplegable ${width}`, `document.querySelector('#planet-info').open`);
      await capture(`ficha-movil-${width}`);
      await click('#planet-info > summary');
    }
    await click('#play-button');
    await click('#play-button');
    await click('#immersive-button');
    await click('#immersive-button');
    await check(`instrumentos dentro de ventana ${width}`, `['#immersive-button','#date-input','#playback-speed','#reset-button','#planet-info'].every(s => { const r=document.querySelector(s).getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; })`);
  }
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await check('movimiento reducido en HUD', `getComputedStyle(document.querySelector('#immersive-button')).transitionDuration === '0s'`);
  assert.deepEqual(errors, [], 'Errores de consola o red');
  checks.push('sin errores JavaScript, consola ni HTTP en la ejecución final');
  await fs.writeFile(`${output}/verificacion.json`, JSON.stringify({ checks, errors }, null, 2));
  console.log(`Completed ${checks.length} checks.`);
} finally {
  socket.close();
}
