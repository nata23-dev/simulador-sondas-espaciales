// Auditoría final, fase 1 — GEN-02: carrera del planificador «Misión completa».
// Reproduce docs/auditoria-final/evidencias/ciencia/carrera-planificador.mjs en Node con el planificador REAL
// (src/ui/IntegratedMissionPlanner.js), las efemérides reales de public/data y un DOM mínimo que solo entiende lo que el
// planificador usa (si el planificador empieza a usar otro selector, el DOM falla en lugar de fingir).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { historicalDesign } from '../src/lab/ProbeDesign.js';
import { designSignature } from '../src/lab/MissionPlanStore.js';
import { ENCOUNTER_TARGETS } from '../src/lab/IntegratedMission.js';

// ---------- DOM mínimo ----------
class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.children = []; this.text = ''; this.listeners = new Map(); this.attributes = new Map();
    this.dataset = {}; this.hidden = false; this.disabled = false; this.checked = false; this.id = ''; this.type = ''; this._value = '';
    this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false }; this.style = {}; this.parsed = [];
  }
  get value() { return this._value; }
  set value(v) { this._value = String(v ?? ''); }
  get textContent() { return this.text + this.children.map(c => c.textContent).join(''); }
  set textContent(v) { this.children = []; this.text = String(v ?? ''); }
  get innerHTML() { return ''; }
  set innerHTML(html) { this.children = []; this.text = ''; this.parsed = parseTemplate(html); }
  get options() { return this.children.filter(c => c.tagName === 'OPTION'); }
  append(...nodes) { for (const n of nodes) if (typeof n === 'string') this.text += n; else this.children.push(n); }
  replaceChildren(...nodes) { this.children = []; this.text = ''; this.append(...nodes); }
  setAttribute(k, v) { this.attributes.set(k, String(v)); }
  getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
  removeAttribute(k) { this.attributes.delete(k); }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
  dispatchEvent(event) { for (const fn of this.listeners.get(event.type) ?? []) fn.call(this, event); return true; }
  click() { if (!this.disabled) this.dispatchEvent(new Event('click')); } // como el navegador: un botón deshabilitado no recibe el clic
  querySelector(selector) {
    const id = /^#([\w-]+)$/.exec(selector)?.[1];
    if (!id) throw new Error(`DOM de prueba: selector no admitido ${selector}`);
    return this.parsed.find(el => el.id === id) ?? null;
  }
  querySelectorAll(selector) {
    if (selector === '[data-ctx]') return this.parsed.filter(el => 'ctx' in el.dataset);
    if (selector === '#im-flow > li') return this.parsed.filter(el => el.tagName === 'LI' && 'flow' in el.dataset);
    if (selector === '.mission-controls input, .mission-controls select') return this.parsed.filter(el => el.section === 'controls' && (el.tagName === 'INPUT' || el.tagName === 'SELECT'));
    throw new Error(`DOM de prueba: selector no admitido ${selector}`);
  }
}
class FakeOption extends FakeElement { constructor(text = '', value = '') { super('option'); this.text = String(text); this._value = String(value); } }
function parseTemplate(html) {
  const elements = []; let section = null, select = null;
  for (const [, closing, tag, rest] of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g)) {
    const name = tag.toLowerCase();
    if (closing) { if (name === 'select') select = null; continue; }
    const el = new FakeElement(name);
    for (const [, key, value = ''] of rest.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
      if (key === 'id') el.id = value; else if (key === 'type') el.type = value; else if (key === 'value') el._value = value;
      else if (key === 'hidden') el.hidden = true; else if (key === 'checked') el.checked = true; else if (key === 'disabled') el.disabled = true;
      else if (key.startsWith('data-')) el.dataset[key.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = value;
      el.setAttribute(key, value);
    }
    const cls = el.getAttribute('class') ?? '';
    if (/\bmission-controls\b/.test(cls)) section = 'controls'; else if (/\bmission-stage\b/.test(cls)) section = 'stage'; else if (/\bmission-results\b/.test(cls)) section = 'results';
    el.section = section;
    if (name === 'select') select = el;
    else if (name === 'option' && select && !select.initialized) { select._value = el.getAttribute('value') ?? ''; select.initialized = true; } // valor por defecto: primera opción
    elements.push(el);
  }
  return elements;
}
globalThis.document = { createElement: tag => new FakeElement(tag) };
globalThis.Option = FakeOption;

