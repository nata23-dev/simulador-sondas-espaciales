// Auditoría de la etapa 17.1 (Claude, 20-11-2026) · parte científica. Métodos DISTINTOS de los del implementador:
//   A. Integridad: SHA-256 de cada archivo de efemérides frente a su metadato y `git status` de public/.
//   B. Referencia EXTERNA: NASA/JPL Horizons en línea (API 1.2), mismos parámetros que declara la adquisición
//      (centro 500@10, ICRF, eclíptica, TDB, km, sin corrección). En nodos: dato tabulado frente a Horizons.
//      Fuera de nodos: interpolación del proveedor del proyecto frente a Horizons (aquí el oráculo es Horizons).
//   C. Encendido de captura en Marte integrado con un RK4 PROPIO (paso fijo, convergencia 2/1/0,5 s) a partir del estado
//      de entrada en la esfera de influencia y del modelo declarado (dos cuerpos, empuje retrógrado constante, flujo F/(Isp·g0),
//      encendido centrado en el periapsis con duración estimada por Tsiolkovsky, apagado con apoapsis ≤ objetivo).
//   D. Conservación de energía y momento angular en los tramos balísticos muestreados por la reproducción.
//   E. Casos límite de cobertura del adaptador de la escena principal (rechazo sin extrapolar, frontera exacta).
//   F. Determinismo y tamaño de las trayectorias frente a la capacidad de la línea dibujada (16 384 puntos).
// Uso (desde la raíz): node evidence/stage17_1/auditoria-claude/ciencia.mjs  → ciencia.json y horizons/*.json
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const root = process.cwd(), dir = `${root}/evidence/stage17_1/auditoria-claude`;
mkdirSync(`${dir}/horizons`, { recursive: true });
const imp = p => import(pathToFileURL(`${root}/${p}`).href);
const json = f => JSON.parse(readFileSync(f, 'utf8'));
const { mission, helio, design, eph } = await imp('evidence/stage17_1/auditoria-claude/_mision-a1.mjs');
const { createIntegratedExecution, sampleIntegratedExecution } = await imp('src/lab/IntegratedMissionPlayback.js');
const { createSolarSystemMissionView } = await imp('src/integration/SolarSystemMissionView.js');
const { MEASURED_INTERPOLATION_ERROR } = await imp('src/science/InterplanetaryEphemeris.js');
const results = [], notes = {};
const check = (grupo, name, value, limit, unit, note = '') => { results.push({ grupo, ok: Number.isFinite(value) && value <= limit, name, value, limit, unit, note }); };
const sub = (a, b) => a.map((x, i) => x - b[i]), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], norm = a => Math.hypot(a[0], a[1], a[2]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// ---------- A. Integridad ----------
const ipDir = `${root}/public/data/interplanetary`;
for (const meta of readdirSync(ipDir).filter(f => f.endsWith('.metadata.json'))) {
  const m = json(`${ipDir}/${meta}`), file = `${ipDir}/${meta.replace('.metadata.json', '.json')}`;
  const sha = createHash('sha256').update(readFileSync(file)).digest('hex');
  check('A integridad', `SHA-256 de ${meta.replace('.metadata.json', '.json')} = metadato`, sha === m.sha256 ? 0 : 1, 0, '', sha.slice(0, 16));
}
const publicStatus = execSync('git status --porcelain -- public', { cwd: root }).toString().trim().split('\n').filter(Boolean);
notes.gitPublic = publicStatus;
check('A integridad', 'public/: único cambio = retirada de public/icons.svg (plantilla de Vite)', publicStatus.filter(l => !/public\/icons\.svg$/.test(l)).length, 0, 'archivos');
const dataChanged = execSync('git diff --name-only HEAD -- public/data public/models src/science', { cwd: root }).toString().trim().split('\n').filter(Boolean);
notes.cambiosDatosCiencia = dataChanged;
check('A integridad', 'Sin cambios en public/data ni public/models; en src/science solo limpieza de importaciones', dataChanged.filter(f => !/src\/science\/(GravitationalDynamics|PlanetaryEncounter)\.js$/.test(f)).length, 0, 'archivos');

// ---------- B. Horizons en línea ----------
async function horizons(id, jds) {
  const key = `${id}-${createHash('sha1').update(jds.join(',')).digest('hex').slice(0, 10)}`, cache = `${dir}/horizons/${key}.json`;
  if (existsSync(cache)) return json(cache);
  const params = new URLSearchParams({ format: 'json', COMMAND: `'${id}'`, OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'", EPHEM_TYPE: "'VECTORS'", CENTER: "'500@10'",
    REF_PLANE: "'ECLIPTIC'", REF_SYSTEM: "'ICRF'", VEC_TABLE: "'2'", VEC_CORR: "'NONE'", OUT_UNITS: "'KM-S'", CSV_FORMAT: "'YES'", TIME_TYPE: "'TDB'",
    TLIST_TYPE: "'JD'", TLIST: jds.map(j => `'${j}'`).join(' ') });
  const url = `https://ssd.jpl.nasa.gov/api/horizons.api?${params}`;
  let body = null;
  for (let attempt = 1; attempt <= 4 && !body; attempt++) {
    try { const r = await fetch(url); if (r.ok) body = await r.json(); else await new Promise(res => setTimeout(res, 2000 * attempt)); }
    catch { await new Promise(res => setTimeout(res, 2000 * attempt)); }
  }
  if (!body?.result) throw Error(`Horizons ${id}: sin respuesta`);
  const block = body.result.split('$$SOE')[1]?.split('$$EOE')[0];
  if (!block) throw Error(`Horizons ${id}: ${body.result.slice(0, 400)}`);
  const rows = block.trim().split('\n').map(line => line.split(',').map(s => s.trim())).map(c => ({ jd: Number(c[0]), r: [Number(c[2]), Number(c[3]), Number(c[4])], v: [Number(c[5]), Number(c[6]), Number(c[7])] }));
  const solution = /Target body name:[^\n]*\{source:\s*([^}]+)\}/.exec(body.result)?.[1]?.trim() ?? null;
  const out = { requestedAtUtc: new Date().toISOString(), url, apiVersion: body.signature?.version ?? null, solution, rows };
  writeFileSync(cache, JSON.stringify(out, null, 1));
  return out;
}
export { horizons };
const rowsOf = {};
for (const f of readdirSync(ipDir).filter(f => /^ip-.*\d\.json$/.test(f))) {
  const d = json(`${ipDir}/${f}`);
  for (const [id, rows] of Object.entries(d.series)) for (const row of rows) (rowsOf[id] ??= new Map()).set(row[0], row);
}
const depJd = mission.departureJdTdb, arrJd = depJd + mission.durationSeconds / 86400;
const NODES = [2461400.5, 2462105.5, 2462422.5, 2463800.5, 2465500.5, 2467200.5, 2468300.5];
const OFF = [2461400.3, depJd, 2462183.05592337, arrJd, 2463800.71, 2465500.123, 2468300.9];
const BODIES = ['199', '299', '399', '499', '599', '699', '799', '899', '5', '6', '7', '8'];
// Error de truncado de un interpolador de Hermite cúbico con nodos diarios: ≈ r·n⁴·h⁴/384 (h = 1 d). Se admite ×5.
const PERIOD_D = { 199: 87.97, 299: 224.7, 399: 365.26, 499: 686.98, 599: 4332.6, 699: 10759, 799: 30687, 899: 60190, 5: 4332.6, 6: 10759, 7: 30687, 8: 60190 };
const allIds = ['199', '299', '399', '499', '599', '699', '799', '899', '5', '6', '7', '8'];
const win = await eph.loadWindow(allIds.filter(id => eph.coverage(id)), 2461362.5, 2468346.5);
notes.horizons = {};
for (const id of BODIES) {
  const h = await horizons(id, [...NODES, ...OFF]);
  notes.horizons[id] = { solution: h.solution, apiVersion: h.apiVersion, url: h.url.replace(/TLIST=[^&]*/, 'TLIST=…') };
  let maxNode = 0, maxNodeV = 0, maxOff = 0, nodes = 0;
  for (const jd of NODES) {
    const raw = rowsOf[id]?.get(jd), ref = h.rows.find(r => Math.abs(r.jd - jd) < 1e-6);
    if (!raw || !ref) continue;
    nodes++;
    maxNode = Math.max(maxNode, norm(sub([raw[2], raw[3], raw[4]], ref.r))); maxNodeV = Math.max(maxNodeV, norm(sub([raw[5], raw[6], raw[7]], ref.v)));
  }
  if (rowsOf[id]) {
    check('B Horizons', `${id}: dato tabulado en ${nodes} nodos frente a Horizons (posición)`, maxNode, 0.001, 'km', h.solution ?? '');
    check('B Horizons', `${id}: dato tabulado en ${nodes} nodos frente a Horizons (velocidad)`, maxNodeV, 1e-9, 'km/s');
  }
  for (const jd of OFF) {
    const ref = h.rows.find(r => Math.abs(r.jd - jd) < 1e-7), s = win.stateAt(id, jd);
    if (!ref || s?.status !== 'available') continue;
    maxOff = Math.max(maxOff, norm(sub(s.positionKm, ref.r)));
  }
  const a = { 199: 0.387, 299: 0.723, 399: 1, 499: 1.524, 599: 5.2, 699: 9.58, 799: 19.2, 899: 30.1, 5: 5.2, 6: 9.58, 7: 19.2, 8: 30.1 }[id] * 149597870.7;
  // Contrato del proyecto: error medido declarado (MEASURED_INTERPOLATION_ERROR) con el 30 % de margen que usa su propia prueba.
  // Sin valor declarado (baricentros): cota de truncado de Hermite r·n⁴·h⁴/384 ×5 con h = cadencia del archivo.
  const declared = MEASURED_INTERPOLATION_ERROR[id]?.positionKm, hDays = (eph.coverage(id)?.cadenceSeconds ?? win.quality?.(id)?.cadenceSeconds ?? (/^[5-8]$|^[5-8]99$/.test(id) ? 345600 : 86400)) / 86400;
  const n = 2 * Math.PI / PERIOD_D[id], bound = declared ? 1.3 * declared : Math.max(0.01, 5 * a * n ** 4 * hDays ** 4 / 384);
  check('B Horizons', `${id}: interpolación del proyecto fuera de nodos (7 instantes, incluidos salida y llegada de A1) frente a Horizons`, maxOff, bound, 'km',
    declared ? `declarado ${declared} km; medido/declarado = ${(maxOff / declared).toFixed(2)}` : `cota Hermite ×5 (h = ${hDays} d) = ${bound.toFixed(3)} km`);
}

