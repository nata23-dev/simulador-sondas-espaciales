// Etapa 22 · Crucero realista: propagación de n cuerpos (DOPRI54 con los planetas de Horizons) en paralelo a la cónica, su
// diferencia y la corrección de trayectoria (TCM-1). Comprobaciones con métodos propios: aceleración calculada aparte, límite de dos
// cuerpos frente a Kepler, un RK4 de paso fijo escrito aquí, y la TCM re-propagada de forma independiente.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { historicalDesign } from '../src/lab/ProbeDesign.js';
import { INTEGRATED_SCENARIOS, integratedMissionInput, scenarioFormValues, refinementHalfSpanDays } from '../src/ui/IntegratedMissionPlanner.js';
import { computeIntegratedMission, ENCOUNTER_TARGETS } from '../src/lab/IntegratedMission.js';
import { compareMissionCruise, compareNBodyCruise, propagateNBody, heliocentricAcceleration, NBODY_PERTURBERS, NBODY_EPHEMERIS_IDS, NBODY_STATUS, MU_SUN_NBODY } from '../src/lab/NBodyCruise.js';
import { propagateKepler } from '../src/science/KeplerPropagator.js';
import { SOLAR_SYSTEM_GM_CATALOG } from '../src/science/GravitationalParameters.js';
import { refineTransferCandidate } from '../src/lab/InterplanetaryPlan.js';
import { createInterplanetaryEphemeris } from '../src/science/InterplanetaryEphemeris.js';
import { datetimeLocalUtcToJdTdb } from '../src/science/AstrodynamicsTime.js';
import { GLOSSARY, termFor } from '../src/ui/LabGlossary.js';

