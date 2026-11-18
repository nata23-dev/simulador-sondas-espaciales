import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateMoonDataset, queryMoon } from '../src/science/PlanetaryMoons.js';
import { gregorianTimestampToJdTdb, secondsBetweenJdTdb } from '../src/science/Time.js';
import { integrateRk4, integrateDopri54 } from '../src/science/NumericalIntegrator.js';
import { PRESETS } from '../src/lab/ProbeDesign.js';
import { calculateLunarTransfer, EARTH_MU_KM3_S2, EARTH_RADIUS_KM, MOON_MU_KM3_S2 } from '../src/lab/MissionPhysics.js';
import { evaluateMission } from '../src/lab/MissionEngineering.js';
import { formatMissionTdb, formatMissionFlightDays, formatMissionFlightSeconds } from '../src/ui/MissionTimeDisplay.js';

const dataset = validateMoonDataset(JSON.parse(readFileSync(new URL('../public/data/moons-2026-10.json', import.meta.url), 'utf8')), { isolate: true }).data;
const departureJd = gregorianTimestampToJdTdb('2026-10-15 12:00');
const probe = PRESETS[1].create();
const cache = new Map();
function caseTransfer(id) {
  if (!cache.has(id)) {
    const setup = { A: [200, 'approach'], B: [100000, 'approach'], F: [200, 'flyby'], V: [60000, 'flyby'] }[id];
    cache.set(id, calculateLunarTransfer({ dataset, departureJd, altitudeKm: setup[0], target: setup[1] }));
  }
  return cache.get(id);
}
const magnitude = values => Math.hypot(...values);
const distance = (a, b) => magnitude(a.map((value, index) => value - b[index]));
function lunarStateAt(transfer, jd, position, velocity) {
  const moon = queryMoon(dataset, 'Luna', jd);
  const r = distance(position, moon.positionKm);
  const v = distance(velocity, moon.velocityKmS);
  return { r, v, energy: v * v / 2 - MOON_MU_KM3_S2 / r };
}

test('12B.1-A: 200 km, salida TDB y transferencia de 4.3249 días', () => {
  const t = caseTransfer('A');
  assert.equal(departureJd, 2461329);
  assert.ok(Math.abs(magnitude(t.initialPositionKm) - (EARTH_RADIUS_KM + 200)) < 1e-7);
  assert.ok(Math.abs(magnitude(t.circularVelocityKmS) - Math.sqrt(EARTH_MU_KM3_S2 / (EARTH_RADIUS_KM + 200))) < 1e-10);
  assert.ok(Math.abs(t.departureDeltaVMS - 3123.10003) < 0.02);
  assert.ok(Math.abs(t.flightSeconds - 373674.8880) < 0.05);
  assert.ok(Math.abs(t.arrivalSeparationKm - 50000) < 0.1);
  assert.equal(evaluateMission(probe, t).status, 'INSUFICIENTE');
});

test('12B.1-B: 100 000 km, misma salida pero transferencia de 6.1047 días', () => {
  const t = caseTransfer('B');
  assert.ok(Math.abs(magnitude(t.initialPositionKm) - (EARTH_RADIUS_KM + 100000)) < 1e-7);
  assert.ok(Math.abs(magnitude(t.circularVelocityKmS) - Math.sqrt(EARTH_MU_KM3_S2 / (EARTH_RADIUS_KM + 100000))) < 1e-10);
  assert.ok(Math.abs(t.departureDeltaVMS - 435.19382) < 0.02);
  assert.ok(Math.abs(t.flightSeconds - 527445.6085) < 0.05);
  assert.ok(Math.abs(t.arrivalSeparationKm - 50000) < 0.5);
  assert.equal(evaluateMission(probe, t).status, 'VIABLE SEGÚN EL MODELO');
});