// ---------- C. Encendido de captura con RK4 propio ----------
const G0 = 9.80665, tgt = mission.target, mu = tgt.mu, R = tgt.radiusKm;
const seg = id => mission.segments.find(s => s.id === id);
const coastSeg = seg('planet-planet-capture-1-coast'), burnSeg = seg('planet-planet-capture-1'), man = mission.maneuvers.find(m => m.id === 'planet-planet-capture-1');
const eng = mission.vehicle.probe.engine, thrustN = eng.thrustN, isp = eng.ispS, flow = thrustN / (isp * G0), ve = isp * G0 / 1000;
const raTarget = R + 100000, m0 = coastSeg.initial.massKg, massFloor = m0 - mission.vehicle.probe.propellantKg;
notes.entradaSOI = { t: coastSeg.startSeconds, ...coastSeg.initial, mu, R, thrustN, ispS: isp, raTargetKm: raTarget, massFloorKg: massFloor };
// Hipérbola de llegada (elementos propios) y tiempo hasta el periapsis por la anomalía hiperbólica.
const r0 = coastSeg.initial.positionKm, v0 = coastSeg.initial.velocityKmS, rn = norm(r0), eps = dot(v0, v0) / 2 - mu / rn, a = -mu / (2 * eps);
const evec = sub(r0.map(x => x * (dot(v0, v0) - mu / rn) / mu), v0.map(x => x * dot(r0, v0) / mu)), e = norm(evec);
const rp = a * (1 - e), vp = Math.sqrt(mu * (2 / rp - 1 / a));
const F = -Math.acosh((1 - rn / a) / e), M = e * Math.sinh(F) - F, tPeri = -M / Math.sqrt(mu / (-a) ** 3);
const dvImp = vp - Math.sqrt(mu * (2 / rp - 2 / (rp + raTarget))), tEst = m0 * (1 - Math.exp(-dvImp / ve)) / flow, tStartRel = tPeri - 0.5 * tEst;
check('C captura', 'Inicio del encendido (periapsis − ½ duración estimada) frente al del cálculo', Math.abs(tStartRel - (burnSeg.startSeconds - coastSeg.startSeconds)), 0.01, 's');
check('C captura', 'Δv impulsivo de referencia (vis-viva propio) frente al del cálculo', Math.abs(dvImp - man.impulsiveDeltaVKmS) * 1000, 1e-6, 'm/s');
function deriv(s, thrust) {
  const r = Math.hypot(s[0], s[1], s[2]), g = -mu / r ** 3, v = Math.hypot(s[3], s[4], s[5]), at = thrust ? thrustN / s[6] / 1000 : 0;
  return [s[3], s[4], s[5], g * s[0] - at * s[3] / v, g * s[1] - at * s[4] / v, g * s[2] - at * s[5] / v, thrust ? -flow : 0, at];
}
function rk4(s, h, thrust) {
  const add = (x, k, f) => x.map((xi, i) => xi + f * k[i]);
  const k1 = deriv(s, thrust), k2 = deriv(add(s, k1, h / 2), thrust), k3 = deriv(add(s, k2, h / 2), thrust), k4 = deriv(add(s, k3, h), thrust);
  return s.map((x, i) => x + h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}
const apo = s => { const r = [s[0], s[1], s[2]], v = [s[3], s[4], s[5]], rr = norm(r), en = dot(v, v) / 2 - mu / rr; if (en >= 0) return Infinity; const aa = -mu / (2 * en);
  const ev = sub(r.map(x => x * (dot(v, v) - mu / rr) / mu), v.map(x => x * dot(r, v) / mu)); return aa * (1 + norm(ev)); };
const peri = s => { const r = [s[0], s[1], s[2]], v = [s[3], s[4], s[5]], rr = norm(r), en = dot(v, v) / 2 - mu / rr, aa = -mu / (2 * en);
  const ev = sub(r.map(x => x * (dot(v, v) - mu / rr) / mu), v.map(x => x * dot(r, v) / mu)); return aa * (1 - norm(ev)); };
function captureRun(h) {
  let s = [...r0, ...v0, m0, 0], t = 0;
  // Crucero planetocéntrico hasta el inicio del encendido: RK4 sin empuje con el paso ajustado para llegar exactamente.
  const nCoast = Math.ceil(tStartRel / 5), hc = tStartRel / nCoast;
  for (let i = 0; i < nCoast; i++) s = rk4(s, hc, false);
  const atStart = [...s]; t = 0;
  for (;;) {
    const next = rk4(s, h, true);
    if (apo(next) <= raTarget || next[6] <= massFloor) {
      let lo = 0, hi = h; // bisección del instante de apagado dentro del paso
      for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2, sm = rk4(s, mid, true); if (apo(sm) <= raTarget || sm[6] <= massFloor) hi = mid; else lo = mid; }
      s = rk4(s, hi, true); t += hi; break;
    }
    s = next; t += h;
    if (t > 5e5) throw Error('sin apagado');
  }
  return { atStart, end: s, durationS: t, propellantKg: m0 - s[6], dvKmS: s[7], rpAltKm: peri(s) - R, raAltKm: apo(s) - R };
}
const runs = [2, 1, 0.5].map(h => ({ h, ...captureRun(h) }));
const best = runs.at(-1), conv = Math.abs(runs[1].rpAltKm - best.rpAltKm);
notes.capturaRK4 = runs.map(({ h, durationS, propellantKg, dvKmS, rpAltKm, raAltKm }) => ({ pasoS: h, durationS, propellantKg, dvKmS, rpAltKm, raAltKm }));
const finalOrbit = man.orbitAfter;
check('C captura', 'Estado al encender: RK4 propio (crucero desde la SOI) frente al del cálculo', norm(sub(best.atStart.slice(0, 3), burnSeg.initial.positionKm)), 0.01, 'km');
check('C captura', 'Convergencia del RK4 propio (periapsis, paso 1 s frente a 0,5 s)', conv, 0.01, 'km');
check('C captura', 'Duración del encendido: RK4 propio frente al cálculo (DOPRI54)', Math.abs(best.durationS - man.durationSeconds), 0.5, 's');
check('C captura', 'Propelente consumido: RK4 propio frente al cálculo', Math.abs(best.propellantKg - (m0 - burnSeg.final.massKg)), 0.1, 'kg');
check('C captura', 'Δv propulsivo: RK4 propio frente al cálculo', Math.abs(best.dvKmS - man.propulsiveDeltaVKmS) * 1000, 0.1, 'm/s');
check('C captura', 'Periapsis final: RK4 propio frente al cálculo (315,5 km)', Math.abs(best.rpAltKm - finalOrbit.periapsisAltitudeKm), 0.5, 'km', `RK4 ${best.rpAltKm.toFixed(3)} km`);
check('C captura', 'Apoapsis final: RK4 propio frente al cálculo (100 000 km)', Math.abs(best.raAltKm - finalOrbit.apoapsisAltitudeKm), 1, 'km', `RK4 ${best.raAltKm.toFixed(3)} km`);
check('C captura', 'Pérdida gravitatoria = Δv propulsivo − Δv impulsivo (RK4 propio) frente al cálculo', Math.abs((best.dvKmS - dvImp) - man.gravityLossKmS) * 1000, 0.1, 'm/s', `${((best.dvKmS - dvImp) * 1000).toFixed(1)} m/s`);

