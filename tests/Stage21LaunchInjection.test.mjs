// Etapa 21 · Lanzamiento → inyección. La misión empieza en la plataforma LC-41: ascenso de 12E, órbita de aparcamiento,
// inyección de empuje finito con la Centaur D-1T y escape hasta la SOI terrestre, apuntado para empalmar con el crucero.
// Las comprobaciones usan fórmulas propias (dos cuerpos, WGS84, tiempo de rotación de la Tierra IERS 2010, precesión IAU 2006)
// sobre los vectores de estado de los tramos, no los elementos que calcula el propio módulo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { historicalDesign } from '../src/lab/ProbeDesign.js';
import { INTEGRATED_SCENARIOS, integratedMissionInput, scenarioFormValues, refinementHalfSpanDays } from '../src/ui/IntegratedMissionPlanner.js';
import { computeIntegratedMission, ENCOUNTER_TARGETS, INTEGRATED_MISSION_VERSION, PHASE_STATUS, COMPENSATION_STATUS, sampleSegmentNative } from '../src/lab/IntegratedMission.js';
import { createIntegratedExecution, sampleIntegratedExecution, deriveIntegratedTelemetry, autoContextAt } from '../src/lab/IntegratedMissionPlayback.js';
import { designEarthDeparture, hyperbolicTimeToRadius, CENTAUR_D1T, DEPARTURE_LAUNCHER, DEPARTURE_LAUNCHER_CAPACITY_KG, DEPARTURE_STATUS, DEPARTURE_SITE, departureLaunchOptions } from '../src/lab/EarthDeparture.js';
import { simulateLaunch } from '../src/lab/LaunchSimulation.js';
import { estimatePayloadCapacityKg } from '../src/lab/LaunchPlan.js';
import { EARTH_GM_KM3_S2 } from '../src/lab/LaunchEarth.js';
import { propagateKepler } from '../src/science/KeplerPropagator.js';
import { precessionMatrixJ2000ToDate, precessionMatrixJ2000ToDateIau2006, launchFrameToEclipticJ2000, applyMatrix } from '../src/science/EarthOrientation.js';
import { eclipticJ2000ToIcrfEquatorial } from '../src/science/Frames.js';
import { tdbToTimeScales } from '../src/science/AstrodynamicsTime.js';
import { refineTransferCandidate } from '../src/lab/InterplanetaryPlan.js';
import { createInterplanetaryEphemeris } from '../src/science/InterplanetaryEphemeris.js';
import { datetimeLocalUtcToJdTdb } from '../src/science/AstrodynamicsTime.js';

const json = file => JSON.parse(readFileSync(file, 'utf8'));
const catalog = { catalogVersion: 1, datasets: [...json('public/data/interplanetary-ephemerides-catalog-v1.json').datasets, ...json('public/data/encounter-ephemerides-catalog-v1.json').datasets] };
const ephemeris = createInterplanetaryEphemeris({ catalog, loadJson: async file => json(`public/${file}`) });
const MU = EARTH_GM_KM3_S2, ARCSEC = Math.PI / 180 / 3600, DEG = Math.PI / 180;
const norm = a => Math.hypot(a[0], a[1], a[2]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const angleArcsec = (a, b) => Math.acos(Math.min(1, dot(a, b) / (norm(a) * norm(b)))) / ARCSEC;

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
  return { mission: computeIntegratedMission(input, { helio, moons: null }), target, helio, design, input };
}
const a1 = run('A1', 'cassini', { launch: true });
const a1Sin = run('A1', 'cassini');

test('21 · precesión IAU 1976 frente a IAU 2006 (formulación independiente) y deriva del equinoccio', () => {
  for (const jdTt of [2443391.5, 2451545, 2461318.5, 2469807.5]) {
    const a = precessionMatrixJ2000ToDate(jdTt), b = precessionMatrixJ2000ToDateIau2006(jdTt);
    for (const e of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) assert.ok(angleArcsec(applyMatrix(a, e), applyMatrix(b, e)) < 0.5, `${jdTt}: ${angleArcsec(applyMatrix(a, e), applyMatrix(b, e))}″`);
    // Ortonormal.
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) assert.ok(Math.abs(dot(a[i], a[j]) - (i === j ? 1 : 0)) < 1e-14);
  }
  // Ascensión recta del equinoccio J2000 en la fecha: ≈ −m·t con m = 46,124″/año (3,07496 s) para fechas cercanas a J2000.
  const jd = 2451545 + 10 * 365.25, x = applyMatrix(precessionMatrixJ2000ToDate(jd), [1, 0, 0]);
  assert.ok(Math.abs(Math.atan2(x[1], x[0]) / ARCSEC / 10 - 46.124) < 0.05, `${Math.atan2(x[1], x[0]) / ARCSEC / 10}″/año`);
});