// ---------- Datos: public/ en disco, con retención controlable de algunos archivos ----------
const held = [];
let holdPattern = null;
globalThis.fetch = async url => {
  const file = `public${decodeURIComponent(String(url))}`;
  if (holdPattern?.test(file)) {
    const outcome = await new Promise(resolve => held.push({ file, resolve }));
    if (outcome === 'fail') return { ok: false, status: 503, json: async () => { throw new Error('503'); } };
  }
  const text = readFileSync(file, 'utf8');
  return { ok: true, status: 200, json: async () => JSON.parse(text) };
};
const tick = (ms = 5) => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, label, timeoutMs = 20000) {
  const t0 = Date.now();
  while (!predicate()) { if (Date.now() - t0 > timeoutMs) throw new Error(`Tiempo agotado esperando: ${label}`); await tick(); }
}
function release(outcome = 'ok') { for (const h of held.splice(0)) h.resolve(outcome); }

const { createIntegratedMissionPlanner } = await import('../src/ui/IntegratedMissionPlanner.js');
const CASSINI = { ...historicalDesign('cassini'), id: 'flota-cassini' };
const JUNO = { ...historicalDesign('juno'), id: 'flota-juno' };
const MARS = ENCOUNTER_TARGETS['499'].name, JUPITER = ENCOUNTER_TARGETS['599'].name;

async function mount(design = CASSINI) {
  holdPattern = null; held.length = 0;
  const host = new FakeElement('section'), executed = [];
  const planner = createIntegratedMissionPlanner({ host, onExecuteRequest: request => executed.push(request) });
  planner.setDesign(design);
  const $ = selector => host.querySelector(selector);
  await until(() => $('#im-coverage').textContent.includes('DE441'), 'catálogos de efemérides');
  // Mismo gesto que la interfaz y que ExperimentalLaboratory.applyScenario: cambiar el selector y emitir «change».
  const choose = id => { $('#im-scenario').value = id; $('#im-scenario').dispatchEvent(new Event('change')); };
  // Clic que llega al manejador aunque el botón esté deshabilitado: comprueba la defensa del propio manejador.
  const forceExecute = () => $('#im-execute').dispatchEvent(new Event('click'));
  return { planner, host, $, executed, choose, forceExecute };
}
function assertNothingExecutable(t, label) {
  const s = t.planner.getState();
  assert.equal(s.mission, null, `${label}: no queda misión publicada`);
  assert.equal(s.executable, false, `${label}: no reproducible`);
  assert.equal(t.$('#im-execute').disabled, true, `${label}: botón de reproducción deshabilitado`);
  t.forceExecute();
  assert.equal(t.executed.length, 0, `${label}: el manejador tampoco ejecuta`);
}

test('GEN-02 · A1 → C1 durante la primera espera: el cálculo de Marte se descarta y no puede ejecutarse', async () => {
  const t = await mount();
  t.choose('A1');
  const pending = t.planner.compute();
  assert.equal(t.planner.getState().busy, true);
  t.choose('C1'); // como el guion de la auditoría: inmediatamente después de pulsar «Calcular»
  assert.equal(t.planner.getState().busy, false, 'el cambio cancela el cálculo en curso al instante');
  assert.equal(t.$('#im-compute').disabled, false, 'se puede volver a calcular enseguida');
  await pending;
  await tick(50);
  assert.equal(t.$('#im-scenario').value, 'C1');
  assert.equal(t.$('#im-destination').value, '599');
  assert.match(t.$('#im-message').textContent, /descartó su resultado/);
  assertNothingExecutable(t, 'tras el cambio a C1');
  // Con las condiciones vigentes (C1), el cálculo y la ejecución corresponden a Júpiter.
  await t.planner.compute();
  const s = t.planner.getState();
  assert.equal(s.mission.destinationName, JUPITER);
  assert.equal(s.executable, true);
  t.$('#im-execute').click();
  assert.equal(t.executed.length, 1);
  assert.equal(t.executed[0].result.destinationName, JUPITER);
  assert.doesNotMatch(t.executed[0].name, /Marte/);
  // La API directa applyScenario(id) también sincroniza el selector e invalida la misión anterior.
  t.executed.length = 0;
  t.planner.applyScenario('A1');
  assert.equal(t.$('#im-scenario').value, 'A1');
  assert.equal(t.planner.getState().scenarioId, 'A1');
  assertNothingExecutable(t, 'tras applyScenario(A1) directo');
});

