import { requireFiniteNumber, SECONDS_PER_DAY } from './Units.js';

/** Un número juliano en la escala TDB; no acepta fechas UTC de JavaScript. */
export function requireJdTdb(jdTdb) {
  requireFiniteNumber(jdTdb, 'jdTdb');
  return jdTdb;
}

/** Segundos desde `fromJdTdb` hasta `toJdTdb` (ambos TDB). */
export function secondsBetweenJdTdb(fromJdTdb, toJdTdb) {
  const seconds = (requireJdTdb(toJdTdb) - requireJdTdb(fromJdTdb)) * SECONDS_PER_DAY;
  if (!Number.isFinite(seconds)) throw new RangeError('La diferencia TDB excede el rango numérico.');
  return seconds;
}

/** Avanza (o retrocede con segundos negativos) un JD TDB. */
export function advanceJdTdb(jdTdb, seconds) {
  requireJdTdb(jdTdb);
  requireFiniteNumber(seconds, 'seconds');
  const result = jdTdb + seconds / SECONDS_PER_DAY;
  if (!Number.isFinite(result) || (seconds !== 0 && result === jdTdb)) {
    throw new RangeError('La duración no se puede representar en jdTdb con esta precisión.');
  }
  return result;
}

/** Devuelve -1, 0 o 1 para dos instantes TDB. */
export function compareJdTdb(a, b) {
  requireJdTdb(a);
  requireJdTdb(b);
  return Math.sign(a - b);
}

/**
 * Día juliano a las 00:00 de una fecha de calendario gregoriano en la MISMA
 * escala de tiempo que el dato externo. Solo relaciona etiquetas de calendario
 * con números julianos; no realiza ninguna conversión UTC/TDB.
 */
export function gregorianLabelToJulianMidnight(label) {
  if (typeof label !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(label)) {
    throw new TypeError('La etiqueta de calendario debe tener formato YYYY-MM-DD.');
  }
  const [year, month, day] = label.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1583 || month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) {
    throw new RangeError(`Etiqueta gregoriana inválida: ${label}.`);
  }
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  const jdn = day + Math.floor((153 * m + 2) / 5) + 365 * y
    + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
  return jdn - 0.5;
}

/**
 * Convierte una etiqueta gregoriana `YYYY-MM-DD`, `YYYY-MM-DD HH:MM` o
 * `YYYY-MM-DD HH:MM:SS(.sss)` en la MISMA escala temporal (TDB) a número juliano,
 * sin usar `Date` de JavaScript ni zonas horarias del navegador.
 */
export function gregorianTimestampToJdTdb(label) {
  if (typeof label !== 'string') {
    throw new TypeError('La marca temporal gregoriana debe ser texto.');
  }
  if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(label)) {
    return gregorianLabelToJulianMidnight(label);
  }
  const match = /^([0-9]{4}-[0-9]{2}-[0-9]{2})[ T]([0-9]{2}):([0-9]{2})(?::([0-9]{2})(?:\.([0-9]+))?)?$/.exec(label);
  if (!match) {
    throw new TypeError('La marca temporal debe tener formato YYYY-MM-DD o YYYY-MM-DD HH:MM[:SS].');
  }
  const [, datePart, hourText, minuteText, secondText = '00', fractionText = '0'] = match;
  const baseJd = gregorianLabelToJulianMidnight(datePart);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (hour > 23 || minute > 59 || second > 59) {
    throw new RangeError(`Hora gregoriana inválida en la escala TDB: ${label}.`);
  }
  const daySeconds = hour * 3600 + minute * 60 + second + Number(`0.${fractionText}`);
  return baseJd + daySeconds / SECONDS_PER_DAY;
}

/**
 * Descompone un JD (posterior a 1582-10-15) en componentes gregorianas exactas
 * dentro de la MISMA escala temporal del argumento (p. ej., TDB), sin `Date`.
 */
export function jdToGregorianComponents(jd) {
  requireJdTdb(jd);
  const shifted = jd + 0.5;
  let z = Math.floor(shifted);
  let f = shifted - z;
  let totalMs = Math.round(f * SECONDS_PER_DAY * 1000);
  if (totalMs >= SECONDS_PER_DAY * 1000) {
    z += 1;
    totalMs -= SECONDS_PER_DAY * 1000;
  }
  const alpha = Math.floor((z - 1867216.25) / 36524.25);
  const a = z < 2299161 ? z : z + 1 + alpha - Math.floor(alpha / 4);
  const b = a + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const d = Math.floor(365.25 * c);
  const e = Math.floor((b - d) / 30.6001);
  const day = b - d - Math.floor(30.6001 * e);
  const month = e < 14 ? e - 1 : e - 13;
  const year = month > 2 ? c - 4716 : c - 4715;

  const hour = Math.floor(totalMs / 3600000);
  const remHour = totalMs - hour * 3600000;
  const minute = Math.floor(remHour / 60000);
  const remMin = remHour - minute * 60000;
  const second = Math.floor(remMin / 1000);
  const millisecond = remMin - second * 1000;

  const pad2 = n => String(n).padStart(2, '0');
  const dateIso = `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
  const timeHm = `${pad2(hour)}:${pad2(minute)}`;
  const timeHms = `${timeHm}:${pad2(second)}`;

  return Object.freeze({
    year,
    month,
    day,
    hour,
    minute,
    second,
    millisecond,
    dateIso,
    timeHm,
    timeHms
  });
}
