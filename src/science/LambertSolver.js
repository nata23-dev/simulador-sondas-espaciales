// Etapa 12G — problema de Lambert de dos cuerpos, cero revoluciones, por variables universales.
//
// Formulación (Bate, Mueller & White 1971, §5.3; Curtis 2014, alg. 5.2; Vallado 2013, alg. 58):
//   A = sin Δθ · sqrt(r1·r2 / (1 − cos Δθ))
//   y(z) = r1 + r2 + A·(z·S(z) − 1)/sqrt(C(z))
//   √μ·t(z) = (y/C)^{3/2}·S + A·sqrt(y)
//   f = 1 − y/r1,  g = A·sqrt(y/μ),  ġ = 1 − y/r2
//   v1 = (r2 − f·r1)/g,  v2 = (ġ·r2 − r1)/g
// Para cero revoluciones t(z) crece monótonamente en el dominio admisible (y > 0, z < 4π²), desde 0 hasta ∞;
// se resuelve t(z) = Δt por bisección/regula falsi (Illinois) con intervalo garantizado, sin Newton sin protección.
// Se trabaja adimensionalizado (L = r1, T = sqrt(L³/μ)) para tolerar diferencias extremas de escala.
//
// Alcance: SOLO cero revoluciones. No se calculan soluciones multi-revolución, óptimos globales ni asistencias gravitacionales.
import { stumpff, propagateKepler } from './KeplerPropagator.js';

export const LAMBERT_SOLVER_VERSION = '12G-universal-0rev-1';
export const LAMBERT_STATUS = Object.freeze({
  converged: 'converged', invalid: 'invalid_input', degenerate: 'degenerate_geometry', noSolution: 'no_solution', noConvergence: 'not_converged'
});
// |Δθ − 180°| o |Δθ| por debajo de este ángulo: plano de transferencia mal condicionado (A → 0).
export const NEAR_COLINEAR_DEG = 1;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => Math.hypot(a[0], a[1], a[2]);
const finiteVector = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);

function failure(status, reason, extra = {}) { return Object.freeze({ status, converged: false, reason, ...extra }); }

/**
 * @param {number[]} r1Km posición inicial (km)
 * @param {number[]} r2Km posición final (km), mismo origen, ejes y época de referencia que r1
 * @param {number} tofSeconds tiempo de vuelo (s), > 0
 * @param {number} muKm3S2 parámetro gravitacional del cuerpo central
 * @param {{ direction?: 'prograde'|'retrograde', referenceNormal?: number[], tolerance?: number, maxIterations?: number, verify?: boolean }} options
 *   `direction` define el sentido respecto a `referenceNormal` (por defecto +Z del marco: norte eclíptico). Prograda ⇒ h·n > 0.
 */
