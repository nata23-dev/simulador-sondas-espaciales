import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, planPartChange, applyPartChange, validateDesign } from '../src/lab/ProbeDesign.js';
import { calculateEngineering } from '../src/lab/ProbeEngineering.js';
import { measureLandingClearance, measureRearMountFit } from '../src/lab/ProbeAssemblyView.js';

test('la sustitución identifica el tanque y requiere decisión sin tocar el diseño', () => {
  const original = PRESETS[1].create();
  const snapshot = structuredClone(original);
  const plan = planPartChange(original, 'engine-ion', 'engine');
  assert.equal(plan.component.propellant, 'xenon');
  assert.deepEqual(plan.conflicts.map(item => [item.componentId, item.socketId, item.replacement?.id]),
    [['tank-chemical', 'tank', 'tank-xenon']]);
  assert.throws(() => applyPartChange(original, 'engine-ion', 'engine'), /Propelente incompatible/);
  assert.deepEqual(original, snapshot);
});

test('reemplazar motor y tanque es atómico y actualiza la ingeniería', () => {
  const original = PRESETS[1].create();
  const snapshot = structuredClone(original);
  const replaced = applyPartChange(original, 'engine-ion', 'engine', 'replace');
  assert.deepEqual(original, snapshot);
  assert.equal(replaced.parts.find(part => part.socketId === 'engine').componentId, 'engine-ion');
  assert.deepEqual(replaced.parts.filter(part => part.socketId === 'tank').map(part => [part.componentId, part.fuelKg]),
    [['tank-xenon', 58]]);
  assert.equal(replaced.parts.length, original.parts.length);
  assert.deepEqual(validateDesign(replaced), []);
  const oldMetrics = calculateEngineering(original);
  const newMetrics = calculateEngineering(replaced);
  assert.equal(oldMetrics.wetMassKg, 561);
  assert.equal(newMetrics.dryMassKg, 356);
  assert.equal(newMetrics.wetMassKg, 414);
  assert.equal(newMetrics.thrustN, 0.04);
  assert.ok(newMetrics.deltaVMS > oldMetrics.deltaVMS);
});

test('retirar tanque, cancelar y fallar conservan el diseño previo', () => {
  const original = PRESETS[1].create();
  const snapshot = structuredClone(original);
  // Cancelar en la interfaz termina después de planificar; no hay mutación.
  planPartChange(original, 'engine-ion', 'engine');
  assert.deepEqual(original, snapshot);
  const withoutTank = applyPartChange(original, 'engine-ion', 'engine', 'remove');
  assert.equal(withoutTank.parts.some(part => part.socketId === 'tank'), false);
  assert.equal(calculateEngineering(withoutTank).deltaVMS, null);
  assert.deepEqual(validateDesign(withoutTank), []);
  assert.throws(() => applyPartChange(original, 'engine-ion', 'antenna', 'replace'), /conexión incompatible/);
  assert.throws(() => applyPartChange(original, 'engine-ion', 'engine', 'unknown'), /Elige reemplazar o retirar/);
  assert.deepEqual(original, snapshot);
});

test('el cambio inverso de tanque también resuelve el motor y las ranuras ocupadas no duplican piezas', () => {
  const original = PRESETS[1].create();
  const plan = planPartChange(original, 'tank-xenon', 'tank');
  assert.deepEqual(plan.conflicts.map(item => item.componentId), ['engine-chemical']);
  const switched = applyPartChange(original, 'tank-xenon', 'tank', 'replace');
  assert.equal(switched.parts.find(part => part.socketId === 'engine').componentId, 'engine-ion');
  assert.deepEqual(validateDesign(switched), []);
  const sameFuel = applyPartChange(original, 'engine-chemical', 'engine');
  assert.equal(sameFuel.parts.length, original.parts.length);
  assert.deepEqual(validateDesign(sameFuel), []);
});

test('las mallas ensambladas dejan más de 5 cm entre tobera y apoyos en el aterrizador', () => {
  const clearance = measureLandingClearance(PRESETS[3].create());
  assert.ok(clearance);
  assert.ok(Math.abs(clearance.engineBottomY - (-1.959)) < 0.001);
  assert.ok(clearance.padBottomY < clearance.engineBottomY);
  assert.ok(clearance.clearanceM >= 0.05, `Holgura real: ${clearance.clearanceM} m`);
  for (const preset of PRESETS.slice(1, 3)) {
    const withLegs = applyPartChange(preset.create(), 'landing-legs', 'landing');
    assert.ok(measureLandingClearance(withLegs).clearanceM >= 0.05, `${preset.id}: holgura insuficiente`);
  }
});

test('cámara y tanque quedan fuera del casco y sus soportes llegan a la pared', () => {
  for (const preset of PRESETS.slice(1)) {
    const fit = measureRearMountFit(preset.create());
    for (const part of [fit.camera, fit.tank]) {
      assert.ok(part.bodyGapM >= 0, `${preset.id}: cuerpo penetra ${part.bodyGapM} m`);
      assert.ok(part.bodyGapM < 0.15, `${preset.id}: pieza demasiado alejada ${part.bodyGapM} m`);
      assert.ok(part.mountReachM > 0, `${preset.id}: soporte no alcanza el casco`);
    }
  }
});
