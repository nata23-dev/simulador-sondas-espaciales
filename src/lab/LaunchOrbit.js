// Etapa 12E — elementos orbitales osculadores y clasificación del resultado de un lanzamiento.
// Entrada en el marco inercial terrestre ECI-L (km, km/s). Dos cuerpos con GM terrestre; sin arrastre
// ni J2 en los elementos: son osculadores en el instante evaluado.
import { EARTH_GM_KM3_S2, cross3, dot3, ellipsoidRadiusKm, geodeticFromPosition, norm3 } from './LaunchEarth.js';

const DEG = 180 / Math.PI;
export const ORBIT_CLASSES = Object.freeze({
  orbit: 'ÓRBITA TERRESTRE ALCANZADA SEGÚN EL MODELO', suborbital: 'SUBORBITAL',
  notReached: 'OBJETIVO NO ALCANZADO', unverifiable: 'NO VERIFICABLE'
});
// 12E.1: resultado fino dentro de la familia SUBORBITAL (campo `outcome`). `classification` conserva la familia.
export const SUBORBITAL_OUTCOMES = Object.freeze({ impactConfirmed: 'IMPACTO CONFIRMADO', descending: 'SUBORBITAL DESCENDENTE', ellipseIntersects: 'SUBORBITAL' });
export const DEFAULT_TARGET_ORBIT = Object.freeze({
  // Perigeo mínimo para considerar la órbita operativamente sostenible en este modelo (no es una garantía de vida orbital).
  minPerigeeAltitudeKm: 160, maxApogeeAltitudeKm: 2000, inclinationDeg: null, inclinationToleranceDeg: 1, targetAltitudeKm: 200
});

export function orbitalElements(position, velocity, mu = EARTH_GM_KM3_S2) {
  const r = norm3(position), v2 = dot3(velocity, velocity);
  if (![r, v2].every(Number.isFinite) || r <= 0) throw Error('Estado orbital no finito.');
  const h = cross3(position, velocity), hn = norm3(h);
  const energy = v2 / 2 - mu / r; // energía orbital específica, km²/s²
  const rv = dot3(position, velocity);
  const evec = [0, 1, 2].map(i => ((v2 - mu / r) * position[i] - rv * velocity[i]) / mu);
  const e = norm3(evec);
  const bound = energy < 0;
  const semiMajorAxisKm = Math.abs(energy) > 1e-12 ? -mu / (2 * energy) : null; // parábola: indefinido
  const periapsisRadiusKm = hn * hn / (mu * (1 + e));
  const apoapsisRadiusKm = bound ? hn * hn / (mu * (1 - e)) : null;
  return {
    radiusKm: r, speedKmS: Math.sqrt(v2), specificEnergyKm2S2: energy, angularMomentumKm2S: hn, angularMomentumVectorKm2S: h,
    bound, trajectoryType: bound ? 'elíptica ligada' : Math.abs(energy) < 1e-9 ? 'parabólica (escape)' : 'hiperbólica (escape)',
    semiMajorAxisKm: bound ? semiMajorAxisKm : null, eccentricity: e, eccentricityVector: evec,
    inclinationDeg: hn > 0 ? Math.acos(Math.max(-1, Math.min(1, h[2] / hn))) * DEG : null,
    periapsisRadiusKm, apoapsisRadiusKm, period: bound ? 2 * Math.PI * Math.sqrt(semiMajorAxisKm ** 3 / mu) : null
  };
}

// Altitud mínima de la órbita (perigeo) sobre el elipsoide WGS84, comparando r(ν) con el radio del elipsoide
// a la latitud geocéntrica de cada punto de la órbita (muestreo de la anomalía verdadera).
export function minimumOrbitAltitudeKm(position, velocity, mu = EARTH_GM_KM3_S2, samples = 720) {
  const el = orbitalElements(position, velocity, mu);
  if (!el.bound) return null;
  const hhat = el.angularMomentumVectorKm2S.map(x => x / el.angularMomentumKm2S);
  const p = el.angularMomentumKm2S ** 2 / mu;
  // Base perifocal: P̂ hacia el perigeo (si e≈0 se usa la posición actual), Q̂ = ĥ × P̂.
  const pHat = el.eccentricity > 1e-9 ? el.eccentricityVector.map(x => x / el.eccentricity) : position.map(x => x / el.radiusKm);
  const qHat = cross3(hhat, pHat);
  let minimum = Infinity;
  for (let i = 0; i < samples; i++) {
    const nu = 2 * Math.PI * i / samples, r = p / (1 + el.eccentricity * Math.cos(nu));
    const point = [0, 1, 2].map(k => r * (Math.cos(nu) * pHat[k] + Math.sin(nu) * qHat[k]));
    const psi = Math.asin(point[2] / r);
    minimum = Math.min(minimum, r - ellipsoidRadiusKm(psi));
  }
  return minimum;
}

// Altitud osculante del perigeo (para detener un encendido cuando se alcanza el perigeo objetivo).
export function osculatingPerigeeAltitudeKm(position, velocity, mu = EARTH_GM_KM3_S2) {
  const el = orbitalElements(position, velocity, mu);
  const dir = el.eccentricity > 1e-9 ? el.eccentricityVector.map(x => x / el.eccentricity) : position.map(x => x / el.radiusKm);
  return el.periapsisRadiusKm - ellipsoidRadiusKm(Math.asin(dir[2]));
}

