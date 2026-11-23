// Aquí defino el modelo de la Tierra para el lanzamiento: elipsoide WGS84, velocidad de rotación
// y marco inercial local ECI-L.
//
// Uso un marco autoconsistente (sin acoplarlo con las efemérides lunares ni planetarias):
// pongo el origen en el centro terrestre, el eje z en el eje de rotación y el eje x alineado con el
// meridiano de longitud 0° en t = 0 más el ángulo inicial `earthRotationAngleDeg`. La fecha UTC se
// conserva solo como etiqueta, sin aplicar conversión a UT1/TDB ni precesión, nutación o movimiento polar.
// Unidades: km, km/s, rad/s y s.
import { SOLAR_SYSTEM_GM_CATALOG } from '../science/GravitationalParameters.js';

// Defino los parámetros geométricos del elipsoide WGS84 (NIMA TR8350.2) y la velocidad angular nominal terrestre.
export const WGS84_A_KM = 6378.137;
export const WGS84_F = 1 / 298.257223563;
export const WGS84_B_KM = WGS84_A_KM * (1 - WGS84_F);
export const WGS84_E2 = WGS84_F * (2 - WGS84_F);
export const EARTH_ROTATION_RATE_RAD_S = 7.292115e-5;
// Tomo el mismo GM terrestre (km³/s²) que utiliza el resto del laboratorio desde el catálogo gravitacional.
export const EARTH_GM_KM3_S2 = SOLAR_SYSTEM_GM_CATALOG.getMu('399');
export const STANDARD_GRAVITY_M_S2 = 9.80665;

const DEG = Math.PI / 180;
// Defino operaciones vectoriales básicas en R³ para no depender de librerías externas en la dinámica.
export const norm3 = v => Math.hypot(v[0], v[1], v[2]);
export const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const unit3 = v => { const n = norm3(v); return [v[0] / n, v[1] / n, v[2] / n]; };

// Convierto coordenadas geodésicas (latitud/longitud en grados y altitud en km) a coordenadas ECEF en km sobre WGS84.
export function geodeticToEcefKm({ latDeg, lonDeg, altitudeKm = 0 }) {
  if (![latDeg, lonDeg, altitudeKm].every(Number.isFinite) || Math.abs(latDeg) > 90) throw Error('Coordenadas geodésicas inválidas.');
  const phi = latDeg * DEG, lambda = lonDeg * DEG, s = Math.sin(phi), c = Math.cos(phi);
  const n = WGS84_A_KM / Math.sqrt(1 - WGS84_E2 * s * s);
  return [(n + altitudeKm) * c * Math.cos(lambda), (n + altitudeKm) * c * Math.sin(lambda), (n * (1 - WGS84_E2) + altitudeKm) * s];
}

// Roto un vector ECEF alrededor del eje z un ángulo θ (rad) para pasarlo al marco inercial ECI-L.
export function ecefToInertial(ecef, thetaRad) {
  const c = Math.cos(thetaRad), s = Math.sin(thetaRad);
  return [ecef[0] * c - ecef[1] * s, ecef[0] * s + ecef[1] * c, ecef[2]];
}
// Calculo el ángulo de rotación terrestre acumulado (rad) para un tiempo en segundos desde el lanzamiento.
export const earthRotationAngleRad = (seconds, initialAngleDeg = 0) => initialAngleDeg * DEG + EARTH_ROTATION_RATE_RAD_S * seconds;

// Calculo la velocidad inercial ω × r (km/s) de un punto solidario a la Tierra o de la atmósfera corrotante.
export function corotatingVelocityKmS(position, omega = EARTH_ROTATION_RATE_RAD_S) {
  return [-omega * position[1], omega * position[0], 0];
}

// Obtengo latitud geodésica (rad) y altitud (km) sobre WGS84 mediante iteración de punto fijo (invariante ante giros en z).
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
// Calculo el radio geocéntrico (km) de la superficie del elipsoide WGS84 a una latitud geocéntrica ψ (rad).
export function ellipsoidRadiusKm(geocentricLatRad) {
  const c = Math.cos(geocentricLatRad), s = Math.sin(geocentricLatRad);
  return WGS84_A_KM * WGS84_B_KM / Math.sqrt((WGS84_B_KM * c) ** 2 + (WGS84_A_KM * s) ** 2);
}

// Construyo la base local geocéntrica (up = r̂, east = ẑ×r̂, north = up×east) que empleo en las leyes de guiado.
export function localFrame(position) {
  const up = unit3(position);
  let east = cross3([0, 0, 1], up);
  east = norm3(east) < 1e-9 ? [0, 1, 0] : unit3(east);
  return { up, east, north: cross3(up, east) };
}
// Calculo el vector unitario horizontal correspondiente a un acimut en grados medido desde el norte hacia el este.
export function horizontalDirection(frame, azimuthDeg) {
  const a = azimuthDeg * DEG;
  return [0, 1, 2].map(i => Math.cos(a) * frame.north[i] + Math.sin(a) * frame.east[i]);
}

// Obtengo la posición inicial (km), la velocidad inercial de corrotación (km/s) y su rapidez superficial en la rampa.
export function launchSiteState({ latDeg, lonDeg, altitudeM = 0, earthRotationAngleDeg = 0 }) {
  const ecef = geodeticToEcefKm({ latDeg, lonDeg, altitudeKm: altitudeM / 1000 });
  const positionKm = ecefToInertial(ecef, earthRotationAngleRad(0, earthRotationAngleDeg));
  return { positionKm, velocityKmS: corotatingVelocityKmS(positionKm),
    surfaceSpeedKmS: norm3(corotatingVelocityKmS(positionKm)) };
}