const json = file => JSON.parse(readFileSync(file, 'utf8'));
const catalog = { catalogVersion: 1, datasets: [...json('public/data/interplanetary-ephemerides-catalog-v1.json').datasets, ...json('public/data/encounter-ephemerides-catalog-v1.json').datasets] };
const ephemeris = createInterplanetaryEphemeris({ catalog, loadJson: async file => json(`public/${file}`) });
const norm = a => Math.hypot(a[0], a[1], a[2]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

// Réplica de IntegratedMissionPlanner.compute() y de compareNBody() (misma ventana de efemérides).
async function run(id, probeId, launch = false, patch = null) {
  const v = scenarioFormValues(INTEGRATED_SCENARIOS.find(s => s.id === id)), target = ENCOUNTER_TARGETS[v.destinationId];
  let departureJdTdb = datetimeLocalUtcToJdTdb(v.departureUtc), tofDays = v.tofDays;
  const covE = ephemeris.coverage('399'), covT = ephemeris.coverage(target.ephemerisId), margin = Math.max(30, 0.02 * tofDays) + 140;
  const helio = await ephemeris.loadWindow(['399', target.ephemerisId], Math.max(covE.startJdTdb, covT.startJdTdb, departureJdTdb - margin), Math.min(covE.endJdTdb, covT.endJdTdb, departureJdTdb + tofDays + margin + 200));
  if (v.refine) {
    const r = refineTransferCandidate(helio, { destinationId: target.ephemerisId, departureJdTdb, tofDays, criterion: 'c3', halfSpanDepartureDays: refinementHalfSpanDays(tofDays), halfSpanTofDays: refinementHalfSpanDays(tofDays) });
    if (Number.isFinite(r.score)) { departureJdTdb = r.departureJdTdb; tofDays = r.tofDays; }
  }
  const design = { ...historicalDesign(probeId), id: `flota-${probeId}` };
  const input = integratedMissionInput({ ...v, destinationId: target.id, departureJdTdb, tofDays, launch }, design);
  if (patch) input.profile.launch.patch = patch; // 28: 'velocity' = empalme de la etapa 21
  const mission = computeIntegratedMission(input, { helio, moons: null });
  const cruise = mission.segments.find(s => s.id === 'cruise');
  const start = mission.departureJdTdb + cruise.startSeconds / 86400, end = mission.departureJdTdb + cruise.endSeconds / 86400;
  const win = await ephemeris.loadWindow(NBODY_EPHEMERIS_IDS, start - 1, end + 1);
  const stateAt = (eid, jd) => { const s = win.stateAt(eid, jd); return s?.status === 'available' ? s : null; };
  return { mission, cruise, start, end, stateAt };
}
const a1 = run('A1', 'cassini');
const a1Pad = run('A1', 'cassini', true);
const a1Pad21 = run('A1', 'cassini', true, 'velocity');

const sun0 = r => r.map(x => -MU_SUN_NBODY * x / norm(r) ** 3);
test('22 · aceleración heliocéntrica: término directo e indirecto calculados aparte', () => {
  const r = [1.2e8, -8.0e7, 3.0e6];
  const bodies = [{ positionKm: [7.4e8, 1.0e8, -1.5e7], muKm3S2: 1.267e8 }, { positionKm: [-1.0e8, 1.1e8, 0], muKm3S2: 3.986e5 }];
  let ax = -MU_SUN_NBODY * r[0] / norm(r) ** 3, ay = -MU_SUN_NBODY * r[1] / norm(r) ** 3, az = -MU_SUN_NBODY * r[2] / norm(r) ** 3;
  for (const b of bodies) {
    const d = sub(b.positionKm, r), dn = norm(d), pn = norm(b.positionKm);
    ax += b.muKm3S2 * (d[0] / dn ** 3 - b.positionKm[0] / pn ** 3); ay += b.muKm3S2 * (d[1] / dn ** 3 - b.positionKm[1] / pn ** 3); az += b.muKm3S2 * (d[2] / dn ** 3 - b.positionKm[2] / pn ** 3);
  }
  const a = heliocentricAcceleration(r, bodies);
  assert.ok(norm(sub(a, [ax, ay, az])) < 1e-14 * norm(a), `${norm(sub(a, [ax, ay, az]))}`);
  // El término indirecto importa: sin él la aceleración cambia en más de 10⁻¹⁰ km/s².
  const direct = bodies.reduce((acc, b) => { const d = sub(b.positionKm, r), dn = norm(d); return acc.map((x, i) => x + b.muKm3S2 * d[i] / dn ** 3); }, sun0(r));
  assert.ok(norm(sub(a, direct)) > 1e-10);
  // Sin perturbadores, solo el Sol.
  const sun = [-MU_SUN_NBODY * r[0] / norm(r) ** 3, -MU_SUN_NBODY * r[1] / norm(r) ** 3, -MU_SUN_NBODY * r[2] / norm(r) ** 3];
  assert.ok(norm(sub(heliocentricAcceleration(r, []), sun)) < 1e-14 * norm(sun), 'redondeo relativo');
});

test('22 · perturbadores: GM del catálogo del proyecto (sistemas en los gigantes, Luna sumada a la Tierra)', () => {
  const gm = id => SOLAR_SYSTEM_GM_CATALOG.getMu(id);
  assert.deepEqual(NBODY_PERTURBERS.map(p => p.ephemerisId), ['199', '299', '399', '499', '5', '6', '7', '8']);
  assert.equal(NBODY_PERTURBERS.find(p => p.id === '399').muKm3S2, gm('399') + gm('301'));
  assert.equal(NBODY_PERTURBERS.find(p => p.id === '599').muKm3S2, gm('599'));
  assert.equal(MU_SUN_NBODY, gm('10'));
});

test('22 · sin perturbadores, la propagación coincide con Kepler (312 días)', async () => {
  const { cruise, start, end, stateAt } = await a1;
  const n = propagateNBody({ stateAt, positionKm: cruise.initial.positionKm, velocityKmS: cruise.initial.velocityKmS, startJdTdb: start, endJdTdb: end, perturbers: [] });
  const k = propagateKepler(cruise.initial.positionKm, cruise.initial.velocityKmS, (end - start) * 86400, MU_SUN_NBODY);
  assert.ok(norm(sub(n.positionKm, k.positionKm)) < 0.01, `${norm(sub(n.positionKm, k.positionKm))} km`);
  assert.ok(norm(sub(n.velocityKmS, k.velocityKmS)) < 1e-9);
});

test('22 · el modelo completo coincide con un RK4 propio de paso fijo (A1, siete planetas)', async () => {
  const { cruise, start, end, stateAt } = await a1;
  const bodies = NBODY_PERTURBERS.filter(p => p.id !== '399');
  const n = propagateNBody({ stateAt, positionKm: cruise.initial.positionKm, velocityKmS: cruise.initial.velocityKmS, startJdTdb: start, endJdTdb: end, perturbers: bodies });
  const f = (jd, y) => {
    const ps = bodies.map(b => ({ positionKm: stateAt(b.ephemerisId, jd).positionKm, muKm3S2: b.muKm3S2 }));
    const r = y.slice(0, 3); let a = r.map(x => -MU_SUN_NBODY * x / norm(r) ** 3);
    for (const p of ps) { const d = sub(p.positionKm, r), dn = norm(d), pn = norm(p.positionKm); a = a.map((x, i) => x + p.muKm3S2 * (d[i] / dn ** 3 - p.positionKm[i] / pn ** 3)); }
    return [y[3], y[4], y[5], ...a];
  };
  const steps = 2400, h = (end - start) * 86400 / steps; let y = [...cruise.initial.positionKm, ...cruise.initial.velocityKmS], jd = start;
  const add = (u, w, k) => u.map((x, i) => x + w[i] * k);
  for (let i = 0; i < steps; i++) {
    const k1 = f(jd, y), k2 = f(jd + h / 172800, add(y, k1, h / 2)), k3 = f(jd + h / 172800, add(y, k2, h / 2)), k4 = f(jd + h / 86400, add(y, k3, h));
    y = y.map((x, j) => x + h / 6 * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j])); jd += h / 86400;
  }
  assert.ok(norm(sub(n.positionKm, y.slice(0, 3))) < 1, `${norm(sub(n.positionKm, y.slice(0, 3)))} km`);
  assert.ok(norm(sub(n.velocityKmS, y.slice(3))) < 1e-7);
});

