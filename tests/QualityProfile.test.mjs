// Etapa 15 — perfiles de calidad gráfica: lógica pura (sin WebGL). Solo presentación.
import test from 'node:test';
import assert from 'node:assert/strict';
import { QUALITY_PROFILES, effectivePixelRatio, autoInitialCap, createFrameMonitor, registerRenderer, setQualityProfile, getQualityState, reportFrame } from '../src/graphics/QualityProfile.js';

test('relación de píxeles efectiva: tope del perfil sin superar la del dispositivo', () => {
  assert.equal(effectivePixelRatio(3, QUALITY_PROFILES.alto.pixelRatioCap), 2);
  assert.equal(effectivePixelRatio(3, QUALITY_PROFILES.medio.pixelRatioCap), 1.5);
  assert.equal(effectivePixelRatio(3, QUALITY_PROFILES.bajo.pixelRatioCap), 1);
  assert.equal(effectivePixelRatio(1, QUALITY_PROFILES.alto.pixelRatioCap), 1, 'nunca por encima del dispositivo');
  assert.equal(effectivePixelRatio(undefined, 2), 1);
});

test('modo automático: tope inicial según el equipo', () => {
  assert.equal(autoInitialCap({}), 2);
  assert.equal(autoInitialCap({ coarsePointer: true }), 1.5);
  assert.equal(autoInitialCap({ deviceMemoryGb: 4 }), 1.5);
  assert.equal(autoInitialCap({ cores: 2 }), 1.5);
  assert.equal(autoInitialCap({ deviceMemoryGb: 16, cores: 12 }), 2);
});

test('monitor de fotogramas: baja solo tras dos ventanas lentas e ignora pausas largas', () => {
  const m = createFrameMonitor({ windowSeconds: 1, slowFps: 30, slowWindows: 2 });
  const run = (fps, seconds) => { let out = false; for (let i = 0; i < fps * seconds; i++) out = m.report(1 / fps) || out; return out; };
  assert.equal(run(60, 3), false, 'a 60 FPS no baja');
  assert.equal(run(20, 1.05), false, 'una ventana lenta no basta');
  assert.equal(run(20, 1.05), true, 'dos ventanas lentas seguidas');
  m.reset();
  assert.equal(m.report(5), false, 'una pausa de 5 s (pestaña oculta) no cuenta');
});

test('el perfil se aplica a los renderizadores registrados y el automático reduce por escalones', () => {
  const calls = [];
  const fake = { setPixelRatio: value => calls.push(value) };
  globalThis.devicePixelRatio = 3;
  const unregister = registerRenderer(fake);
  setQualityProfile('bajo'); assert.equal(calls.at(-1), 1);
  setQualityProfile('alto'); assert.equal(calls.at(-1), 2);
  setQualityProfile('auto');
  const start = getQualityState().pixelRatioCap;
  // 27: equipo limitado por los píxeles (el tiempo de cada fotograma crece con el cuadrado de la relación): a la relación de
  // partida va a 20 FPS. La resolución dinámica baja y se queda abajo, porque al bajar los FPS mejoran.
  const fotograma = () => Math.max(1 / 60, (1 / 20) * (getQualityState().pixelRatio / start) ** 2);
  for (let t = 0; t < 8;) { const dt = fotograma(); reportFrame(dt); t += dt; }
  assert.ok(getQualityState().pixelRatioCap < start, 'baja la resolución');
  assert.ok(1 / fotograma() >= 48, `y llega a la zona de 50–60 FPS (${(1 / fotograma()).toFixed(1)})`);
  assert.equal(calls.at(-1), getQualityState().pixelRatio);
  assert.equal(getQualityState().adapted, true);
  unregister();
  const count = calls.length; setQualityProfile('medio'); assert.equal(calls.length, count, 'tras la baja ya no recibe cambios');
  delete globalThis.devicePixelRatio;
});
