import { requireFiniteNumber, SECONDS_PER_DAY } from './Units.js';
import { requireJdTdb, secondsBetweenJdTdb } from './Time.js';

/**
 * Representa un instante interno de simulación mediante segundos transcurridos
 * desde una época de referencia JD TDB. Evita acumular pequeños pasos sobre un
 * número juliano grande (~2.46e6, donde 1 ULP ~ 40.2 us).
 */
export function createSimulationInstant(epochJdTdb, elapsedSeconds = 0) {
  requireJdTdb(epochJdTdb);
  requireFiniteNumber(elapsedSeconds, 'elapsedSeconds');
  const jdTdb = elapsedSeconds === 0
    ? epochJdTdb
    : epochJdTdb + elapsedSeconds / SECONDS_PER_DAY;
  if (!Number.isFinite(jdTdb)) {
    throw new RangeError('El instante simulado excede el rango representable en JD TDB.');
  }
  return Object.freeze({
    epochJdTdb,
    elapsedSeconds,
    jdTdb,
    scale: 'TDB'
  });
}

/**
 * Avanza un instante interno acumulando sobre `elapsedSeconds`, nunca sobre `jdTdb`.
 */
export function advanceSimulationInstant(instant, deltaSeconds) {
  if (!instant || typeof instant !== 'object') {
    throw new TypeError('instant debe ser un objeto de tiempo de simulación.');
  }
  requireJdTdb(instant.epochJdTdb);
  requireFiniteNumber(instant.elapsedSeconds, 'instant.elapsedSeconds');
  requireFiniteNumber(deltaSeconds, 'deltaSeconds');
  const nextElapsed = instant.elapsedSeconds + deltaSeconds;
  if (!Number.isFinite(nextElapsed)) {
    throw new RangeError('El tiempo transcurrido excede el rango numérico.');
  }
  return createSimulationInstant(instant.epochJdTdb, nextElapsed);
}

/**
 * Convierte un JD TDB externo en segundos relativos a `epochJdTdb`.
 */
export function jdTdbToElapsedSeconds(epochJdTdb, targetJdTdb) {
  return secondsBetweenJdTdb(epochJdTdb, targetJdTdb);
}

/**
 * Convierte segundos relativos a `epochJdTdb` en un JD TDB para la frontera del sistema.
 */
export function elapsedSecondsToJdTdb(epochJdTdb, elapsedSeconds) {
  return createSimulationInstant(epochJdTdb, elapsedSeconds).jdTdb;
}

/**
 * Descompone `(epochJdTdb, elapsedSeconds)` en fecha y hora gregoriana en la
 * escala TDB mediante aritmética entera de Día Juliano, sin utilizar `Date` ni UTC.
 */
export function decomposeJdTdbCalendar(epochJdTdb, elapsedSeconds = 0) {
  requireJdTdb(epochJdTdb);
  requireFiniteNumber(elapsedSeconds, 'elapsedSeconds');

  const shiftedEpoch = epochJdTdb + 0.5;
  const baseJdn = Math.floor(shiftedEpoch);
  const baseDaySeconds = (shiftedEpoch - baseJdn) * SECONDS_PER_DAY;
  const totalSeconds = baseDaySeconds + elapsedSeconds;
  if (!Number.isFinite(totalSeconds)) {
    throw new RangeError('El instante excede el rango de descomposición calendárica.');
  }

  let dayOffset = Math.floor(totalSeconds / SECONDS_PER_DAY);
  let secondOfDay = totalSeconds - dayOffset * SECONDS_PER_DAY;
  if (secondOfDay >= SECONDS_PER_DAY || Math.abs(secondOfDay - SECONDS_PER_DAY) < 1e-9) {
    secondOfDay = 0;
    dayOffset += 1;
  } else if (secondOfDay < 0) {
    secondOfDay = 0;
  }

  const totalWholeSeconds = Math.floor(secondOfDay + 1e-9);
  const fractionalSeconds = Math.max(0, secondOfDay - totalWholeSeconds);
  const hour = Math.floor(totalWholeSeconds / 3600);
  const minute = Math.floor((totalWholeSeconds % 3600) / 60);
  const second = (totalWholeSeconds % 60) + fractionalSeconds;

  const jdn = baseJdn + dayOffset;
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = 100 * b + d - 4800 + Math.floor(m / 10);

  const dateIso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const wholeSec = Math.min(59, Math.floor(second + 1e-9));
  const timeHms = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(wholeSec).padStart(2, '0')}`;
  const timeHm = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  return Object.freeze({
    year,
    month,
    day,
    hour,
    minute,
    second,
    dateIso,
    timeHms,
    timeHm,
    labelTdb: `${dateIso} · ${timeHms} TDB`,
    shortLabelTdb: `${dateIso} · ${timeHm} TDB`
  });
}

/**
 * Formatea una duración de misión en formato legible `T+DDd HHh MMm SSs` (o `T-`).
 */
export function formatMissionElapsedTime(elapsedSeconds) {
  requireFiniteNumber(elapsedSeconds, 'elapsedSeconds');
  const sign = elapsedSeconds < 0 ? '-' : '+';
  const absTotal = Math.round(Math.abs(elapsedSeconds));
  const days = Math.floor(absTotal / SECONDS_PER_DAY);
  const remDay = absTotal % SECONDS_PER_DAY;
  const hours = Math.floor(remDay / 3600);
  const minutes = Math.floor((remDay % 3600) / 60);
  const seconds = remDay % 60;
  return `T${sign}${String(days).padStart(2, '0')}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
}
