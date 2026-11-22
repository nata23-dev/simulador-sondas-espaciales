// Etapa 21 — orientación de la Tierra para enlazar el lanzamiento con las efemérides. Solo ciencia: sin DOM ni Three.js.
//
// Marcos que se enlazan:
//   · inercial del lanzamiento de 12E («ECI-L»): z = eje de rotación y x = meridiano de Greenwich girado el «ángulo de rotación
//     terrestre inicial». Si ese ángulo es el tiempo sidéreo medio de Greenwich (GMST) del despegue, ECI-L son los ejes del ecuador
//     y el equinoccio medios de la fecha;
//   · ecuador y equinoccio medios J2000, mediante la precesión IAU 1976 (Lieske et al. 1977). Se toman como ICRF: el sesgo de
//     marco (≈ 0,023″) se ignora;
//   · eclíptica J2000 de las efemérides del proyecto (Frames.js, ε = 84 381,448″).
// Se ignoran la nutación (≤ 17″ en longitud, ≤ 9″ en oblicuidad), el movimiento del polo y UT1 − UTC (< 0,9 s; el GMST se
// evalúa con UTC). El efecto conjunto es del orden de 10⁻² ° en la orientación del sitio de lanzamiento.
import { tiempoSidereoMedioGrados } from './VoyagerLaunchProfile.js';
import { icrfEquatorialToEclipticJ2000 } from './Frames.js';
import { tdbToTimeScales } from './AstrodynamicsTime.js';

const ARCSEC = Math.PI / 180 / 3600;
const J2000 = 2451545.0;

// Rotaciones de ejes (pasivas), convención de las IERS Conventions: R1, R2, R3 alrededor de x, y, z.
const R1 = a => { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, s], [0, -s, c]]; };
const R2 = a => { const c = Math.cos(a), s = Math.sin(a); return [[c, 0, -s], [0, 1, 0], [s, 0, c]]; };
const R3 = a => { const c = Math.cos(a), s = Math.sin(a); return [[c, s, 0], [-s, c, 0], [0, 0, 1]]; };
export const multiplyMatrices = (A, B) => A.map(row => [0, 1, 2].map(j => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j]));
export const transposeMatrix = A => [0, 1, 2].map(i => [A[0][i], A[1][i], A[2][i]]);
export const applyMatrix = (A, v) => [A[0][0] * v[0] + A[0][1] * v[1] + A[0][2] * v[2], A[1][0] * v[0] + A[1][1] * v[1] + A[1][2] * v[2], A[2][0] * v[0] + A[2][1] * v[1] + A[2][2] * v[2]];

/** Ángulos de precesión IAU 1976 (ζ_A, z_A, θ_A) desde J2000 hasta la fecha, en radianes. `jdTt`: fecha juliana TT. */
export function precessionAnglesIau1976(jdTt) {
  if (!Number.isFinite(jdTt)) throw new TypeError('Se requiere una fecha juliana TT finita.');
  const T = (jdTt - J2000) / 36525;
  return Object.freeze({
    zetaRad: (2306.2181 * T + 0.30188 * T * T + 0.017998 * T ** 3) * ARCSEC,
    zRad: (2306.2181 * T + 1.09468 * T * T + 0.018203 * T ** 3) * ARCSEC,
    thetaRad: (2004.3109 * T - 0.42665 * T * T - 0.041833 * T ** 3) * ARCSEC
  });
}

/** Matriz de precesión P (IAU 1976): vector en ecuador y equinoccio medios de la fecha = P · vector en J2000. */
export function precessionMatrixJ2000ToDate(jdTt) {
  const { zetaRad, zRad, thetaRad } = precessionAnglesIau1976(jdTt);
  return multiplyMatrices(R3(-zRad), multiplyMatrices(R2(thetaRad), R3(-zetaRad)));
}

/**
 * Misma matriz con la precesión IAU 2006 (Capitaine et al. 2003, P03; IERS Conventions 2010, ec. 5.39–5.40), en su forma de
 * cuatro rotaciones P = R3(χ_A)·R1(−ω_A)·R3(−ψ_A)·R1(ε₀). Es una formulación independiente; solo se usa para contrastar la de 1976.
 */
export function precessionMatrixJ2000ToDateIau2006(jdTt) {
  const T = (jdTt - J2000) / 36525, eps0 = 84381.406;
  const psi = (5038.481507 * T - 1.0790069 * T ** 2 - 0.00114045 * T ** 3 + 0.000132851 * T ** 4) * ARCSEC;
  const omega = (eps0 - 0.025754 * T + 0.0512623 * T ** 2 - 0.00772503 * T ** 3) * ARCSEC;
  const chi = (10.556403 * T - 2.3814292 * T ** 2 - 0.00121197 * T ** 3) * ARCSEC;
  return multiplyMatrices(R3(chi), multiplyMatrices(R1(-omega), multiplyMatrices(R3(-psi), R1(eps0 * ARCSEC))));
}

/** GMST (grados) en el instante TDB dado, con UT1 ≈ UTC. */
export function greenwichMeanSiderealDeg(jdTdb) {
  return tiempoSidereoMedioGrados(tdbToTimeScales(jdTdb).jdUtcPseudo);
}

/**
 * Matriz M (3×3) que lleva un vector del marco inercial del lanzamiento de 12E calculado con ángulo de rotación inicial 0
 * (x = meridiano de Greenwich en el despegue) a ejes eclípticos J2000: v_ecl = M · v_L0. Como la Tierra de 12E es puntual,
 * su atmósfera corrota y el guiado se define en ejes locales, la trayectoria con otro ángulo inicial g es la misma girada g
 * alrededor de z; con g = GMST del despegue, ECI-L son los ejes medios de la fecha.
 */
export function launchFrameToEclipticJ2000(liftoffJdTdb) {
  const scales = tdbToTimeScales(liftoffJdTdb);
  const g = tiempoSidereoMedioGrados(scales.jdUtcPseudo) * Math.PI / 180;
  const toDate = R3(-g); // giro activo +g alrededor de z (de Greenwich al equinoccio medio de la fecha)
  const toJ2000 = transposeMatrix(precessionMatrixJ2000ToDate(scales.jdTt));
  const eq = multiplyMatrices(toJ2000, toDate);
  const columns = [0, 1, 2].map(j => icrfEquatorialToEclipticJ2000([eq[0][j], eq[1][j], eq[2][j]]));
  return Object.freeze({ matrix: [0, 1, 2].map(i => columns.map(c => c[i])), gmstDeg: g * 180 / Math.PI, jdTt: scales.jdTt, jdUtc: scales.jdUtcPseudo });
}
