/**
 * En este módulo modelo la orientación de la Tierra para enlazar un lanzamiento
 * desde superficie con las efemérides planetarias, sin depender del DOM ni de Three.js.
 *
 * - Unidades: fechas julianas en JD TT, JD TDB y JD UTC (pseudo); ángulos de precesión
 *   en radianes (rad) y tiempo sidéreo medio de Greenwich (GMST) en grados (°); matrices
 *   de rotación ortogonales adimensionales (conservan km o km/s de los vectores rotados).
 * - Marcos de referencia que enlazo:
 *   1. Marco inercial de lanzamiento («ECI-L»): eje +Z en el eje de rotación terrestre y
 *      +X en el meridiano de Greenwich girado el ángulo de rotación inicial. Cuando ese
 *      ángulo coincide con el GMST del despegue, ECI-L coincide con los ejes del ecuador
 *      y equinoccio medios de la fecha.
 *   2. Ecuador y equinoccio medios J2000 mediante la precesión IAU 1976 (Lieske et al. 1977),
 *      asimilados a ICRF (desprecio el sesgo de marco de ≈ 0,023″).
 *   3. Eclíptica J2000 de las efemérides del proyecto (`Frames.js`, oblicuidad ε = 84 381,448″).
 * - Límites del modelo: no incluyo nutación (≤ 17″ en longitud y ≤ 9″ en oblicuidad),
 *   movimiento del polo ni la diferencia UT1 − UTC (< 0,9 s, pues evalúo el GMST con UTC).
 *   El efecto acumulado en la orientación del sitio de lanzamiento es del orden de 10⁻² °.
 */
import { tiempoSidereoMedioGrados } from './VoyagerLaunchProfile.js';
import { icrfEquatorialToEclipticJ2000 } from './Frames.js';
import { tdbToTimeScales } from './AstrodynamicsTime.js';

const ARCSEC = Math.PI / 180 / 3600;
const J2000 = 2451545.0;

// Defino rotaciones pasivas de ejes según la convención de las IERS Conventions (R1, R2, R3 alrededor de x, y, z).
const R1 = a => { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, s], [0, -s, c]]; };
const R2 = a => { const c = Math.cos(a), s = Math.sin(a); return [[c, 0, -s], [0, 1, 0], [s, 0, c]]; };
const R3 = a => { const c = Math.cos(a), s = Math.sin(a); return [[c, s, 0], [-s, c, 0], [0, 0, 1]]; };
/** Multiplico dos matrices 3×3 (`A · B`). */
export const multiplyMatrices = (A, B) => A.map(row => [0, 1, 2].map(j => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j]));
/** Obtengo la transpuesta (inversa ortogonal) de una matriz 3×3. */
export const transposeMatrix = A => [0, 1, 2].map(i => [A[0][i], A[1][i], A[2][i]]);
/** Aplico una matriz 3×3 a un vector columna `[x, y, z]`. */
export const applyMatrix = (A, v) => [A[0][0] * v[0] + A[0][1] * v[1] + A[0][2] * v[2], A[1][0] * v[0] + A[1][1] * v[1] + A[1][2] * v[2], A[2][0] * v[0] + A[2][1] * v[1] + A[2][2] * v[2]];

/**
 * Aquí calculo los ángulos de precesión IAU 1976 (ζ_A, z_A, θ_A) desde J2000
 * hasta la fecha `jdTt` (en fecha juliana TT) y los devuelvo en radianes.
 */
export function precessionAnglesIau1976(jdTt) {
  if (!Number.isFinite(jdTt)) throw new TypeError('Se requiere una fecha juliana TT finita.');
  const T = (jdTt - J2000) / 36525;
  return Object.freeze({
    zetaRad: (2306.2181 * T + 0.30188 * T * T + 0.017998 * T ** 3) * ARCSEC,
    zRad: (2306.2181 * T + 1.09468 * T * T + 0.018203 * T ** 3) * ARCSEC,
    thetaRad: (2004.3109 * T - 0.42665 * T * T - 0.041833 * T ** 3) * ARCSEC
  });
}

/**
 * Aquí construyo la matriz de precesión `P` (IAU 1976) que transforma un vector
 * expresado en ecuador y equinoccio medios J2000 al ecuador y equinoccio medios de la fecha.
 */
export function precessionMatrixJ2000ToDate(jdTt) {
  const { zetaRad, zRad, thetaRad } = precessionAnglesIau1976(jdTt);
  return multiplyMatrices(R3(-zRad), multiplyMatrices(R2(thetaRad), R3(-zetaRad)));
}

/**
 * Aquí construyo la misma transformación usando el modelo de precesión IAU 2006
 * (Capitaine et al. 2003, P03; IERS Conventions 2010, ec. 5.39–5.40) en su forma de
 * cuatro rotaciones `P = R3(χ_A)·R1(−ω_A)·R3(−ψ_A)·R1(ε₀)`. La mantengo como referencia
 * independiente para contrastar la formulación IAU 1976.
 */
export function precessionMatrixJ2000ToDateIau2006(jdTt) {
  const T = (jdTt - J2000) / 36525, eps0 = 84381.406;
  const psi = (5038.481507 * T - 1.0790069 * T ** 2 - 0.00114045 * T ** 3 + 0.000132851 * T ** 4) * ARCSEC;
  const omega = (eps0 - 0.025754 * T + 0.0512623 * T ** 2 - 0.00772503 * T ** 3) * ARCSEC;
  const chi = (10.556403 * T - 2.3814292 * T ** 2 - 0.00121197 * T ** 3) * ARCSEC;
  return multiplyMatrices(R3(chi), multiplyMatrices(R1(-omega), multiplyMatrices(R3(-psi), R1(eps0 * ARCSEC))));
}

/** Calculo el tiempo sidéreo medio de Greenwich (GMST, en grados) para un instante JD TDB tomando UT1 ≈ UTC. */
export function greenwichMeanSiderealDeg(jdTdb) {
  return tiempoSidereoMedioGrados(tdbToTimeScales(jdTdb).jdUtcPseudo);
}

/**
 * Aquí obtengo la matriz `M` (3×3) que lleva un vector del marco inercial de lanzamiento
 * con ángulo de rotación inicial 0 (`+X` en el meridiano de Greenwich al despegar) hacia
 * ejes eclípticos J2000 (`v_ecl = M · v_L0`). Como la Tierra del modelo de ascenso es
 * esférica, su atmósfera corrota y el guiado se define en ejes locales, cualquier ángulo
 * inicial `g` equivale a girar la trayectoria `g` alrededor de Z; tomando `g = GMST`,
 * alineo el marco de lanzamiento con el ecuador y equinoccio medios de la fecha.
 */
export function launchFrameToEclipticJ2000(liftoffJdTdb) {
  const scales = tdbToTimeScales(liftoffJdTdb);
  const g = tiempoSidereoMedioGrados(scales.jdUtcPseudo) * Math.PI / 180;
  // Aplico un giro activo +g alrededor de Z para pasar del meridiano de Greenwich al equinoccio medio de la fecha.
  const toDate = R3(-g);
  const toJ2000 = transposeMatrix(precessionMatrixJ2000ToDate(scales.jdTt));
  const eq = multiplyMatrices(toJ2000, toDate);
  const columns = [0, 1, 2].map(j => icrfEquatorialToEclipticJ2000([eq[0][j], eq[1][j], eq[2][j]]));
  return Object.freeze({ matrix: [0, 1, 2].map(i => columns.map(c => c[i])), gmstDeg: g * 180 / Math.PI, jdTt: scales.jdTt, jdUtc: scales.jdUtcPseudo });
}