test('21 · el ascenso de 12E es invariante al girar la Tierra: girar la solución equivale a recalcularla con otro ángulo inicial (salvo el error de integración)', () => {
  const payload = 20000, g = 123.4;
  const base = simulateLaunch({ launcher: DEPARTURE_LAUNCHER, payloadMassKg: payload, options: departureLaunchOptions(90) });
  const rotated = simulateLaunch({ launcher: DEPARTURE_LAUNCHER, payloadMassKg: payload, options: departureLaunchOptions(90, { earthRotationAngleDeg: g }) });
  const c = Math.cos(g * DEG), s = Math.sin(g * DEG), rot = p => [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];
  // No es idéntico a precisión de máquina: el paso adaptativo cambia con el redondeo. Medido: 0,23 m y 2,5·10⁻⁷ km/s tras ~600 s de ascenso.
  assert.ok(norm(sub(rot(base.final.positionKm), rotated.final.positionKm)) < 1e-3, `${norm(sub(rot(base.final.positionKm), rotated.final.positionKm))} km`);
  assert.ok(norm(sub(rot(base.final.velocityKmS), rotated.final.velocityKmS)) < 1e-6, `${norm(sub(rot(base.final.velocityKmS), rotated.final.velocityKmS))} km/s`);
  // El corte de la circularización se detecta como evento: su instante difiere en ~5·10⁻⁵ s.
  assert.ok(Math.abs(base.final.elapsedSeconds - rotated.final.elapsedSeconds) < 1e-3);
});

test('21 · etapa de inyección con los datos documentados de la Centaur D-1T y lanzador ilustrativo con su capacidad medida', () => {
  const LBF = 4.4482216152605, LB = 0.45359237;
  assert.ok(Math.abs(CENTAUR_D1T.thrustN - 30000 * LBF) < 1e-6 && CENTAUR_D1T.ispS === 444);
  assert.ok(Math.abs(CENTAUR_D1T.propellantKg - 29750 * LB) < 1e-6 && Math.abs(CENTAUR_D1T.dryMassKg - 4400 * LB) < 1e-6);
  const capacity = estimatePayloadCapacityKg({ launcher: DEPARTURE_LAUNCHER, options: departureLaunchOptions(90), maxKg: 60000 });
  assert.ok(Math.abs(capacity - DEPARTURE_LAUNCHER_CAPACITY_KG) / DEPARTURE_LAUNCHER_CAPACITY_KG < 0.01, `capacidad medida ${capacity} kg`);
  // Cabe la Centaur llena con la sonda más pesada de la flota (Cassini).
  assert.ok(capacity > CENTAUR_D1T.dryMassKg + CENTAUR_D1T.propellantKg + 5606);
});

test('21 · tiempo hasta un radio en la hipérbola de escape (comparado con bisección sobre Kepler)', () => {
  const r = [6700, 0, 0], v = [0, 11.2, 0.5];
  const t = hyperbolicTimeToRadius(r, v, MU, 900000);
  let lo = 0, hi = 1e7;
  for (let k = 0; k < 200; k++) { const m = (lo + hi) / 2; if (norm(propagateKepler(r, v, m, MU).positionKm) < 900000) lo = m; else hi = m; }
  assert.ok(Math.abs(t - (lo + hi) / 2) < 1e-3, `${t} frente a ${(lo + hi) / 2}`);
  assert.equal(hyperbolicTimeToRadius(r, [0, 7.7, 0], MU, 900000), null, 'una órbita ligada no escapa');
});

