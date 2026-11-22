// Etapa 12G — cadena explícita de escalas de tiempo para la planificación interplanetaria.
//   UTC --(TAI−UTC, segundos intercalares)--> TAI --(+32,184 s exactos)--> TT --(TDB−TT periódico)--> TDB
// Reutiliza la tabla de segundos intercalares y la conversión de `HistoricalTime.js` (Fairhead & Bretagnon 1990,
// dos términos, error < 30 µs en 1970–2100). Añade el algoritmo DELTET de NAIF/SPICE (time.req) como formulación
// independiente para contrastar TDB − TT. Módulo puro: sin Date del navegador, sin DOM.
import { IERS_LEAP_SECONDS_TABLE, J2000_JD, TT_MINUS_TAI_SECONDS, jdTdbToHistoricalLabels, taiMinusUtcAtPseudoJd, tdbMinusTtSeconds, utcTimestampToTdb } from './HistoricalTime.js';
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

/** TDB − TT según el algoritmo DELTET de SPICE (time.req): K·sin(E), E = M + EB·sin(M), M = M0 + M1·t. */
export function naifDeltetTdbMinusTt(jdTt) {
  requireFiniteNumber(jdTt, 'jdTt');
  const K = 1.657e-3, EB = 1.671e-2, M0 = 6.239996, M1 = 1.99096871e-7;
  const seconds = (jdTt - J2000_JD) * SECONDS_PER_DAY;
  const M = M0 + M1 * seconds;
  return K * Math.sin(M + EB * Math.sin(M));
}

/** Descompone una marca UTC (`YYYY-MM-DD[ HH:MM[:SS]]`) en JD UTC (pseudo), TAI, TT y TDB, con cada diferencia. */
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

/** Inversa: a partir de un JD TDB devuelve las cuatro escalas y etiquetas legibles. */
export function tdbToTimeScales(jdTdb) {
  requireJdTdb(jdTdb);
  const labels = jdTdbToHistoricalLabels(jdTdb);
  const relSeconds = tdbMinusTtSeconds(jdTdb);
  const jdTt = jdTdb - relSeconds / SECONDS_PER_DAY;
  const jdTai = jdTt - TT_MINUS_TAI_SECONDS / SECONDS_PER_DAY;
  const jdUtcPseudo = jdTai - labels.taiMinusUtcSeconds / SECONDS_PER_DAY;
  return Object.freeze({ jdTdb, jdTt, jdTai, jdUtcPseudo, taiMinusUtcSeconds: labels.taiMinusUtcSeconds, tdbMinusTtSeconds: relSeconds,
    tdbMinusUtcSeconds: labels.tdbMinusUtcSeconds, labelTdb: roundedLabel(jdTdb, 'TDB'), labelUtc: roundedLabel(jdUtcPseudo, 'UTC'),
    labelTdbTruncated: labels.labelTdb, labelUtcTruncated: labels.labelUtc, utcPredicted: isUtcPrediction(jdUtcPseudo) });
}

/** Etiqueta «YYYY-MM-DD · HH:MM:SS escala» redondeada al segundo más próximo (el JD en doble precisión resuelve ~40 µs). */
export function roundedLabel(jd, scale) {
  const day = Math.floor(jd + 0.5);
  let seconds = Math.round((jd + 0.5 - day) * SECONDS_PER_DAY), dayNumber = day;
  if (seconds >= SECONDS_PER_DAY) { seconds -= SECONDS_PER_DAY; dayNumber += 1; }
  const c = jdToGregorianComponents(dayNumber - 0.5 + seconds / SECONDS_PER_DAY);
  return `${c.dateIso} · ${c.timeHms} ${scale}`;
}

/** Verdadero si la fecha UTC es posterior al último segundo intercalar tabulado más 6 meses (horizonte de anuncio de IERS). */
export function isUtcPrediction(jdUtcPseudo) {
  return jdUtcPseudo > IERS_LEAP_SECONDS_TABLE.at(-1).effectiveJdUtcPseudo + 183;
}

/** `YYYY-MM-DDTHH:MM` (campo datetime-local) interpretado como UTC → JD TDB. */
export function datetimeLocalUtcToJdTdb(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(value)) throw new TypeError('Fecha UTC con formato YYYY-MM-DDTHH:MM.');
  return utcTimestampToTdb(value.replace('T', ' ')).jdTdb;
}

/** Fecha juliana modificada (MJD = JD − 2 400 000,5) en la misma escala. */
export const jdToMjd = jd => requireFiniteNumber(jd, 'jd') - 2400000.5;

export { J2000_JD, TT_MINUS_TAI_SECONDS, taiMinusUtcAtPseudoJd, tdbMinusTtSeconds };