test('12B.1-C: duración TDB y resta civil independiente de etiquetas completas', () => {
  for (const id of ['A', 'B']) {
    const t = caseTransfer(id);
    assert.ok(Math.abs(secondsBetweenJdTdb(t.departureJd, t.arrivalJd) - t.flightSeconds) < 0.001);
  }
  // Date.UTC se usa aquí SOLO como aritmética gregoriana independiente entre
  // etiquetas TDB de igual escala. No convierte un instante TDB a UTC.
  const civilA = (Date.UTC(2026, 9, 19, 19, 47, 54, 888) - Date.UTC(2026, 9, 15, 12)) / 1000;
  const civilB = (Date.UTC(2026, 9, 21, 14, 30, 45, 609) - Date.UTC(2026, 9, 15, 12)) / 1000;
  assert.ok(Math.abs(civilA - caseTransfer('A').flightSeconds) < 0.001);
  assert.ok(Math.abs(civilB - caseTransfer('B').flightSeconds) < 0.001);
  assert.equal((Date.UTC(2026, 9, 21, 14, 30) - Date.UTC(2026, 9, 15, 12)) / 86400000, 6.104166666666667);
});

test('12B.1-D: energía lunar osculante usa r y v de una sola época', () => {
  const t = caseTransfer('F');
  const arrival = lunarStateAt(t, t.arrivalJd, t.arrivalPositionKm, t.arrivalVelocityKmS);
  const near = lunarStateAt(t, t.closestApproach.jdTdb, t.closestApproach.positionKm, t.closestApproach.velocityKmS);
  assert.ok(Math.abs(arrival.r - 19999.808322) < 0.1);
  assert.ok(Math.abs(arrival.v - 1.033254055) < 1e-5);
  assert.ok(Math.abs(arrival.energy - 0.2886646153) < 1e-5);
  assert.ok(Math.abs(arrival.energy - t.moonRelativeEnergyKm2S2) < 1e-12);
  assert.ok(Math.abs(near.r - 19175.983592) < 0.1);
  assert.ok(Math.abs(near.v - 1.042913032) < 1e-5);
  assert.ok(Math.abs(near.energy - 0.2881598126) < 1e-5);
  const mixedEpoch = arrival.v ** 2 / 2 - MOON_MU_KM3_S2 / near.r;
  assert.ok(Math.abs(mixedEpoch - 0.2781329868) < 1e-5);
  assert.ok(Math.abs(mixedEpoch - near.energy) > 0.009);
});

test('12B.1-E: signo de energía osculante no define por sí solo el sobrevuelo', () => {
  const t = caseTransfer('V');
  assert.ok(t.flybyResolved);
  assert.equal(evaluateMission(probe, t).status, 'VIABLE SEGÚN EL MODELO');
  assert.equal(evaluateMission(probe, { ...t, flybyResolved: false }).status, 'NO VERIFICABLE');
  assert.equal(evaluateMission(probe, { ...t, moonRelativeEnergyKm2S2: -1 }).status, 'VIABLE SEGÚN EL MODELO');
  const flyby = caseTransfer('F');
  const arrival = lunarStateAt(flyby, flyby.arrivalJd, flyby.arrivalPositionKm, flyby.arrivalVelocityKmS);
  const near = lunarStateAt(flyby, flyby.closestApproach.jdTdb, flyby.closestApproach.positionKm, flyby.closestApproach.velocityKmS);
  assert.ok(arrival.energy > 0 && near.energy > 0);
  assert.ok(Math.abs(arrival.energy - near.energy) > 1e-4);
});

test('12B.1-F: fechas y duración que ve la interfaz coinciden con los casos documentados', () => {
  assert.equal(formatMissionTdb(caseTransfer('A').departureJd), '2026-10-15 12:00:00.000 TDB');
  assert.equal(formatMissionTdb(caseTransfer('A').arrivalJd), '2026-10-19 19:47:54.888 TDB');
  assert.equal(formatMissionTdb(caseTransfer('B').arrivalJd), '2026-10-21 14:30:45.609 TDB');
  assert.equal(formatMissionFlightDays(caseTransfer('A').flightSeconds), '4.324941 días');
  assert.equal(formatMissionFlightDays(caseTransfer('B').flightSeconds), '6.104695 días');
  assert.equal(formatMissionFlightSeconds(caseTransfer('B').flightSeconds), '527,445.609 s');
  const doc = readFileSync(new URL('../docs/STAGE12B1_NUMERICAL_RECONCILIATION.md', import.meta.url), 'utf8');
  for (const value of ['CASO-A', 'CASO-B', 'CASO-F', '2026-10-21 14:30:45.609 TDB', '+0,288665', '+0,288160']) assert.ok(doc.includes(value), value);
});

