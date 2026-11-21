// Etapa 12G — tiempo, marcos, efemérides de cobertura amplia, Lambert, ventanas, reproducción y telemetría.
// Las tolerancias se justifican en docs/STAGE12G_INTERPLANETARY_PLANNING.md; ningún valor se calibra para que pase.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { utcToTimeScales, tdbToTimeScales, naifDeltetTdbMinusTt, tdbMinusTtSeconds, datetimeLocalUtcToJdTdb, jdToMjd, LEAP_SECONDS_SOURCE } from '../src/science/AstrodynamicsTime.js';
import { gregorianTimestampToJdTdb } from '../src/science/Time.js';
import { eclipticJ2000ToIcrfEquatorial, icrfEquatorialToEclipticJ2000 } from '../src/science/Frames.js';
import { createInterplanetaryEphemeris, UNAVAILABLE_MESSAGE, MEASURED_INTERPOLATION_ERROR, INTERPLANETARY_FRAME } from '../src/science/InterplanetaryEphemeris.js';
import { solveLambert, LAMBERT_STATUS } from '../src/science/LambertSolver.js';
import { propagateKepler, stumpff } from '../src/science/KeplerPropagator.js';
import { integrateDopri54 } from '../src/science/NumericalIntegrator.js';
import { KM_PER_AU } from '../src/science/Units.js';
import { CANDIDATE_STATUS, CELL, MU_EARTH, MU_SUN, EARTH_RADIUS_KM, compareRequirementsWithDesign, evaluateTransfer, hyperbolicExcess, injectionDeltaV,
  isInterplanetaryResultCurrent, listMissionDestinations, searchLaunchWindows, validateInterplanetaryOptions, MAX_GRID_CELLS } from '../src/lab/InterplanetaryPlan.js';
import { createInterplanetaryExecution, deriveInterplanetaryTelemetry, sampleInterplanetaryExecution, INTERPLANETARY_MAX_RATE } from '../src/lab/InterplanetaryPlayback.js';
import { createPlaybackClock } from '../src/lab/MissionPlayback.js';

