// Auditoría de la etapa 17.1 (Claude) · lo que DIBUJA la escena principal frente a referencias independientes, en los instantes
// exactos que registró navegador.mjs (Chrome con GPU real):
//   · planetas: posición de la escena → km con la conversión inversa (x, −z, y)·AU/32, frente a NASA/JPL Horizons en línea en esa
//     misma época TDB (no frente al proveedor del proyecto);
//   · sonda en crucero: frente a un RK4 propio (paso 600 s) desde el estado de salida calculado (μ☉ DE440);
//   · sonda junto a Marte: (sonda − Marte) de la escena frente al RK4 propio planetocéntrico (crucero desde la SOI, encendido
//     retrógrado y órbita final), independiente de las efemérides.
// Uso (desde la raíz, después de navegador.mjs): node evidence/stage17_1/auditoria-claude/comparar-escena.mjs → escena.json
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const root = process.cwd(), dir = `${root}/evidence/stage17_1/auditoria-claude`;
const json = f => JSON.parse(readFileSync(f, 'utf8'));
const { mission } = await import(pathToFileURL(`${dir}/_mision-a1.mjs`).href);
const { MEASURED_INTERPOLATION_ERROR } = await import(pathToFileURL(`${root}/src/science/InterplanetaryEphemeris.js`).href);
const nav = json(`${dir}/navegador.json`), samples = nav.checks.muestras;
// Duración de la misión calculada en Chrome (la regresión con GPU la registró al llegar): la de Node difiere por la tolerancia del refinamiento.
const browserDuration = json(`${root}/evidence/stage17_1/gpu/stage17-browser-scene.json`).checks.scene1366x768.llegada.mission.elapsedSeconds;
const DURATION_SHIFT = browserDuration - mission.durationSeconds;
if (!samples?.length) throw Error('navegador.json sin muestras');
const AU = 149597870.7, toKm = p => [p[0] / 32 * AU, -p[2] / 32 * AU, p[1] / 32 * AU];
const sub = (a, b) => a.map((x, i) => x - b[i]), norm = a => Math.hypot(a[0], a[1], a[2]), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const results = [], check = (name, value, limit, unit, note = '') => results.push({ ok: Number.isFinite(value) && value <= limit, name, value, limit, unit, note });

async function horizons(id, jds) {
  const key = `${id}-${createHash('sha1').update(jds.join(',')).digest('hex').slice(0, 10)}`, cache = `${dir}/horizons/${key}.json`;
  if (existsSync(cache)) return json(cache);
  const params = new URLSearchParams({ format: 'json', COMMAND: `'${id}'`, OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'", EPHEM_TYPE: "'VECTORS'", CENTER: "'500@10'",
    REF_PLANE: "'ECLIPTIC'", REF_SYSTEM: "'ICRF'", VEC_TABLE: "'2'", VEC_CORR: "'NONE'", OUT_UNITS: "'KM-S'", CSV_FORMAT: "'YES'", TIME_TYPE: "'TDB'",
    TLIST_TYPE: "'JD'", TLIST: jds.map(j => `'${j}'`).join(' ') });
  const url = `https://ssd.jpl.nasa.gov/api/horizons.api?${params}`;
  let body = null;
  for (let attempt = 1; attempt <= 4 && !body; attempt++) {
    try { const r = await fetch(url); if (r.ok) body = await r.json(); } catch { /* reintento */ }
    if (!body) await new Promise(res => setTimeout(res, 2000 * attempt));
  }
  const block = body?.result?.split('$$SOE')[1]?.split('$$EOE')[0];
  if (!block) throw Error(`Horizons ${id}: ${body?.result?.slice(0, 300)}`);
  const rows = block.trim().split('\n').map(l => l.split(',').map(s => s.trim())).map(c => ({ jd: Number(c[0]), r: [Number(c[2]), Number(c[3]), Number(c[4])] }));
  const out = { requestedAtUtc: new Date().toISOString(), url, rows };
  writeFileSync(cache, JSON.stringify(out, null, 1));
  return out;
}