test('12B.1-G: RK4 independiente converge hacia DOPRI54 sin ajustar tolerancias', () => {
  const t = caseTransfer('A');
  const derivative = (seconds, state, out) => {
    const moon = queryMoon(dataset, 'Luna', t.departureJd + seconds / 86400);
    const lunar = [0, 1, 2].map(i => state[i] - moon.positionKm[i]);
    const earthNorm = magnitude([state[0], state[1], state[2]]);
    const lunarNorm = magnitude(lunar);
    for (let i = 0; i < 3; i++) {
      out[i] = state[i + 3];
      out[i + 3] = -EARTH_MU_KM3_S2 * state[i] / earthNorm ** 3
        - MOON_MU_KM3_S2 * lunar[i] / lunarNorm ** 3
        - MOON_MU_KM3_S2 * moon.positionKm[i] / moon.distanceKm ** 3;
    }
  };
  const initialState = [...t.initialPositionKm, ...t.initialVelocityKmS];
  const run = stepSeconds => integrateRk4({ derivative, initialState, targetSeconds: t.flightSeconds, stepSeconds });
  const coarse = run(60), middle = run(30), fine = run(15);
  const reference = [...t.arrivalPositionKm, ...t.arrivalVelocityKmS];
  const coarseToMiddleKm = distance(Array.from(coarse.finalState.slice(0, 3)), Array.from(middle.finalState.slice(0, 3)));
  const middleToFineKm = distance(Array.from(middle.finalState.slice(0, 3)), Array.from(fine.finalState.slice(0, 3)));
  const fineErrorKm = distance(Array.from(fine.finalState.slice(0, 3)), reference.slice(0, 3));
  assert.ok(coarseToMiddleKm / middleToFineKm > 10, `${coarseToMiddleKm} km versus ${middleToFineKm} km`);
  assert.ok(fineErrorKm < 0.1, `${fineErrorKm} km versus DOPRI54`);
  const tightened = integrateDopri54({ derivative, initialState, targetSeconds: t.flightSeconds,
    initialStepSeconds: 150, maxStepSeconds: 900,
    absTol: [1e-7, 1e-7, 1e-7, 1e-10, 1e-10, 1e-10], relTol: 1e-13 });
  const tightenedDifferenceKm = distance(Array.from(tightened.finalState.slice(0, 3)), reference.slice(0, 3));
  assert.ok(tightenedDifferenceKm < 0.1, `${tightenedDifferenceKm} km versus DOPRI54 de producción`);
  console.log(`B1_CONVERGENCE rk4_ratio=${(coarseToMiddleKm / middleToFineKm).toFixed(2)} rk4_15s_vs_dopri_km=${fineErrorKm.toFixed(6)} dopri_tight_vs_default_km=${tightenedDifferenceKm.toFixed(6)}`);
});

test('12B.1-H: salida o tramo posterior fuera de cobertura se rechazan', () => {
  assert.throws(() => calculateLunarTransfer({ dataset, departureJd: gregorianTimestampToJdTdb('2026-11-02'), altitudeKm: 200 }), /cubierta/);
  assert.throws(() => calculateLunarTransfer({ dataset, departureJd: gregorianTimestampToJdTdb('2026-10-31'), altitudeKm: 200 }), /cobertura/);
  assert.throws(() => calculateLunarTransfer({ dataset, departureJd: gregorianTimestampToJdTdb('2026-10-27'), altitudeKm: 200, target: 'flyby' }), /cobertura|efemérides/);
});