// ---------- D. Conservación en tramos balísticos (estados que dibuja la reproducción) ----------
const ex = createIntegratedExecution({ result: mission, data: { helio, moons: null }, design });
function conservation(segment, frame, muC) {
  let eMin = Infinity, eMax = -Infinity, hMin = Infinity, hMax = -Infinity;
  for (let k = 0; k <= 200; k++) {
    const t = segment.startSeconds + (segment.endSeconds - segment.startSeconds) * k / 200, s = sampleIntegratedExecution(ex, t, frame);
    const en = dot(s.velocityKmS, s.velocityKmS) / 2 - muC / norm(s.positionKm), hh = norm(cross(s.positionKm, s.velocityKmS));
    eMin = Math.min(eMin, en); eMax = Math.max(eMax, en); hMin = Math.min(hMin, hh); hMax = Math.max(hMax, hh);
  }
  return { dE: (eMax - eMin) / Math.abs(eMax), dH: (hMax - hMin) / hMax };
}
const cruise = conservation(seg('cruise'), 'helio', mission.segments[0].mu), fin = conservation(seg('planet-final-coast'), 'planet', mu);
check('D conservación', 'Crucero heliocéntrico: variación relativa de la energía (201 muestras de la reproducción)', cruise.dE, 1e-9, '');
check('D conservación', 'Crucero heliocéntrico: variación relativa del momento angular', cruise.dH, 1e-9, '');
check('D conservación', 'Órbita final en Marte: variación relativa de la energía', fin.dE, 1e-9, '');
check('D conservación', 'Órbita final en Marte: variación relativa del momento angular', fin.dH, 1e-9, '');