export function solveLambert(r1Km, r2Km, tofSeconds, muKm3S2, { direction = 'prograde', referenceNormal = [0, 0, 1], tolerance = 1e-13, maxIterations = 300, verify = true } = {}) {
  if (!finiteVector(r1Km) || !finiteVector(r2Km)) return failure(LAMBERT_STATUS.invalid, 'Las posiciones deben ser vectores finitos de tres componentes.');
  if (!Number.isFinite(tofSeconds) || tofSeconds <= 0) return failure(LAMBERT_STATUS.invalid, 'El tiempo de vuelo debe ser finito y positivo.');
  if (!Number.isFinite(muKm3S2) || muKm3S2 <= 0) return failure(LAMBERT_STATUS.invalid, 'μ debe ser finito y positivo.');
  if (direction !== 'prograde' && direction !== 'retrograde') return failure(LAMBERT_STATUS.invalid, 'Sentido orbital desconocido.');
  if (!finiteVector(referenceNormal) || !(norm(referenceNormal) > 0)) return failure(LAMBERT_STATUS.invalid, 'Normal de referencia inválida.');
  const r1n = norm(r1Km), r2n = norm(r2Km);
  if (!(r1n > 0) || !(r2n > 0)) return failure(LAMBERT_STATUS.degenerate, 'Una posición coincide con el cuerpo central.');
  const L = r1n, T = Math.sqrt(L * L * L / muKm3S2), V = L / T;
  const r1 = r1Km.map(x => x / L), r2 = r2Km.map(x => x / L), R1 = 1, R2 = r2n / L, t = tofSeconds / T;
  if (!Number.isFinite(t) || !Number.isFinite(R2) || R2 > 1e8 || R2 < 1e-8) return failure(LAMBERT_STATUS.invalid, 'Relación de escalas fuera del rango numérico admitido (1e-8 a 1e8).');
  const cosTheta = Math.max(-1, Math.min(1, dot(r1, r2) / (R1 * R2)));
  const c = cross(r1, r2), cn = norm(c), sameSign = dot(c, referenceNormal) >= 0;
  const base = Math.acos(cosTheta);
  let theta = (direction === 'prograde') === sameSign ? base : 2 * Math.PI - base;
  const thetaDeg = theta * 180 / Math.PI;
  const sinTheta = Math.sin(theta);
  // Δθ = 0 (posiciones alineadas en el mismo sentido) o Δθ = 180° exactos: el plano no queda definido.
  if (cn <= 1e-14 * R1 * R2 || 1 - cosTheta <= 1e-15) {
    return failure(LAMBERT_STATUS.degenerate, 'Posiciones colineales con el cuerpo central: el plano de transferencia no está definido (Δθ = 0° o 180°).', { transferAngleDeg: thetaDeg });
  }
  const A = sinTheta * Math.sqrt(R1 * R2 / (1 - cosTheta));
  const nearColinear = Math.abs(thetaDeg - 180) < NEAR_COLINEAR_DEG || thetaDeg < NEAR_COLINEAR_DEG || thetaDeg > 360 - NEAR_COLINEAR_DEG;
  const yOf = z => { const { C, S } = stumpff(z); return { y: R1 + R2 + A * (z * S - 1) / Math.sqrt(C), C, S }; };
  // t(z) extendida a 0 donde y ≤ 0 (fuera del dominio físico): sigue siendo monótona no decreciente.
  const tOf = z => { const { y, C, S } = yOf(z); if (!(y > 0)) return 0; return Math.pow(y / C, 1.5) * S + A * Math.sqrt(y); };
  const Z_MAX = 4 * Math.PI * Math.PI;
  let zHi = Z_MAX * (1 - 1e-6), tHi = tOf(zHi), guard = 0;
  while (tHi < t && guard++ < 40) { zHi = Z_MAX - (Z_MAX - zHi) / 8; tHi = tOf(zHi); }
  if (!(tHi >= t)) return failure(LAMBERT_STATUS.noSolution, 'No existe solución de cero revoluciones con ese tiempo de vuelo en la rama solicitada.', { transferAngleDeg: thetaDeg });
  let zLo = -4, tLo = tOf(zLo); guard = 0;
  while (tLo > t && guard++ < 60) { zLo = zLo * 2 - 4; if (zLo < -4e5) break; tLo = tOf(zLo); }
  if (!(tLo <= t) || !Number.isFinite(tLo)) return failure(LAMBERT_STATUS.noSolution, 'Tiempo de vuelo demasiado corto para una hipérbola representable (fuera del rango numérico).', { transferAngleDeg: thetaDeg });
  // Illinois (regula falsi modificada) sobre g(z) = t(z) − Δt con intervalo garantizado.
  let a = zLo, b = zHi, fa = tLo - t, fb = tHi - t, side = 0, iterations = 0, z = a;
  for (; iterations < maxIterations; iterations++) {
    z = (a * fb - b * fa) / (fb - fa);
    if (!(z > a && z < b)) z = 0.5 * (a + b);
    const fz = tOf(z) - t;
    if (Math.abs(fz) <= tolerance * t || (b - a) <= 1e-15 * Math.max(1, Math.abs(z))) { iterations++; break; }
    if (fz > 0) { b = z; fb = fz; if (side === 1) fa /= 2; side = 1; }
    else { a = z; fa = fz; if (side === -1) fb /= 2; side = -1; }
  }
  const { y } = yOf(z);
  const tofError = Math.abs(tOf(z) - t) / t;
  if (!(y > 0) || !(tofError <= 1e-10)) return failure(LAMBERT_STATUS.noConvergence, `El solucionador no alcanzó la tolerancia (error relativo de tiempo ${tofError.toExponential(2)}).`, { iterations, transferAngleDeg: thetaDeg });
  const f = 1 - y / R1, g = A * Math.sqrt(y), gdot = 1 - y / R2;
  const v1 = [0, 1, 2].map(i => (r2[i] - f * r1[i]) / g * V), v2 = [0, 1, 2].map(i => (gdot * r2[i] - r1[i]) / g * V);
  if (!finiteVector(v1) || !finiteVector(v2)) return failure(LAMBERT_STATUS.noConvergence, 'Velocidades no finitas.', { iterations, transferAngleDeg: thetaDeg });
  const conic = z > 1e-9 ? 'elipse' : z < -1e-9 ? 'hipérbola' : 'parábola (límite)';
  const result = {
    status: LAMBERT_STATUS.converged, converged: true, solver: LAMBERT_SOLVER_VERSION, revolutions: 0, direction,
    departureVelocityKmS: v1, arrivalVelocityKmS: v2, tofSeconds, muKm3S2,
    diagnostics: { iterations, z, y: y * L, A: A * L, transferAngleDeg: thetaDeg, transferType: theta < Math.PI ? 'I (Δθ < 180°)' : 'II (Δθ > 180°)',
      conic, nearColinear, timeOfFlightRelativeError: tofError,
      warnings: nearColinear ? ['Geometría casi colineal (Δθ a menos de 1° de 0°/180°): el plano de transferencia está mal condicionado y la velocidad fuera del plano puede ser muy grande.'] : [] }
  };
  if (verify) {
    // Cierre: propagación kepleriana independiente desde (r1, v1) durante Δt (otro algoritmo: ecuación de Kepler en χ).
    try {
      const end = propagateKepler(r1Km, v1, tofSeconds, muKm3S2);
      const miss = Math.hypot(end.positionKm[0] - r2Km[0], end.positionKm[1] - r2Km[1], end.positionKm[2] - r2Km[2]);
      const velMiss = Math.hypot(end.velocityKmS[0] - v2[0], end.velocityKmS[1] - v2[1], end.velocityKmS[2] - v2[2]);
      result.diagnostics.closurePositionKm = miss; result.diagnostics.closureRelative = miss / r2n; result.diagnostics.closureVelocityKmS = velMiss;
    } catch (error) { result.diagnostics.closurePositionKm = null; result.diagnostics.warnings.push(`Cierre no verificable: ${error.message}`); }
  }
  return Object.freeze(result);
}
