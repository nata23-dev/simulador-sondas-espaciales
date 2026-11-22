// Etapa 20 · Captura apuntada: la llegada se apunta a otro periapsis para que el encendido de captura finito, que baja la
// trayectoria mientras actúa, termine en la órbita pedida. Comprobaciones con fórmulas propias de dos cuerpos sobre los vectores
// de estado de los tramos (no con los elementos que calcula el propio módulo), casos que no se compensan y su motivo, y la
// función de búsqueda con modelos sintéticos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { historicalDesign } from '../src/lab/ProbeDesign.js';
import { INTEGRATED_SCENARIOS, integratedMissionInput, scenarioFormValues, refinementHalfSpanDays } from '../src/ui/IntegratedMissionPlanner.js';
import { computeIntegratedMission, ENCOUNTER_TARGETS, compensateCapturePeriapsis, COMPENSATION_STATUS, INTEGRATED_MISSION_VERSION, PHASE_STATUS } from '../src/lab/IntegratedMission.js';
import { createIntegratedExecution } from '../src/lab/IntegratedMissionPlayback.js';
import { AIM_STATUS } from '../src/lab/EncounterDesign.js';
import { INSERTION_STATUS } from '../src/lab/OrbitalInsertion.js';
import { refineTransferCandidate } from '../src/lab/InterplanetaryPlan.js';
import { createInterplanetaryEphemeris } from '../src/science/InterplanetaryEphemeris.js';
import { datetimeLocalUtcToJdTdb } from '../src/science/AstrodynamicsTime.js';

const json = file => JSON.parse(readFileSync(file, 'utf8'));
const catalog = { catalogVersion: 1, datasets: [...json('public/data/interplanetary-ephemerides-catalog-v1.json').datasets, ...json('public/data/encounter-ephemerides-catalog-v1.json').datasets] };
const ephemeris = createInterplanetaryEphemeris({ catalog, loadJson: async file => json(`public/${file}`) });

// Réplica de IntegratedMissionPlanner.compute() (mismo refinamiento y misma ventana de efemérides).
async function run(id, probeId = 'cassini', overrides = {}) {
  const v = scenarioFormValues(INTEGRATED_SCENARIOS.find(s => s.id === id)), target = ENCOUNTER_TARGETS[v.destinationId];
  let departureJdTdb = datetimeLocalUtcToJdTdb(v.departureUtc), tofDays = v.tofDays;
  const covE = ephemeris.coverage('399'), covT = ephemeris.coverage(target.ephemerisId), margin = Math.max(30, 0.02 * tofDays) + 140;
  const helio = await ephemeris.loadWindow(['399', target.ephemerisId], Math.max(covE.startJdTdb, covT.startJdTdb, departureJdTdb - margin), Math.min(covE.endJdTdb, covT.endJdTdb, departureJdTdb + tofDays + margin + 200));
  if (v.refine) {
    const r = refineTransferCandidate(helio, { destinationId: target.ephemerisId, departureJdTdb, tofDays, criterion: 'c3', halfSpanDepartureDays: refinementHalfSpanDays(tofDays), halfSpanTofDays: refinementHalfSpanDays(tofDays) });
    if (Number.isFinite(r.score)) { departureJdTdb = r.departureJdTdb; tofDays = r.tofDays; }
  }
  const design = { ...historicalDesign(probeId), id: `flota-${probeId}` };
  const input = integratedMissionInput({ ...v, destinationId: target.id, departureJdTdb, tofDays, ...overrides }, design);
  return { mission: computeIntegratedMission(input, { helio, moons: null }), target, helio, design };
}

// Dos cuerpos, calculado aquí: periapsis r_p = h² / (μ (1 + e)) a partir de r y v.
function periapsisRadiusKm(positionKm, velocityKmS, mu) {
  const [x, y, z] = positionKm, [vx, vy, vz] = velocityKmS;
  const h = Math.hypot(y * vz - z * vy, z * vx - x * vz, x * vy - y * vx), r = Math.hypot(x, y, z), v2 = vx * vx + vy * vy + vz * vz;
  const energy = v2 / 2 - mu / r, e = Math.sqrt(Math.max(0, 1 + 2 * energy * h * h / (mu * mu)));
  return h * h / (mu * (1 + e));
}
const capturePhase = m => m.phases.find(p => p.id === 'capture');

const a1 = run('A1');
const a1Sin = run('A1', 'cassini', { compensate: false });