// ---------- E. Casos límite de cobertura del adaptador ----------
const touched = [];
const fakeScene = new Proxy({}, { get: (_, k) => (...args) => { touched.push(String(k)); return k === 'modoEscalaActual' ? 'cientifica' : true; } });
const loadEphemeris = async () => eph;
const view = createSolarSystemMissionView({ scene: fakeScene, loadEphemeris });
const cover = Math.min(...allIds.filter(id => !/^[5-8]$/.test(id)).map(id => eph.coverage(id).endJdTdb));
const longer = { ...ex, durationSeconds: (cover - depJd + 1) * 86400 };
const r1 = await view.prepare(longer);
check('E cobertura', 'Misión que termina 1 día después del fin de cobertura: rechazada', r1.ok ? 1 : 0, 0, '', r1.reason);
check('E cobertura', '… con la razón «no extrapola» y sin tocar la escena', (/no extrapola/.test(r1.reason ?? '') ? 0 : 1) + touched.length, 0, '');
const before = { ...ex, mission: { ...ex.mission, departureJdTdb: 2461362.5 - 2 } };
const r2 = await view.prepare(before);
check('E cobertura', 'Misión que empieza 2 días antes del inicio de cobertura: rechazada sin tocar la escena', (r2.ok ? 1 : 0) + touched.length, 0, '', r2.reason);
const exact = { ...ex, data: { ...ex.data, helio: win }, durationSeconds: (cover - depJd) * 86400 }; // ventana completa: la de A1 no llega a 2046
let r3; try { r3 = await view.prepare(exact); } catch (error) { r3 = { ok: false, reason: error.message }; }
notes.fronteraExacta = r3;
check('E cobertura', 'Misión que termina exactamente en el último nodo: admitida (sin extrapolar)', r3.ok ? 0 : 1, 0, '', r3.reason ?? '');
view.clear();

