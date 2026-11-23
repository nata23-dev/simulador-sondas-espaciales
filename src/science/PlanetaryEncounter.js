// Aquí calculo la geometría de encuentros planetarios con cónicas parcheadas y plano B.
// Mantengo este módulo completamente puro, sin DOM ni Three.js.
// Unidades: km, km/s, s y μ en km³/s², en el marco común ICRF eclíptico J2000.
// Referencias: Bate, Mueller & White (1971) cap. 4 y 8; Curtis, «Orbital Mechanics for Engineering Students», cap. 8
// (esfera de influencia e hipérbolas de llegada); Kizner (1961) y Vallado (2013) §12 para el plano B (vectores S, T, R).
//
// Convenciones que sigo en todas las funciones:
//  · Defino v∞ (vector) como la velocidad relativa ASINTÓTICA de llegada (planeta → nave) en los ejes del marco común.
//  · Construyo el plano B con Ŝ = v∞/|v∞|, T̂ = (Ŝ × k̂)/|Ŝ × k̂| (k̂ = polo de referencia declarado), R̂ = Ŝ × T̂ y B = b(cos θ T̂ + sin θ R̂).
//  · Relaciono el momento angular como h = r × v = v∞ (B × Ŝ) ⇒ ĥ = B̂ × Ŝ, |h| = b·v∞ y b = √(rp² + 2 μ rp / v∞²).
//  · Parametrizo la hipérbola con e = 1 + rp v∞²/μ, a = −μ/v∞², P̂ = (Ŝ + √(e²−1) B̂)/e (hacia el periapsis) y Q̂ = ĥ × P̂.
// Una solución de Lambert que termina en el centro del planeta no fija la hipérbola: debo imponer explícitamente
// el apuntado (B, θ) y verificarlo después propagando el estado real.
import { propagateKepler, conicSummary } from './KeplerPropagator.js';

