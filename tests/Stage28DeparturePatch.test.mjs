// Etapa 28 · Salida desde la plataforma con el empalme convencional por la asíntota y la gravedad terrestre fuera de la SOI.
// Comprobaciones con métodos propios: la asíntota frente a una propagación de Kepler muy lejos, la relación analítica entre los dos
// empalmes en un caso sintético, la energía de la hipérbola en la frontera y un RK4 de paso fijo escrito aquí (Sol + Tierra) para
// la llegada de la nave real. Implementado y comprobado por Claude; falta la revisión de alguien que no lo implementó.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { historicalDesign } from '../src/lab/ProbeDesign.js';
import { INTEGRATED_SCENARIOS, integratedMissionInput, scenarioFormValues, refinementHalfSpanDays } from '../src/ui/IntegratedMissionPlanner.js';
import { computeIntegratedMission, ENCOUNTER_TARGETS } from '../src/lab/IntegratedMission.js';
import { designEarthDeparture, hyperbolicExcessVelocity, DEPARTURE_STATUS, DEPARTURE_PATCH_MODELS, EARTH_BEYOND_SOI } from '../src/lab/EarthDeparture.js';
import { NBODY_EPHEMERIS_IDS, NBODY_PERTURBERS, MU_SUN_NBODY } from '../src/lab/NBodyCruise.js';
import { EARTH_GM_KM3_S2 } from '../src/lab/LaunchEarth.js';
import { propagateKepler } from '../src/science/KeplerPropagator.js';
import { refineTransferCandidate } from '../src/lab/InterplanetaryPlan.js';
import { createInterplanetaryEphemeris } from '../src/science/InterplanetaryEphemeris.js';
import { datetimeLocalUtcToJdTdb } from '../src/science/AstrodynamicsTime.js';
import { GLOSSARY } from '../src/ui/LabGlossary.js';