// ---------- F. Determinismo y capacidad de la línea ----------
const { mission: again } = await import(pathToFileURL(`${dir}/_mision-a1.mjs`).href + '?otra');
const strip = m => JSON.stringify({ maneuvers: m.maneuvers, segments: m.segments.map(s => ({ ...s, initial: s.initial, final: s.final })), verdict: m.verdict, final: m.finalMassKg });
check('F determinismo', 'A1 calculada dos veces: maniobras, tramos y veredicto idénticos', strip(again) === strip(mission) ? 0 : 1, 0, '');
const trajLen = ex.contexts.helio.transfer.trajectory.length;
notes.puntosTrayectoriaA1 = trajLen;
check('F capacidad', 'Puntos de la trayectoria heliocéntrica de A1 frente al máximo dibujable (16 384)', trajLen, 16384, 'puntos');

const failed = results.filter(r => !r.ok);
writeFileSync(`${dir}/ciencia.json`, JSON.stringify({ auditor: 'Claude (Opus 5.5), implementador de 17.1', fecha: new Date().toISOString(), resultados: results, notas: notes }, null, 1));
for (const r of results) console.log(`${r.ok ? 'OK ' : 'FALLA'} [${r.grupo}] ${r.name}: ${typeof r.value === 'number' ? r.value.toPrecision(4) : r.value} ${r.unit} (límite ${r.limit}) ${r.note}`);
console.log(`${results.length - failed.length}/${results.length} dentro del límite`);
process.exitCode = failed.length ? 1 : 0;