// Planetas de la escena frente a Horizons (Horizons da hasta 16 cifras: las épocas se piden tal cual las dio el navegador).
const IDS = { Mercurio: '199', Venus: '299', Tierra: '399', Marte: '499', Jupiter: '599', Saturno: '699', Urano: '799', Neptuno: '899' };
const jds = samples.map(s => s.jdTdb);
for (const [name, id] of Object.entries(IDS)) {
  const h = await horizons(id, jds);
  let worst = 0;
  for (const s of samples) {
    const ref = h.rows.reduce((best, r) => (Math.abs(r.jd - s.jdTdb) < Math.abs(best.jd - s.jdTdb) ? r : best));
    if (Math.abs(ref.jd - s.jdTdb) * 86400 > 0.01) throw Error(`${name}: Horizons devolvió JD ${ref.jd} para ${s.jdTdb}`);
    worst = Math.max(worst, norm(sub(toKm(s.planetas[name]), ref.r)));
  }
  const limit = 1.3 * MEASURED_INTERPOLATION_ERROR[id].positionKm + 0.001;
  check(`${name}: escena principal frente a Horizons en ${samples.length} instantes (crucero, encendido, órbita final)`, worst, limit, 'km', `límite = 1,3 × error de interpolación declarado`);
}

// Sonda: RK4 propio.
const MU_SUN = mission.segments[0].mu, tgt = mission.target, mu = tgt.mu, G0 = 9.80665;
function rk4(f, s, h) {
  const add = (x, k, c) => x.map((xi, i) => xi + c * k[i]);
  const k1 = f(s), k2 = f(add(s, k1, h / 2)), k3 = f(add(s, k2, h / 2)), k4 = f(add(s, k3, h));
  return s.map((x, i) => x + h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}
const twoBody = m => s => { const r = Math.hypot(s[0], s[1], s[2]), g = -m / r ** 3; return [s[3], s[4], s[5], g * s[0], g * s[1], g * s[2], 0]; };
function propagate(f, s, t, hMax) { const n = Math.max(1, Math.ceil(Math.abs(t) / hMax)), h = t / n; for (let i = 0; i < n; i++) s = rk4(f, s, h); return s; }
const cruise = mission.segments.find(s => s.id === 'cruise'), coast = mission.segments.find(s => s.id === 'planet-planet-capture-1-coast');
const burn = mission.segments.find(s => s.id === 'planet-planet-capture-1'), eng = mission.vehicle.probe.engine, flow = eng.thrustN / (eng.ispS * G0);
const raTarget = tgt.radiusKm + 100000;
const apo = s => { const r = [s[0], s[1], s[2]], v = [s[3], s[4], s[5]], rr = norm(r), v2 = dot(v, v), en = v2 / 2 - mu / rr; if (en >= 0) return Infinity;
  const e = norm(sub(r.map(x => x * (v2 - mu / rr) / mu), v.map(x => x * dot(r, v) / mu))); return -mu / (2 * en) * (1 + e); };
const thrust = s => { const r = Math.hypot(s[0], s[1], s[2]), g = -mu / r ** 3, v = Math.hypot(s[3], s[4], s[5]), a = eng.thrustN / s[6] / 1000;
  return [s[3], s[4], s[5], g * s[0] - a * s[3] / v, g * s[1] - a * s[4] / v, g * s[2] - a * s[5] / v, -flow]; };
// Encendido propio: empieza donde lo declara el cálculo (ya auditado en ciencia.mjs) y se apaga con apoapsis ≤ objetivo.
function planetocentricAt(t) {
  let s = [...coast.initial.positionKm, ...coast.initial.velocityKmS, coast.initial.massKg];
  const tBurn = burn.startSeconds;
  if (t <= tBurn) return propagate(twoBody(mu), s, t - coast.startSeconds, 5);
  s = propagate(twoBody(mu), s, tBurn - coast.startSeconds, 5);
  let tt = tBurn; const h = 0.5;
  while (tt < t) {
    const step = Math.min(h, t - tt), next = rk4(thrust, s, step);
    if (apo(next) <= raTarget) { let lo = 0, hi = step; for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (apo(rk4(thrust, s, mid)) <= raTarget) hi = mid; else lo = mid; }
      s = rk4(thrust, s, hi); tt += hi; return propagate(twoBody(mu), s, t - tt, 5); }
    s = next; tt += step;
  }
  return s;
}
// (1) Autoconsistencia SIN la réplica de Node: las tres posiciones de crucero DIBUJADAS deben estar en una misma cónica kepleriana
//     alrededor del Sol y en los instantes correctos. Método de Gibbs (velocidad en r2 a partir de r1, r2, r3) + RK4 propio a t1 y t3.
const cr = samples.filter(x => x.elapsed <= cruise.endSeconds).map(x => ({ t: x.elapsed, r: toKm(x.sonda) }));
const crossP = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], scale = (a, k) => a.map(x => x * k), add3 = (a, b) => a.map((x, i) => x + b[i]);
{
  const [p1, p2, p3] = cr, r1 = p1.r, r2 = p2.r, r3 = p3.r, n1 = norm(r1), n2 = norm(r2), n3 = norm(r3);
  const N = add3(add3(scale(crossP(r2, r3), n1), scale(crossP(r3, r1), n2)), scale(crossP(r1, r2), n3));
  const D = add3(add3(crossP(r1, r2), crossP(r2, r3)), crossP(r3, r1));
  const S = add3(add3(scale(r1, n2 - n3), scale(r2, n3 - n1)), scale(r3, n1 - n2));
  const v2 = scale(add3(scale(crossP(D, r2), 1 / n2), S), Math.sqrt(MU_SUN / (norm(N) * norm(D))));
  const coplanar = Math.abs(dot(crossP(r1, r2), r3)) / (norm(crossP(r1, r2)) * n3);
  const back = propagate(twoBody(MU_SUN), [...r2, ...v2, 0], -(p2.t - p1.t), 600), fwd = propagate(twoBody(MU_SUN), [...r2, ...v2, 0], p3.t - p2.t, 600);
  check('Sonda en crucero: las 3 posiciones dibujadas son coplanarias con el Sol', coplanar, 1e-9, '');
  check('Sonda en crucero: Gibbs + RK4 propio desde la posición dibujada intermedia reproduce la primera (−100 d) con μ☉', norm(sub(back.slice(0, 3), r1)), 0.05, 'km');
  check('Sonda en crucero: … y la última (+150 d)', norm(sub(fwd.slice(0, 3), r3)), 0.05, 'km');
}
// (2) Frente a la réplica de Node (informativo): el navegador refina la salida con Nelder–Mead (tolerancia 1e-6 d ≈ 0,09 s) y converge
//     0,070 s después que Node; la llegada se desplaza ${Δduración}. Junto a Marte la diferencia debe ser ≈ |v|·Δt.
for (const s of samples) {
  if (s.elapsed >= coast.startSeconds) {
    const rel = sub(toKm(s.sonda), toKm(s.planetas.Marte)), ref = planetocentricAt(s.elapsed), dt = DURATION_SHIFT;
    const predicted = norm(ref.slice(3, 6)) * dt, measured = norm(sub(rel, ref.slice(0, 3)));
    check(`Sonda (${s.label}): (sonda − Marte) dibujada frente a RK4 propio = |v|·Δt del desplazamiento de ${dt.toFixed(3)} s (±20 %)`, Math.abs(measured - predicted) / predicted, 0.2, '',
      `medido ${measured.toFixed(3)} km, previsto ${predicted.toFixed(3)} km, a ${norm(rel).toFixed(0)} km del centro de Marte`);
  }
  check(`Sin error de la vista en «${s.label}»`, s.error ? 1 : 0, 0, '', s.error ?? '');
}
const failed = results.filter(r => !r.ok);
writeFileSync(`${dir}/escena.json`, JSON.stringify({ auditor: 'Claude (Opus 5.5), implementador de 17.1', fecha: new Date().toISOString(), resultados: results }, null, 1));
for (const r of results) console.log(`${r.ok ? 'OK ' : 'FALLA'} ${r.name}: ${r.value.toPrecision(4)} ${r.unit} (límite ${r.limit.toPrecision(3)}) ${r.note}`);
console.log(`${results.length - failed.length}/${results.length} dentro del límite`);
process.exitCode = failed.length ? 1 : 0;
