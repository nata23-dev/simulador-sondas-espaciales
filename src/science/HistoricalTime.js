/**
 * En este módulo implemento las conversiones exactas entre UTC, TAI, TT y TDB
 * con soporte explícito para segundos intercalares, además del reloj dividido
 * de alta precisión para líneas temporales históricas de varias décadas.
 *
 * - Unidades: fechas julianas en días (JD UTC pseudo, JD TAI, JD TT, JD TDB),
 *   desplazamientos e intervalos en segundos (s) y años julianos de 365,25 días
 *   (31 557 600 s exactos según la IAU).
 * - Marco de referencia: independiente del marco espacial; TDB actúa como escala
 *   temporal canónica de las efemérides NASA/JPL Horizons.
 * - Fuentes y límites: utilizo la tabla oficial IERS Bulletin C de segundos
 *   intercalares (exacta desde 1972-01-01 hasta el último salto tabulado) y la
 *   fórmula relativista periódica de dos términos de Fairhead & Bretagnon (1990) /
 *   IAU SOFA (exactitud < 30 µs entre 1970 y 2100). Rechazo fechas anteriores a
 *   1972-01-01 para conversiones UTC↔TDB y nunca dependo de `Date` del navegador.
 */
import {
  gregorianLabelToJulianMidnight,
  jdToGregorianComponents,
  requireJdTdb
} from './Time.js';
import { requireFiniteNumber, SECONDS_PER_DAY } from './Units.js';

export const J2000_JD = 2451545.0;
export const TT_MINUS_TAI_SECONDS = 32.184;
// Uso el año juliano exacto definido por la IAU: 365,25 días = 31 557 600 s.
export const JULIAN_YEAR_SECONDS = 365.25 * SECONDS_PER_DAY;
// Fijo el ancla histórica en la fecha de lanzamiento de Voyager 2 (1977-08-20, JD 2443375.5).
export const HISTORICAL_ANCHOR_JD_TDB = gregorianLabelToJulianMidnight('1977-08-20');

/**
 * Mantengo aquí la tabla histórica oficial del IERS Bulletin C de saltos
 * `TAI − UTC` vigente desde 1972-01-01 hasta 2026+ (último salto introducido
 * el 2017-01-01).
 */
export const IERS_LEAP_SECONDS_TABLE = Object.freeze([
  ['1972-01-01', 10],
  ['1972-07-01', 11],
  ['1973-01-01', 12],
  ['1974-01-01', 13],
  ['1975-01-01', 14],
  ['1976-01-01', 15],
  ['1977-01-01', 16],
  ['1978-01-01', 17],
  ['1979-01-01', 18],
  ['1980-01-01', 19],
  ['1981-07-01', 20],
  ['1982-07-01', 21],
  ['1983-07-01', 22],
  ['1985-07-01', 23],
  ['1988-01-01', 24],
  ['1990-01-01', 25],
  ['1991-01-01', 26],
  ['1992-07-01', 27],
  ['1993-07-01', 28],
  ['1994-07-01', 29],
  ['1996-01-01', 30],
  ['1997-07-01', 31],
  ['1999-01-01', 32],
  ['2006-01-01', 33],
  ['2009-01-01', 34],
  ['2012-07-01', 35],
  ['2015-07-01', 36],
  ['2017-01-01', 37]
].map(([effectiveDateUtc, taiMinusUtcSeconds]) => Object.freeze({
  effectiveDateUtc,
  effectiveJdUtcPseudo: gregorianLabelToJulianMidnight(effectiveDateUtc),
  taiMinusUtcSeconds
})));

/**
 * Aquí calculo el término relativista periódico `TDB − TT` en segundos según
 * Fairhead & Bretagnon (1990) / IAU SOFA de dos términos:
 * `0,001657·sin(g) + 0,000022·sin(2g)` (exactitud < 30 µs entre 1970 y 2100).
 */
export function tdbMinusTtSeconds(jdApprox) {
  requireFiniteNumber(jdApprox, 'jdApprox');
  const daysFromJ2000 = jdApprox - J2000_JD;
  const gRad = (357.5277233 + 0.9856002831 * daysFromJ2000) * (Math.PI / 180);
  return 0.001657 * Math.sin(gRad) + 0.000022 * Math.sin(2 * gRad);
}

