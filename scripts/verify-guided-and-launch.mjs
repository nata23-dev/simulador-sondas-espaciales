import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const output = 'evidencias/lanzamiento-y-recorrido';
await fs.mkdir(output, { recursive: true });

const tabs = await fetch('http://127.0.0.1:9338/json').then(r => r.json());
const pageTab = tabs.find(t => t.type === 'page' && (t.url.includes('5173') || t.title.includes('Simulador')));
if (!pageTab) throw Error('No simulator tab found on port 5173');
console.log('Connecting to Chrome debugger at:', pageTab.webSocketDebuggerUrl);
const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
console.log('WebSocket connection opened successfully.');

let seq = 0;
const pending = new Map(), errors = [], checks = [], captures = [];

ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id) {
    const p = pending.get(m.id);
    m.error ? p?.reject(Error(JSON.stringify(m.error))) : p?.resolve(m.result);
    pending.delete(m.id);
  }
  if (m.method === 'Runtime.exceptionThrown') errors.push({ type: 'javascript', detail: m.params.exceptionDetails });
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) errors.push({ type: 'http', url: m.params.response.url, status: m.params.response.status });
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push({ type: 'log', detail: m.params.entry });
};

const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});

const wait = ms => new Promise(r => setTimeout(r, ms));

async function ev(expression) {
  try {
    const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r?.exceptionDetails) {
      return null;
    }
    return r?.result?.value ?? null;
  } catch (err) {
    return null;
  }
}

async function check(name, expression, maxTries = 150) {
  let ok = false;
  for (let i = 0; i < maxTries; i++) {
    const val = await ev(expression);
    if (val === true) {
      ok = true;
      break;
    }
    await wait(200);
  }
  assert.equal(ok, true, `Check failed: ${name}`);
  checks.push(name);
  console.log('PASS', name);
}

async function click(s) {
  const res = await ev(`(()=>{
    const el = document.querySelector(${JSON.stringify(s)});
    if (!el) return false;
    el.click();
    return true;
  })()`);
  if (!res) throw Error(`Element not found to click: ${s}`);
  await wait(350);
}

