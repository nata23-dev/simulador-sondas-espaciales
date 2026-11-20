// Etapa 12G — propagación kepleriana de dos cuerpos por variables universales (Bate, Mueller & White 1971, cap. 4;
// Curtis, «Orbital Mechanics for Engineering Students», alg. 3.3–3.4). Módulo puro: sin DOM ni Three.js.
// Unidades: km, km/s, s y μ en km³/s². Internamente se adimensionaliza con L = |r0|, T = sqrt(L³/μ) para que el
// método no dependa de la escala (órbitas lunares o heliocéntricas de decenas de AU).
import { requireFiniteNumber } from './Units.js';

export const KEPLER_PROPAGATOR_VERSION = '12G-universal-1';

/** Funciones de Stumpff C(z) y S(z), con series de Taylor cerca de z = 0. */
export function stumpff(z) {
  if (Math.abs(z) < 1e-3) {
    // C = 1/2 − z/24 + z²/720 − z³/40320 ; S = 1/6 − z/120 + z²/5040 − z³/362880
    return { C: 0.5 - z / 24 + z * z / 720 - z * z * z / 40320, S: 1 / 6 - z / 120 + z * z / 5040 - z * z * z / 362880 };
  }
  if (z > 0) { const s = Math.sqrt(z); return { C: (1 - Math.cos(s)) / z, S: (s - Math.sin(s)) / (s * s * s) }; }
  const s = Math.sqrt(-z);
  return { C: (Math.cosh(s) - 1) / -z, S: (Math.sinh(s) - s) / (s * s * s) };
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => Math.hypot(a[0], a[1], a[2]);

function requireVector(v, name) {
  if (!Array.isArray(v) || v.length !== 3) throw new TypeError(`${name} debe ser un vector [x, y, z].`);
  v.forEach((value, i) => requireFiniteNumber(value, `${name}[${i}]`));
  return v;
}

/**
 * Propaga (r0, v0) durante dt segundos bajo un único cuerpo central de parámetro μ.
 * Devuelve posición y velocidad, el χ universal, iteraciones y la desviación de la identidad f·ġ − ḟ·g = 1.
 */
export function propagateKepler(r0Km, v0KmS, dtSeconds, muKm3S2, { tolerance = 1e-14, maxIterations = 100 } = {}) {
  requireVector(r0Km, 'r0Km'); requireVector(v0KmS, 'v0KmS'); requireFiniteNumber(dtSeconds, 'dtSeconds'); requireFiniteNumber(muKm3S2, 'muKm3S2');
  if (muKm3S2 <= 0) throw new RangeError('μ debe ser positivo.');
  const L = norm(r0Km);
  if (!(L > 0)) throw new RangeError('La posición inicial no puede ser nula.');
  if (dtSeconds === 0) return { positionKm: [...r0Km], velocityKmS: [...v0KmS], chi: 0, iterations: 0, identityError: 0 };
  const T = Math.sqrt(L * L * L / muKm3S2), V = L / T;
  const r0 = r0Km.map(x => x / L), v0 = v0KmS.map(x => x / V);
  let t = dtSeconds / T;
  const r0n = 1, vr0 = dot(r0, v0) / r0n, alpha = 2 / r0n - dot(v0, v0); // α = 1/a (μ = 1)
  // Una elipse se reduce a menos de un periodo; esto no altera el estado físico final.
  if (alpha > 1e-12) { const period = 2 * Math.PI / Math.pow(alpha, 1.5); if (Math.abs(t) > period) t -= period * Math.trunc(t / period); }
  // Semilla: χ ≈ √μ·α·t para elipses; para hipérbolas/parábolas, aproximación de Vallado (alg. 8).
  let chi;
  if (alpha > 1e-12) chi = alpha * t;
  else if (Math.abs(alpha) <= 1e-12) { const h = norm([r0[1] * v0[2] - r0[2] * v0[1], r0[2] * v0[0] - r0[0] * v0[2], r0[0] * v0[1] - r0[1] * v0[0]]); const p = h * h;
    const s = 0.5 * Math.atan(1 / (3 * Math.sqrt(1 / (p * p * p)) * t)); const w = Math.atan(Math.cbrt(Math.tan(s))); chi = Math.sqrt(p) * 2 / Math.tan(2 * w); }
  else { const a = 1 / alpha; chi = Math.sign(t) * Math.sqrt(-a) * Math.log((-2 * alpha * t) / (vr0 * r0n + Math.sign(t) * Math.sqrt(-a) * (1 - r0n * alpha))); if (!Number.isFinite(chi)) chi = Math.sign(t) * Math.sqrt(-a); }
  const timeOf = x => { const z = alpha * x * x, { C, S } = stumpff(z);
    const terms = [r0n * vr0 * x * x * C, (1 - alpha * r0n) * x * x * x * S, r0n * x];
    return { F: terms[0] + terms[1] + terms[2] - t, scale: Math.abs(terms[0]) + Math.abs(terms[1]) + Math.abs(terms[2]) + Math.abs(t),
      r: x * x * C + r0n * vr0 * x * (1 - z * S) + r0n * (1 - z * C), C, S, z }; };
  let iterations = 0, converged = false;
  // Etapa 13: F(χ) es estrictamente creciente (dF/dχ = r > 0); se mantiene un intervalo [lo, hi] con F(lo) < 0 < F(hi) y se
  // bisecta cuando el paso de Newton sale de él. En elipses el intervalo inicial es exacto, χ ∈ [0, 2π/√α] para t > 0 (t ya se
  // redujo a menos de un periodo). Evita los ciclos de Newton en órbitas casi rectilíneas (momento angular pequeño).
  let lo = -Infinity, hi = Infinity;
  // En cualquier cónica F(0) = −t, así que χ = 0 acota por un lado; en hipérbolas el otro extremo aparece al primer F > 0.
  if (alpha > 1e-12) { const chiPeriod = 2 * Math.PI / Math.sqrt(alpha); if (t > 0) { lo = 0; hi = chiPeriod; } else { lo = -chiPeriod; hi = 0; } if (!(chi > lo && chi < hi)) chi = (lo + hi) / 2; }
  else if (t > 0) { lo = 0; if (!(chi > 0)) chi = t; } else { hi = 0; if (!(chi < 0)) chi = t; }
  let previousAbsF = Infinity;
  for (; iterations < maxIterations; iterations++) {
    const { F, r, scale } = timeOf(chi); // dF/dχ = r (radio adimensional en ese χ)
    if (F < 0) lo = Math.max(lo, chi); else if (F > 0) hi = Math.min(hi, chi);
    let step = F / r;
    if (!Number.isFinite(step)) break;
    // Salvaguarda: limita pasos desmesurados de Newton.
    if (Math.abs(step) > 10 * (Math.abs(chi) + 1)) step = Math.sign(step) * 10 * (Math.abs(chi) + 1);
    // Etapa 13: en arcos hiperbólicos largos (esfera de influencia → periapsis) el residuo F llega al suelo de redondeo
    // (~ε·Σ|términos|) antes de que el paso baje de `tolerance`; se acepta el χ actual con residuo a nivel de redondeo.
    if (Math.abs(F) <= 16 * Number.EPSILON * scale) { converged = true; iterations++; break; }
    let next = chi - step;
    // Paso de Newton fuera del intervalo (inclusivo: un paso por debajo del ulp deja next = chi) ⇒ bisección.
    // También se bisecta si Newton no reduce |F| a la mitad (convergencia lineal lenta en la rama exponencial de una hipérbola).
    if (Number.isFinite(lo) && Number.isFinite(hi) && (!(next >= lo && next <= hi) || Math.abs(F) > 0.5 * previousAbsF)) { next = (lo + hi) / 2; step = chi - next; }
    previousAbsF = Math.abs(F);
    chi = next;
    if (Math.abs(step) <= tolerance * Math.max(1, Math.abs(chi)) || (hi - lo) <= tolerance * Math.max(1, Math.abs(chi))) { converged = true; iterations++; break; }
  }
  if (!converged) throw new RangeError('La propagación kepleriana no convergió.');
  const { z, C, S } = timeOf(chi);
  const f = 1 - chi * chi / r0n * C, g = t - chi * chi * chi * S;
  const r = [0, 1, 2].map(i => f * r0[i] + g * v0[i]), rn = norm(r);
  const fdot = chi / (rn * r0n) * (z * S - 1), gdot = 1 - chi * chi / rn * C;
  const v = [0, 1, 2].map(i => fdot * r0[i] + gdot * v0[i]);
  return { positionKm: r.map(x => x * L), velocityKmS: v.map(x => x * V), chi, iterations, identityError: Math.abs(f * gdot - fdot * g - 1) };
}

/** Elementos osculantes básicos (km, km/s) respecto a un cuerpo central. */
export function conicSummary(rKm, vKmS, mu) {
  const r = norm(rKm), v2 = dot(vKmS, vKmS), energy = v2 / 2 - mu / r;
  const h = [rKm[1] * vKmS[2] - rKm[2] * vKmS[1], rKm[2] * vKmS[0] - rKm[0] * vKmS[2], rKm[0] * vKmS[1] - rKm[1] * vKmS[0]], hn = norm(h);
  const rv = dot(rKm, vKmS);
  const e = [0, 1, 2].map(i => ((v2 - mu / r) * rKm[i] - rv * vKmS[i]) / mu), ecc = norm(e);
  const a = Math.abs(energy) > 1e-14 * mu / r ? -mu / (2 * energy) : Infinity;
  return { specificEnergyKm2S2: energy, angularMomentumKm2S: hn, angularMomentumVector: h, eccentricity: ecc, eccentricityVector: e, semiMajorAxisKm: a,
    periapsisKm: hn * hn / (mu * (1 + ecc)), apoapsisKm: ecc < 1 ? hn * hn / (mu * (1 - ecc)) : null,
    inclinationDeg: hn > 0 ? Math.acos(Math.max(-1, Math.min(1, h[2] / hn))) * 180 / Math.PI : null };
}
