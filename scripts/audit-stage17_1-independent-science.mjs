// 17.1 · Verificación científica independiente de la misión guiada Cassini → Marte (escenario A1) y de las efemérides.
// Las referencias (elementos aproximados de Standish/JPL, Kepler universal con funciones de Stumpff, ecuación del cohete,
// vis-viva, hipérbola de llegada, esfera de Laplace, TDB−UTC) están implementadas AQUÍ, sin reutilizar código del proyecto;
// el proyecto solo aporta los valores que se comprueban. Uso: node scripts/audit-stage17_1-independent-science.mjs
// Escribe evidence/stage17_1/independent-science.json. No modifica datos ni descarga nada.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
const imp = p => import(pathToFileURL(`${root}/${p}`).href);
const { createIntegratedExecution, sampleIntegratedExecution } = await imp('src/lab/IntegratedMissionPlayback.js');
const { createInterplanetaryEphemeris } = await imp('src/science/InterplanetaryEphemeris.js');
const { tdbToTimeScales } = await imp('src/science/AstrodynamicsTime.js');
const json = f => JSON.parse(readFileSync(f, 'utf8'));
const { historicalDesign } = await imp('src/lab/ProbeDesign.js');
const { INTEGRATED_SCENARIOS, integratedMissionInput, scenarioFormValues, refinementHalfSpanDays } = await imp('src/ui/IntegratedMissionPlanner.js');
const { computeIntegratedMission, ENCOUNTER_TARGETS } = await imp('src/lab/IntegratedMission.js');
const { refineTransferCandidate } = await imp('src/lab/InterplanetaryPlan.js');
const { datetimeLocalUtcToJdTdb } = await imp('src/science/AstrodynamicsTime.js');
// Misión A1 construida como IntegratedMissionPlanner.compute() en el navegador (la misma réplica que la prueba 17.1).
const ic = json('public/data/interplanetary-ephemerides-catalog-v1.json');
const catalog = { catalogVersion: 1, datasets: [...ic.datasets, ...json('public/data/encounter-ephemerides-catalog-v1.json').datasets] };
const eph = createInterplanetaryEphemeris({ catalog, loadJson: async f => json(`public/${f}`) });
const design = { ...historicalDesign('cassini'), id: 'flota-cassini' };
const v = scenarioFormValues(INTEGRATED_SCENARIOS.find(s => s.id === 'A1')), target = ENCOUNTER_TARGETS[v.destinationId];
let dep = datetimeLocalUtcToJdTdb(v.departureUtc), tof = v.tofDays;
const cE = eph.coverage('399'), cT = eph.coverage(target.ephemerisId), margin = Math.max(30, 0.02 * tof) + 140;
const helio = await eph.loadWindow(['399', target.ephemerisId], Math.max(cE.startJdTdb, cT.startJdTdb, dep - margin), Math.min(cE.endJdTdb, cT.endJdTdb, dep + tof + margin + 200));
if (v.refine) { const r = refineTransferCandidate(helio, { destinationId: target.ephemerisId, departureJdTdb: dep, tofDays: tof, criterion: 'c3', halfSpanDepartureDays: refinementHalfSpanDays(tof), halfSpanTofDays: refinementHalfSpanDays(tof) }); if (Number.isFinite(r.score)) { dep = r.departureJdTdb; tof = r.tofDays; } }
const m = computeIntegratedMission(integratedMissionInput({ ...v, destinationId: target.id, departureJdTdb: dep, tofDays: tof }, design), { helio, moons: null });
const mission = m;
const AU = 149597870.7, MU_SUN = 132712440041.279419, G0 = 9.80665, D2R = Math.PI / 180;
const sub = (a, b) => a.map((x, i) => x - b[i]), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], norm = a => Math.hypot(...a);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const out = [];
const report = (name, value, limit, unit, note = '') => { const ok = value <= limit; out.push({ ok, name, value, limit, unit, note }); };

