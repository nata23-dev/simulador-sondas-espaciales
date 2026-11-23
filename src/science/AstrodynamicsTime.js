/**
 * En este módulo gestiono la cadena explícita de escalas de tiempo para la
 * planificación interplanetaria:
 *   UTC --(TAI − UTC, segundos intercalares IERS)--> TAI --(+32,184 s exactos)--> TT --(TDB − TT periódico)--> TDB
 *
 * - Unidades: fechas julianas en días (JD UTC pseudo, JD TAI, JD TT, JD TDB, MJD)
 *   y desplazamientos temporales en segundos (s).
 * - Marco de referencia: independiente del marco espacial; TDB sirve como argumento
 *   temporal de las efemérides NASA/JPL.
 * - Límites y alcance: reutilizo la tabla IERS Bulletin C y la aproximación periódica
 *   de Fairhead & Bretagnon (1990) implementada en `HistoricalTime.js` (dos términos,
 *   error < 30 µs entre 1970 y 2100). Incorporo además el algoritmo DELTET de NAIF/SPICE
 *   (time.req) como formulación independiente de contraste para TDB − TT. Opero como
 *   módulo puro sin `Date` del navegador ni acceso al DOM, y considero predicción toda
 *   etiqueta UTC posterior en más de 6 meses al último segundo intercalar tabulado.
 */
import { IERS_LEAP_SECONDS_TABLE, J2000_JD, TT_MINUS_TAI_SECONDS, jdTdbToHistoricalLabels, roundedUtcLabelFromJdTai, taiMinusUtcAtPseudoJd, tdbMinusTtSeconds, utcTimestampToTdb } from './HistoricalTime.js';
import { jdToGregorianComponents, requireJdTdb } from './Time.js';
import { SECONDS_PER_DAY, requireFiniteNumber } from './Units.js';

