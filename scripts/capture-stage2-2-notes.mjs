import fs from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve(process.argv[2] || 'stage2-2-notes');
await fs.mkdir(output, { recursive: true });
const tabs = await fetch('http://127.0.0.1:9338/json').then(response => response.json());
const tab = tabs.find(item => item.type === 'page' && item.url.includes('5173'));
if (!tab) throw Error('Se requiere Chrome CDP en 9338 y la aplicación en 5173');
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(resolve => { ws.onopen = resolve; });
let seq = 0;
const pending = new Map();
const errors = [];
ws.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const task = pending.get(message.id);
    if (message.error) task.reject(Error(JSON.stringify(message.error)));
    else task.resolve(message.result);
    pending.delete(message.id);
  }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
  if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
    errors.push(`${message.params.response.status} ${message.params.response.url}`);
  }
};
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
  return result.result.value;
};
await call('Runtime.enable');
await call('Network.enable');
await call('Page.navigate', { url: 'http://127.0.0.1:5173/?mode=historical' });
await new Promise(resolve => setTimeout(resolve, 1800));
const captures = [];
for (const [eventId, width, height] of [
  ['v2-uranus-1986', 1366, 768], ['v2-neptune-1989', 1366, 768],
  ['v2-uranus-1986', 390, 844], ['v2-neptune-1989', 390, 844]
]) {
  await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const state = await evaluate(`(async () => {
    if (document.querySelector('#historical-welcome-modal:not([hidden])')) document.querySelector('#welcome-explore-free').click();
    await new Promise(resolve => setTimeout(resolve, 120));
    if (document.querySelector('#context-inspector')?.dataset.state === 'closed') document.querySelector('#inspector-toggle').click();
    document.querySelector('[data-inspector-tab="history"]').click();
    document.querySelector('.historical-event-list button[data-event-id="${eventId}"]').click();
    await new Promise(resolve => setTimeout(resolve, 500));
    const note = document.querySelector('#hist-ev-periapse');
    note.scrollIntoView({block:'center'});
    await new Promise(resolve => setTimeout(resolve, 200));
    return {event:document.querySelector('#historical-event-select').value,
      note:note.textContent, noteVisible:!note.hidden,
      welcomeVisible:!!document.querySelector('#historical-welcome-modal:not([hidden])'),
      width:innerWidth, height:innerHeight,
      horizontalOverflow:document.documentElement.scrollWidth>innerWidth,
      inspector:document.querySelector('#context-inspector').dataset.state,
      camera:window.__SIMULADOR_DIAGNOSTICO__?.obtenerEstadoCamaraHistorica()};
  })()`);
  if (state.event !== eventId || !state.noteVisible || state.welcomeVisible || state.horizontalOverflow) throw Error(`Estado visual inválido: ${eventId}`);
  const name = `${eventId}-${width}x${height}`;
  const png = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await fs.writeFile(path.join(output, `${name}.png`), Buffer.from(png.data, 'base64'));
  captures.push({ file: `${name}.png`, state });
  console.log(name, state.note);
}
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({source:'Chrome CDP, capturas auténticas',timestamp:new Date().toISOString(),captures,errors},null,2)}\n`);
ws.close();
if (errors.length) throw Error(`${errors.length} errores de navegador: ${errors.join('; ')}`);