/**
 * Aquí consulto el desplazamiento entero `TAI − UTC` en segundos para un
 * pseudo-JD UTC, rechazando cualquier fecha anterior a 1972-01-01.
 */
export function taiMinusUtcAtPseudoJd(jdUtcPseudo) {
  requireFiniteNumber(jdUtcPseudo, 'jdUtcPseudo');
  if (jdUtcPseudo < IERS_LEAP_SECONDS_TABLE[0].effectiveJdUtcPseudo) {
    throw new RangeError('La conversión exacta UTC<->TDB con segundos intercalares requiere fechas >= 1972-01-01.');
  }
  let current = IERS_LEAP_SECONDS_TABLE[0].taiMinusUtcSeconds;
  for (let i = 1; i < IERS_LEAP_SECONDS_TABLE.length; i++) {
    if (jdUtcPseudo >= IERS_LEAP_SECONDS_TABLE[i].effectiveJdUtcPseudo) {
      current = IERS_LEAP_SECONDS_TABLE[i].taiMinusUtcSeconds;
    } else {
      break;
    }
  }
  return current;
}

/**
 * Aquí compruebo si el día UTC que comienza en `midnightPseudoJd` termina con
 * un segundo intercalar positivo (`23:59:60`) en la tabla IERS; devuelvo sus
 * metadatos o `null`. Comparo exactamente porque cada medianoche es un semientero
 * (`x,5`) representable sin error en doble precisión.
 */
export function leapSecondEndingUtcDay(midnightPseudoJd) {
  requireFiniteNumber(midnightPseudoJd, 'midnightPseudoJd');
  const nextMidnight = midnightPseudoJd + 1;
  for (let i = 1; i < IERS_LEAP_SECONDS_TABLE.length; i++) {
    const entry = IERS_LEAP_SECONDS_TABLE[i];
    if (entry.effectiveJdUtcPseudo !== nextMidnight) continue;
    const previous = IERS_LEAP_SECONDS_TABLE[i - 1].taiMinusUtcSeconds;
    return entry.taiMinusUtcSeconds === previous + 1
      ? Object.freeze({ dateUtc: entry.effectiveDateUtc, taiMinusUtcBeforeSeconds: previous, taiMinusUtcAfterSeconds: entry.taiMinusUtcSeconds })
      : null;
  }
  return null;
}

/**
 * Aquí analizo una marca UTC ISO/astronómica (`YYYY-MM-DD`, `YYYY-MM-DD HH:MM[:SS]`,
 * `YYYY-MM-DDTHH:MM:SS[.sss]Z`) sin delegar en `Date` del navegador. Solo acepto
 * el segundo `:60` como `23:59:60[.sss]` del último día UTC previo a un salto
 * positivo tabulado por el IERS.
 */
export function parseUtcTimestamp(utcText) {
  if (typeof utcText !== 'string' || utcText.trim() === '') {
    throw new TypeError('utcText debe ser una cadena UTC no vacía.');
  }
  const trimmed = utcText.trim();
  const match = /^([0-9]{4}-[0-9]{2}-[0-9]{2})(?:[ T]([0-9]{2}):([0-9]{2})(?::([0-9]{2})(?:\.([0-9]+))?)?(?:Z|\s*UTC)?)?$/i.exec(trimmed);
  if (!match) {
    throw new RangeError(`Formato UTC inválido: ${utcText}`);
  }
  const [, dateIso, hText = '00', mText = '00', sText = '00', fracText = '0'] = match;
  const midnightPseudoJd = gregorianLabelToJulianMidnight(dateIso);
  const hour = Number(hText);
  const minute = Number(mText);
  const second = Number(sText);
  if (hour > 23 || minute > 59 || second > 60) {
    throw new RangeError(`Campos horarios UTC fuera de rango: ${utcText}`);
  }
  // Solo admito `:60` cuando corresponde exactamente al segundo intercalar 23:59:60 de un salto positivo IERS.
  const leapSecond = second === 60;
  if (leapSecond && !(hour === 23 && minute === 59 && leapSecondEndingUtcDay(midnightPseudoJd))) {
    throw new RangeError(`Segundo intercalar inexistente en la tabla IERS: ${utcText} (solo 23:59:60 del día anterior a un salto de TAI − UTC).`);
  }
  const fraction = Number(`0.${fracText}`);
  const daySeconds = hour * 3600 + minute * 60 + second + fraction;
  return Object.freeze({
    dateIso,
    hour,
    minute,
    second,
    fraction,
    midnightPseudoJd,
    daySeconds,
    leapSecond
  });
}