test('GEN-02 · cambio durante la descarga del tramo de efemérides (segunda espera): el resultado obsoleto no se publica', async () => {
  const t = await mount();
  t.choose('A1');
  holdPattern = /data[\\/]interplanetary[\\/]ip-planets-inner/;
  const pending = t.planner.compute();
  await until(() => held.length > 0, 'descarga retenida del tramo de Marte');
  t.$('#im-tof').value = 300; t.$('#im-tof').dispatchEvent(new Event('change')); // cualquier edición del formulario
  assert.equal(t.$('#im-scenario').value, 'custom');
  holdPattern = null; release();
  await pending;
  await tick(50);
  assertNothingExecutable(t, 'tras editar el vuelo durante la descarga');
  assert.equal(t.planner.getState().busy, false);
});

test('GEN-02 · la solicitud nueva termina antes que la anterior: solo se publica y ejecuta la vigente (A1)', async () => {
  const t = await mount();
  t.choose('C1');
  holdPattern = /galilean-moons/; // solo C1 la necesita: la solicitud de Júpiter se queda esperando el satélite
  const old = t.planner.compute();
  await until(() => held.length > 0, 'descarga retenida de los satélites galileanos');
  t.choose('A1');
  await t.planner.compute(); // A1 no usa ese archivo: termina mientras C1 sigue esperando
  let s = t.planner.getState();
  assert.equal(s.mission.destinationName, MARS);
  assert.equal(s.executable, true);
  holdPattern = null; release(); // ahora vuelve la solicitud obsoleta de Júpiter
  await old;
  await tick(50);
  s = t.planner.getState();
  assert.equal(s.mission.destinationName, MARS, 'la solicitud de Júpiter no sobrescribe la misión vigente');
  assert.equal(s.executable, true);
  t.$('#im-execute').click();
  assert.equal(t.executed.length, 1);
  assert.match(t.executed[0].name, /^Tierra → Marte \(/);
});

test('GEN-02 · un error de carga de la solicitud descartada no pisa el resultado ni el mensaje vigentes', async () => {
  const t = await mount();
  t.choose('C1');
  holdPattern = /galilean-moons/;
  const old = t.planner.compute();
  await until(() => held.length > 0, 'descarga retenida de los satélites galileanos');
  t.choose('A1');
  await t.planner.compute();
  const before = t.$('#im-message').textContent;
  holdPattern = null; release('fail'); // la descarga de la solicitud obsoleta falla (HTTP 503)
  await old;
  await tick(50);
  const s = t.planner.getState();
  assert.equal(s.mission.destinationName, MARS);
  assert.equal(s.executable, true);
  assert.equal(t.$('#im-message').textContent, before);
  assert.equal(t.$('#im-message').dataset.error, 'false');
});

test('GEN-02 · un error de carga de la solicitud vigente se informa y no deja nada ejecutable', async () => {
  const t = await mount();
  t.choose('A1');
  holdPattern = /data[\\/]interplanetary[\\/]ip-planets-inner/;
  const pending = t.planner.compute();
  await until(() => held.length > 0, 'descarga retenida');
  holdPattern = null; release('fail');
  await pending;
  assert.equal(t.$('#im-message').dataset.error, 'true');
  assert.match(t.$('#im-message').textContent, /HTTP 503/);
  assertNothingExecutable(t, 'tras el error de carga');
  assert.equal(t.planner.getState().busy, false);
  assert.equal(t.$('#im-compute').disabled, false);
  // Reintentar con los mismos parámetros funciona (el archivo fallido no quedó en caché).
  await t.planner.compute();
  assert.equal(t.planner.getState().mission.destinationName, MARS);
  assert.equal(t.planner.getState().executable, true);
});

test('GEN-02 · cambiar de sonda durante el cálculo lo descarta; la misma sonda no', async () => {
  const t = await mount(CASSINI);
  t.choose('A1');
  let pending = t.planner.compute();
  t.planner.setDesign({ ...CASSINI }); // misma firma (la barra del laboratorio vuelve a enviar la sonda activa)
  assert.equal(t.planner.getState().busy, true, 'la misma sonda no cancela');
  await pending;
  assert.equal(t.planner.getState().mission.destinationName, MARS);
  assert.equal(t.planner.getState().mission.designSignature, designSignature(CASSINI));
  pending = t.planner.compute();
  t.planner.setDesign(JUNO);
  assert.equal(t.planner.getState().busy, false, 'otra sonda cancela al instante');
  await pending;
  await tick(50);
  assert.match(t.$('#im-message').textContent, /sonda activa cambió durante el cálculo/);
  assertNothingExecutable(t, 'tras cambiar a Juno');
  await t.planner.compute();
  assert.equal(t.planner.getState().mission.designSignature, designSignature(JUNO));
  t.$('#im-execute').click();
  assert.equal(t.executed.length, 1);
  assert.equal(t.executed[0].design, JUNO);
});

test('GEN-02 · mientras se calcula no se reproduce el resultado anterior; sin cambios, A1 se calcula y se reproduce', async () => {
  const t = await mount();
  t.choose('A1');
  await t.planner.compute();
  assert.equal(t.planner.getState().executable, true);
  const pending = t.planner.compute(); // recálculo con las mismas condiciones
  assert.equal(t.$('#im-execute').disabled, true);
  assert.equal(t.planner.getState().executable, false);
  t.forceExecute();
  assert.equal(t.executed.length, 0);
  assert.match(t.$('#im-message').textContent, /Espera a que termine el cálculo en curso/);
  await pending;
  const s = t.planner.getState();
  assert.equal(s.busy, false);
  assert.equal(s.mission.destinationName, MARS);
  assert.match(s.mission.verdict, /^CADENA CALCULADA COMPLETA/);
  assert.equal(s.executable, true);
  t.$('#im-execute').click();
  assert.equal(t.executed.length, 1);
  assert.match(t.executed[0].name, /^Tierra → Marte \(/);
  assert.equal(t.executed[0].result, s.mission);
});

test('GEN-02 · recalcular mientras carga el crucero de n cuerpos: la comparación anterior no bloquea ni contamina la misión nueva', async () => {
  const t = await mount();
  t.choose('A1');
  await t.planner.compute();
  holdPattern = /ip-(planets|barycenters)-outer/; // archivos que solo pide la comparación de n cuerpos (A1 no los usa)
  t.$('#im-nbody').click();
  await until(() => held.length > 0, 'descarga retenida del crucero de n cuerpos');
  assert.equal(t.$('#im-nbody').disabled, true);
  await t.planner.compute(); // mismas condiciones: publica una misión nueva sin pasar por la invalidación
  const current = t.planner.getState().mission;
  holdPattern = null; release(); // ahora termina la descarga de la comparación anterior
  await tick(300);
  assert.equal(t.planner.getState().mission, current);
  assert.equal(t.$('#im-nbody').disabled, false, 'se puede comparar la misión nueva');
  assert.equal(t.$('#im-nbody-status').textContent, 'Sin comparar todavía.', 'el resultado de la misión anterior no se muestra como de la nueva');
});

test('GEN-02 · elegir «Personalizado» no cambia los valores ni invalida, pero actualiza el resultado esperado', async () => {
  const t = await mount();
  t.choose('A1');
  await t.planner.compute();
  assert.match(t.$('#im-outcome').textContent, /^Con Cassini/);
  t.choose('custom');
  assert.equal(t.$('#im-scenario').value, 'custom');
  assert.match(t.$('#im-outcome').textContent, /^Valores propios/);
  assert.equal(t.planner.getState().mission.destinationName, MARS);
  assert.equal(t.planner.getState().executable, true, 'los valores del formulario siguen siendo los calculados');
});