const json = file => JSON.parse(readFileSync(file, 'utf8'));
const catalog = { catalogVersion: 1, datasets: [...json('public/data/interplanetary-ephemerides-catalog-v1.json').datasets, ...json('public/data/encounter-ephemerides-catalog-v1.json').datasets] };
const ephemeris = createInterplanetaryEphemeris({ catalog, loadJson: async file => json(`public/${file}`) });
const MU = EARTH_GM_KM3_S2;
const norm = a => Math.hypot(a[0], a[1], a[2]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

async function run(id, probeId, { launch = false, patch = null, wrap = null } = {}) {
  const v = scenarioFormValues(INTEGRATED_SCENARIOS.find(s => s.id === id)), target = ENCOUNTER_TARGETS[v.destinationId];
  let departureJdTdb = datetimeLocalUtcToJdTdb(v.departureUtc), tofDays = v.tofDays;
  const covE = ephemeris.coverage('399'), covT = ephemeris.coverage(target.ephemerisId), margin = Math.max(30, 0.02 * tofDays) + 140;
  const helio = await ephemeris.loadWindow(['399', target.ephemerisId], Math.max(covE.startJdTdb, covT.startJdTdb, departureJdTdb - margin), Math.min(covE.endJdTdb, covT.endJdTdb, departureJdTdb + tofDays + margin + 200));
  if (v.refine) {
    const r = refineTransferCandidate(helio, { destinationId: target.ephemerisId, departureJdTdb, tofDays, criterion: 'c3', halfSpanDepartureDays: refinementHalfSpanDays(tofDays), halfSpanTofDays: refinementHalfSpanDays(tofDays) });
    if (Number.isFinite(r.score)) { departureJdTdb = r.departureJdTdb; tofDays = r.tofDays; }
  }
  const input = integratedMissionInput({ ...v, destinationId: target.id, departureJdTdb, tofDays, launch }, { ...historicalDesign(probeId), id: `flota-${probeId}` });
  if (patch) input.profile.launch.patch = patch;
  const mission = computeIntegratedMission(input, { helio: wrap ? wrap(helio, departureJdTdb) : helio, moons: null });
  return { mission, helio };
}
const a1Pad = run('A1', 'cassini', { launch: true });
const a1Pad21 = run('A1', 'cassini', { launch: true, patch: 'velocity' });
const a1Centro = run('A1', 'cassini');

test('28 · v∞ de la asíntota: módulo √C3 y dirección límite de la hipérbola (Kepler a 10⁹ km)', () => {
  const r = [6700, 300, -200], v = [0.4, 11.4, 1.1];
  const vInf = hyperbolicExcessVelocity(r, v, MU), c3 = dot(v, v) - 2 * MU / norm(r);
  assert.ok(Math.abs(dot(vInf, vInf) - c3) < 1e-12 * c3, 'módulo');
  // Muy lejos, la velocidad tiende a v∞: la diferencia cae como μ/(r·v∞) (aquí, ~10⁻⁴ km/s a 10⁹ km).
  let lo = 0, hi = 1e10;
  for (let k = 0; k < 200; k++) { const m = (lo + hi) / 2; if (norm(propagateKepler(r, v, m, MU).positionKm) < 1e9) lo = m; else hi = m; }
  const far = propagateKepler(r, v, hi, MU);
  const expected = MU / (1e9 * Math.sqrt(c3));
  assert.ok(norm(sub(far.velocityKmS, vInf)) < 3 * expected, `${norm(sub(far.velocityKmS, vInf))} frente a ~${expected}`);
  // Y la diferencia baja al alejarse (a 10⁸ km es ~10 veces mayor).
  lo = 0; hi = 1e10;
  for (let k = 0; k < 200; k++) { const m = (lo + hi) / 2; if (norm(propagateKepler(r, v, m, MU).positionKm) < 1e8) lo = m; else hi = m; }
  assert.ok(norm(sub(propagateKepler(r, v, hi, MU).velocityKmS, vInf)) > 5 * norm(sub(far.velocityKmS, vInf)));
  // Órbitas ligadas: no hay asíntota.
  assert.equal(hyperbolicExcessVelocity([6700, 0, 0], [0, 7.7, 0], MU), null);
});

test('28 · caso sintético: con la asíntota el C3 es |v_pedida − V⊕|²; con el empalme de la etapa 21, 2μ/R_SOI menos', () => {
  const earthStateAt = jd => ({ positionKm: [1.496e8, 29.78 * (jd - 2461000.5) * 86400, 0], velocityKmS: [0, 29.78, 0] });
  const want = [2.1, 29.78 + 1.6, 0.9], R = 924000, base = { payloadMassKg: 1200, liftoffGuessJdTdb: 2461000.5, earthStateAt, soiRadiusKm: R, azimuthDeg: 'auto', requiredVelocityAt: () => want };
  const asym = designEarthDeparture(base), vel = designEarthDeparture({ ...base, patch: 'velocity' });
  assert.equal(asym.status, DEPARTURE_STATUS.designed, asym.reason ?? '');
  assert.equal(vel.status, DEPARTURE_STATUS.designed, vel.reason ?? '');
  assert.equal(asym.patch, 'asymptote'); assert.equal(vel.patch, 'velocity');
  const vInfWanted = sub(want, [0, 29.78, 0]);
  assert.ok(norm(sub(asym.exit.vInfVectorKmS, vInfWanted)) < 1e-7, 'la asíntota es la v∞ pedida');
  assert.ok(Math.abs(asym.injection.c3Km2S2 - dot(vInfWanted, vInfWanted)) < 1e-6);
  assert.ok(Math.abs(asym.injection.c3Km2S2 - vel.injection.c3Km2S2 - 2 * MU / R) < 1e-6, `${asym.injection.c3Km2S2 - vel.injection.c3Km2S2} frente a ${2 * MU / R}`);
  // En la frontera la nave va más rápida que la v∞ (energía de la hipérbola) y el salto es el declarado.
  const g = asym.exit.geocentric, speed = norm(g.velocityKmS);
  assert.ok(Math.abs(speed ** 2 - (asym.injection.c3Km2S2 + 2 * MU / norm(g.positionKm))) < 1e-8);
  assert.ok(norm(sub(asym.exit.soiVelocityJumpKmS, sub(asym.exit.helioVelocityActualKmS, want))) < 1e-12);
  assert.ok(norm(vel.exit.soiVelocityJumpKmS) < 1e-7, 'con el empalme de la etapa 21 no hay salto');
  assert.throws(() => designEarthDeparture({ ...base, patch: 'otro' }), RangeError);
  assert.deepEqual(Object.keys(DEPARTURE_PATCH_MODELS).sort(), ['asymptote', 'velocity']);
});

test('28 · A1 desde la plataforma: C3 convencional, v∞ coherente y salto de velocidad declarado en la frontera', async () => {
  const [{ mission }, { mission: m21 }, { mission: centro }] = await Promise.all([a1Pad, a1Pad21, a1Centro]);
  const L = mission.launch, c3 = mission.departure.c3Km2S2, c3Centro = centro.departure.c3Km2S2;
  assert.equal(L.patch, 'asymptote');
  // El C3 vuelve al del centro de la Tierra (8,99) en menos de un 1 %; el de la etapa 21 estaba 0,86 km²/s² por debajo.
  assert.ok(Math.abs(c3 - c3Centro) < 0.01 * c3Centro, `${c3} frente a ${c3Centro}`);
  assert.ok(c3Centro - m21.departure.c3Km2S2 > 0.8, `${m21.departure.c3Km2S2}`);
  assert.ok(Math.abs(dot(mission.departure.vInfVectorKmS, mission.departure.vInfVectorKmS) - c3) < 1e-9, '|v∞|² = C3');
  // Continuidad: posición y tiempo siempre; la única discontinuidad de velocidad es la del empalme, declarada y medida.
  const c = mission.continuity;
  assert.ok(c.maxPositionErrorKm < 1e-3 && c.maxVelocityErrorKmS < 1e-6, JSON.stringify({ p: c.maxPositionErrorKm, v: c.maxVelocityErrorKmS }));
  assert.equal(c.declaredPatches.length, 1);
  const p = c.declaredPatches[0];
  assert.equal(p.from, 'earth-escape'); assert.equal(p.to, 'cruise');
  assert.ok(Math.abs(p.velocityJumpKmS - L.soiVelocityJumpKmS) < 1e-9 && Math.abs(p.declaredVelocityJumpKmS - L.soiVelocityJumpKmS) < 1e-12);
  // Orden de magnitud independiente: |v| − v∞ en la frontera ≈ μ/(R·v∞) (unos 0,14 km/s con v∞ ≈ 3 km/s).
  const est = MU / (L.soiRadiusKm * Math.sqrt(c3));
  assert.ok(p.velocityJumpKmS > 0.5 * est && p.velocityJumpKmS < 2 * est, `${p.velocityJumpKmS} frente a ~${est}`);
  assert.equal(m21.continuity.declaredPatches.length, 0, 'la etapa 21 no tiene salto');
  // Texto de la fase: explica el salto y que no es un encendido.
  assert.match(mission.phases.find(x => x.id === 'earth-escape').detail, /no es un encendido/);
});

test('28 · gravedad terrestre fuera de la SOI: un RK4 propio (Sol + Tierra) lleva la nave real al punto de llegada del crucero', async () => {
  const { mission } = await a1Pad, L = mission.launch, B = L.earthBeyondSoi;
  assert.equal(B.applied, true); assert.equal(B.converged, true);
  assert.ok(B.missKm <= EARTH_BEYOND_SOI.toleranceKm && B.correctionMS > 1 && B.correctionMS < 100, JSON.stringify(B));
  const cruise = mission.segments.find(s => s.id === 'cruise');
  const start = mission.departureJdTdb + cruise.startSeconds / 86400, end = mission.departureJdTdb + cruise.endSeconds / 86400;
  const win = await ephemeris.loadWindow(NBODY_EPHEMERIS_IDS, start - 1, end + 1);
  const earthAt = jd => { const s = win.stateAt('399', jd); assert.equal(s?.status, 'available'); return s.positionKm; };
  const muE = NBODY_PERTURBERS.find(x => x.id === '399').muKm3S2;
  // RK4 de paso fijo (1 h) en ejes heliocéntricos con la aceleración indirecta, escrito aquí.
  const acc = (r, jd, withEarth) => {
    const rn = norm(r), a = r.map(x => -MU_SUN_NBODY * x / rn ** 3);
    if (!withEarth) return a;
    const e = earthAt(jd), d = sub(e, r), dn = norm(d), en = norm(e);
    return a.map((x, i) => x + muE * (d[i] / dn ** 3 - e[i] / en ** 3));
  };
  const rk4 = (r0, v0, withEarth) => {
    const total = (end - start) * 86400, n = Math.ceil(total / 3600), h = total / n;
    let r = r0.slice(), v = v0.slice();
    for (let k = 0; k < n; k++) {
      const jd = start + (k * h) / 86400, jh = jd + h / 2 / 86400, j1 = jd + h / 86400;
      const k1v = acc(r, jd, withEarth), k1r = v;
      const k2v = acc(add(r, k1r.map(x => x * h / 2)), jh, withEarth), k2r = add(v, k1v.map(x => x * h / 2));
      const k3v = acc(add(r, k2r.map(x => x * h / 2)), jh, withEarth), k3r = add(v, k2v.map(x => x * h / 2));
      const k4v = acc(add(r, k3r.map(x => x * h)), j1, withEarth), k4r = add(v, k3v.map(x => x * h));
      r = r.map((x, i) => x + h / 6 * (k1r[i] + 2 * k2r[i] + 2 * k3r[i] + k4r[i]));
      v = v.map((x, i) => x + h / 6 * (k1v[i] + 2 * k2v[i] + 2 * k3v[i] + k4v[i]));
    }
    return r;
  };
  const conicEnd = propagateKepler(cruise.initial.positionKm, cruise.initial.velocityKmS, (end - start) * 86400, MU_SUN_NBODY).positionKm;
  const S = L.soiExitHelioState;
  assert.ok(norm(sub(S.positionKm, cruise.initial.positionKm)) < 1e-6, 'la nave real parte del mismo punto que el crucero');
  const real = rk4(S.positionKm, S.velocityKmS, true);
  assert.ok(norm(sub(real, conicEnd)) < 20, `nave real a ${norm(sub(real, conicEnd))} km de la llegada cónica`);
  // Sin la Tierra fuera de la SOI, esa misma nave se pasaría de largo cientos de miles de km: la corrección es necesaria.
  assert.ok(norm(sub(rk4(S.positionKm, S.velocityKmS, false), conicEnd)) > 1e5);
});

test('28 · la interfaz explica el empalme: glosario y perfil por defecto', async () => {
  const handoff = GLOSSARY.find(g => g.id === 'handoff');
  assert.match(handoff.text, /asíntota/);
  assert.match(handoff.text, /fuera de (su|la) esfera de influencia/);
  const { mission } = await a1Pad;
  assert.equal(mission.launch.earthBeyondSoi.perturbers[0], 'Tierra + Luna');
});

test('28 · auditoría O-1: si la propagación con la Tierra falla en una vuelta posterior, se declara la corrección parcial', async () => {
  // Deja pasar la primera propagación hasta la llegada; desde el segundo diseño del lanzamiento, la Tierra lejos de la salida «no está».
  let fase = 0;
  const wrap = (helio, dep) => ({ ...helio, stateAt: (eid, jd) => { // la ventana está congelada: copia con stateAt sustituido
    const lejos = jd > dep + 30, tierra = eid === '399';
    if (tierra && lejos && fase === 0) fase = 1; else if (tierra && !lejos && fase === 1) fase = 2;
    if (tierra && lejos && fase === 2) return { status: 'unavailable', reason: 'prueba: sin efemérides' };
    return helio.stateAt(eid, jd);
  } });
  const { mission } = await run('A1', 'cassini', { launch: true, wrap });
  const B = mission.launch.earthBeyondSoi;
  assert.equal(B.applied, false);
  assert.ok(B.partialCorrectionMS > 1, JSON.stringify(B));
  assert.ok(mission.warnings.some(w => /corrección parcial de \d+(\.\d+)? m\/s sin comprobar/.test(w)), mission.warnings.join(' | '));
  // Sin fallo, la corrección es completa y no hay aviso.
  const { mission: ok } = await a1Pad;
  assert.equal(ok.launch.earthBeyondSoi.applied, true);
  assert.ok(!ok.warnings.some(w => /fuera de la SOI no incluida/.test(w)));
});
