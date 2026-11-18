import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateMoonDataset } from '../src/science/PlanetaryMoons.js';
import { gregorianTimestampToJdTdb } from '../src/science/Time.js';
import { PRESETS } from '../src/lab/ProbeDesign.js';
import { calculateEngineering, STANDARD_GRAVITY_M_S2 } from '../src/lab/ProbeEngineering.js';
import { calculateLunarTransfer, EARTH_MU_KM3_S2, EARTH_RADIUS_KM, MOON_RADIUS_KM, hasLunarCoverage } from '../src/lab/MissionPhysics.js';
import { consumeManeuvers, evaluateMission } from '../src/lab/MissionEngineering.js';
import { createMissionPlan, designSignature, isMissionResultCurrent, loadSavedPlans, parseMissionPlan, saveMissionPlan } from '../src/lab/MissionPlanStore.js';

const dataset = validateMoonDataset(JSON.parse(readFileSync(new URL('../public/data/moons-2026-10.json', import.meta.url), 'utf8')), { isolate: true }).data;
const departureJd = gregorianTimestampToJdTdb('2026-10-15 12:00');
const options = { destination: 'moon', objective: 'approach', altitudeKm: 200, targetDistanceKm: 50000, departureTdb: '2026-10-15T12:00' };

test('Tsiolkovsky consume masa secuencialmente y conserva masa seca', () => {
  const result = consumeManeuvers({ dryMassKg: 800, fuelKg: 200, ispS: 300, thrustN: 1000, deltaVMS: [200, 300] });
  const expectedFirst = 1000 * Math.exp(-200 / (300 * STANDARD_GRAVITY_M_S2));
  const expectedFinal = 1000 * Math.exp(-500 / (300 * STANDARD_GRAVITY_M_S2));
  assert.ok(Math.abs(result.maneuvers[0].massAfterKg - expectedFirst) < 1e-9);
  assert.ok(Math.abs(result.finalMassKg - expectedFinal) < 1e-9);
  assert.ok(result.maneuvers[1].fuelRequiredKg < result.maneuvers[0].fuelRequiredKg * 1.5);
  assert.ok(result.finalMassKg >= 800 && result.fuelRemainingKg >= 0);
  assert.ok(Math.abs(result.maneuvers.reduce((s, m) => s + m.fuelConsumedKg, 0) + result.finalMassKg - 1000) < 1e-9);
});

test('maniobra imposible no consume combustible ni permite saltar a una posterior', () => {
  const result = consumeManeuvers({ dryMassKg: 900, fuelKg: 100, ispS: 300, thrustN: 1000, deltaVMS: [1000, 100] });
  assert.deepEqual(result.maneuvers.map(m => m.executable), [false, false]);
  assert.equal(result.finalMassKg, 1000);
  assert.equal(result.fuelRemainingKg, 100);
});

test('efeméride local restringe salida y llegada; no extrapola', () => {
  assert.ok(hasLunarCoverage(dataset, departureJd, departureJd + 5));
  assert.equal(hasLunarCoverage(dataset, departureJd, gregorianTimestampToJdTdb('2026-11-02')), false);
  assert.throws(() => calculateLunarTransfer({ dataset, departureJd: gregorianTimestampToJdTdb('2026-11-02'), altitudeKm: 200 }), /cubierta/);
  assert.throws(() => calculateLunarTransfer({ dataset, departureJd: gregorianTimestampToJdTdb('2026-10-31'), altitudeKm: 200 }), /cobertura/);
});

test('transferencia restringida integra el encuentro lunar y conserva la geometría inicial', () => {
  const result = calculateLunarTransfer({ dataset, departureJd, altitudeKm: 200, target: 'approach' });
  assert.ok(Math.abs(result.departureDeltaVMS - 3124) < 2);
  assert.ok(Math.abs(result.flightSeconds / 86400 - 4.325) < 0.01);
  assert.ok(Math.abs(result.arrivalSeparationKm - 50000) < 1);
  assert.ok(result.integrationMissKm < 1);
  assert.ok(result.trajectory.length > 50);
  assert.ok(result.trajectory.every(state => state.positionKm.every(Number.isFinite) && state.velocityKmS.every(Number.isFinite)));
  assert.ok(result.trajectory.every(state => state.moonPositionKm.every(Number.isFinite)));
  const independentlyComputedHalfPeriod = Math.PI * Math.sqrt(((result.parkingRadiusKm + result.apogeeKm) / 2) ** 3 / EARTH_MU_KM3_S2);
  assert.ok(Math.abs(result.flightSeconds - independentlyComputedHalfPeriod) < 1e-6);
  assert.ok(Math.abs(Math.hypot(...result.initialPositionKm) - (EARTH_RADIUS_KM + 200)) < 1e-8);
});