test('22 · A1 sin plataforma: diferencia con la cónica, efecto de Marte fuera de su SOI y TCM-1 verificada aparte', async () => {
  const { mission, cruise, start, end, stateAt } = await a1;
  const before = JSON.stringify(mission.segments.map(s => [s.id, s.startSeconds, s.endSeconds]));
  const r = compareMissionCruise(mission, stateAt);
  assert.equal(r.status, NBODY_STATUS.computed, r.reason ?? '');
  assert.deepEqual(r.excluded.map(e => e.id), ['399'], 'la Tierra se excluye: el crucero empieza en su centro');
  assert.ok(!r.perturbers.some(p => p.id === '399') && r.perturbers.length === 7);
  // Órdenes de magnitud medidos (decenas de miles de km tras ~313 días).
  assert.ok(r.uncorrected.arrivalPositionErrorKm > 1e4 && r.uncorrected.arrivalPositionErrorKm < 1e5, `${r.uncorrected.arrivalPositionErrorKm}`);
  assert.equal(r.isolated.length, 1); assert.equal(r.isolated[0].id, '499');
  assert.ok(r.thirdBodies.arrivalPositionErrorKm < r.uncorrected.arrivalPositionErrorKm);
  // TCM-1: pequeña; re-propagada aquí desde el estado «otros planetas» en el día 10, llega al punto de la cónica.
  const T = r.tcm, third = NBODY_PERTURBERS.filter(p => !['399', '499'].includes(p.id));
  assert.ok(T.deltaVMS > 0.1 && T.deltaVMS < 5 && T.residualKm < 0.1, JSON.stringify(T));
  assert.ok(Math.abs(T.daysAfterStart - 10) < 1e-9);
  const atTcm = propagateNBody({ stateAt, positionKm: cruise.initial.positionKm, velocityKmS: cruise.initial.velocityKmS, startJdTdb: start, endJdTdb: T.jdTdb, perturbers: third });
  const hit = propagateNBody({ stateAt, positionKm: atTcm.positionKm, velocityKmS: atTcm.velocityKmS.map((v, i) => v + T.deltaVKmS[i]), startJdTdb: T.jdTdb, endJdTdb: end, perturbers: third });
  const conic = propagateKepler(cruise.initial.positionKm, cruise.initial.velocityKmS, (end - start) * 86400, MU_SUN_NBODY);
  assert.ok(norm(sub(hit.positionKm, conic.positionKm)) < 0.1, `${norm(sub(hit.positionKm, conic.positionKm))} km`);
  // Propelente: ecuación del cohete con el Isp de la sonda y la masa del crucero.
  const isp = mission.vehicle.probe.engine.ispS, m = cruise.initial.massKg;
  assert.ok(Math.abs(T.propellantKg - m * (1 - Math.exp(-T.deltaVMS / (isp * 9.80665)))) < 1e-9);
  // La misión no cambia.
  assert.equal(JSON.stringify(mission.segments.map(s => [s.id, s.startSeconds, s.endSeconds])), before);
  assert.ok(r.samples.length > 10 && r.samples.length <= 121);
});