export const PLANETARY_ENCOUNTER_VERSION = '13-patched-conic-encounter-1';
export const SOI_MODELS = Object.freeze({
  laplace: Object.freeze({ id: 'laplace', label: 'Laplace: r = a·(m/M)^(2/5)', note: 'Radio donde la perturbación relativa del primario iguala la del secundario (definición clásica de cónicas parcheadas).' }),
  hill: Object.freeze({ id: 'hill', label: 'Hill: r = a·(1 − e)·(m/3M)^(1/3)', note: 'Esfera de Hill en el periapsis del secundario; mayor que la de Laplace.' })
});

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => Math.hypot(a[0], a[1], a[2]);
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => { const n = norm(a); if (!(n > 0)) throw new RangeError('Vector nulo: dirección no definida.'); return scale(a, 1 / n); };
const DEG = 180 / Math.PI;
const finiteVector = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
function requirePositive(value, name) { if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} debe ser finito y positivo.`); return value; }

/** Aquí calculo el radio de la esfera de influencia (km) según el modelo elegido (Laplace o Hill), usando el semieje mayor del secundario respecto al primario. */
export function sphereOfInfluenceRadiusKm({ model = 'laplace', semiMajorAxisKm, eccentricity = 0, muBody, muPrimary }) {
  requirePositive(semiMajorAxisKm, 'semiMajorAxisKm'); requirePositive(muBody, 'muBody'); requirePositive(muPrimary, 'muPrimary');
  if (model === 'laplace') return semiMajorAxisKm * Math.pow(muBody / muPrimary, 0.4);
  if (model === 'hill') {
    if (!(Number.isFinite(eccentricity) && eccentricity >= 0 && eccentricity < 1)) throw new RangeError('La excentricidad debe estar en [0, 1).');
    return semiMajorAxisKm * (1 - eccentricity) * Math.cbrt(muBody / (3 * muPrimary));
  }
  throw new RangeError(`Modelo de esfera de influencia desconocido: ${model}.`);
}

/** Aquí extraigo el semieje mayor y la excentricidad osculantes del cuerpo secundario respecto al primario con μ = μ_primario + μ_secundario. */
export function osculatingOrbitOfBody(relativePositionKm, relativeVelocityKmS, muSum) {
  const c = conicSummary(relativePositionKm, relativeVelocityKmS, muSum);
  if (!(c.eccentricity < 1)) throw new RangeError('El cuerpo no tiene una órbita ligada respecto a su primario.');
  return { semiMajorAxisKm: c.semiMajorAxisKm, eccentricity: c.eccentricity };
}

/** Aquí construyo la base ortonormal del plano B (Ŝ, T̂, R̂) para una velocidad de exceso asintótica y un polo de referencia. */
export function bPlaneFrame(vInfVectorKmS, poleVector = [0, 0, 1]) {
  if (!finiteVector(vInfVectorKmS) || !finiteVector(poleVector)) throw new TypeError('v∞ y el polo deben ser vectores finitos.');
  const S = unit(vInfVectorKmS), k = unit(poleVector), sk = cross(S, k);
  if (norm(sk) < 1e-9) throw new RangeError('v∞ es paralela al polo de referencia: el eje T del plano B no está definido.');
  const T = unit(sk), R = cross(S, T);
  return { S, T, R };
}

/** Aquí construyo la hipérbola de llegada a partir de v∞ (vector), μ, el radio de periapsis y el ángulo θ del vector B medido desde T̂ hacia R̂. */
export function hyperbolaFromBPlane({ vInfVectorKmS, muKm3S2, periapsisRadiusKm, bAngleDeg = 0, poleVector = [0, 0, 1] }) {
  requirePositive(muKm3S2, 'μ'); requirePositive(periapsisRadiusKm, 'radio de periapsis');
  if (!Number.isFinite(bAngleDeg)) throw new RangeError('El ángulo del plano B debe ser finito.');
  const { S, T, R } = bPlaneFrame(vInfVectorKmS, poleVector);
  const vInf = norm(vInfVectorKmS);
  if (!(vInf > 1e-9)) throw new RangeError('v∞ nula: no hay hipérbola de llegada.');
  const rp = periapsisRadiusKm, mu = muKm3S2;
  const e = 1 + rp * vInf * vInf / mu, k = Math.sqrt(e * e - 1);
  const b = Math.sqrt(rp * rp + 2 * mu * rp / (vInf * vInf));
  const th = bAngleDeg / DEG;
  const Bhat = add(scale(T, Math.cos(th)), scale(R, Math.sin(th)));
  const hHat = cross(Bhat, S);
  const P = scale(add(S, scale(Bhat, k)), 1 / e);
  const Q = cross(hHat, P);
  const a = -mu / (vInf * vInf), p = a * (1 - e * e), h = b * vInf;
  const B = scale(Bhat, b);
  const outgoingDirection = scale(add(scale(P, -1), scale(Q, k)), 1 / e);
  return Object.freeze({ model: PLANETARY_ENCOUNTER_VERSION, mu, vInfKmS: vInf, vInfVectorKmS: [...vInfVectorKmS], eccentricity: e, semiMajorAxisKm: a, semiLatusRectumKm: p,
    angularMomentumKm2S: h, angularMomentumUnit: hHat, periapsisRadiusKm: rp, periapsisSpeedKmS: Math.sqrt(vInf * vInf + 2 * mu / rp), impactParameterKm: b,
    turnAngleDeg: 2 * Math.asin(1 / e) * DEG, trueAnomalyInfinityDeg: Math.acos(-1 / e) * DEG, P, Q, S, T, R, B, BdotT: dot(B, T), BdotR: dot(B, R), bAngleDeg,
    poleVector: [...poleVector], outgoingVInfVectorKmS: scale(outgoingDirection, vInf),
    inclinationToPoleDeg: Math.acos(Math.max(-1, Math.min(1, dot(hHat, unit(poleVector))))) * DEG });
}

/** Aquí evalúo la posición y velocidad sobre la cónica (hipérbola o elipse) a partir de P̂, Q̂, p, e y la anomalía verdadera ν (rad). */
export function stateOnConic(conic, trueAnomalyRad) {
  const { P, Q, semiLatusRectumKm: p, eccentricity: e, mu } = conic;
  const c = Math.cos(trueAnomalyRad), s = Math.sin(trueAnomalyRad), denom = 1 + e * c;
  if (!(denom > 1e-12)) throw new RangeError('Anomalía verdadera fuera de la rama física de la cónica.');
  const r = p / denom, w = Math.sqrt(mu / p);
  return { positionKm: add(scale(P, r * c), scale(Q, r * s)), velocityKmS: add(scale(P, -w * s), scale(Q, w * (e + c))) };
}

/** Aquí obtengo la anomalía verdadera (rad) donde la hipérbola cruza un radio dado; devuelvo signo negativo en la rama de llegada. */
export function trueAnomalyAtRadius(conic, radiusKm, branch = 'incoming') {
  requirePositive(radiusKm, 'radio');
  if (radiusKm < conic.periapsisRadiusKm * (1 - 1e-12)) throw new RangeError('El radio pedido es menor que el periapsis.');
  const cosNu = Math.max(-1, Math.min(1, (conic.semiLatusRectumKm / radiusKm - 1) / conic.eccentricity));
  const nu = Math.acos(cosNu);
  return branch === 'incoming' ? -nu : nu;
}

/** Aquí calculo el tiempo (s) desde el periapsis hasta la anomalía verdadera ν sobre una hipérbola (negativo antes del paso por periapsis). */
export function hyperbolicTimeFromPeriapsis(conic, trueAnomalyRad) {
  const e = conic.eccentricity;
  if (!(e > 1)) throw new RangeError('La cónica no es hiperbólica.');
  const F = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(trueAnomalyRad / 2));
  return Math.sqrt(Math.pow(-conic.semiMajorAxisKm, 3) / conic.mu) * (e * Math.sinh(F) - F);
}

/** Aquí calculo el exceso hiperbólico asintótico de un estado relativo (rama de llegada o de salida) y devuelvo null si la órbita es ligada. */
export function asymptoticExcess(positionKm, velocityKmS, muKm3S2, branch = 'incoming') {
  const c = conicSummary(positionKm, velocityKmS, muKm3S2);
  if (!(c.specificEnergyKm2S2 > 0) || !(c.eccentricity > 1)) return null;
  const vInf = Math.sqrt(2 * c.specificEnergyKm2S2), e = c.eccentricity, k = Math.sqrt(e * e - 1);
  const P = unit(c.eccentricityVector), hHat = unit(c.angularMomentumVector), Q = cross(hHat, P);
  const direction = branch === 'incoming' ? scale(add(P, scale(Q, k)), 1 / e) : scale(add(scale(P, -1), scale(Q, k)), 1 / e);
  return { vInfKmS: vInf, vInfVectorKmS: scale(direction, vInf), eccentricity: e, periapsisRadiusKm: c.periapsisKm, P, Q, angularMomentumUnit: hHat };
}

/** Aquí reconstruyo los parámetros del plano B a partir de un estado relativo real para verificar de forma inversa el apuntado. */
export function bPlaneFromState(positionKm, velocityKmS, muKm3S2, poleVector = [0, 0, 1]) {
  const ex = asymptoticExcess(positionKm, velocityKmS, muKm3S2, 'incoming');
  if (!ex) return null;
  const { S, T, R } = bPlaneFrame(ex.vInfVectorKmS, poleVector);
  const h = cross(positionKm, velocityKmS);
  const B = scale(cross(S, h), 1 / ex.vInfKmS);
  return { vInfKmS: ex.vInfKmS, vInfVectorKmS: ex.vInfVectorKmS, B, BdotT: dot(B, T), BdotR: dot(B, R), bMagnitudeKm: norm(B),
    bAngleDeg: Math.atan2(dot(B, R), dot(B, T)) * DEG, periapsisRadiusKm: ex.periapsisRadiusKm, eccentricity: ex.eccentricity, S, T, R };
}

/**
 * Aquí determino el ángulo θ del plano B que minimiza la inclinación de la hipérbola respecto a una normal de referencia
 * (por ejemplo, el plano orbital de un satélite). Como ĥ(θ) = −cos θ R̂ + sin θ T̂, maximizo ĥ·n̂ en θ* = atan2(T̂·n̂, −R̂·n̂);
 * la inclinación mínima alcanzable es asin(|Ŝ·n̂|) y solo depende de la dirección de llegada.
 */
export function bAngleForReferenceNormal(vInfVectorKmS, poleVector, referenceNormal) {
  const { S, T, R } = bPlaneFrame(vInfVectorKmS, poleVector), n = unit(referenceNormal);
  const theta = Math.atan2(dot(T, n), -dot(R, n));
  return { bAngleDeg: theta * DEG, minimumInclinationDeg: Math.asin(Math.min(1, Math.abs(dot(S, n)))) * DEG };
}

/** Aquí calculo el Δv impulsivo ideal en el periapsis para capturar una hipérbola (v∞, rp) en una elipse de apoapsis ra ≥ rp. */
export function impulsiveCaptureDeltaV({ vInfKmS, muKm3S2, periapsisRadiusKm, apoapsisRadiusKm }) {
  requirePositive(muKm3S2, 'μ'); requirePositive(periapsisRadiusKm, 'radio de periapsis');
  if (!Number.isFinite(vInfKmS) || vInfKmS < 0) throw new RangeError('v∞ debe ser finita y no negativa.');
  if (!(apoapsisRadiusKm >= periapsisRadiusKm)) throw new RangeError('El apoapsis objetivo debe ser ≥ periapsis.');
  const rp = periapsisRadiusKm, ra = apoapsisRadiusKm, a = (rp + ra) / 2;
  const vHyp = Math.sqrt(vInfKmS * vInfKmS + 2 * muKm3S2 / rp), vEll = Math.sqrt(muKm3S2 * (2 / rp - 1 / a));
  return { deltaVKmS: vHyp - vEll, hyperbolicPeriapsisSpeedKmS: vHyp, ellipticPeriapsisSpeedKmS: vEll, semiMajorAxisKm: a,
    eccentricity: (ra - rp) / (ra + rp), periodSeconds: 2 * Math.PI * Math.sqrt(a ** 3 / muKm3S2) };
}

/** Aquí calculo el tiempo hasta el siguiente periapsis y propago el estado kepleriano hasta él para una cónica hiperbólica o elíptica. */
export function timeToNextPeriapsis(positionKm, velocityKmS, muKm3S2) {
  const c = conicSummary(positionKm, velocityKmS, muKm3S2), e = c.eccentricity;
  const r = norm(positionKm), rv = dot(positionKm, velocityKmS);
  const P = unit(c.eccentricityVector), hHat = unit(c.angularMomentumVector), Q = cross(hHat, P);
  const nu = Math.atan2(dot(positionKm, Q), dot(positionKm, P));
  let dt;
  if (e > 1) {
    const conic = { eccentricity: e, semiMajorAxisKm: c.semiMajorAxisKm, mu: muKm3S2 };
    dt = -hyperbolicTimeFromPeriapsis(conic, nu);
    if (dt < 0) return { seconds: null, passed: true, conic: c }; // Señalo que la nave ya transita la rama de salida.
  } else {
    const E = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(nu / 2));
    const M = E - e * Math.sin(E), n = Math.sqrt(muKm3S2 / Math.pow(c.semiMajorAxisKm, 3));
    const period = 2 * Math.PI / n;
    dt = ((-M / n) % period + period) % period;
    if (dt < 1e-9 && rv >= 0) dt = 0;
  }
  const at = propagateKepler(positionKm, velocityKmS, dt, muKm3S2);
  return { seconds: dt, passed: false, conic: c, stateAtPeriapsis: at, radiusNowKm: r };
}

/**
 * Aquí convierto un estado elíptico (r, v) a elementos orbitales clásicos respecto al plano xy del marco del estado,
 * con altitudes referidas a `radiusKm` y ángulos en grados.
 * Trato explícitamente los casos degenerados: en órbitas circulares (e < 1e-10) fijo ω = 0 y ν igual al argumento de latitud;
 * en órbitas ecuatoriales (i < 1e-10) fijo Ω = 0 y mido ω desde +X, coherente con `initialOrbitState`.
 */
export function classicalElements(positionKm, velocityKmS, mu, radiusKm = 0) {
  const r = norm(positionKm), v2 = dot(velocityKmS, velocityKmS), h = cross(positionKm, velocityKmS), hn = norm(h);
  const rv = dot(positionKm, velocityKmS);
  const eVec = [0, 1, 2].map(i => ((v2 - mu / r) * positionKm[i] - rv * velocityKmS[i]) / mu), e = norm(eVec);
  const energy = v2 / 2 - mu / r;
  if (!(energy < 0) || !(e < 1)) throw new RangeError('La órbita no es ligada: no hay elementos elípticos.');
  const a = -mu / (2 * energy), rp = a * (1 - e), ra = a * (1 + e);
  const inc = Math.acos(Math.max(-1, Math.min(1, h[2] / hn)));
  const nVec = [-h[1], h[0], 0], nn = norm(nVec);
  const equatorial = nn / hn < 1e-10, circular = e < 1e-10;
  const wrap = x => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const raan = equatorial ? 0 : wrap(Math.atan2(nVec[1], nVec[0]));
  const nodeDir = equatorial ? [1, 0, 0] : scale(nVec, 1 / nn);
  const inPlane = u => { const q = cross(scale(h, 1 / hn), nodeDir); return Math.atan2(dot(u, q), dot(u, nodeDir)); };
  const argp = circular ? 0 : wrap(inPlane(eVec));
  const u = wrap(inPlane(positionKm));
  const nu = wrap(u - argp);
  return { semiMajorAxisKm: a, eccentricity: e, periapsisAltitudeKm: rp - radiusKm, apoapsisAltitudeKm: ra - radiusKm, inclinationDeg: inc * DEG, raanDeg: raan * DEG,
    argumentOfPeriapsisDeg: argp * DEG, trueAnomalyDeg: nu * DEG, circular, equatorial };
}