const catalog = JSON.parse(readFileSync('public/data/interplanetary-ephemerides-catalog-v1.json', 'utf8'));
const holdout = JSON.parse(readFileSync('tests/fixtures/interplanetary-horizons-holdout-v1.json', 'utf8'));
const ephemeris = () => createInterplanetaryEphemeris({ catalog, loadJson: async file => JSON.parse(readFileSync(`public/${file}`, 'utf8')) });
const near = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected} (tol ${tolerance})`);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const norm = a => Math.hypot(a[0], a[1], a[2]);

// ---------- A–B: tiempo ----------
test('A: UTC → TDB coincide con ΔT = TDB − UT de NASA/JPL Horizons en 2026–2045 y no es un desfase fijo', () => {
  const rows = holdout.deltaT.rows;
  assert.equal(rows.length, 4);
  const values = holdout.deltaT.requestedUtc.map((utc, i) => {
    const ours = utcToTimeScales(utc).tdbMinusUtcSeconds, horizons = Number(rows[i][3]);
    // 2 términos de Fairhead & Bretagnon: < 30 µs; Horizons imprime 1 µs. Tolerancia 1e-4 s.
    near(ours, horizons, 1e-4, `TDB − UTC ${utc}`);
    return ours;
  });
  assert.ok(Math.max(...values) - Math.min(...values) > 5e-4, 'TDB − UTC varía con la época (término periódico)');
  const t = utcToTimeScales('2030-01-01 00:00');
  assert.equal(t.taiMinusUtcSeconds, 37); // Resolución de un JD en doble precisión cerca de 2,46e6: ~40 µs; se compara en segundos con 1e-4 s.
  near((t.jdTai - t.jdUtcPseudo) * 86400, 37, 1e-4, 'TAI − UTC'); near((t.jdTt - t.jdTai) * 86400, 32.184, 1e-4, 'TT − TAI');
  assert.equal(utcToTimeScales('2016-12-31 23:59:59').taiMinusUtcSeconds, 36); assert.equal(utcToTimeScales('2017-01-01 00:00:00').taiMinusUtcSeconds, 37);
  assert.equal(t.utcPredicted, true, 'fechas futuras sin segundos intercalares anunciados se marcan como predicción');
  assert.match(LEAP_SECONDS_SOURCE.lastEntry, /2017-01-01/);
  for (const utc of ['2026-11-18 00:00', '2031-06-15 13:45:10', '2045-12-31 23:00']) {
    const back = tdbToTimeScales(utcToTimeScales(utc).jdTdb);
    near(back.jdUtcPseudo, utcToTimeScales(utc).jdUtcPseudo, 1e-8, `ida y vuelta ${utc}`);
  }
  near(datetimeLocalUtcToJdTdb('2030-01-01T00:00'), t.jdTdb, 1e-12, 'campo datetime-local');
});
test('A2: TDB − TT de Fairhead–Bretagnon concuerda con DELTET de NAIF/SPICE (< 50 µs) en toda la cobertura', () => {
  let max = 0;
  for (let jd = 2461362.5; jd <= 2468346.5; jd += 7.3) max = Math.max(max, Math.abs(tdbMinusTtSeconds(jd) - naifDeltetTdbMinusTt(jd)));
  assert.ok(max < 5e-5, `diferencia máxima ${max} s`);
});
test('B: fechas julianas: J2000, inicio de cobertura y MJD', () => {
  assert.equal(gregorianTimestampToJdTdb('2000-01-01 12:00'), 2451545.0);
  assert.equal(gregorianTimestampToJdTdb('2026-11-18'), 2461362.5);
  assert.equal(gregorianTimestampToJdTdb('2046-01-01'), 2468346.5);
  assert.equal(jdToMjd(2461362.5), 61362);
});

// ---------- C–H: marcos, unidades y efemérides ----------
test('C: eclíptica J2000 → ejes ecuatoriales ICRF reproduce los vectores REF_PLANE=FRAME de Horizons', async () => {
  const e = ephemeris();
  assert.match(holdout.frameCheck.referenceFrameLine, /ICRF/);
  for (const row of holdout.frameCheck.rows) {
    const state = await e.getBodyState('399', row.jdTdb);
    assert.equal(state.interpolation.method, 'exact-node');
    assert.ok(dist(eclipticJ2000ToIcrfEquatorial(state.positionKm), row.positionKm) < 1e-5, 'posición (km)');
    assert.ok(dist(eclipticJ2000ToIcrfEquatorial(state.velocityKmS), row.velocityKmS) < 1e-11, 'velocidad (km/s)');
    assert.ok(dist(icrfEquatorialToEclipticJ2000(row.positionKm), state.positionKm) < 1e-5, 'inversa');
  }
});
test('D: unidades km y km/s; magnitudes heliocéntricas físicamente coherentes', async () => {
  const e = ephemeris();
  for (const d of catalog.datasets) { assert.deepEqual(d.fileUnits, { position: 'km', velocity: 'km/s' }); assert.equal(d.frameId, 'ICRF_ECLIPTIC_J2000'); assert.equal(d.origin, 'SUN_CENTER'); }
  const earth = await e.getBodyState('399', 2463000.5);
  assert.deepEqual(earth.units, { position: 'km', velocity: 'km/s' });
  const au = norm(earth.positionKm) / KM_PER_AU, v = norm(earth.velocityKmS);
  assert.ok(au > 0.98 && au < 1.02 && v > 29 && v < 30.4, `Tierra ${au} AU, ${v} km/s`);
  const neptune = await e.getBodyState('899', 2465000.5);
  assert.ok(norm(neptune.positionKm) / KM_PER_AU > 29 && norm(neptune.positionKm) / KM_PER_AU < 30.5);
});
test('E: los nodos coinciden con una consulta Horizons independiente (Tierra, 2030-01-01 00:00 TDB, DE441)', async () => {
  // Consulta individual realizada durante la Etapa 12G, distinta de la adquisición por lotes.
  const ref = { p: [-2.600847757810495E+07, 1.447900488833384E+08, -9.532206645891070E+03], v: [-2.981505192741513E+01, -5.371451831814229E+00, -5.573338788711357E-04] };
  const s = await ephemeris().getBodyState('399', 2462502.5);
  assert.equal(s.interpolation.method, 'exact-node'); assert.equal(s.dataset.solutionId, 'DE441');
  assert.ok(dist(s.positionKm, ref.p) < 1e-6 && dist(s.velocityKmS, ref.v) < 1e-12);
});
test('F: Hermite cúbica en instantes intermedios frente a estados Horizons NO usados como nodos (error medido)', async () => {
  const e = ephemeris();
  const report = {};
  for (const [bodyId, data] of Object.entries(holdout.states)) {
    let maxP = 0, maxV = 0;
    for (const row of data.rows) {
      const s = await e.getBodyState(bodyId, row.jdTdb);
      assert.equal(s.interpolation.method, 'cubic-hermite', `${bodyId} en JD ${row.jdTdb} no es nodo`);
      maxP = Math.max(maxP, dist(s.positionKm, row.positionKm)); maxV = Math.max(maxV, dist(s.velocityKmS, row.velocityKmS));
    }
    report[bodyId] = { maxP, maxV };
    // Tolerancia: error medido declarado (MEASURED_INTERPOLATION_ERROR) con 30 % de margen.
    assert.ok(maxP <= 1.3 * MEASURED_INTERPOLATION_ERROR[bodyId].positionKm, `${bodyId}: ${maxP} km`);
    assert.ok(maxV <= 1.3 * MEASURED_INTERPOLATION_ERROR[bodyId].velocityKmS, `${bodyId}: ${maxV} km/s`);
  }
  assert.ok(report['399'].maxP < 0.2 && report['499'].maxP < 0.05, 'Tierra y Marte por debajo de 0,2 km');
});
test('G: rechazo fuera de cobertura sin extrapolar', async () => {
  const e = ephemeris();
  for (const jd of [2461362.4, 2468346.6, 2400000.5]) {
    const s = await e.getBodyState('499', jd);
    assert.equal(s.status, 'unavailable'); assert.equal(s.message, UNAVAILABLE_MESSAGE); assert.equal(s.positionKm, undefined);
  }
  const w = await e.loadWindow(['399', '599'], 2468300.5, 2468346.5);
  assert.equal(w.stateAt('599', 2468346.9).status, 'unavailable');
  assert.equal((await e.getBodyState('10', 2463000.5)).interpolation.method, 'definition', 'el Sol es el origen por definición');
});
test('H: origen y ejes homogéneos; frontera entre archivos sin conflicto ni salto', async () => {
  const e = ephemeris();
  const boundary = 2463018.5; // nodo compartido por ip-planets-inner-2026-2031 y -2031-2036
  const s = await e.getBodyState('399', boundary);
  assert.equal(s.status, 'available'); assert.equal(s.frame.id, INTERPLANETARY_FRAME.id); assert.equal(s.frame.origin, 'SUN_CENTER');
  const w = await e.loadWindow(['399'], boundary - 3, boundary + 3);
  const before = w.stateAt('399', boundary - 0.5), after = w.stateAt('399', boundary + 0.5);
  assert.deepEqual(before.interpolation.nodeJdTdb, [boundary - 1, boundary]); assert.deepEqual(after.interpolation.nodeJdTdb, [boundary, boundary + 1]);
  // El nodo frontera procede de la MISMA respuesta física en ambos archivos (si difiriera, el proveedor declararía conflicto).
  const a = JSON.parse(readFileSync('public/data/interplanetary/ip-planets-inner-2026-2031.json', 'utf8')).series['399'].at(-1);
  const b = JSON.parse(readFileSync('public/data/interplanetary/ip-planets-inner-2031-2036.json', 'utf8')).series['399'][0];
  assert.equal(a[0], boundary); assert.deepEqual(a.slice(2), b.slice(2));
  assert.ok(dist(w.stateAt('399', boundary).positionKm, s.positionKm) < 1e-9);
  for (const st of [before, after]) { assert.equal(st.origin, INTERPLANETARY_FRAME.originLabel); assert.equal(st.frame.timeScale, 'TDB'); }
});

// ---------- I–L: Lambert ----------
test('I: Lambert reproduce casos publicados (Curtis ej. 5.2; Vallado ej. 7-5) y un caso analítico circular', () => {
  const c = solveLambert([5000, 10000, 2100], [-14600, 2500, 7000], 3600, 398600);
  assert.equal(c.status, LAMBERT_STATUS.converged);
  [[-5.9925, 1.9254, 3.2456], [-3.3125, -4.1966, -0.38529]].forEach((ref, k) => ref.forEach((x, i) => near((k ? c.arrivalVelocityKmS : c.departureVelocityKmS)[i], x, 6e-5, `Curtis v${k + 1}[${i}]`)));
  const v = solveLambert([15945.34, 0, 0], [12214.83899, 10249.46731, 0], 76 * 60, 398600.4418);
  [[2.058913, 2.915965, 0], [-3.451565, 0.910315, 0]].forEach((ref, k) => ref.forEach((x, i) => near((k ? v.arrivalVelocityKmS : v.departureVelocityKmS)[i], x, 2e-6, `Vallado v${k + 1}[${i}]`)));
  const R = KM_PER_AU, vc = Math.sqrt(MU_SUN / R), T = 2 * Math.PI * Math.sqrt(R ** 3 / MU_SUN);
  const q = solveLambert([R, 0, 0], [0, R, 0], T / 4, MU_SUN);
  assert.ok(dist(q.departureVelocityKmS, [0, vc, 0]) < 1e-9 * vc && dist(q.arrivalVelocityKmS, [-vc, 0, 0]) < 1e-9 * vc, 'órbita circular: v = √(μ/r) tangencial');
});
function dopri(r0, v0, seconds) {
  const out = integrateDopri54({ derivative: (t, y, d) => { const r = Math.hypot(y[0], y[1], y[2]), k = -MU_SUN / (r * r * r);
    const res = d ?? new Float64Array(6); res[0] = y[3]; res[1] = y[4]; res[2] = y[5]; res[3] = k * y[0]; res[4] = k * y[1]; res[5] = k * y[2]; return res; },
  initialState: Float64Array.from([...r0, ...v0]), startSeconds: 0, targetSeconds: seconds, initialStepSeconds: 3600, minStepSeconds: 1e-3, maxStepSeconds: 5 * 86400,
  absTol: 1e-6, relTol: 1e-13 });
  return Array.from(out.finalState.slice(0, 3));
}
test('J: cierre por propagación independiente DOPRI54 (dos cuerpos) con varios tiempos de vuelo', async () => {
  const w = await ephemeris().loadWindow(['399', '499'], 2462100.5, 2462900.5);
  const dep = 2462150.5;
  for (const tofDays of [60, 150, 260, 330, 500]) {
    const r1 = w.stateAt('399', dep).positionKm, r2 = w.stateAt('499', dep + tofDays).positionKm;
    const sol = solveLambert(r1, r2, tofDays * 86400, MU_SUN);
    assert.equal(sol.status, LAMBERT_STATUS.converged);
    const miss = dist(dopri(r1, sol.departureVelocityKmS, tofDays * 86400), r2);
    // DOPRI54 con relTol 1e-13 sobre ~1e8–1e9 km: cierre esperado < 1 km (≈1e-8 relativo). Kepler interno: < 1e-3 km.
    assert.ok(miss < 1, `TOF ${tofDays} d: cierre DOPRI54 ${miss} km`);
    assert.ok(sol.diagnostics.closurePositionKm < 1e-3, `cierre kepleriano ${sol.diagnostics.closurePositionKm} km`);
  }
});
test('K: convergencia, invariancia de escala y estabilidad numérica de Lambert', () => {
  const r1 = [1.2e8, 8.0e7, 1.0e5], r2 = [-1.9e8, 1.3e8, 4.0e6], t = 210 * 86400;
  const base = solveLambert(r1, r2, t, MU_SUN);
  assert.ok(base.diagnostics.iterations < 100 && base.diagnostics.timeOfFlightRelativeError < 1e-12);
  const k = 1e-3, scaled = solveLambert(r1.map(x => x * k), r2.map(x => x * k), t, MU_SUN * k ** 3);
  base.departureVelocityKmS.forEach((x, i) => near(scaled.departureVelocityKmS[i], x * k, 1e-12 * norm(base.departureVelocityKmS) * k, `escala v1[${i}]`));
  const loose = solveLambert(r1, r2, t, MU_SUN, { tolerance: 1e-10 });
  assert.ok(dist(loose.departureVelocityKmS, base.departureVelocityKmS) < 1e-6, 'resultado estable frente a la tolerancia');
  const s = stumpff(1e-4), sNeg = stumpff(-1e-4), s0 = stumpff(0);
  near(s.C, 0.5 - 1e-4 / 24 + 1e-8 / 720, 1e-15, 'serie C'); near(sNeg.S, 1 / 6 + 1e-4 / 120 + 1e-8 / 5040, 1e-15, 'serie S');
  near(stumpff(0.01).C, (1 - Math.cos(0.1)) / 0.01, 1e-12, 'forma cerrada C'); near(stumpff(-0.01).S, (Math.sinh(0.1) - 0.1) / 1e-3, 1e-12, 'forma cerrada S'); near(s0.C, 0.5, 0, 'C(0)');
  const kepler = propagateKepler(r1, base.departureVelocityKmS, t, MU_SUN);
  assert.ok(kepler.identityError < 1e-10, 'identidad f·ġ − ḟ·g = 1');
});
test('L: casos degenerados y entradas inválidas no producen trayectorias', () => {
  const r = [1.5e8, 0, 0];
  assert.equal(solveLambert(r, [-2.2e8, 0, 0], 2e7, MU_SUN).status, LAMBERT_STATUS.degenerate, 'Δθ = 180° exactos');
  assert.equal(solveLambert(r, [2.2e8, 0, 0], 2e7, MU_SUN).status, LAMBERT_STATUS.degenerate, 'Δθ = 0°');
  assert.equal(solveLambert([0, 0, 0], [2.2e8, 1, 0], 2e7, MU_SUN).status, LAMBERT_STATUS.degenerate, 'posición nula');
  for (const bad of [[r, [NaN, 1, 0], 1e7, MU_SUN], [r, [1, 2e8, 0], 0, MU_SUN], [r, [1, 2e8, 0], -5, MU_SUN], [r, [1, 2e8, 0], 1e7, 0], [r, [1, 2e8, 0], Infinity, MU_SUN]]) {
    const out = solveLambert(...bad); assert.equal(out.status, LAMBERT_STATUS.invalid); assert.equal(out.departureVelocityKmS, undefined);
  }
  assert.equal(solveLambert(r, [1e18, 1e18, 0], 1e7, MU_SUN).status, LAMBERT_STATUS.invalid, 'escala extrema fuera del rango admitido');
  const nearPi = solveLambert(r, [-2.2e8, 1e3, 0], 250 * 86400, MU_SUN);
  assert.equal(nearPi.diagnostics.nearColinear, true, 'casi colineal: señalado');
  const pro = solveLambert(r, [0, 2.2e8, 0], 200 * 86400, MU_SUN), retro = solveLambert(r, [0, 2.2e8, 0], 200 * 86400, MU_SUN, { direction: 'retrograde' });
  assert.ok(pro.diagnostics.transferAngleDeg < 180 && retro.diagnostics.transferAngleDeg > 180, 'la rama retrógrada recorre el arco largo');
  assert.ok(pro.departureVelocityKmS[1] > 0 && retro.departureVelocityKmS[1] < 0);
});

// ---------- M–O: v∞, C3 e inyección ----------
test('M–N: v∞ = v_transferencia − v_planeta y C3 = |v∞|²', () => {
  const ex = hyperbolicExcess([10, 32, 1], [1, 29, 0.5]);
  assert.deepEqual(ex.vectorKmS, [9, 3, 0.5]); near(ex.magnitudeKmS, Math.hypot(9, 3, 0.5), 1e-15, '|v∞|'); near(ex.c3Km2S2, 81 + 9 + 0.25, 1e-12, 'C3');
  assert.ok(ex.declinationDeg >= -90 && ex.declinationDeg <= 90 && ex.rightAscensionDeg >= 0 && ex.rightAscensionDeg < 360);
});
test('O: Δv ideal de inyección desde órbita circular (cónicas parcheadas)', () => {
  const r = EARTH_RADIUS_KM + 200, vc = Math.sqrt(MU_EARTH / r);
  near(injectionDeltaV(0, 200).deltaVKmS, (Math.SQRT2 - 1) * vc, 1e-12, 'v∞ = 0 → escape');
  near(injectionDeltaV(3, 200).deltaVKmS, Math.sqrt(9 + 2 * MU_EARTH / r) - vc, 1e-12, 'v∞ = 3 km/s');
  assert.throws(() => injectionDeltaV(-1, 200)); assert.throws(() => injectionDeltaV(3, 0));
  const cmp = compareRequirementsWithDesign({ injectionDeltaVKmS: 3.6 }, { deltaVMS: 1200 });
  assert.match(cmp.status, /INSUFICIENTE/);
  assert.match(compareRequirementsWithDesign({ injectionDeltaVKmS: 0.5 }, { deltaVMS: 1200 }).message, /no queda declarada viable/);
});

// ---------- P–S: búsquedas reales ----------
async function search(input) {
  const { options, issues } = validateInterplanetaryOptions(input);
  assert.deepEqual(issues, []);
  const w = await ephemeris().loadWindow([options.originId, options.destinationId], options.departureStartJdTdb, options.departureEndJdTdb + options.tofMaxDays);
  return { w, r: searchLaunchWindows(w, input) };
}
test('P: búsqueda de ventanas: cuadrícula completa, mejor candidato = mínimo de la cuadrícula, estados y límites', async () => {
  const { r } = await search({ destinationId: '499', departureStartUtc: '2028-09-01', departureEndUtc: '2029-02-01', departureStepDays: 5, tofMinDays: 150, tofMaxDays: 400, tofStepDays: 10 });
  assert.equal(r.grid.code.length, r.grid.nDep * r.grid.nTof); assert.equal(r.counts.total, r.counts.ok + r.counts.noCoverage + r.counts.noConvergence + r.counts.illConditioned);
  const minC3 = Math.min(...[...r.grid.c3].filter(Number.isFinite));
  assert.equal(r.best.c3Km2S2, minC3); assert.equal(r.bestLabel, CANDIDATE_STATUS.best); assert.match(r.note, /no es un óptimo global/);
  assert.ok(r.localMinima.includes(r.best));
  assert.ok(validateInterplanetaryOptions({ departureStartUtc: '2027-01-01', departureEndUtc: '2045-01-01', departureStepDays: 0.25, tofMinDays: 10, tofMaxDays: 400, tofStepDays: 0.25 }).issues.some(i => i.includes(String(MAX_GRID_CELLS))));
  const outside = await search({ destinationId: '599', departureStartUtc: '2044-06-01', departureEndUtc: '2044-12-01', departureStepDays: 30, tofMinDays: 500, tofMaxDays: 900, tofStepDays: 100 });
  assert.ok(outside.r.counts.noCoverage > 0, 'llegadas posteriores a 2045-12-31 se marcan sin cobertura');
  assert.ok([...outside.r.grid.code].every(c => [CELL.ok, CELL.noCoverage, CELL.illConditioned].includes(c)));
});
test('Q: Tierra → Marte (oportunidad 2028–2029, encontrada por la búsqueda)', async () => {
  const { w, r } = await search({ destinationId: '499', departureStartUtc: '2028-06-01', departureEndUtc: '2029-06-01', departureStepDays: 4, tofMinDays: 100, tofMaxDays: 450, tofStepDays: 4 });
  const b = r.best;
  assert.ok(b.c3Km2S2 > 7 && b.c3Km2S2 < 11, `C3 ${b.c3Km2S2}`);
  const dep = tdbToTimeScales(b.departureJdTdb).labelUtc;
  assert.ok(dep >= '2028-10' && dep <= '2029-02', `salida ${dep}`);
  const e = evaluateTransfer(w, { destinationId: '499', departureJdTdb: b.departureJdTdb, arrivalJdTdb: b.arrivalJdTdb, isBest: true });
  assert.equal(e.status, CANDIDATE_STATUS.best); assert.equal(e.completeness, CANDIDATE_STATUS.notEvaluated);
  assert.ok(e.lambert.diagnostics.closurePositionKm < 1e-3 && e.requirements.vInfArrivalKmS > 2 && e.requirements.vInfArrivalKmS < 6);
  assert.ok(e.injection.deltaVKmS > 3.4 && e.injection.deltaVKmS < 3.9);
});
test('R: Tierra → Venus (2027–2028)', async () => {
  const { r } = await search({ destinationId: '299', departureStartUtc: '2027-01-01', departureEndUtc: '2028-12-31', departureStepDays: 4, tofMinDays: 60, tofMaxDays: 250, tofStepDays: 4 });
  assert.ok(r.best.c3Km2S2 > 5 && r.best.c3Km2S2 < 14, `C3 ${r.best.c3Km2S2}`);
  assert.ok(r.best.tofDays >= 80 && r.best.tofDays <= 220);
});
test('S: Tierra → Júpiter: oportunidad directa idealizada (C3 alto, sin asistencias)', async () => {
  const { w, r } = await search({ destinationId: '599', departureStartUtc: '2028-01-01', departureEndUtc: '2029-12-31', departureStepDays: 6, tofMinDays: 500, tofMaxDays: 1300, tofStepDays: 20 });
  assert.ok(r.best.c3Km2S2 > 70 && r.best.c3Km2S2 < 90, `C3 ${r.best.c3Km2S2}`);
  const e = evaluateTransfer(w, { destinationId: '599', departureJdTdb: r.best.departureJdTdb, arrivalJdTdb: r.best.arrivalJdTdb });
  assert.ok(e.requirements.vInfArrivalKmS > 4 && e.requirements.vInfArrivalKmS < 8);
  assert.ok(e.limits.some(l => /asistencias gravitacionales/.test(l)));
});
test('S2: Mercurio, Saturno, Urano y Neptuno: el mismo método produce soluciones verificables en la cobertura', async () => {
  const cases = [
    { destinationId: '199', departureStartUtc: '2030-01-01', departureEndUtc: '2030-06-30', departureStepDays: 6, tofMinDays: 60, tofMaxDays: 200, tofStepDays: 10 },
    { destinationId: '699', departureStartUtc: '2030-01-01', departureEndUtc: '2030-12-31', departureStepDays: 15, tofMinDays: 1200, tofMaxDays: 2600, tofStepDays: 100 },
    { destinationId: '799', departureStartUtc: '2030-01-01', departureEndUtc: '2030-12-31', departureStepDays: 20, tofMinDays: 2500, tofMaxDays: 5000, tofStepDays: 250 },
    { destinationId: '899', departureStartUtc: '2030-01-01', departureEndUtc: '2030-12-31', departureStepDays: 20, tofMinDays: 3500, tofMaxDays: 5500, tofStepDays: 250 }];
  for (const c of cases) {
    const { r } = await search(c);
    assert.ok(r.counts.ok > 0 && r.best && r.best.closureKm < 1, `${c.destinationId}: sin soluciones verificables`);
    assert.equal(r.note.includes('BORDE'), r.best.atGridEdge, 'el borde de la cuadrícula se advierte');
  }
});

// ---------- T–U: invalidación ----------
test('T–U: un cambio de fechas o de destino invalida el resultado', async () => {
  const input = { destinationId: '499', departureStartUtc: '2028-10-01', departureEndUtc: '2028-12-31', departureStepDays: 10, tofMinDays: 150, tofMaxDays: 350, tofStepDays: 20 };
  const { r } = await search(input);
  assert.equal(isInterplanetaryResultCurrent(r, input), true);
  assert.equal(isInterplanetaryResultCurrent(r, { ...input, departureEndUtc: '2029-01-10' }), false, 'fecha');
  assert.equal(isInterplanetaryResultCurrent(r, { ...input, tofMaxDays: 360 }), false, 'tiempo de vuelo');
  assert.equal(isInterplanetaryResultCurrent(r, { ...input, destinationId: '299' }), false, 'destino');
  assert.equal(isInterplanetaryResultCurrent(r, { ...input, parkingAltitudeKm: 400 }), false, 'órbita de estacionamiento');
});

// ---------- V–W: reproducción y telemetría ----------
async function execution() {
  const { w, r } = await search({ destinationId: '499', departureStartUtc: '2028-11-01', departureEndUtc: '2028-12-31', departureStepDays: 5, tofMinDays: 200, tofMaxDays: 340, tofStepDays: 10 });
  const result = evaluateTransfer(w, { destinationId: '499', departureJdTdb: r.best.departureJdTdb, arrivalJdTdb: r.best.arrivalJdTdb, isBest: true });
  return createInterplanetaryExecution({ result, window: w, design: null });
}
test('V: reproducción determinista: el estado es función pura del instante y la nave sigue la cónica propagada', async () => {
  const ex = await execution();
  const t = 0.37 * ex.durationSeconds;
  const a = sampleInterplanetaryExecution(ex, t);
  sampleInterplanetaryExecution(ex, 0.9 * ex.durationSeconds); sampleInterplanetaryExecution(ex, 0.1 * ex.durationSeconds);
  const b = sampleInterplanetaryExecution(ex, t);
  assert.deepEqual(a.positionKm, b.positionKm); assert.deepEqual(a.moonPositionKm, b.moonPositionKm);
  const end = sampleInterplanetaryExecution(ex, ex.durationSeconds);
  assert.ok(dist(end.positionKm, ex.result.destinationState.positionKm) < 1e-3, 'llega a la posición efemérica del destino');
  assert.ok(dist(sampleInterplanetaryExecution(ex, 0).positionKm, ex.result.originState.positionKm) === 0, 'parte del centro de la Tierra (cónica heliocéntrica)');
  // La nave NO se mueve en línea recta entre planetas: a mitad de vuelo está lejos de la cuerda.
  const mid = sampleInterplanetaryExecution(ex, 0.5 * ex.durationSeconds).positionKm, r1 = ex.result.originState.positionKm, r2 = ex.result.destinationState.positionKm;
  assert.ok(dist(mid, r1.map((x, i) => (x + r2[i]) / 2)) > 0.05 * KM_PER_AU);
  assert.ok(ex.events[0].kind === 'departure' && ex.events.at(-1).kind === 'arrival');
  const clock = createPlaybackClock(ex.durationSeconds, { maxRate: INTERPLANETARY_MAX_RATE }); clock.setRate(30 * 86400); clock.play(); clock.advance(2);
  assert.equal(clock.snapshot().elapsedSeconds, 60 * 86400);
  assert.throws(() => createPlaybackClock(10).setRate(864000), /Velocidad temporal/, 'el reloj por defecto conserva su límite (Tierra–Luna, 12C–12F)');
});
test('W: telemetría derivada de los estados físicos, sin combustible ficticio', async () => {
  const ex = await execution();
  const s = sampleInterplanetaryExecution(ex, 0.5 * ex.durationSeconds), t = deriveInterplanetaryTelemetry(ex, s);
  near(t.derived.sunDistanceKm, norm(s.positionKm), 1e-6, 'distancia al Sol');
  near(t.derived.destinationDistanceKm, dist(s.positionKm, s.moonPositionKm), 1e-6, 'distancia al destino');
  near(t.requirements.c3Km2S2, ex.result.departureExcess.c3Km2S2, 0, 'C3');
  assert.match(t.time.tdb, /TDB$/); assert.match(t.time.utc, /UTC$/); assert.match(t.validation, /^12G aprobada en auditoría independiente \(Gemini\)/); // 17.1.1: 12G ya está aprobada (antes: «pendiente de auditoría»)
  assert.equal(JSON.stringify(t).includes('fuel'), false, 'no hay combustible consumido durante la cónica');
  assert.ok(t.provenance.solutions.includes('DE441') && t.provenance.solutions.includes('mar099'));
  const end = deriveInterplanetaryTelemetry(ex, sampleInterplanetaryExecution(ex, ex.durationSeconds));
  assert.ok(end.derived.destinationDistanceKm < 1e-3); near(end.derived.destinationRelativeSpeedKmS, ex.result.arrivalExcess.magnitudeKmS, 1e-9, 'v∞ de llegada');
});
test('Satélites: destinos identificados sin prometer una trayectoria completa', () => {
  const d = listMissionDestinations();
  assert.equal(d.planets.length, 7);
  assert.equal(d.satellites.length, 10, 'las diez lunas del registro multicuerpo');
  assert.match(d.satellites.find(s => s.id === '301').heliocentricLeg, /Planificador Tierra–Luna/);
  const europa = d.satellites.find(s => s.id === '502');
  assert.equal(europa.hostId, '599'); assert.ok(europa.pendingStages.length >= 3); assert.match(europa.localOperations, /OPERATIVO/);
  assert.equal(validateInterplanetaryOptions({ destinationId: '502' }).issues.some(i => /satélites requieren/.test(i)), true);
});