test('21 · A1 desde la plataforma (Cassini): cadena completa, fases de salida y órbita final pedida', async () => {
  const { mission } = await a1;
  assert.equal(mission.model, INTEGRATED_MISSION_VERSION);
  assert.match(mission.verdict, /^CADENA CALCULADA COMPLETA/);
  const ids = mission.phases.map(p => p.id);
  for (const id of ['launch', 'parking', 'injection', 'earth-escape', 'cruise', 'capture']) assert.ok(ids.includes(id), id);
  assert.ok(!ids.includes('departure'), 'sin la condición inicial externa');
  for (const id of ['launch', 'parking', 'injection', 'earth-escape']) assert.equal(mission.phases.find(p => p.id === id).status, PHASE_STATUS.done, id);
  const L = mission.launch;
  assert.equal(L.status, DEPARTURE_STATUS.designed);
  assert.ok(Math.abs(L.liftoffJdTdb - mission.plannedDepartureJdTdb) <= 0.5, 'despegue el día de la salida prevista');
  assert.equal(mission.departureJdTdb, L.liftoffJdTdb, 't = 0 es el despegue');
  assert.ok(L.handoffResidualKmS < 1e-7, `empalme ${L.handoffResidualKmS} km/s`);
  // La captura apuntada (20) sigue dejando la órbita pedida.
  const cap = mission.phases.find(p => p.id === 'capture').insertion.finalOrbit;
  assert.equal(mission.approach.periapsisCompensation.status, COMPENSATION_STATUS.applied);
  assert.ok(Math.abs(cap.periapsisAltitudeKm - 3000) < 0.01 && Math.abs(cap.apoapsisAltitudeKm - 100000) < 1, JSON.stringify(cap));
  // Continuidad de toda la cadena, con los cambios de marco Tierra → Sol → Marte, y masas solo en separaciones declaradas.
  const c = mission.continuity;
  assert.equal(c.boundaries.filter(b => b.error).length, 0);
  assert.ok(c.maxPositionErrorKm < 1e-3 && c.maxVelocityErrorKmS < 1e-6 && c.maxTimeGapSeconds < 1e-6, JSON.stringify({ p: c.maxPositionErrorKm, v: c.maxVelocityErrorKmS }));
  assert.equal(c.undeclaredMassJumps, 0);
  assert.ok(mission.separations.length >= 3, 'etapa 1, etapa 2 y Centaur');
});