test('20 · A1 (Cassini → Marte): la órbita final tiene el periapsis pedido (3000 km) y la llegada se apunta más alta', async () => {
  const { mission, target } = await a1;
  assert.equal(mission.model, INTEGRATED_MISSION_VERSION);
  assert.match(mission.verdict, /^CADENA CALCULADA COMPLETA/);
  const pc = mission.approach.periapsisCompensation, o = capturePhase(mission).insertion.finalOrbit;
  assert.equal(pc.status, COMPENSATION_STATUS.applied);
  assert.ok(pc.iterations >= 1 && pc.iterations <= 6, `${pc.iterations} iteraciones`);
  assert.ok(Math.abs(pc.aimedPeriapsisAltitudeKm - 5833.66) < 0.5, `apuntado ${pc.aimedPeriapsisAltitudeKm}`);
  assert.ok(Math.abs(pc.uncompensatedPeriapsisAltitudeKm - 315.55) < 0.1, `sin compensar ${pc.uncompensatedPeriapsisAltitudeKm}`);
  assert.ok(Math.abs(o.periapsisAltitudeKm - 3000) < 0.01 && Math.abs(o.apoapsisAltitudeKm - 100000) < 1, JSON.stringify(o));
  // Fórmulas propias sobre los vectores de estado: estado final tras la espera en órbita y estado en la entrada en la SOI.
  const mu = target.mu, R = target.radiusKm;
  const final = mission.segments.find(s => s.id === 'planet-final-coast').final;
  assert.ok(Math.abs(periapsisRadiusKm(final.positionKm, final.velocityKmS, mu) - R - 3000) < 0.05, 'periapsis final (dos cuerpos, cálculo propio)');
  const soi = mission.segments.find(s => s.phase === 'planet-approach').initial;
  assert.ok(Math.abs(periapsisRadiusKm(soi.positionKm, soi.velocityKmS, mu) - R - pc.aimedPeriapsisAltitudeKm) < 0.1, 'la hipérbola de llegada pasa por el periapsis apuntado');
  assert.ok(Math.abs(mission.approach.periapsisTargetKm - R - pc.aimedPeriapsisAltitudeKm) < 1e-9);
  assert.equal(mission.approach.orbitPeriapsisTargetKm, R + 3000);
  assert.match(capturePhase(mission).detail, /Captura apuntada: la llegada se apuntó a 5 834 km de altitud .* termine en los 3 000 km pedidos \(sin compensar habría quedado en 316 km; \d iteraciones de secante\)\./);
  assert.doesNotMatch(capturePhase(mission).detail, /lo desplaza/);
});

test('20 · la reproducción y la continuidad de los tramos siguen intactas con la llegada compensada', async () => {
  const { mission, helio, design } = await a1;
  assert.ok(mission.continuity.maxPositionErrorKm < 1e-3 && mission.continuity.maxVelocityErrorKmS < 1e-6, JSON.stringify({ p: mission.continuity.maxPositionErrorKm, v: mission.continuity.maxVelocityErrorKmS }));
  const execution = createIntegratedExecution({ result: mission, data: { helio, moons: null }, design });
  assert.ok(execution.durationSeconds > 0);
});

test('20 · sin compensar (opción del perfil) el resultado es el de 17.1', async () => {
  const { mission } = await a1Sin, pc = mission.approach.periapsisCompensation;
  assert.equal(pc.status, COMPENSATION_STATUS.disabled);
  assert.equal(pc.applied, false);
  assert.ok(Math.abs(capturePhase(mission).insertion.finalOrbit.periapsisAltitudeKm - 315.55) < 0.1);
  assert.equal(mission.approach.periapsisTargetKm, mission.approach.orbitPeriapsisTargetKm);
  assert.match(capturePhase(mission).detail, /\(periapsis apuntado 3 000 km; el encendido de 4\.5 h lo desplaza\)\. Captura apuntada no aplicada\. Compensación desactivada/);
});

test('20 · C1 (Cassini → Júpiter): 4200 km pedidos y alcanzados (antes 3735 km)', async () => {
  const { mission } = await run('C1');
  const pc = mission.approach.periapsisCompensation, o = capturePhase(mission).insertion.finalOrbit;
  assert.equal(pc.status, COMPENSATION_STATUS.applied);
  assert.ok(Math.abs(o.periapsisAltitudeKm - 4200) < 0.01, `${o.periapsisAltitudeKm}`);
  assert.ok(Math.abs(pc.uncompensatedPeriapsisAltitudeKm - 3734.5) < 0.5 && Math.abs(pc.aimedPeriapsisAltitudeKm - 4665.85) < 0.5, JSON.stringify(pc));
});

test('20 · casos que no se compensan conservan el resultado anterior y dicen por qué', async () => {
  // A2 (Cassini, circular baja): subir la llegada empeora el periapsis final.
  const [a2, a2Sin] = await Promise.all([run('A2'), run('A2', 'cassini', { compensate: false })]);
  const pc = a2.mission.approach.periapsisCompensation;
  assert.equal(pc.status, COMPENSATION_STATUS.failed);
  assert.match(pc.reason, /no monótona/);
  assert.equal(capturePhase(a2.mission).insertion.finalOrbit.periapsisAltitudeKm, capturePhase(a2Sin.mission).insertion.finalOrbit.periapsisAltitudeKm);
  assert.equal(a2.mission.verdict, a2Sin.mission.verdict);
  assert.match(capturePhase(a2.mission).detail, /Captura apuntada no aplicada\. Subir el periapsis apuntado no sube/);
  // Voyager en A1: sin Δv para capturar, con o sin compensación.
  const v = await run('A1', 'voyager');
  assert.match(v.mission.approach.periapsisCompensation.reason, /falta Δv o empuje/);
  assert.equal(v.mission.approach.periapsisCompensation.iterations, 0);
});

