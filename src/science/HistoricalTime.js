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
 * Segundo intercalar positivo insertado al final del día UTC que empieza en `midnightPseudoJd` (`23:59:60`), o `null`.
 * Es la entrada de la tabla que entra en vigor a la medianoche siguiente con TAI − UTC un segundo mayor que la anterior.
 * La comparación es exacta: las medianoches son semienteros (x,5) representables en doble precisión.
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
 * Analiza una marca UTC ISO/astronómica (`YYYY-MM-DD`, `YYYY-MM-DD HH:MM[:SS]`,
 * `YYYY-MM-DDTHH:MM:SS[.sss]Z`) sin delegar en `Date` del navegador.
 * El segundo `:60` solo existe como `23:59:60[.sss]` del último día UTC antes de un salto positivo de la tabla IERS.
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
  // SCI-01: `:60` solo es válido en el segundo intercalar real (23:59:60 del día anterior a un salto positivo tabulado).
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
 * Convierte una marca histórica UTC documentada a `jdTdb` (escala TDB canónica).
 * Conserva además el desglose `taiMinusUtcSeconds` y `tdbMinusUtcSeconds`.
 */
export function utcTimestampToTdb(utcText) {
  const parsed = parseUtcTimestamp(utcText);
  // SCI-01: los saltos de TAI − UTC ocurren solo a medianoche UTC, así que el valor de todo el día civil (incluido su
  // 23:59:60) es el vigente en su medianoche inicial. Se consulta con ese semientero exacto: sumar una fracción casi igual
  // a 1 a un JD de ~2,4·10⁶ redondeaba al día siguiente (ULP ≈ 40 µs) y daba el TAI − UTC posterior durante el segundo
  // intercalar, de modo que 23:59:60 coincidía con las 00:00:00 siguientes. En fechas ordinarias el valor no cambia.
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

export function utcTimestampToJdTdb(utcText) {
  return utcTimestampToTdb(utcText).jdTdb;
}

/**
 * SCI-01: UTC de un instante dado como JD en una escala atómica que va `scaleMinusTaiSeconds` por delante de TAI (0 para TAI,
 * 32,184 s para TT), al milisegundo y con `23:59:60` dentro de los segundos intercalares.
 * El segundo insertado antes de la entrada i ocupa, contado desde su medianoche UTC E_i, los segundos TAI
 * [(TAI − UTC)_{i−1}, (TAI − UTC)_i). `jd − E_i` es exacta en doble precisión (lema de Sterbenz: ambos ≈ 2,4·10⁶), así que solo
 * cuenta el error del propio `jd` (≈ 20 µs); el milisegundo se redondea igual que en las etiquetas.
 * Fuera de un segundo intercalar se usa la misma aritmética que antes de SCI-01 (resultados idénticos bit a bit).
 */
function utcFromAtomicJd(jd, scaleMinusTaiSeconds) {
  for (let i = 1; i < IERS_LEAP_SECONDS_TABLE.length; i++) {
    const entry = IERS_LEAP_SECONDS_TABLE[i];
    const before = IERS_LEAP_SECONDS_TABLE[i - 1].taiMinusUtcSeconds;
    const offsetDays = jd - entry.effectiveJdUtcPseudo;
    if (entry.taiMinusUtcSeconds !== before + 1 || offsetDays < -1 || offsetDays > 1) continue;
    const millisecond = Math.round((offsetDays * SECONDS_PER_DAY - scaleMinusTaiSeconds - before) * 1000);
    if (millisecond < 0 || millisecond >= 1000) continue;
    const day = jdToGregorianComponents(entry.effectiveJdUtcPseudo - 1); // día civil que termina con el segundo insertado
    const utc = Object.freeze({ year: day.year, month: day.month, day: day.day, hour: 23, minute: 59, second: 60, millisecond,
      dateIso: day.dateIso, timeHm: '23:59', timeHms: '23:59:60' });
    return Object.freeze({ utc, taiMinusUtcSeconds: before, jdUtcPseudo: jd - (before + scaleMinusTaiSeconds) / SECONDS_PER_DAY, leapSecond: true });
  }
  // Iteración de punto fijo (2 pasos bastan porque TAI − UTC solo cambia en escalones de 1 s).
  let taiMinusUtc = taiMinusUtcAtPseudoJd(jd - (37 + scaleMinusTaiSeconds) / SECONDS_PER_DAY);
  let jdUtcPseudo = jd - (taiMinusUtc + scaleMinusTaiSeconds) / SECONDS_PER_DAY;
  taiMinusUtc = taiMinusUtcAtPseudoJd(jdUtcPseudo);
  jdUtcPseudo = jd - (taiMinusUtc + scaleMinusTaiSeconds) / SECONDS_PER_DAY;
  return Object.freeze({ utc: jdToGregorianComponents(jdUtcPseudo), taiMinusUtcSeconds: taiMinusUtc, jdUtcPseudo, leapSecond: false });
}

/**
 * Componentes UTC (al milisegundo) de un instante dado como JD TAI, con `23:59:60` dentro de los segundos intercalares.
 * Devuelve también TAI − UTC de ese instante y el pseudo-JD UTC (días de 86 400 s; como todo pseudo-JD, no distingue el
 * segundo intercalar de las 00:00:00 siguientes: para eso están `utc` y `leapSecond`).
 */
export function utcComponentsFromJdTai(jdTai) {
  requireFiniteNumber(jdTai, 'jdTai');
  return utcFromAtomicJd(jdTai, 0);
}

/**
 * Etiqueta `YYYY-MM-DD · HH:MM:SS UTC` redondeada al segundo más próximo, con `23:59:60` en los segundos intercalares.
 * Desde 1972 UTC y TAI difieren en segundos enteros: redondear el instante TAI al segundo equivale a redondear el UTC, y el
 * instante redondeado queda sin ambigüedad dentro o fuera de un segundo intercalar.
 */
export function roundedUtcLabelFromJdTai(jdTai) {
  requireFiniteNumber(jdTai, 'jdTai');
  const dayNumber = Math.floor(jdTai + 0.5);
  const seconds = Math.round((jdTai + 0.5 - dayNumber) * SECONDS_PER_DAY);
  const { utc } = utcComponentsFromJdTai(dayNumber - 0.5 + seconds / SECONDS_PER_DAY);
  return `${utc.dateIso} · ${utc.timeHms} UTC`;
}

/**
 * Convierte un `jdTdb` científico a componentes y etiquetas tanto en TDB como en UTC,
 * resolviendo el salto `TAI − UTC` sin usar `Date` local del navegador. Durante un segundo intercalar la etiqueta UTC es
 * `23:59:60` del día que termina y `taiMinusUtcSeconds` conserva el valor anterior al salto (SCI-01).
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
