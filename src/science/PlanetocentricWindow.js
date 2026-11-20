// Etapa 13 — estados de satélites respecto a su centro (planeta o baricentro) en VENTANAS de llegada concretas.
// Formato `planetocentric-window-v1` (scripts/acquire-stage13-encounters.mjs): filas [JD TDB, x, y, z, vx, vy, vz] en km y km/s,
// ejes ICRF eclíptico J2000, vectores geométricos, cadencia constante por satélite. Interpolación cúbica de Hermite entre los
// dos nodos que rodean el instante (posición + velocidad). Nunca extrapola: fuera de la ventana devuelve «no disponible».
// Módulo puro: sin DOM ni Three.js.
export const PLANETOCENTRIC_WINDOW_SCHEMA = 'planetocentric-window-v1';
export const MOON_UNAVAILABLE_MESSAGE = 'Efemérides de satélites no disponibles para el intervalo solicitado';
// Error máximo de la interpolación medido contra estados de Horizons fuera de los nodos (tests/fixtures/stage13-galilean-holdout-v1.json).
export const MEASURED_MOON_INTERPOLATION_ERROR = Object.freeze({
  Europa: Object.freeze({ positionKm: 0.056, velocityKmS: 4.1e-5, cadenceHours: 1 }), Io: Object.freeze({ positionKm: 6.96, velocityKmS: 3.7e-3, cadenceHours: 2 }),
  Ganymede: Object.freeze({ positionKm: 6.44, velocityKmS: 7.4e-4, cadenceHours: 6 }), Callisto: Object.freeze({ positionKm: 0.40, velocityKmS: 4.7e-5, cadenceHours: 6 })
});

function hermite(a, b, jd) {
  const dt = (b[0] - a[0]) * 86400, t = (jd - a[0]) * 86400 / dt, t2 = t * t, t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
  const d00 = (6 * t2 - 6 * t) / dt, d10 = 3 * t2 - 4 * t + 1, d01 = (-6 * t2 + 6 * t) / dt, d11 = 3 * t2 - 2 * t;
  const p = [], v = [];
  for (let i = 1; i <= 3; i++) { p.push(h00 * a[i] + h10 * dt * a[i + 3] + h01 * b[i] + h11 * dt * b[i + 3]); v.push(d00 * a[i] + d10 * a[i + 3] + d01 * b[i] + d11 * b[i + 3]); }
  return { positionKm: p, velocityKmS: v };
}

/** Valida el conjunto y devuelve un evaluador síncrono `stateAt(key, jdTdb)`. */
export function createPlanetocentricWindow(data) {
  if (data?.schema !== PLANETOCENTRIC_WINDOW_SCHEMA || data.frame !== 'ICRF_ECLIPTIC_J2000' || data.timeScale !== 'TDB'
    || data.units?.position !== 'km' || data.units?.velocity !== 'km/s' || typeof data.centerId !== 'string') throw new TypeError('Conjunto planetocéntrico con metadatos inválidos.');
  const bodies = {};
  for (const [key, body] of Object.entries(data.bodies ?? {})) {
    const rows = body.rows;
    if (!Array.isArray(rows) || rows.length < 2 || !(body.stepHours > 0)) throw new RangeError(`${key}: serie vacía o sin cadencia.`);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row) || row.length !== 7 || row.some(n => !Number.isFinite(n))) throw new RangeError(`${key}: fila ${i} inválida.`);
      if (i && Math.abs((row[0] - rows[i - 1][0]) * 24 - body.stepHours) > 1e-5) throw new RangeError(`${key}: hueco o cadencia irregular en la fila ${i}: no se interpola a través de él.`);
    }
    bodies[key] = { id: body.id, stepHours: body.stepHours, rows, solutionId: body.solutionId ?? null, start: rows[0][0], end: rows.at(-1)[0] };
  }
  function stateAt(key, jdTdb) {
    const body = bodies[key];
    if (!body) return Object.freeze({ status: 'unavailable', key, jdTdb, message: MOON_UNAVAILABLE_MESSAGE, reason: 'Satélite no incluido en la ventana adquirida.' });
    if (!Number.isFinite(jdTdb) || jdTdb < body.start - 1e-9 || jdTdb > body.end + 1e-9) return Object.freeze({ status: 'unavailable', key, jdTdb, message: MOON_UNAVAILABLE_MESSAGE, reason: 'Fuera de la ventana adquirida; no se extrapola.', coverage: [body.start, body.end] });
    const rows = body.rows, step = body.stepHours / 24;
    const i = Math.min(rows.length - 2, Math.max(0, Math.floor((jdTdb - body.start) / step + 1e-9)));
    const a = rows[i], b = rows[i + 1];
    const exact = Math.abs(jdTdb - a[0]) < 1e-10 ? a : Math.abs(jdTdb - b[0]) < 1e-10 ? b : null;
    const s = exact ? { positionKm: exact.slice(1, 4), velocityKmS: exact.slice(4, 7) } : hermite(a, b, jdTdb);
    return Object.freeze({ status: 'available', key, id: body.id, jdTdb, positionKm: s.positionKm, velocityKmS: s.velocityKmS, method: exact ? 'exact-node' : 'cubic-hermite',
      centerId: data.centerId, centerName: data.centerName, frame: data.frame, solutionId: body.solutionId, cadenceHours: body.stepHours,
      measuredMaxError: MEASURED_MOON_INTERPOLATION_ERROR[key] ?? null });
  }
  const coverage = key => bodies[key] ? { startJdTdb: bodies[key].start, endJdTdb: bodies[key].end } : null;
  return Object.freeze({ stateAt, coverage, keys: Object.keys(bodies), centerId: data.centerId, centerName: data.centerName });
}
