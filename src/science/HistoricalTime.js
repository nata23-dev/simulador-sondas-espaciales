import {
  gregorianLabelToJulianMidnight,
  jdToGregorianComponents,
  requireJdTdb
} from './Time.js';
import { requireFiniteNumber, SECONDS_PER_DAY } from './Units.js';

export const J2000_JD = 2451545.0;
export const TT_MINUS_TAI_SECONDS = 32.184;
export const JULIAN_YEAR_SECONDS = 365.25 * SECONDS_PER_DAY; // 31 557 600 s exactos (UAI)
export const HISTORICAL_ANCHOR_JD_TDB = gregorianLabelToJulianMidnight('1977-08-20'); // 2443375.5

/**
 * Tabla histórica oficial IERS Bulletin C de segundos intercalares (TAI − UTC)
 * vigente desde 1972-01-01 hasta 2026+ (último salto introducido el 2017-01-01).
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
 * Término relativista periódico Fairhead & Bretagnon (1990) / UAI SOFA de dos términos:
 * TDB − TT ≈ 0,001657 sin(g) + 0,000022 sin(2g) s (exactitud < 30 μs en 1970–2100).
 */
export function tdbMinusTtSeconds(jdApprox) {
  requireFiniteNumber(jdApprox, 'jdApprox');
  const daysFromJ2000 = jdApprox - J2000_JD;
  const gRad = (357.5277233 + 0.9856002831 * daysFromJ2000) * (Math.PI / 180);
  return 0.001657 * Math.sin(gRad) + 0.000022 * Math.sin(2 * gRad);
}

/**
 * Devuelve `TAI − UTC` en segundos enteros para un pseudo-JD UTC (>= 1972-01-01).
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
 * Analiza una marca UTC ISO/astronómica (`YYYY-MM-DD`, `YYYY-MM-DD HH:MM[:SS]`,
 * `YYYY-MM-DDTHH:MM:SS[.sss]Z`) sin delegar en `Date` del navegador.
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
  // Permite segundo intercalar :60 en fin de junio o diciembre si aparece en registros históricos
  if (hour > 23 || minute > 59 || second > 60) {
    throw new RangeError(`Campos horarios UTC fuera de rango: ${utcText}`);
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
    daySeconds
  });
}

/**
 * Convierte una marca histórica UTC documentada a `jdTdb` (escala TDB canónica).
 * Conserva además el desglose `taiMinusUtcSeconds` y `tdbMinusUtcSeconds`.
 */
export function utcTimestampToTdb(utcText) {
  const parsed = parseUtcTimestamp(utcText);
  const pseudoJdUtc = parsed.midnightPseudoJd + Math.min(parsed.daySeconds, SECONDS_PER_DAY - 1e-6) / SECONDS_PER_DAY;
  const taiMinusUtc = taiMinusUtcAtPseudoJd(pseudoJdUtc);
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

export function utcTimestampToJdTdb(utcText) {
  return utcTimestampToTdb(utcText).jdTdb;
}

/**
 * Convierte un `jdTdb` científico a componentes y etiquetas tanto en TDB como en UTC,
 * resolviendo iterativamente el salto `TAI − UTC` sin usar `Date` local del navegador.
 */
export function jdTdbToHistoricalLabels(jdTdb) {
  requireJdTdb(jdTdb);
  const relSeconds = tdbMinusTtSeconds(jdTdb);
  const jdTt = jdTdb - relSeconds / SECONDS_PER_DAY;

  // Iteración de punto fijo (2 pasos bastan porque TAI-UTC solo cambia en escalones de 1 s)
  let taiMinusUtc = taiMinusUtcAtPseudoJd(jdTt - (37 + TT_MINUS_TAI_SECONDS) / SECONDS_PER_DAY);
  let pseudoJdUtc = jdTt - (taiMinusUtc + TT_MINUS_TAI_SECONDS) / SECONDS_PER_DAY;
  taiMinusUtc = taiMinusUtcAtPseudoJd(pseudoJdUtc);
  pseudoJdUtc = jdTt - (taiMinusUtc + TT_MINUS_TAI_SECONDS) / SECONDS_PER_DAY;

  const tdbParts = jdToGregorianComponents(jdTdb);
  const utcParts = jdToGregorianComponents(pseudoJdUtc);
  const tdbMinusUtcSeconds = taiMinusUtc + TT_MINUS_TAI_SECONDS + relSeconds;

  return Object.freeze({
    jdTdb,
    tdb: tdbParts,
    utc: utcParts,
    taiMinusUtcSeconds: taiMinusUtc,
    tdbMinusUtcSeconds,
    labelTdb: `${tdbParts.dateIso} · ${tdbParts.timeHms} TDB`,
    shortLabelTdb: `${tdbParts.dateIso} · ${tdbParts.timeHm} TDB`,
    labelUtc: `${utcParts.dateIso} · ${utcParts.timeHms} UTC`,
    shortLabelUtc: `${utcParts.dateIso} · ${utcParts.timeHm} UTC`
  });
}

/**
 * Velocidades de reproducción histórica definidas matemáticamente en segundos TDB
 * por cada segundo de tiempo real (`tdbSecondsPerRealSecond`).
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
 * Representación temporal dividida `(anchorJdTdb, offsetSecondsTdb)` para
 * conservar precisión numérica sub-microsegundo a lo largo de 50+ años.
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