test('21 · A1 desde la plataforma: comprobaciones propias del sitio, la órbita de aparcamiento, la inyección y la salida de la SOI', async () => {
  const { mission, helio } = await a1;
  const L = mission.launch, segs = mission.segments, earthSegs = segs.filter(s => s.centralBodyId === '399');
  assert.ok(earthSegs.length >= 4 && segs.findIndex(s => s.centralBodyId === '10') === earthSegs.length, 'los tramos terrestres van antes del crucero');
  // Sitio en el despegue: ascensión recta = GMST + longitud y declinación = latitud geocéntrica (WGS84), con el GMST calculado aquí
  // por otra fórmula (ángulo de rotación de la Tierra, IERS 2010 ec. 5.15 y 5.32) y la precesión IAU 2006.
  const first = sampleSegmentNative(segs[0], 0), scales = tdbToTimeScales(mission.departureJdTdb);
  const Du = scales.jdUtcPseudo - 2451545.0, T = (scales.jdTt - 2451545.0) / 36525;
  const era = 2 * Math.PI * ((0.7790572732640 + 1.0027378119113546 * Du) % 1);
  const gmst = era + (0.014506 + 4612.156534 * T + 1.3915817 * T * T) * ARCSEC;
  const mod = applyMatrix(precessionMatrixJ2000ToDateIau2006(scales.jdTt), eclipticJ2000ToIcrfEquatorial(first.positionKm));
  const f = 1 / 298.257223563, e2 = f * (2 - f), lat = DEPARTURE_SITE.latDeg * DEG, N = 6378.137 / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
  const zSite = N * (1 - e2) * Math.sin(lat), rhoSite = N * Math.cos(lat);
  const raDiff = Math.atan2(mod[1], mod[0]) - (gmst + DEPARTURE_SITE.lonDeg * DEG);
  assert.ok(Math.abs(Math.atan2(Math.sin(raDiff), Math.cos(raDiff))) / DEG < 2e-3, `AR del sitio desviada ${raDiff / DEG}°`);
  assert.ok(Math.abs(mod[2] - zSite) < 0.05 && Math.abs(Math.hypot(mod[0], mod[1]) - rhoSite) < 0.05, `sitio ${mod}`);
  // En la plataforma, la velocidad inercial es la de rotación de la Tierra: ω·ρ.
  assert.ok(Math.abs(norm(first.velocityKmS) - 7.292115e-5 * rhoSite) < 1e-6, `${norm(first.velocityKmS)} km/s`);
  // Órbita de aparcamiento: inclinación (h·ẑ en ejes ecuatoriales) ≥ |declinación de la asíntota| y perigeo ≥ 160 km.
  const park = segs.find(s => s.id === 'parking-coast').initial;
  const hEq = cross(eclipticJ2000ToIcrfEquatorial(park.positionKm), eclipticJ2000ToIcrfEquatorial(park.velocityKmS));
  const inc = Math.acos(hEq[2] / norm(hEq)) / DEG;
  assert.ok(inc >= Math.abs(L.declinationDeg) && Math.abs(inc - L.parking.inclinationDeg) < 0.4, `i ${inc}° · δ ${L.declinationDeg}°`);
  assert.ok(L.parking.perigeeAltitudeKm >= 160);
  // Inyección: C3 propio en el final del encendido; energía conservada hasta la SOI; radio de salida = SOI de Laplace calculada aquí.
  const inj = segs.find(s => s.id === 'injection'), bo = sampleSegmentNative(inj, inj.endSeconds);
  const c3 = dot(bo.velocityKmS, bo.velocityKmS) - 2 * MU / norm(bo.positionKm);
  assert.ok(Math.abs(c3 - L.injection.c3Km2S2) < 1e-9 && Math.abs(c3 - mission.departure.c3Km2S2) < 1e-9);
  const esc = segs.find(s => s.id === 'earth-escape'), ex = sampleSegmentNative(esc, esc.endSeconds);
  assert.ok(Math.abs(dot(ex.velocityKmS, ex.velocityKmS) - 2 * MU / norm(ex.positionKm) - c3) < 1e-9, 'energía de la hipérbola');
  const e0 = helio.stateAt('399', mission.plannedDepartureJdTdb), muSun = 1.32712440041279419e11;
  const v2 = dot(e0.velocityKmS, e0.velocityKmS), aE = 1 / (2 / norm(e0.positionKm) - v2 / (muSun + MU));
  assert.ok(Math.abs(norm(ex.positionKm) - aE * (MU / muSun) ** 0.4) < 50, `salida a ${norm(ex.positionKm)} km`);
  // Masa: propelente usado + restante = cargado; masa tras la inyección = sonda + Centaur seca + restante.
  assert.ok(Math.abs(L.injection.propellantKg + L.injection.propellantLeftKg - CENTAUR_D1T.propellantKg) < 1e-6);
  assert.ok(Math.abs(inj.knots.at(-1).massKg - (mission.vehicle.totalKg + CENTAUR_D1T.dryMassKg + L.injection.propellantLeftKg)) < 1e-3);
  // Rocket: Δv propulsivo = Isp·g0·ln(m0/mf) calculado aquí.
  const m0 = mission.vehicle.totalKg + CENTAUR_D1T.dryMassKg + CENTAUR_D1T.propellantKg, mf = inj.knots.at(-1).massKg;
  assert.ok(Math.abs(444 * 9.80665 * Math.log(m0 / mf) / 1000 - L.injection.propulsiveDeltaVKmS) < 1e-6);
  assert.ok(L.injection.gravityLossKmS > 0 && L.injection.gravityLossKmS < 0.1, `pérdidas ${L.injection.gravityLossKmS * 1000} m/s`);
});

test('21 · sin la opción, la misión es la de la etapa 20 (condición inicial externa, sin tramos terrestres)', async () => {
  const [{ mission: con }, { mission: sin }] = await Promise.all([a1, a1Sin]);
  assert.equal(sin.launch, null);
  assert.ok(!sin.segments.some(s => s.centralBodyId === '399'));
  assert.equal(sin.phases[0].id, 'departure');
  assert.ok(Math.abs(sin.approach.periapsisCompensation.aimedPeriapsisAltitudeKm - 5833.66) < 0.5);
  assert.equal(sin.departureJdTdb, sin.plannedDepartureJdTdb);
  // Con la plataforma, el crucero sale de la SOI terrestre unos días después: la llegada cambia poco y se vuelve a compensar.
  assert.ok(Math.abs(con.approach.periapsisCompensation.aimedPeriapsisAltitudeKm - sin.approach.periapsisCompensation.aimedPeriapsisAltitudeKm) < 20);
});