/**
 * Aquí convierto una marca UTC documentada a `jdTdb` respetando los segundos
 * intercalares del IERS y devuelvo el desglose completo `TAI − UTC`, `TDB − TT`
 * y `TDB − UTC` en segundos.
 */
export function utcTimestampToTdb(utcText) {
  const parsed = parseUtcTimestamp(utcText);
  // Consulto `TAI − UTC` en la medianoche inicial exacta del día civil: los saltos solo ocurren a medianoche UTC,
  // y evaluar con ese semientero exacto evita que el redondeo en doble precisión (ULP ≈ 40 µs cerca de 2,4·10⁶)
  // desplace un instante de 23:59:60 hacia el día siguiente y confunda el segundo intercalar con 00:00:00.
  const taiMinusUtc = taiMinusUtcAtPseudoJd(parsed.midnightPseudoJd);
  const ttOffsetSeconds = taiMinusUtc + TT_MINUS_TAI_SECONDS;
  const jdTt = parsed.midnightPseudoJd + (parsed.daySeconds + ttOffsetSeconds) / SECONDS_PER_DAY;
  const relSeconds = tdbMinusTtSeconds(jdTt);
  const tdbMinusUtcSeconds = ttOffsetSeconds + relSeconds;
  const jdTdb = parsed.midnightPseudoJd + (parsed.daySeconds + tdbMinusUtcSeconds) / SECONDS_PER_DAY;
  return Object.freeze({
    jdTdb,
    taiMinusUtcSeconds: taiMinusUtc,
    tdbMinusTtSeconds: relSeconds,
    tdbMinusUtcSeconds,
    utcInput: utcText.trim()
  });
}

/** Atajo con el que devuelvo directamente el valor numérico `jdTdb` correspondiente a una marca UTC. */
export function utcTimestampToJdTdb(utcText) {
  return utcTimestampToTdb(utcText).jdTdb;
}

/**
 * Aquí convierto a UTC (con precisión de milisegundo y soporte explícito de
 * `23:59:60` en los segundos intercalares) una fecha juliana expresada en una
 * escala atómica adelantada `scaleMinusTaiSeconds` respecto a TAI (0 s para TAI,
 * 32,184 s para TT). Aprovecho el lema de Sterbenz al restar `jd − E_i` (ambos
 * del orden de 2,4·10⁶) para mantener exactitud en la detección del segundo
 * insertado `[(TAI − UTC)_{i−1}, (TAI − UTC)_i)`.
 */
function utcFromAtomicJd(jd, scaleMinusTaiSeconds) {
  for (let i = 1; i < IERS_LEAP_SECONDS_TABLE.length; i++) {
    const entry = IERS_LEAP_SECONDS_TABLE[i];
    const before = IERS_LEAP_SECONDS_TABLE[i - 1].taiMinusUtcSeconds;
    const offsetDays = jd - entry.effectiveJdUtcPseudo;
    if (entry.taiMinusUtcSeconds !== before + 1 || offsetDays < -1 || offsetDays > 1) continue;
    const millisecond = Math.round((offsetDays * SECONDS_PER_DAY - scaleMinusTaiSeconds - before) * 1000);
    if (millisecond < 0 || millisecond >= 1000) continue;
    // Recupero la fecha del día civil que concluye con el segundo intercalar insertado.
    const day = jdToGregorianComponents(entry.effectiveJdUtcPseudo - 1);
    const utc = Object.freeze({ year: day.year, month: day.month, day: day.day, hour: 23, minute: 59, second: 60, millisecond,
      dateIso: day.dateIso, timeHm: '23:59', timeHms: '23:59:60' });
    return Object.freeze({ utc, taiMinusUtcSeconds: before, jdUtcPseudo: jd - (before + scaleMinusTaiSeconds) / SECONDS_PER_DAY, leapSecond: true });
  }
  // Aplico dos pasos de punto fijo, suficientes porque TAI − UTC solo varía en saltos de 1 s.
  let taiMinusUtc = taiMinusUtcAtPseudoJd(jd - (37 + scaleMinusTaiSeconds) / SECONDS_PER_DAY);
  let jdUtcPseudo = jd - (taiMinusUtc + scaleMinusTaiSeconds) / SECONDS_PER_DAY;
  taiMinusUtc = taiMinusUtcAtPseudoJd(jdUtcPseudo);
  jdUtcPseudo = jd - (taiMinusUtc + scaleMinusTaiSeconds) / SECONDS_PER_DAY;
  return Object.freeze({ utc: jdToGregorianComponents(jdUtcPseudo), taiMinusUtcSeconds: taiMinusUtc, jdUtcPseudo, leapSecond: false });
}