// Clasificación explícita. Criterios (documentados en docs/STAGE12E_EARTH_LAUNCH.md):
//  - NO VERIFICABLE: estado no finito o dentro de la atmósfera densa sin impacto (el arrastre invalida los elementos).
//  - SUBORBITAL: ligada, pero la elipse intersecta el elipsoide terrestre (o hubo impacto).
//  - OBJETIVO NO ALCANZADO: no ligada, o ligada con perigeo por debajo del mínimo sostenible, o fuera de los límites de la órbita objetivo.
//  - ÓRBITA ALCANZADA SEGÚN EL MODELO: ligada, sin intersección, perigeo >= mínimo, apogeo <= máximo, inclinación en tolerancia si se pidió.
export function classifyOrbit(position, velocity, target = DEFAULT_TARGET_ORBIT, { impact = false, mu = EARTH_GM_KM3_S2 } = {}) {
  const criteria = { ...DEFAULT_TARGET_ORBIT, ...target };
  const reasons = [];
  try {
    if (![...position, ...velocity].every(Number.isFinite)) throw Error('estado no finito');
    const elements = orbitalElements(position, velocity, mu);
    const altitudeKm = geodeticFromPosition(position).altitudeKm;
    if (impact) return { classification: ORBIT_CLASSES.suborbital, outcome: SUBORBITAL_OUTCOMES.impactConfirmed, reasons: ['Impacto con la superficie localizado por el detector de eventos (altitud 0).'], elements, minimumAltitudeKm: null, altitudeKm, criteria };
    if (altitudeKm < 100) {
      // 12E.1: bajo 100 km no se verifica una órbita, pero sí puede establecerse una trayectoria suborbital descendente:
      // ligada, con radial negativa y la elipse osculadora intersectando el elipsoide.
      const descending = dot3(position, velocity) < 0 && elements.bound && minimumOrbitAltitudeKm(position, velocity, mu) < 0;
      if (descending) return { classification: ORBIT_CLASSES.suborbital, outcome: SUBORBITAL_OUTCOMES.descending, reasons: [`Trayectoria descendente a ${altitudeKm.toFixed(1)} km cuya elipse osculadora intersecta la Tierra; el contacto aún no se detectó en la propagación.`], elements, minimumAltitudeKm: minimumOrbitAltitudeKm(position, velocity, mu), altitudeKm, criteria };
    }
    if (altitudeKm < 100) return { classification: ORBIT_CLASSES.unverifiable, reasons: ['El estado final está dentro de la atmósfera densa: el arrastre invalida los elementos osculadores.'], elements, minimumAltitudeKm: null, altitudeKm, criteria };
    if (!elements.bound) return { classification: ORBIT_CLASSES.notReached, reasons: [`Trayectoria no ligada (${elements.trajectoryType}): energía específica ${elements.specificEnergyKm2S2.toFixed(3)} km²/s² ≥ 0.`], elements, minimumAltitudeKm: null, altitudeKm, criteria };
    const minimumAltitudeKm = minimumOrbitAltitudeKm(position, velocity, mu);
    if (minimumAltitudeKm < 0) return { classification: ORBIT_CLASSES.suborbital, outcome: SUBORBITAL_OUTCOMES.ellipseIntersects, reasons: [`La elipse intersecta la Tierra: altitud mínima ${minimumAltitudeKm.toFixed(1)} km.`], elements, minimumAltitudeKm, altitudeKm, criteria };
    if (minimumAltitudeKm < criteria.minPerigeeAltitudeKm) reasons.push(`Órbita matemática con perigeo en la atmósfera o por debajo del mínimo sostenible: ${minimumAltitudeKm.toFixed(1)} km < ${criteria.minPerigeeAltitudeKm} km.`);
    const perigeeDirection = elements.eccentricity > 1e-9 ? elements.eccentricityVector.map(x => x / elements.eccentricity) : position.map(x => x / elements.radiusKm);
    const apogeeAltitudeKm = elements.apoapsisRadiusKm - ellipsoidRadiusKm(Math.asin(-perigeeDirection[2]));
    if (Number.isFinite(criteria.maxApogeeAltitudeKm) && apogeeAltitudeKm > criteria.maxApogeeAltitudeKm) reasons.push(`Apogeo ${apogeeAltitudeKm.toFixed(0)} km por encima del máximo de la órbita objetivo (${criteria.maxApogeeAltitudeKm} km).`);
    if (Number.isFinite(criteria.inclinationDeg) && Math.abs(elements.inclinationDeg - criteria.inclinationDeg) > criteria.inclinationToleranceDeg) reasons.push(`Inclinación ${elements.inclinationDeg.toFixed(2)}° fuera de ${criteria.inclinationDeg}° ± ${criteria.inclinationToleranceDeg}°.`);
    return { classification: reasons.length ? ORBIT_CLASSES.notReached : ORBIT_CLASSES.orbit,
      reasons: reasons.length ? reasons : ['Trayectoria ligada, sin intersección con la Tierra y dentro de los criterios del perigeo, apogeo e inclinación. No certifica operatividad.'],
      elements, minimumAltitudeKm, apogeeAltitudeKm, altitudeKm, criteria };
  } catch (error) {
    return { classification: ORBIT_CLASSES.unverifiable, reasons: [`No se pudo evaluar: ${error.message}.`], elements: null, minimumAltitudeKm: null, altitudeKm: null, criteria };
  }
}