test('21 · reproducción: contexto geocéntrico, encendido de la Centaur en la telemetría y paso al Sol', async () => {
  const { mission, helio, design } = await a1;
  const exec = createIntegratedExecution({ result: mission, data: { helio, moons: null }, design });
  assert.ok(exec.contexts.earth && exec.contexts.helio && exec.contexts.planet);
  assert.equal(autoContextAt(exec, 0), 'earth');
  const t0 = sampleIntegratedExecution(exec, 0, 'helio'), earth = helio.stateAt('399', mission.departureJdTdb);
  assert.ok(Math.abs(norm(sub(t0.positionKm, earth.positionKm)) - 6373.6) < 10, 'en la superficie de la Tierra');
  // Altitud geodésica (WGS84) en la plataforma: 0 km (el sitio se toma a 0 m); con el radio ecuatorial saldría −4,9 km.
  const tel0 = deriveIntegratedTelemetry(exec, sampleIntegratedExecution(exec, 0));
  assert.ok(Math.abs(tel0.derived.altitudeKm) < 0.05, `altitud en la plataforma ${tel0.derived.altitudeKm} km`);
  assert.ok(Math.abs(tel0.derived.speedKmS - 0.4087) < 1e-3, 'velocidad inercial = rotación terrestre');
  const inj = mission.segments.find(s => s.id === 'injection'), mid = (inj.startSeconds + inj.endSeconds) / 2;
  const tel = deriveIntegratedTelemetry(exec, sampleIntegratedExecution(exec, mid));
  assert.equal(tel.propulsion.engineOn, true);
  assert.equal(tel.propulsion.activeManeuver, 'Inyección interplanetaria');
  assert.ok(tel.propulsion.tanks.upper < CENTAUR_D1T.propellantKg && tel.propulsion.tanks.upper > mission.launch.injection.propellantLeftKg);
  assert.match(tel.frame.label, /Tierra/);
  const cruise = mission.segments.find(s => s.id === 'cruise');
  assert.equal(autoContextAt(exec, cruise.startSeconds + 86400), 'helio');
});

test('21 · casos no viables: la Centaur no da el C3 de Júpiter con Cassini, y una asíntota fuera del plano posible', async () => {
  const { mission } = await run('C1', 'cassini', { launch: true });
  assert.match(mission.verdict, /^NO VIABLE/);
  const p = mission.phases.find(x => x.id === 'launch');
  assert.equal(p.status, PHASE_STATUS.failed);
  assert.match(p.detail, /Centaur D-1T/);
  assert.equal(mission.launch.status, DEPARTURE_STATUS.upperStage);
  // Sintético: Tierra en reposo y asíntota con 70° de declinación; con acimut fijo de 90° la inclinación (~29°) no la contiene.
  const earthStateAt = () => ({ positionKm: [1.496e8, 0, 0], velocityKmS: [0, 29.78, 0] });
  const dec = 70 * DEG, vInfEq = [3 * Math.cos(dec), 0, 3 * Math.sin(dec)];
  const eps = 84381.448 * ARCSEC, vInfEcl = [vInfEq[0], Math.cos(eps) * vInfEq[1] + Math.sin(eps) * vInfEq[2], -Math.sin(eps) * vInfEq[1] + Math.cos(eps) * vInfEq[2]];
  const d = designEarthDeparture({ payloadMassKg: 800, liftoffGuessJdTdb: 2461000.5, earthStateAt, soiRadiusKm: 924000, azimuthDeg: 90,
    requiredVelocityAt: () => [vInfEcl[0], 29.78 + vInfEcl[1], vInfEcl[2]] });
  assert.equal(d.status, DEPARTURE_STATUS.declination);
  assert.ok(Math.abs(d.declinationDeg - 70) < 1e-9);
});

test('21 · objetivo sintético: el apuntado alcanza la velocidad pedida en la salida de la SOI (sin crucero real)', () => {
  // Tierra en movimiento uniforme y velocidad heliocéntrica pedida fija: la solución debe dar esa velocidad en la SOI.
  const earthStateAt = jd => ({ positionKm: [1.496e8, 29.78 * (jd - 2461000.5) * 86400, 0], velocityKmS: [0, 29.78, 0] });
  const want = [2.1, 29.78 + 1.6, 0.9];
  const d = designEarthDeparture({ payloadMassKg: 1200, liftoffGuessJdTdb: 2461000.5, earthStateAt, soiRadiusKm: 924000, azimuthDeg: 'auto', requiredVelocityAt: () => want });
  assert.equal(d.status, DEPARTURE_STATUS.designed, d.reason ?? '');
  assert.ok(norm(sub(d.exit.helioVelocityAchievedKmS, want)) < 1e-7);
  // Tiempo y posición coherentes: la salida está en la SOI y después del encendido.
  assert.ok(Math.abs(norm(d.exit.geocentric.positionKm) - 924000) < 1e-3 && d.exit.elapsedSeconds > d.injection.endSeconds);
  assert.ok(Math.abs(d.liftoffJdTdb - 2461000.5) <= 0.5);
});