/**
 * Aquí obtengo los componentes UTC (al milisegundo, incluyendo `23:59:60` en
 * segundos intercalares) a partir de una fecha juliana TAI, junto con `TAI − UTC`
 * y el pseudo-JD UTC de días fijos de 86 400 s.
 */
export function utcComponentsFromJdTai(jdTai) {
  requireFiniteNumber(jdTai, 'jdTai');
  return utcFromAtomicJd(jdTai, 0);
}

/**
 * Aquí formateo `YYYY-MM-DD · HH:MM:SS UTC` redondeado al segundo más próximo
 * a partir de JD TAI, mostrando `23:59:60` cuando corresponde. Como desde 1972
 * TAI y UTC difieren en segundos enteros, redondear TAI al segundo equivale a
 * redondear UTC sin ambigüedad.
 */
export function roundedUtcLabelFromJdTai(jdTai) {
  requireFiniteNumber(jdTai, 'jdTai');
  const dayNumber = Math.floor(jdTai + 0.5);
  const seconds = Math.round((jdTai + 0.5 - dayNumber) * SECONDS_PER_DAY);
  const { utc } = utcComponentsFromJdTai(dayNumber - 0.5 + seconds / SECONDS_PER_DAY);
  return `${utc.dateIso} · ${utc.timeHms} UTC`;
}

/**
 * Aquí convierto un `jdTdb` científico a componentes y etiquetas legibles tanto
 * en TDB como en UTC sin usar `Date` del navegador. Si el instante cae dentro de
 * un segundo intercalar, muestro `23:59:60` en la etiqueta UTC y conservo en
 * `taiMinusUtcSeconds` el valor anterior al salto.
 */
export function jdTdbToHistoricalLabels(jdTdb) {
  requireJdTdb(jdTdb);
  const relSeconds = tdbMinusTtSeconds(jdTdb);
  const jdTt = jdTdb - relSeconds / SECONDS_PER_DAY;
  const { utc: utcParts, taiMinusUtcSeconds: taiMinusUtc, leapSecond } = utcFromAtomicJd(jdTt, TT_MINUS_TAI_SECONDS);

  const tdbParts = jdToGregorianComponents(jdTdb);
  const tdbMinusUtcSeconds = taiMinusUtc + TT_MINUS_TAI_SECONDS + relSeconds;

  return Object.freeze({
    jdTdb,
    tdb: tdbParts,
    utc: utcParts,
    taiMinusUtcSeconds: taiMinusUtc,
    tdbMinusUtcSeconds,
    leapSecond,
    labelTdb: `${tdbParts.dateIso} · ${tdbParts.timeHms} TDB`,
    shortLabelTdb: `${tdbParts.dateIso} · ${tdbParts.timeHm} TDB`,
    labelUtc: `${utcParts.dateIso} · ${utcParts.timeHms} UTC`,
    shortLabelUtc: `${utcParts.dateIso} · ${utcParts.timeHm} UTC`
  });
}

/**
 * Defino los perfiles de velocidad de reproducción histórica expresados de forma
 * exacta en segundos TDB por cada segundo real (`tdbSecondsPerRealSecond`).
 */