test('sobrevuelo lunar usa propagación posterior y distingue maniobra viable de distancia mínima', () => {
  const transfer = calculateLunarTransfer({ dataset, departureJd, altitudeKm: 60000, target: 'flyby' });
  assert.ok(transfer.flybyResolved);
  assert.ok(transfer.closestApproach.distanceKm > MOON_RADIUS_KM);
  assert.ok(transfer.closestApproach.distanceKm < transfer.arrivalSeparationKm);
  assert.ok(transfer.trajectory.at(-1).jdTdb > transfer.arrivalJd);
  assert.equal(evaluateMission(PRESETS[1].create(), transfer).status, 'VIABLE SEGÚN EL MODELO');
});

test('la condición de encuentro seleccionable determina la separación calculada', () => {
  const transfer = calculateLunarTransfer({ dataset, departureJd, altitudeKm: 200, target: 'approach', targetDistanceKm: 60000 });
  assert.ok(Math.abs(transfer.arrivalSeparationKm - 60000) < 2);
  assert.throws(() => calculateLunarTransfer({ dataset, departureJd, altitudeKm: 200, target: 'flyby', targetDistanceKm: 60000 }), /Distancia lunar/);
});

test('presupuesto real del Hangar distingue insuficiencia, caso viable y empuje iónico no verificable', () => {
  const low = calculateLunarTransfer({ dataset, departureJd, altitudeKm: 200 });
  const high = calculateLunarTransfer({ dataset, departureJd, altitudeKm: 100000 });
  const chemical = PRESETS[1].create();
  const insufficient = evaluateMission(chemical, low);
  assert.equal(insufficient.status, 'INSUFICIENTE');
  assert.ok(insufficient.budget.maneuvers[0].fuelRequiredKg > calculateEngineering(chemical).fuelKg);
  const viable = evaluateMission(chemical, high);
  assert.equal(viable.status, 'VIABLE SEGÚN EL MODELO');
  assert.ok(viable.budget.finalMassKg >= viable.engineering.dryMassKg);
  assert.ok(viable.remainingDeltaVMS >= 0 && viable.remainingDeltaVMS < viable.availableDeltaVMS);
  const ion = evaluateMission(PRESETS[2].create(), high);
  assert.equal(ion.status, 'NO VERIFICABLE');
  assert.match(ion.reasons.join(' '), /iónico/);
});

test('potencia y propelente incompatible impiden declarar viable la maniobra', () => {
  const high = calculateLunarTransfer({ dataset, departureJd, altitudeKm: 100000 });
  const dark = PRESETS[1].create();
  dark.parts = dark.parts.filter(part => part.componentId !== 'solar-wing');
  const energy = evaluateMission(dark, high);
  assert.equal(energy.status, 'INSUFICIENTE');
  assert.match(energy.reasons.join(' '), /Energía insuficiente/);
  const invalid = PRESETS[1].create();
  invalid.parts.find(part => part.socketId === 'tank').componentId = 'tank-xenon';
  assert.equal(evaluateMission(invalid, high).status, 'INSUFICIENTE');
});

test('plan versionado, asociación, invalidación y persistencia local', () => {
  const memory = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  try {
    const design = PRESETS[1].create();
    const plan = createMissionPlan(design, options, 'Prueba lunar');
    assert.equal(parseMissionPlan(JSON.stringify(plan)).designId, design.id);
    saveMissionPlan(plan);
    assert.equal(loadSavedPlans().length, 1);
    const result = { designId: design.id, designSignature: designSignature(design), options: JSON.stringify(options), modelVersion: plan.modelVersion };
    assert.equal(isMissionResultCurrent(result, design, options), true);
    const modified = structuredClone(design);
    modified.parts.find(p => p.socketId === 'tank').fuelKg -= 10;
    assert.equal(isMissionResultCurrent(result, modified, options), false);
    assert.equal(isMissionResultCurrent(result, design, { ...options, altitudeKm: 300 }), false);
    assert.throws(() => parseMissionPlan(JSON.stringify({ ...plan, designSignature: 'alterada' })), /asociación/);
    assert.throws(() => parseMissionPlan(JSON.stringify({ ...plan, options: { ...options, destination: 'mars' } })), /destino/);
    assert.throws(() => parseMissionPlan(JSON.stringify({ ...plan, options: { ...options, targetDistanceKm: 500 } })), /Distancia lunar/);
    assert.equal(parseMissionPlan(JSON.stringify({ ...plan, modelVersion: 'antiguo' })).modelVersion, 'antiguo');
  } finally { globalThis.localStorage = previous; }
});
