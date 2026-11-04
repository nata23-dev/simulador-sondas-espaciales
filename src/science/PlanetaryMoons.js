import { KM_PER_AU } from './Units.js';

export const MOONS = Object.freeze({
  Luna: { id: '301', name: 'Luna', parent: 'Tierra', center: '399', radiusKm: 1737.4, description: 'Satélite natural de la Tierra; superficie rocosa craterizada.' },
  Io: { id: '501', name: 'Ío', parent: 'Jupiter', center: '599', radiusKm: 1821.49, description: 'Satélite de Júpiter con actividad volcánica documentada por Voyager.' },
  Europa: { id: '502', name: 'Europa', parent: 'Jupiter', center: '599', radiusKm: 1560.8, description: 'Satélite helado de Júpiter con evidencias de un océano subsuperficial.' },
  Ganymede: { id: '503', name: 'Ganímedes', parent: 'Jupiter', center: '599', radiusKm: 2631.2, description: 'El mayor satélite natural del Sistema Solar; terrenos helados y craterizados.' },
  Callisto: { id: '504', name: 'Calisto', parent: 'Jupiter', center: '599', radiusKm: 2410.3, description: 'Satélite joviano con superficie intensamente craterizada.' },
  Titan: { id: '606', name: 'Titán', parent: 'Saturno', center: '699', radiusKm: 2574.76, description: 'Gran satélite de Saturno con atmósfera densa.' },
  Enceladus: { id: '602', name: 'Encélado', parent: 'Saturno', center: '699', radiusKm: 252.1, description: 'Satélite helado de Saturno con actividad en su región austral.' },
  Titania: { id: '703', name: 'Titania', parent: 'Urano', center: '799', radiusKm: 788.9, description: 'El mayor satélite de Urano, con fallas y cañones.' },
  Miranda: { id: '705', name: 'Miranda', parent: 'Urano', center: '799', radiusKm: 235.8, description: 'Satélite de Urano con terrenos tectónicos variados.' },
  Triton: { id: '801', name: 'Tritón', parent: 'Neptuno', center: '899', radiusKm: 1352.6, description: 'Satélite de Neptuno en órbita retrógrada.' }
});
export const MOON_RADIUS_SOURCE = 'https://ssd.jpl.nasa.gov/sats/phys_par/';

function hermite(a, b, jd) {
  const dt = (b[0] - a[0]) * 86400;
  const t = (jd - a[0]) * 86400 / dt;
  const t2 = t * t, t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
  const dh00 = (6 * t2 - 6 * t) / dt, dh10 = 3 * t2 - 4 * t + 1;
  const dh01 = (-6 * t2 + 6 * t) / dt, dh11 = 3 * t2 - 2 * t;
  const p = [], v = [];
  for (let i = 1; i <= 3; i++) {
    p.push(h00 * a[i] + h10 * dt * a[i + 3] + h01 * b[i] + h11 * dt * b[i + 3]);
    v.push(dh00 * a[i] + dh10 * a[i + 3] + dh01 * b[i] + dh11 * b[i + 3]);
  }
  return { positionKm: p, velocityKmS: v };
}

export function validateMoonDataset(data, { isolate = false } = {}) {
  if (data?.schema !== 'planetocentric-moons-v1' || data.frame !== 'ICRF_ECLIPTIC_J2000'
    || data.timeScale !== 'TDB' || data.stepHours !== 1) throw Error('Invalid moon dataset metadata');
  const valid = {}, invalid = {};
  for (const [key, moon] of Object.entries(MOONS)) {
    try {
    const body = data.moons?.[key];
    if (body?.id !== moon.id || body.center !== moon.center || body.rows?.length !== 745) throw Error(`${key}: identity/coverage`);
    if (!body.source?.targetHeader?.includes(`(${moon.id})`) || !body.source.centerHeader?.includes(`(${moon.center})`)) throw Error(`${key}: Horizons header`);
    if (Math.abs(body.rows[0][0] - 2461314.5) > 1e-8 || Math.abs(body.rows.at(-1)[0] - 2461345.5) > 1e-8) throw Error(`${key}: endpoints`);
    for (let i = 0; i < body.rows.length; i++) {
      const row = body.rows[i];
      if (row.length !== 7 || row.some(n => !Number.isFinite(n))) throw Error(`${key}: sample ${i}`);
      if (i && Math.abs((row[0] - body.rows[i - 1][0]) * 24 - 1) > 1e-5) throw Error(`${key}: cadence`);
    }
    valid[key] = body;
    } catch (error) {
      if (!isolate) throw error;
      invalid[key] = error.message;
    }
  }
  return isolate ? { data: { ...data, moons: valid }, invalid } : true;
}

export function queryMoon(data, key, jdTdb) {
  const body = data?.moons?.[key];
  if (!body || !Number.isFinite(jdTdb)) return null;
  const rows = body.rows;
  if (jdTdb < rows[0][0] - 1e-9 || jdTdb > rows.at(-1)[0] + 1e-9) return null;
  const index = Math.min(rows.length - 2, Math.max(0, Math.floor((jdTdb - rows[0][0]) * 24 + 1e-8)));
  const a = rows[index], b = rows[index + 1];
  const exact = Math.abs(jdTdb - a[0]) < 1e-9 ? a : Math.abs(jdTdb - b[0]) < 1e-9 ? b : null;
  const result = exact ? { positionKm: exact.slice(1, 4), velocityKmS: exact.slice(4, 7) } : hermite(a, b, jdTdb);
  return { ...result, distanceKm: Math.hypot(...result.positionKm), status: exact ? 'exact' : 'Hermite C1', jdTdb,
    positionSceneOffset: result.positionKm.map(n => n / KM_PER_AU * 32) };
}