test('21 · el planificador pasa la opción al perfil (desactivada por defecto)', () => {
  const v = scenarioFormValues(INTEGRATED_SCENARIOS[0]), design = historicalDesign('cassini');
  assert.equal(integratedMissionInput({ ...v, departureJdTdb: 2462000, tofDays: 300 }, design).profile.launch.enabled, false);
  assert.equal(integratedMissionInput({ ...v, departureJdTdb: 2462000, tofDays: 300, launch: true }, design).profile.launch.enabled, true);
});

test('21 · límite del lanzador en el acimut y despegue fuera de la cobertura de efemérides (auditoría)', () => {
  const eps = 84381.448 * ARCSEC, toEcl = q => [q[0], Math.cos(eps) * q[1] + Math.sin(eps) * q[2], -Math.sin(eps) * q[1] + Math.cos(eps) * q[2]];
  const still = () => ({ positionKm: [1.496e8, 0, 0], velocityKmS: [0, 29.78, 0] });
  // Asíntota a 60°: con la carga de Cassini el lanzador ilustrativo solo llega a ~42° de inclinación (acimut ~47°); el motivo lo dice.
  const dec = 60 * DEG, w = toEcl([3 * Math.cos(dec), 0, 3 * Math.sin(dec)]);
  const d = designEarthDeparture({ payloadMassKg: 5606, liftoffGuessJdTdb: 2461000.5, earthStateAt: still, soiRadiusKm: 924000, azimuthDeg: 'auto', requiredVelocityAt: () => [w[0], 29.78 + w[1], w[2]] });
  assert.equal(d.status, DEPARTURE_STATUS.declination);
  assert.match(d.reason, /inclinación máxima con esta carga/);
  assert.ok(d.parkingInclinationDeg > 40 && d.parkingInclinationDeg < 45, `${d.parkingInclinationDeg}°`);
  // Despegue fuera de la cobertura: sin restricción, la ventana más cercana cae 0,16 h antes de la salida prevista; con efemérides de
  // la Tierra solo desde esa salida, esa ventana se rechaza (no se extrapola) y se usa la siguiente.
  const T0 = 2461000.5, tg = T0 + 0.25 / 24, want = () => [2.1, 31.38, 0.9];
  const earthFrom = start => jd => (jd < start - 1e-9 ? null : { positionKm: [1.496e8, 29.78 * (jd - T0) * 86400, 0], velocityKmS: [0, 29.78, 0] });
  const free = designEarthDeparture({ payloadMassKg: 1200, liftoffGuessJdTdb: tg, earthStateAt: earthFrom(-Infinity), soiRadiusKm: 924000, azimuthDeg: 'auto', requiredVelocityAt: want });
  assert.ok(free.ok && free.liftoffJdTdb < tg, 'sin restricción, despegue antes de la salida prevista');
  const r = designEarthDeparture({ payloadMassKg: 1200, liftoffGuessJdTdb: tg, earthStateAt: earthFrom(tg), soiRadiusKm: 924000, azimuthDeg: 'auto', requiredVelocityAt: want });
  if (r.ok) assert.ok(r.liftoffJdTdb >= tg, `despegue ${(r.liftoffJdTdb - tg) * 24} h`);
  else { assert.equal(r.status, DEPARTURE_STATUS.aim); assert.match(r.reason, /cobertura de efemérides/); }
});

test('21 · el glosario explica los rótulos nuevos de la salida desde la plataforma', async () => {
  const { GLOSSARY, termFor } = await import('../src/ui/LabGlossary.js');
  assert.equal(new Set(GLOSSARY.map(e => e.id)).size, GLOSSARY.length);
  assert.equal(termFor('Órbita de aparcamiento')?.id, 'parking-orbit');
  assert.equal(termFor('Acimut')?.id, 'azimuth');
  assert.equal(termFor('Acimut de lanzamiento (° desde el norte)')?.id, 'azimuth');
  assert.equal(termFor('Empalme con el crucero')?.id, 'handoff');
  assert.equal(termFor('C3 conseguido')?.id, 'c3');
  assert.equal(termFor('Sitio'), null);
});