export const LEAP_SECONDS_SOURCE = Object.freeze({
  table: 'IERS Bulletin C (TAI − UTC), equivalente al núcleo de segundos intercalares NAIF naif0012.tls',
  sourceUrls: Object.freeze(['https://hpiers.obspm.fr/iers/bul/bulc/Leap_Second.dat', 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/']),
  firstEntry: '1972-01-01 (TAI − UTC = 10 s)',
  lastEntry: `${IERS_LEAP_SECONDS_TABLE.at(-1).effectiveDateUtc} (TAI − UTC = ${IERS_LEAP_SECONDS_TABLE.at(-1).taiMinusUtcSeconds} s)`,
  coverage: 'Exacta desde 1972-01-01 hasta el último segundo intercalar anunciado. Para épocas futuras se asume que no se añaden segundos intercalares (TAI − UTC = 37 s): la etiqueta UTC de una fecha futura es una predicción; la época TDB, que es la que usa el cálculo, no depende de esa suposición si el usuario introduce TDB.',
  externalCheck: 'Contrastado con ΔT = TDB − UT de NASA/JPL Horizons (cantidad 30) en 2026, 2030, 2035 y 2045 (tests/fixtures/interplanetary-horizons-holdout-v1.json).'
});

export const TIME_SCALE_NOTE = 'UTC: tiempo civil con segundos intercalares. TAI: atómico continuo. TT = TAI + 32,184 s. TDB: tiempo dinámico baricéntrico (argumento de las efemérides JPL); TDB − TT oscila ±1,66 ms.';

/**
 * Aquí calculo TDB − TT en segundos mediante el algoritmo DELTET de NAIF/SPICE
 * (`time.req`): `K·sin(E)` con `E = M + EB·sin(M)` y `M = M0 + M1·t`.
 */
export function naifDeltetTdbMinusTt(jdTt) {
  requireFiniteNumber(jdTt, 'jdTt');
  const K = 1.657e-3, EB = 1.671e-2, M0 = 6.239996, M1 = 1.99096871e-7;
  const seconds = (jdTt - J2000_JD) * SECONDS_PER_DAY;
  const M = M0 + M1 * seconds;
  return K * Math.sin(M + EB * Math.sin(M));
}

/**
 * Aquí descompongo una marca UTC (`YYYY-MM-DD[ HH:MM[:SS]]`) en sus equivalentes
 * JD UTC (pseudo), JD TAI, JD TT y JD TDB, devolviendo cada salto en segundos
 * y señalando si la etiqueta UTC cae en horizonte de predicción.
 */
export function utcToTimeScales(utcText) {
  const tdb = utcTimestampToTdb(utcText);
  const jdTdb = tdb.jdTdb;
  const jdTt = jdTdb - tdb.tdbMinusTtSeconds / SECONDS_PER_DAY;
  const jdTai = jdTt - TT_MINUS_TAI_SECONDS / SECONDS_PER_DAY;
  const jdUtcPseudo = jdTai - tdb.taiMinusUtcSeconds / SECONDS_PER_DAY;
  return Object.freeze({ utcInput: tdb.utcInput, jdUtcPseudo, jdTai, jdTt, jdTdb,
    taiMinusUtcSeconds: tdb.taiMinusUtcSeconds, ttMinusTaiSeconds: TT_MINUS_TAI_SECONDS, tdbMinusTtSeconds: tdb.tdbMinusTtSeconds,
    tdbMinusUtcSeconds: tdb.tdbMinusUtcSeconds, utcPredicted: isUtcPrediction(jdUtcPseudo) });
}

/**
 * Aquí aplico la conversión inversa: parto de un JD TDB y devuelvo las cuatro
 * escalas temporales junto con sus etiquetas legibles. Durante un segundo
 * intercalar muestro `23:59:60` en `labelUtc`; en `jdUtcPseudo`, como en todo
 * pseudo-JD de días fijos de 86 400 s, ese segundo no se distingue de las 00:00:00 siguientes.
 */
export function tdbToTimeScales(jdTdb) {
  requireJdTdb(jdTdb);
  const labels = jdTdbToHistoricalLabels(jdTdb);
  const relSeconds = tdbMinusTtSeconds(jdTdb);
  const jdTt = jdTdb - relSeconds / SECONDS_PER_DAY;
  const jdTai = jdTt - TT_MINUS_TAI_SECONDS / SECONDS_PER_DAY;
  const jdUtcPseudo = jdTai - labels.taiMinusUtcSeconds / SECONDS_PER_DAY;
  return Object.freeze({ jdTdb, jdTt, jdTai, jdUtcPseudo, taiMinusUtcSeconds: labels.taiMinusUtcSeconds, tdbMinusTtSeconds: relSeconds,
    tdbMinusUtcSeconds: labels.tdbMinusUtcSeconds, labelTdb: roundedLabel(jdTdb, 'TDB'), labelUtc: roundedUtcLabelFromJdTai(jdTai),
    labelTdbTruncated: labels.labelTdb, labelUtcTruncated: labels.labelUtc, utcPredicted: isUtcPrediction(jdUtcPseudo) });
}

/**
 * Formateo una fecha juliana como «YYYY-MM-DD · HH:MM:SS escala» redondeando al
 * segundo más próximo (en doble precisión el JD resuelve alrededor de 40 µs).
 */
export function roundedLabel(jd, scale) {
  const day = Math.floor(jd + 0.5);
  let seconds = Math.round((jd + 0.5 - day) * SECONDS_PER_DAY), dayNumber = day;
  if (seconds >= SECONDS_PER_DAY) { seconds -= SECONDS_PER_DAY; dayNumber += 1; }
  const c = jdToGregorianComponents(dayNumber - 0.5 + seconds / SECONDS_PER_DAY);
  return `${c.dateIso} · ${c.timeHms} ${scale}`;
}

/**
 * Determino si una fecha UTC sobrepasa en más de 6 meses el último segundo
 * intercalar tabulado por el IERS (horizonte habitual de anuncio del boletín C).
 */
export function isUtcPrediction(jdUtcPseudo) {
  return jdUtcPseudo > IERS_LEAP_SECONDS_TABLE.at(-1).effectiveJdUtcPseudo + 183;
}

/**
 * Convierto una cadena `YYYY-MM-DDTHH:MM` (propia de campos datetime-local)
 * interpretada estrictamente como UTC a su fecha juliana JD TDB.
 */
export function datetimeLocalUtcToJdTdb(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(value)) throw new TypeError('Fecha UTC con formato YYYY-MM-DDTHH:MM.');
  return utcTimestampToTdb(value.replace('T', ' ')).jdTdb;
}

/** Calculo la fecha juliana modificada (MJD = JD − 2 400 000,5) conservando la escala original. */
export const jdToMjd = jd => requireFiniteNumber(jd, 'jd') - 2400000.5;

export { J2000_JD, TT_MINUS_TAI_SECONDS, taiMinusUtcAtPseudoJd, tdbMinusTtSeconds };