async function resize(w, h) {
  await call('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await wait(500);
}

async function load() {
  console.log('Navigating to http://localhost:5173/...');
  await call('Page.navigate', { url: 'http://localhost:5173/' });
  await wait(2000);
  await check('simulador cargado y listo', `!!window.__SIMULADOR_DIAGNOSTICO__ && !document.querySelector('#date-input')?.disabled`);
  await wait(600);
}

const diag = `window.__SIMULADOR_DIAGNOSTICO__`;

async function snap(name, condition = 'true') {
  if (condition !== 'true') {
    await check(`condición previa ${name}`, condition);
  }
  await wait(400);
  const state = await ev(`(()=>{
    const d = ${diag};
    const canvas = document.querySelector('canvas');
    const gl = canvas ? canvas.getContext('webgl2') : null;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      mode: d?.obtenerModoOperacion() ?? '',
      camera: d?.obtenerEstadoCamaraHistorica() ?? null,
      date: document.querySelector('#scene-date')?.textContent ?? '',
      sceneTitle: document.querySelector('#scene-title')?.textContent ?? '',
      observedBody: document.querySelector('#observed-body')?.textContent ?? '',
      viewMode: document.querySelector('#view-mode-label')?.textContent ?? '',
      webgl: !!gl && !gl.isContextLost(),
      launchActive: d?.obtenerEstadoLanzamiento()?.activo ?? false,
      tourActive: d?.obtenerEstadoRecorridoGuiado()?.activo ?? false,
      fpIndicatorVisible: !document.querySelector('#fp-scene-indicator')?.hidden,
      comparatorOpen: !document.querySelector('#photo-comparator-panel')?.hidden
    };
  })()`);
  assert(state?.webgl, 'WebGL render active');
  const r = await call('Page.captureScreenshot', { format: 'png' });
  const bytes = Buffer.from(r.data, 'base64');
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  await fs.writeFile(`${output}/${name}.png`, bytes);
  captures.push({ file: name + '.png', sha256, ...state });
  console.log(`[CAPTURA GUARDADA] ${name}.png (${bytes.length} bytes, sha256: ${sha256.slice(0, 10)}...)`);
}

try {
  for (const d of ['Page', 'Runtime', 'Network', 'Log']) await call(d + '.enable');
  await call('Page.bringToFront');
  await resize(1920, 1080);
  await load();

  // Reset flag local storage
  await ev(`localStorage.removeItem('voyager_simulator_hide_welcome_v1')`);

  // =========================================================================
  // 1. Entrada a Modo Histórico y Modal de Bienvenida Orientadora
  // =========================================================================
  console.log('\n--- 1. Bienvenida y Modo Histórico ---');
  await click('[data-mode-btn="historico"]');
  await check('modo historico activo', `${diag}.obtenerModoOperacion() === 'historico'`);
  await check('modal bienvenida visible', `!document.querySelector('#historical-welcome-modal').hidden`);
  await snap('01-bienvenida-modo-historico-1920x1080');

  // =========================================================================
  // 2. Cerrar bienvenida con "Explorar libremente" y verificar Selector Visible de Misión
  // =========================================================================
  console.log('\n--- 2. Selector Visible de Misión en Escenario ---');
  await click('#welcome-explore-free');
  await check('modal bienvenida cerrado', `document.querySelector('#historical-welcome-modal').hidden`);
  await check('dock de misiones visible', `!document.querySelector('#hist-mission-dock').hidden`);
  await check('boton Ambas inicial activo', `document.querySelector('[data-mission-choice="both"]').getAttribute('aria-pressed') === 'true'`);

  // Cambiar a Voyager 2
  await click('[data-mission-choice="voyager-2"]');
  await check('boton Voyager 2 activo', `document.querySelector('[data-mission-choice="voyager-2"]').getAttribute('aria-pressed') === 'true'`);
  await wait(400);

  // Cambiar a Voyager 1
  await click('[data-mission-choice="voyager-1"]');
  await check('boton Voyager 1 activo', `document.querySelector('[data-mission-choice="voyager-1"]').getAttribute('aria-pressed') === 'true'`);
  await wait(400);

  // Cambiar a Ambas
  await click('[data-mission-choice="both"]');
  await check('boton Ambas activo', `document.querySelector('[data-mission-choice="both"]').getAttribute('aria-pressed') === 'true'`);
  await wait(400);

  // Regresar a Voyager 2
  await click('[data-mission-choice="voyager-2"]');
  await check('boton Voyager 2 re-activo', `document.querySelector('[data-mission-choice="voyager-2"]').getAttribute('aria-pressed') === 'true'`);
  await snap('02-selector-misiones-visible-1920x1080');

  // =========================================================================
  // 3. Lanzamiento Histórico Cinematográfico (Titan IIIE-Centaur en LC-41)
  // =========================================================================
  console.log('\n--- 3. Lanzamiento Histórico Cinematográfico (Titan IIIE-Centaur) ---');
  await click('#hist-launch-cinematic-btn');
  await check('lanzamiento activo', `${diag}.obtenerEstadoLanzamiento().activo`);
  await check('overlay lanzamiento visible', `!document.querySelector('#launch-cinematic-overlay').hidden`);

  // Esperamos 2.5s para que la cinemática avance hacia Fase C (Despegue e ignición de propulsores sólidos)
  await wait(2500);
  await snap('03-lanzamiento-despegue-lc41-1920x1080', `${diag}.obtenerEstadoLanzamiento().activo`);

  // Esperamos 3s más para ver ascenso atmosférico y separación de etapas
  await wait(3000);
  await snap('04-lanzamiento-separacion-etapas-1920x1080', `${diag}.obtenerEstadoLanzamiento().activo`);

  // Saltar introducción para completar la inyección y transición heliocéntrica a 1977
  await click('#launch-skip-btn');
  await wait(800);
  await check('lanzamiento finalizado', `!${diag}.obtenerEstadoLanzamiento().activo`);
  await check('fecha heliocéntrica 1977', `document.querySelector('#scene-date').textContent.includes('1977')`);
  await snap('05-lanzamiento-transicion-voyager-1920x1080');

  // =========================================================================
  // 4. Recorrido Histórico Guiado (12 Hitos 1977–2026)
  // =========================================================================
  console.log('\n--- 4. Recorrido Histórico Guiado (12 Hitos) ---');
  await click('#hist-start-tour-btn');
  await check('recorrido guiado visible', `${diag}.obtenerEstadoRecorridoGuiado().activo`);

  // Hito 3: Júpiter y Volcanes en Ío (Voyager 1 - 1979)
  await ev(`${diag}.iniciarRecorrido(2)`); // index 2 = Hito 3
  await wait(800);
  await check('hito 3 activo', `document.querySelector('#tour-step-counter').textContent.includes('Paso 3')`);
  await check('miniatura de Jupiter visible', `!document.querySelector('#tour-photo-container').hidden`);
  await snap('06-recorrido-guiado-jupiter-1979-1920x1080');

  // Hito 7: Urano Primer Encuentro (Voyager 2 - 1986)
  await ev(`${diag}.iniciarRecorrido(6)`); // index 6 = Hito 7
  await wait(800);
  await check('hito 7 activo', `document.querySelector('#tour-step-counter').textContent.includes('Paso 7')`);
  await snap('07-recorrido-guiado-urano-1986-1920x1080');

  // Hito 12: Espacio Interestelar (2018–2026)
  await ev(`${diag}.iniciarRecorrido(11)`); // index 11 = Hito 12
  await wait(800);
  await check('hito 12 activo', `document.querySelector('#tour-step-counter').textContent.includes('Paso 12')`);
  await snap('08-recorrido-guiado-interestelar-2026-1920x1080');

  // Cerrar recorrido guiado
  await click('#tour-close-btn');
  await check('recorrido cerrado', `!${diag}.obtenerEstadoRecorridoGuiado().activo`);

  // =========================================================================
  // 5. Corrección de Defecto 1: Comparador Urano Creciente PIA00143
  // =========================================================================
  console.log('\n--- 5. Defecto 1: Urano Creciente PIA00143 ---');
  // Navegamos al Hito 7 de Urano y abrimos el comparador
  await ev(`${diag}.iniciarRecorrido(6)`);
  await wait(500);
  await click('#tour-photo-btn'); // click en "Comparar en 3D ↗"
  await wait(1000);
  await check('comparador abierto', `!document.querySelector('#photo-comparator-panel').hidden`);
  await check('imagen NASA PIA00143 cargada', `document.querySelector('#comp-photo-img').complete && document.querySelector('#comp-photo-img').naturalWidth > 0`);

  // Verificar que la etiqueta de texto de Urano está oculta sobre el creciente
  const labelHidden = await ev(`(()=>{
    const labels = [...document.querySelectorAll('.planet-label')];
    const uranoLabel = labels.find(l => l.textContent.includes('Urano'));
    return !uranoLabel || uranoLabel.hidden;
  })()`);
  assert.equal(labelHidden, true, 'La etiqueta • Urano debe estar oculta para no tapar el creciente');
  console.log('PASS etiqueta • Urano no obstruye el disco');
  await snap('09-comparador-urano-crescente-corregido-1920x1080');

  // Cerrar comparador y tour
  await click('#comp-close-btn');
  await check('comparador cerrado', `document.querySelector('#photo-comparator-panel').hidden`);
  await click('#tour-close-btn');

  // =========================================================================
  // 6. Corrección de Defecto 2: Modo Experimental limpio sin residuales de Voyager
  // =========================================================================
  console.log('\n--- 6. Defecto 2: Modo Experimental sin textos residuales ---');
  await click('[data-mode-btn="experimental"]');
  await check('modo experimental activo', `${diag}.obtenerModoOperacion() === 'experimental'`);
  await wait(500);

  const expState = await ev(`(()=>{
    return {
      title: document.querySelector('#scene-title').textContent,
      observed: document.querySelector('#observed-body')?.textContent || '',
      brandEyebrow: document.querySelector('#brand-eyebrow')?.textContent || '',
      dockHidden: document.querySelector('#hist-mission-dock').hidden
    };
  })()`);
  assert.equal(expState.title, 'Sistema Solar', 'Título de escena debe ser Sistema Solar');
  assert.equal(expState.observed, 'Observando · Sonda Experimental 01', 'Observado debe ser Sonda Experimental 01');
  assert(expState.brandEyebrow.includes('DINÁMICA ORBITAL'), 'Marca debe ser DINÁMICA ORBITAL');
  assert(!expState.title.includes('Voyager'), 'No debe haber texto de Voyager en título');
  assert(!expState.observed.includes('Voyager'), 'No debe haber texto de Voyager en observado');
  assert.equal(expState.dockHidden, true, 'Dock histórico debe estar oculto en modo experimental');
  console.log('PASS verificación de textos limpios en Modo Experimental');
  await snap('10-modo-experimental-limpio-sin-residuales-1920x1080');

  // =========================================================================
  // 7. Corrección de Defecto 3: Claridad en Primera Persona
  // =========================================================================
  console.log('\n--- 7. Defecto 3: Claridad en Primera Persona ---');
  await click('[data-mode-btn="historico"]');
  await wait(800);
  if (!await ev(`document.querySelector('#historical-welcome-modal').hidden`)) {
    await click('#welcome-close-btn');
  }

  // Ir al hito de Urano
  await ev(`${diag}.iniciarRecorrido(6)`);
  await wait(500);
  await click('#tour-close-btn');

  // Activar primera persona via inspector
  if (await ev(`document.querySelector('#context-inspector').dataset.state === 'closed'`)) {
    await click('#inspector-toggle');
  }
  await click('[data-inspector-tab="navigation"]');
  await click('#hist-cam-fp-btn');
  await wait(600);
  await click('[data-fp-target="Urano"]');
  await wait(600);

  await check('indicador primera persona visible', `!document.querySelector('#fp-scene-indicator').hidden`);
  const fpText = await ev(`document.querySelector('#fp-scene-indicator').textContent`);
  console.log('Indicador 1.ª persona:', fpText.trim().replace(/\s+/g, ' '));
  assert(fpText.includes('Voyager'), 'Indicador muestra sonda observadora');
  assert(fpText.includes('Urano'), 'Indicador muestra objetivo de mirada');
  assert(fpText.includes('FOV'), 'Indicador muestra FOV');

  // Cerrar inspector para capturar el escenario limpio con el indicador
  await click('#inspector-close');
  await snap('11-primera-persona-indicador-claridad-1920x1080');

  // Salir de primera persona usando el botón directo del indicador
  await click('#fp-exit-btn');
  await wait(500);
  await check('salida de primera persona', `document.querySelector('#fp-scene-indicator').hidden`);
  console.log('PASS salida limpia de primera persona mediante el indicador flotante');

  // =========================================================================
  // 8. Pruebas Responsive Móvil y Tablet
  // =========================================================================
  console.log('\n--- 8. Pruebas Responsive Móvil ---');
  // 390x844 (iPhone 14)
  await resize(390, 844);
  await wait(600);
  await snap('12-modo-historico-movil-390x844');

  // 320x568 (Compacto)
  await resize(320, 568);
  await wait(600);
  await snap('13-modo-historico-movil-320x568');

  // 768x1024 (Tablet vertical)
  await resize(768, 1024);
  await wait(600);
  await snap('14-modo-historico-tablet-768x1024');

  // Restaurar resolución de escritorio
  await resize(1920, 1080);
  await wait(400);

  assert.deepEqual(errors, [], 'No JS/HTTP errors during test run');
  console.log('\n============================================================');
  console.log(`COMPLETE: ${checks.length} checks passed, ${captures.length} screenshots captured.`);
  console.log('============================================================\n');

  await fs.writeFile(output + '/manifest.json', JSON.stringify({ checks, errors, captures }, null, 2));

} catch (err) {
  console.error('\n!!! ERROR EN TEST E2E:', err);
  errors.push({ type: 'test-failure', message: err.message, stack: err.stack });
  process.exitCode = 1;
} finally {
  ws.close();
}