export const HISTORICAL_PLAYBACK_SPEEDS = Object.freeze([
  Object.freeze({
    id: '1h_s',
    label: '1 h/s',
    longLabel: '1 hora de misión / s',
    tdbSecondsPerRealSecond: 3600
  }),
  Object.freeze({
    id: '6h_s',
    label: '6 h/s',
    longLabel: '6 horas de misión / s',
    tdbSecondsPerRealSecond: 21600
  }),
  Object.freeze({
    id: '1d_s',
    label: '1 día/s',
    longLabel: '1 día juliano / s',
    tdbSecondsPerRealSecond: SECONDS_PER_DAY
  }),
  Object.freeze({
    id: '7d_s',
    label: '7 días/s',
    longLabel: '7 días julianos / s',
    tdbSecondsPerRealSecond: 7 * SECONDS_PER_DAY
  }),
  Object.freeze({
    id: '30d_s',
    label: '30 días/s',
    longLabel: '30 días julianos / s',
    tdbSecondsPerRealSecond: 30 * SECONDS_PER_DAY
  }),
  Object.freeze({
    id: '1y_s',
    label: '1 año/s',
    longLabel: '1 año juliano (365,25 d) / s',
    tdbSecondsPerRealSecond: JULIAN_YEAR_SECONDS
  }),
  Object.freeze({
    id: '5y_s',
    label: '5 años/s',
    longLabel: '5 años julianos / s',
    tdbSecondsPerRealSecond: 5 * JULIAN_YEAR_SECONDS
  })
]);

/**
 * Aquí creo un reloj temporal dividido `(anchorJdTdb, offsetSecondsTdb)` acotado
 * a `[minJdTdb, maxJdTdb]` para conservar precisión numérica sub-microsegundo a
 * lo largo de más de 50 años de misión.
 */
export function createSplitHistoricalTime({
  minJdTdb,
  maxJdTdb,
  initialJdTdb = minJdTdb,
  anchorJdTdb = HISTORICAL_ANCHOR_JD_TDB
}) {
  requireJdTdb(minJdTdb);
  requireJdTdb(maxJdTdb);
  requireJdTdb(initialJdTdb);
  requireJdTdb(anchorJdTdb);
  if (maxJdTdb <= minJdTdb) {
    throw new RangeError('maxJdTdb debe ser posterior a minJdTdb.');
  }

  const minOffsetSeconds = (minJdTdb - anchorJdTdb) * SECONDS_PER_DAY;
  const maxOffsetSeconds = (maxJdTdb - anchorJdTdb) * SECONDS_PER_DAY;
  let offsetSeconds = Math.min(
    maxOffsetSeconds,
    Math.max(minOffsetSeconds, (initialJdTdb - anchorJdTdb) * SECONDS_PER_DAY)
  );

  function currentJdTdb() {
    return anchorJdTdb + offsetSeconds / SECONDS_PER_DAY;
  }

  function setJdTdb(targetJdTdb) {
    requireJdTdb(targetJdTdb);
    const rawOffset = (targetJdTdb - anchorJdTdb) * SECONDS_PER_DAY;
    offsetSeconds = Math.min(maxOffsetSeconds, Math.max(minOffsetSeconds, rawOffset));
    return currentJdTdb();
  }

  function advanceByTdbSeconds(deltaTdbSeconds) {
    requireFiniteNumber(deltaTdbSeconds, 'deltaTdbSeconds');
    offsetSeconds = Math.min(maxOffsetSeconds, Math.max(minOffsetSeconds, offsetSeconds + deltaTdbSeconds));
    return currentJdTdb();
  }

  function normalizedProgress() {
    return (offsetSeconds - minOffsetSeconds) / (maxOffsetSeconds - minOffsetSeconds);
  }

  function setNormalizedProgress(fraction) {
    requireFiniteNumber(fraction, 'fraction');
    const clamped = Math.min(1, Math.max(0, fraction));
    offsetSeconds = minOffsetSeconds + clamped * (maxOffsetSeconds - minOffsetSeconds);
    return currentJdTdb();
  }

  return Object.freeze({
    anchorJdTdb,
    minJdTdb,
    maxJdTdb,
    getJdTdb: currentJdTdb,
    getOffsetSeconds: () => offsetSeconds,
    setJdTdb,
    advanceByTdbSeconds,
    normalizedProgress,
    setNormalizedProgress,
    atStart: () => offsetSeconds <= minOffsetSeconds + 1e-6,
    atEnd: () => offsetSeconds >= maxOffsetSeconds - 1e-6
  });
}
