// Etapa 12E — Tierra para el lanzamiento: elipsoide WGS84, rotación y marco inercial.
//
// MARCO DE REFERENCIA (autoconsistente, NO conectado con las efemérides lunares):
//   ECI-L: origen en el centro de la Tierra, eje z = eje de rotación terrestre, eje x = dirección
//   del meridiano de referencia (longitud 0°) en el instante de lanzamiento t = 0 más el ángulo de
//   rotación declarado (earthRotationAngleDeg). La fecha de lanzamiento UTC es solo una etiqueta:
//   no se convierte a UT1/TDB ni se usan precesión, nutación ni movimiento polar. Por eso el marco no
//   afirma ninguna orientación absoluta respecto a ICRF, a la eclíptica J2000 ni a la Luna.
// Unidades: km, km/s, rad/s, s.
import { SOLAR_SYSTEM_GM_CATALOG } from '../science/GravitationalParameters.js';

// WGS84 (NIMA TR8350.2): semieje mayor y achatamiento. ω nominal de la Tierra (WGS84/IERS).
export const WGS84_A_KM = 6378.137;
export const WGS84_F = 1 / 298.257223563;
export const WGS84_B_KM = WGS84_A_KM * (1 - WGS84_F);
export const WGS84_E2 = WGS84_F * (2 - WGS84_F);
export const EARTH_ROTATION_RATE_RAD_S = 7.292115e-5;
// Mismo GM terrestre que el resto del laboratorio (catálogo de parámetros gravitacionales).
export const EARTH_GM_KM3_S2 = SOLAR_SYSTEM_GM_CATALOG.getMu('399');
export const STANDARD_GRAVITY_M_S2 = 9.80665;

const DEG = Math.PI / 180;
export const norm3 = v => Math.hypot(v[0], v[1], v[2]);
export const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const unit3 = v => { const n = norm3(v); return [v[0] / n, v[1] / n, v[2] / n]; };

export function geodeticToEcefKm({ latDeg, lonDeg, altitudeKm = 0 }) {
  if (![latDeg, lonDeg, altitudeKm].every(Number.isFinite) || Math.abs(latDeg) > 90) throw Error('Coordenadas geodésicas inválidas.');
  const phi = latDeg * DEG, lambda = lonDeg * DEG, s = Math.sin(phi), c = Math.cos(phi);
  const n = WGS84_A_KM / Math.sqrt(1 - WGS84_E2 * s * s);
  return [(n + altitudeKm) * c * Math.cos(lambda), (n + altitudeKm) * c * Math.sin(lambda), (n * (1 - WGS84_E2) + altitudeKm) * s];
}

// Rotación alrededor de z por el ángulo de rotación terrestre θ (ECEF → inercial).
export function ecefToInertial(ecef, thetaRad) {
  const c = Math.cos(thetaRad), s = Math.sin(thetaRad);
  return [ecef[0] * c - ecef[1] * s, ecef[0] * s + ecef[1] * c, ecef[2]];
}
export const earthRotationAngleRad = (seconds, initialAngleDeg = 0) => initialAngleDeg * DEG + EARTH_ROTATION_RATE_RAD_S * seconds;

// Velocidad inercial de un punto fijo a la Tierra (y de una atmósfera corrotante): ω × r.
export function corotatingVelocityKmS(position, omega = EARTH_ROTATION_RATE_RAD_S) {
  return [-omega * position[1], omega * position[0], 0];
}

// Altura geodésica sobre WGS84 (método iterativo; vale para cualquier latitud; invariante ante rotación en z).
export function geodeticFromPosition(position) {
  const p = Math.hypot(position[0], position[1]), z = position[2];
  let phi = Math.atan2(z, p * (1 - WGS84_E2));
  let height = 0;
  for (let i = 0; i < 12; i++) {
    const s = Math.sin(phi), n = WGS84_A_KM / Math.sqrt(1 - WGS84_E2 * s * s);
    height = p * Math.cos(phi) + z * s - WGS84_A_KM * Math.sqrt(1 - WGS84_E2 * s * s);
    phi = Math.atan2(z, p * (1 - WGS84_E2 * n / (n + height)));
  }
  return { latitudeRad: phi, altitudeKm: height };
}
// Radio geocéntrico del elipsoide a una latitud geocéntrica ψ.
export function ellipsoidRadiusKm(geocentricLatRad) {
  const c = Math.cos(geocentricLatRad), s = Math.sin(geocentricLatRad);
  return WGS84_A_KM * WGS84_B_KM / Math.sqrt((WGS84_B_KM * c) ** 2 + (WGS84_A_KM * s) ** 2);
}

// Base local geocéntrica (arriba = r̂; este = ẑ×r̂; norte = arriba×este). La guía usa esta base, no la geodésica.
export function localFrame(position) {
  const up = unit3(position);
  let east = cross3([0, 0, 1], up);
  east = norm3(east) < 1e-9 ? [0, 1, 0] : unit3(east);
  return { up, east, north: cross3(up, east) };
}
// Dirección horizontal con acimut medido desde el norte hacia el este.
export function horizontalDirection(frame, azimuthDeg) {
  const a = azimuthDeg * DEG;
  return [0, 1, 2].map(i => Math.cos(a) * frame.north[i] + Math.sin(a) * frame.east[i]);
}

export function launchSiteState({ latDeg, lonDeg, altitudeM = 0, earthRotationAngleDeg = 0 }) {
  const ecef = geodeticToEcefKm({ latDeg, lonDeg, altitudeKm: altitudeM / 1000 });
  const positionKm = ecefToInertial(ecef, earthRotationAngleRad(0, earthRotationAngleDeg));
  return { positionKm, velocityKmS: corotatingVelocityKmS(positionKm),
    surfaceSpeedKmS: norm3(corotatingVelocityKmS(positionKm)) };
}