// 1) Efemérides frente a elementos keplerianos aproximados de JPL (E. M. Standish, tabla 1, 1800–2050).
const STANDISH = {
  '199': [[0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593], [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081], 15, 1],
  '299': [[0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255], [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418], 20, 4],
  '399': [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0], [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0], 20, 6],
  '499': [[1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343], 40, 25],
  '599': [[5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106], 400, 600],
  '699': [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794], 600, 1500],
  '799': [[19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503], [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589], 50, 1000],
  '899': [[30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574], [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664], 10, 200]
};
function standish(id, jd) {
  const [el, rate] = STANDISH[id], T = (jd - 2451545.0) / 36525;
  const [a, e, I, L, wbar, node] = el.map((x, i) => x + rate[i] * T);
  const w = (wbar - node) * D2R, O = node * D2R, i = I * D2R;
  let M = ((L - wbar) % 360) * D2R; if (M > Math.PI) M -= 2 * Math.PI; if (M < -Math.PI) M += 2 * Math.PI;
  let E = M + e * Math.sin(M); for (let k = 0; k < 30; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(i), sI = Math.sin(i);
  return [(cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp, (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp, sw * sI * xp + cw * sI * yp].map(x => x * AU);
}
// Para los planetas exteriores los elementos de Standish describen el movimiento respecto al baricentro del sistema solar
// (con datos heliocéntricos aparece el desvío del Sol alrededor del baricentro, hasta ~1,2 millones de km). El Sol respecto al
// baricentro se estima con los GM de DE440 y las posiciones heliocéntricas de los ocho planetas.
// Criterio: < 900″ y < 0,5 % en distancia detecta cualquier error de marco, ejes, unidades u origen sin atribuir a Standish
// (aproximado) más precisión de la que tiene; los valores medidos se dan junto al error publicado de su tabla 1.
const GM = { '199': 22031.868551, '299': 324858.592, '399': 403503.235625, '499': 42828.375816, '599': 126712764.1, '699': 37940584.8418, '799': 5794556.4, '899': 6836527.10058 };
const ids = Object.keys(STANDISH), covAll = ids.map(id => eph.coverage(id));
const span = [Math.max(...covAll.map(c => c.startJdTdb)), Math.min(...covAll.map(c => c.endJdTdb))];
const allWin = await eph.loadWindow(ids, span[0], span[1]);
const muTotal = MU_SUN + Object.values(GM).reduce((x, y) => x + y, 0);
const sunWrtSsb = jd => ids.reduce((acc, id) => { const r = allWin.stateAt(id, jd).positionKm; return acc.map((x, i) => x - GM[id] * r[i] / muTotal); }, [0, 0, 0]);
const OUTER = new Set(['599', '699', '799', '899']);
for (const id of ids) {
  let maxAng = 0, maxRel = 0, samples = 0;
  for (let jd = span[0] + 0.37; jd < span[1]; jd += 61.3) {
    const s = allWin.stateAt(id, jd); if (s.status !== 'available') throw Error(`${id} sin estado en ${jd}`);
    const sun = OUTER.has(id) ? sunWrtSsb(jd) : [0, 0, 0], r = s.positionKm.map((x, i) => x + sun[i]), ref = standish(id, jd);
    maxAng = Math.max(maxAng, Math.acos(Math.min(1, dot(r, ref) / norm(r) / norm(ref))) / D2R * 3600);
    maxRel = Math.max(maxRel, Math.abs(norm(r) - norm(ref)) / norm(ref)); samples++;
  }
  const origin = OUTER.has(id) ? 'baricéntrico' : 'heliocéntrico';
  report(`Efeméride ${id} (${origin}) frente a Standish: separación angular máxima`, maxAng, 900, '″', `${samples} instantes 2026–2046; error publicado de la tabla 1 ≤ ${STANDISH[id][2]}″ (referencia aproximada)`);
  report(`Efeméride ${id} (${origin}) frente a Standish: diferencia relativa de distancia`, maxRel, 0.005, '', `error publicado ≤ ${STANDISH[id][3]}×1000 km`);
}

// 2) Kepler universal propio (Stumpff), para comprobar la cónica de crucero y la hipérbola de llegada.
function stumpff(z) {
  if (z > 1e-8) { const s = Math.sqrt(z); return [(1 - Math.cos(s)) / z, (s - Math.sin(s)) / (s * s * s)]; }
  if (z < -1e-8) { const s = Math.sqrt(-z); return [(Math.cosh(s) - 1) / -z, (Math.sinh(s) - s) / (s * s * s)]; }
  return [1 / 2 - z / 24, 1 / 6 - z / 120];
}
function kepler(r0v, v0v, dt, mu) {
  const r0 = norm(r0v), vr0 = dot(r0v, v0v) / r0, alpha = 2 / r0 - dot(v0v, v0v) / mu, sq = Math.sqrt(mu);
  let x = sq * Math.abs(alpha) * dt; if (!(alpha > 1e-12)) x = Math.sign(dt) * Math.sqrt(mu) * Math.abs(dt) / r0;
  for (let k = 0; k < 200; k++) {
    const z = alpha * x * x, [C, S] = stumpff(z);
    const F = r0 * vr0 / sq * x * x * C + (1 - alpha * r0) * x * x * x * S + r0 * x - sq * dt;
    const dF = r0 * vr0 / sq * x * (1 - alpha * x * x * S) + (1 - alpha * r0) * x * x * C + r0;
    const step = F / dF; x -= step; if (Math.abs(step) < 1e-12 * Math.max(1, Math.abs(x))) break;
  }
  const z = alpha * x * x, [C, S] = stumpff(z), f = 1 - x * x / r0 * C, g = dt - x * x * x / sq * S;
  const r = r0v.map((p, i) => f * p + g * v0v[i]), rn = norm(r);
  const fd = sq / (rn * r0) * (alpha * x * x * x * S - x), gd = 1 - x * x / rn * C;
  return { r, v: r0v.map((p, i) => fd * p + gd * v0v[i]) };
}
const ex = createIntegratedExecution({ result: mission, data: { helio, moons: null }, design });
const aim = mission.aim;
// Lambert: desde la posición de la Tierra a la salida, la velocidad de Lambert llega al punto de entrada en la esfera de influencia.
{
  const k = kepler(aim.departure.positionKm, aim.departure.velocityKmS, (aim.soi.jdTdb - aim.departure.jdTdb) * 86400, MU_SUN);
  const target = aim.soi.aimPositionKm;
  report('Lambert: llegada al punto de entrada en la esfera de influencia (Kepler propio)', norm(sub(k.r, target)), 1, 'km');
  const earth = helio.stateAt('399', aim.departure.jdTdb);
  const c3 = dot(sub(aim.departure.velocityKmS, earth.velocityKmS), sub(aim.departure.velocityKmS, earth.velocityKmS));
  report('C3 de salida = |v − v_Tierra|²', Math.abs(c3 - mission.departure.c3Km2S2), 1e-6, 'km²/s²', `C3 = ${c3.toFixed(4)} km²/s²`);
}
// Segmentos balísticos: Kepler propio frente a la reproducción (en el marco nativo de cada segmento).
for (const seg of mission.segments.filter(s => s.kind !== 'burn')) {
  let worst = 0;
  for (let f = 0.1; f <= 1.0001; f += 0.15) {
    const t = seg.startSeconds + f * (seg.endSeconds - seg.startSeconds);
    const ctx = seg.centralBodyId === '10' ? 'helio' : 'planet';
    const s = sampleIntegratedExecution(ex, t, ctx);
    const k = kepler(seg.initial.positionKm, seg.initial.velocityKmS, t - seg.startSeconds, seg.mu);
    worst = Math.max(worst, norm(sub(k.r, s.positionKm)));
  }
  report(`Tramo «${seg.label}» (${seg.centralName}): Kepler propio frente a la reproducción`, worst, 1, 'km');
}
// Maniobra de captura: ecuación del cohete y órbita final por vis-viva.
for (const mv of mission.maneuvers) {
  const seg = mission.segments.find(s => s.kind === 'burn');
  const isp = mission.vehicle.probe.engine.ispS;
  const m0 = seg.massKg;
  if (isp && m0) {
    const dvRocket = isp * G0 * Math.log(m0 / mv.massAfterKg) / 1000;
    report(`Maniobra «${mv.label}»: Δv = Isp·g₀·ln(m₀/m₁)`, Math.abs(dvRocket - mv.propulsiveDeltaVKmS), 1e-6, 'km/s', `Δv propulsivo ${mv.propulsiveDeltaVKmS.toFixed(4)} km/s, impulsivo ${mv.impulsiveDeltaVKmS.toFixed(4)}, pérdida gravitatoria ${mv.gravityLossKmS.toFixed(4)}`);
  } else out.push({ ok: null, name: `Maniobra «${mv.label}»: datos de motor`, value: JSON.stringify({ engine: mv.engine, massKg: seg?.massKg }), limit: '', unit: '' });
}
const end = sampleIntegratedExecution(ex, mission.durationSeconds, 'planet');
{
  const mu = mission.target.mu, r = norm(end.positionKm), v = norm(end.velocityKmS), energy = v * v / 2 - mu / r;
  const a = -mu / (2 * energy), h = norm(cross(end.positionKm, end.velocityKmS)), e = Math.sqrt(Math.max(0, 1 + 2 * energy * h * h / (mu * mu)));
  const rp = a * (1 - e), ra = a * (1 + e);
  report('Órbita final en Marte: periapsis (vis-viva propio) = el que declara el cálculo', Math.abs(rp - mission.maneuvers.at(-1).orbitAfter.periapsisRadiusKm), 0.01, 'km', `periapsis ${(rp - mission.target.radiusKm).toFixed(1)} km de altitud, apoapsis ${(ra - mission.target.radiusKm).toFixed(0)} km, e = ${e.toFixed(4)}`);
  report('Órbita final en Marte: apoapsis = objetivo de la captura', Math.abs(ra - mission.target.radiusKm - mission.profile.planet.captureBurns.at(-1).apoapsisAltitudeKm), 1, 'km');
  report('Órbita final en Marte: ligada (energía < 0)', energy < 0 ? 0 : 1, 0, '', `ε = ${energy.toFixed(4)} km²/s²`);
}
// Hipérbola de llegada: fórmulas cerradas.
{
  const ap = mission.approach, mu = mission.target.mu, rp = ap.periapsisTargetKm, vinf = ap.vInfKmS;
  const e = 1 + rp * vinf * vinf / mu, turn = 2 * Math.asin(1 / e) / D2R, B = rp * Math.sqrt(1 + 2 * mu / (rp * vinf * vinf));
  report('Hipérbola de llegada: excentricidad 1 + r_p·v∞²/μ', Math.abs(e - ap.eccentricity), 1e-6, '');
  report('Hipérbola de llegada: ángulo de giro 2·asin(1/e)', Math.abs(turn - ap.turnAngleDeg), 1e-6, '°');
  report('Hipérbola de llegada: parámetro de impacto B', Math.abs(B - ap.bMagnitudeKm), 1e-3, 'km');
  const ms = helio.stateAt('499', mission.arrivalJdTdb), aMars = 1 / (2 / norm(ms.positionKm) - dot(ms.velocityKmS, ms.velocityKmS) / MU_SUN);
  report('Esfera de influencia de Laplace a·(μ/μ☉)^(2/5) con el semieje mayor osculante', Math.abs(aMars * (mu / MU_SUN) ** 0.4 - ap.soiRadiusKm) / ap.soiRadiusKm, 0.01, '(relativo)', `${ap.soiRadiusKm.toFixed(0)} km`);
}
// Escalas de tiempo: TDB − UTC = 37 s (TAI−UTC desde 2017) + 32,184 s + término periódico (≤ 1,7 ms).
{
  const t = tdbToTimeScales(mission.departureJdTdb);
  report('TDB − UTC a la salida (2028)', Math.abs(t.tdbMinusUtcSeconds - 69.184), 0.002, 's', `${t.tdbMinusUtcSeconds.toFixed(4)} s`);
}
// Continuidad entre tramos (declarada por el propio cálculo).
report('Continuidad entre tramos: salto de posición', mission.continuity.maxPositionErrorKm, 1e-3, 'km');
for (const r of out) console.log(`${r.ok === null ? '·' : r.ok ? '✓' : '✗'} ${r.name}: ${typeof r.value === 'number' ? r.value.toPrecision(4) : r.value} ${r.unit} (límite ${r.limit}) ${r.note}`);
const passed = out.filter(r => r.ok).length, total = out.filter(r => r.ok !== null).length;
console.log(`\n${passed}/${total} comprobaciones dentro del límite`);
mkdirSync('evidence/stage17_1', { recursive: true });
writeFileSync('evidence/stage17_1/independent-science.json', JSON.stringify({ generatedAt: new Date().toISOString(), scenario: 'A1 Cassini → Marte', passed, total, checks: out }, null, 2));
if (passed !== total) process.exitCode = 1;