test('20 · un apuntado fallido (periapsis 0 km) devuelve «no viable» con el motivo, sin excepción', async () => {
  const { mission } = await run('A1', 'cassini', { rp: 0 });
  assert.match(mission.verdict, /^NO VIABLE/);
  const cruise = mission.phases.find(p => p.id === 'cruise');
  assert.equal(cruise.status, PHASE_STATUS.failed);
  assert.match(cruise.detail, /bajo la superficie/);
  assert.equal(mission.approach, null);
});

// ---- Búsqueda con modelos sintéticos -------------------------------------------------------------------------------------
const R = 3000, SOI = 500000;
// Modelo del encendido: periapsis final = g(apuntado). `status(x)` permite simular impactos o capturas parciales.
function synthetic(g, { status = () => INSERTION_STATUS.target, aimFails = () => false } = {}) {
  const calls = { aim: 0, trial: 0 };
  const aimAt = x => { calls.aim++; return aimFails(x) ? { status: AIM_STATUS.lambert, reason: 'sin convergencia' } : { status: AIM_STATUS.aimed, x }; };
  const trial = a => { calls.trial++; return { status: status(a.x), final: { orbit: { periapsisRadiusKm: g(a.x) } } }; };
  return { aimAt, trial, firstAim: { status: AIM_STATUS.aimed, x: R + 3000 }, calls };
}
const target = R + 3000;

test('20 · búsqueda: modelo lineal (pendiente 0,95) converge al objetivo y no acepta menos precisión que la tolerancia', () => {
  const s = synthetic(x => 0.95 * x - 2400);
  const c = compensateCapturePeriapsis({ ...s, targetRadiusKm: target, bodyRadiusKm: R, soiRadiusKm: SOI });
  assert.equal(c.status, COMPENSATION_STATUS.applied);
  assert.ok(Math.abs(0.95 * c.aimedRadiusKm - 2400 - target) <= 0.01);
  assert.ok(c.iterations <= 3, `${c.iterations}`);
  assert.equal(c.aim.x, c.aimedRadiusKm, 'devuelve el apuntado de la última prueba');
  assert.equal(c.history.length, c.iterations + 1);
});

test('20 · búsqueda: no compensa si es innecesario, si está desactivada, si no es monótona, si el apuntado falla o si se sale del intervalo', () => {
  const base = { targetRadiusKm: target, bodyRadiusKm: R, soiRadiusKm: SOI };
  const ok = synthetic(x => x);
  assert.equal(compensateCapturePeriapsis({ ...ok, ...base }).status, COMPENSATION_STATUS.unnecessary);
  const off = compensateCapturePeriapsis({ ...synthetic(x => x - 500), ...base, enabled: false });
  assert.equal(off.status, COMPENSATION_STATUS.disabled); assert.equal(off.applied, false); assert.equal(off.aimedRadiusKm, target);
  const down = compensateCapturePeriapsis({ ...synthetic(x => 2 * target - x - 500), ...base });
  assert.equal(down.status, COMPENSATION_STATUS.failed); assert.match(down.reason, /no monótona/);
  const s = synthetic(x => x - 500, { aimFails: x => x > target });
  const failedAim = compensateCapturePeriapsis({ ...s, ...base });
  assert.equal(failedAim.status, COMPENSATION_STATUS.failed); assert.match(failedAim.reason, /no converge/); assert.equal(failedAim.aim, s.firstAim);
  const outside = compensateCapturePeriapsis({ ...synthetic(x => x - 600000), ...base });
  assert.equal(outside.status, COMPENSATION_STATUS.failed); assert.match(outside.reason, /fuera de la esfera de influencia/);
  const partial = compensateCapturePeriapsis({ ...synthetic(x => x - 500, { status: () => INSERTION_STATUS.partial }), ...base });
  assert.equal(partial.status, COMPENSATION_STATUS.failed); assert.match(partial.reason, /falta Δv o empuje/);
});

test('20 · búsqueda: un impacto sin compensar se puede evitar apuntando más alto', () => {
  // Por debajo de R + 2000 km de llegada la trayectoria choca; por encima captura.
  const s = synthetic(x => x - 3500, { status: x => (x - 3500 <= R ? INSERTION_STATUS.impact : INSERTION_STATUS.target) });
  const c = compensateCapturePeriapsis({ ...s, targetRadiusKm: R + 400, bodyRadiusKm: R, soiRadiusKm: SOI, firstAim: { status: AIM_STATUS.aimed, x: R + 400 } });
  assert.equal(c.status, COMPENSATION_STATUS.applied);
  assert.ok(Math.abs(c.aimedRadiusKm - (R + 3900)) < 0.01);
  assert.equal(c.history[0].status, INSERTION_STATUS.impact);
});
