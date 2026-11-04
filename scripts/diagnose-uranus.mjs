const tabs = await fetch('http://127.0.0.1:9338/json').then(r => r.json());
const wsUrl = tabs.find(t => t.type === 'page' && t.url.startsWith('http://127.0.0.1:5173')).webSocketDebuggerUrl;
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.onopen = r);

let seq = 0;
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  const handler = e => {
    const m = JSON.parse(e.data);
    if (m.id === id) {
      ws.removeEventListener('message', handler);
      m.error ? reject(Error(JSON.stringify(m.error))) : resolve(m.result);
    }
  };
  ws.addEventListener('message', handler);
  ws.send(JSON.stringify({ id, method, params }));
});

async function ev(expression) {
  const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

await call('Page.navigate', { url: 'http://127.0.0.1:5173/' });
for (let i = 0; i < 50; i++) {
  try {
    const ok = await ev(`!!window.__SIMULADOR_DIAGNOSTICO__ && !document.querySelector('#date-input')?.disabled`);
    if (ok) break;
  } catch {}
  await new Promise(r => setTimeout(r, 200));
}
await new Promise(r => setTimeout(r, 800));

const res = await ev(`(async () => {
  const d = window.__SIMULADOR_DIAGNOSTICO__;
  document.querySelector('[data-mode-btn="historico"]').click();
  for (let i = 0; i < 60; i++) {
    if (d.obtenerSnapshotHistorico() && !d.obtenerEstadoCamaraHistorica().transicionActiva) break;
    await new Promise(r => setTimeout(r, 100));
  }
  await new Promise(r => setTimeout(r, 500));
  
  // Click compare for Uranus
  const b = document.querySelector('[data-photo-id="v2-uranus-crescent-1986"] [data-photo-act="compare"]');
  b.click();
  
  for (let i = 0; i < 60; i++) {
    const c = d.obtenerEstadoCamaraHistorica();
    if (c.modo === 'photo_recreation' && !c.transicionActiva) break;
    await new Promise(r => setTimeout(r, 100));
  }
  
  return {
    cam: d.obtenerEstadoCamaraHistorica(),
    date: document.querySelector('#hist-clock-utc')?.textContent,
    compOpen: !document.querySelector('#photo-comparator-panel')?.hidden
  };
})()`);

console.log(JSON.stringify(res, null, 2));

const shot = await call('Page.captureScreenshot', { format: 'png' });
const fs = await import('fs/promises');
await fs.writeFile('evidencias/test-uranus-crescent.png', Buffer.from(shot.data, 'base64'));
console.log('Saved evidencias/test-uranus-crescent.png');

ws.close();