test('22 · A1 desde la plataforma con el empalme de la etapa 21: la gravedad terrestre fuera de la SOI explica casi toda la diferencia', async () => {
  // 28: el empalme de la etapa 21 (velocidad continua en la frontera) sigue disponible para compararlo; ya no es el de por defecto.
  const { mission, stateAt } = await a1Pad21;
  assert.equal(mission.launch.patch, 'velocity');
  const r = compareMissionCruise(mission, stateAt);
  assert.equal(r.status, NBODY_STATUS.computed, r.reason ?? '');
  assert.equal(r.excluded.length, 0);
  const earth = r.isolated.find(i => i.id === '399');
  assert.ok(earth && r.uncorrected.arrivalPositionErrorKm > 1e6, `${r.uncorrected.arrivalPositionErrorKm}`);
  assert.ok(earth.withoutArrivalPositionErrorKm < 1e5, 'sin la Tierra, la diferencia vuelve a decenas de miles de km');
  assert.deepEqual(r.thirdBodies.without.sort(), ['399', '499']);
  assert.ok(r.tcm.deltaVMS < 5 && r.tcm.residualKm < 0.1);
});

test('28 · A1 desde la plataforma (empalme por la asíntota con la Tierra fuera de la SOI): el crucero de n cuerpos llega como sin la plataforma', async () => {
  const [{ mission, stateAt }, sin] = await Promise.all([a1Pad, a1]);
  assert.equal(mission.launch.patch, 'asymptote');
  assert.equal(mission.launch.earthBeyondSoi.applied, true);
  const r = compareMissionCruise(mission, stateAt), r0 = compareMissionCruise(sin.mission, sin.stateAt);
  assert.equal(r.status, NBODY_STATUS.computed, r.reason ?? '');
  // La nave parte de su velocidad REAL en la frontera (la de la hipérbola), no de la del crucero.
  assert.ok(Math.abs(r.boundaryState.velocityDifferenceKmS - mission.launch.soiVelocityJumpKmS) < 1e-12 && r.boundaryState.positionDifferenceKm === 0);
  // De 13,2 millones de km (etapa 21) a decenas de miles, como el crucero que empieza en el centro de la Tierra.
  assert.ok(r.uncorrected.arrivalPositionErrorKm < 1e5, `${r.uncorrected.arrivalPositionErrorKm} km`);
  assert.ok(Math.abs(r.uncorrected.arrivalPositionErrorKm - r0.uncorrected.arrivalPositionErrorKm) < 0.15 * r0.uncorrected.arrivalPositionErrorKm,
    `${r.uncorrected.arrivalPositionErrorKm} frente a ${r0.uncorrected.arrivalPositionErrorKm} km`);
  // La Tierra ya no se aísla (está en el diseño de la salida); la TCM-1 corrige con ella.
  assert.deepEqual(r.isolated.map(i => i.id), ['499']);
  assert.ok(r.thirdBodies.perturbers.includes('Tierra + Luna'));
  assert.ok(r.tcm.deltaVMS < 5 && r.tcm.residualKm < 0.1, JSON.stringify(r.tcm));
});

test('22 · sin efemérides en parte del crucero: no se extrapola', async () => {
  const { cruise, start, end, stateAt } = await a1;
  const cut = start + 100;
  const r = compareNBodyCruise({ stateAt: (id, jd) => (jd > cut ? null : stateAt(id, jd)), initial: cruise.initial, startJdTdb: start, arrivalJdTdb: end, exclude: [{ id: '399', reason: 'x' }], massKg: 1000, ispS: 300 });
  assert.equal(r.status, NBODY_STATUS.noData);
  assert.equal(r.ok, false);
  assert.match(r.reason, /no se extrapola/);
  const none = compareMissionCruise({ segments: [] }, stateAt);
  assert.equal(none.ok, false);
});

test('22 · el glosario explica los rótulos nuevos', () => {
  assert.equal(new Set(GLOSSARY.map(e => e.id)).size, GLOSSARY.length);
  assert.equal(termFor('Crucero de n cuerpos (comparación)')?.id, 'nbody');
  assert.equal(termFor('Solo los otros planetas')?.id, 'nbody');
  assert.equal(termFor('Corrección de trayectoria (TCM-1)')?.id, 'tcm');
});
