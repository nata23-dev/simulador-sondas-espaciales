// Aquí gestiono el reloj interno de simulación mediante una época fija en JD TDB y segundos transcurridos,
// evitando la pérdida de resolución en coma flotante al sumar pasos pequeños sobre un número juliano (~2.46e6).
// Unidades: segundos (`elapsedSeconds`) y días julianos (`jdTdb`); escala temporal TDB pura, sin `Date` ni UTC.
import { requireFiniteNumber, SECONDS_PER_DAY } from './Units.js';
import { requireJdTdb, secondsBetweenJdTdb } from './Time.js';

/**
 * Aquí represento un instante interno de simulación mediante segundos transcurridos desde una época de referencia JD TDB,
 * evitando acumular incrementos pequeños directamente sobre un número juliano grande (~2.46e6, donde 1 ULP ≈ 40,2 μs).
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
 * Aquí avanzo un instante interno acumulando siempre sobre `elapsedSeconds` y nunca directamente sobre `jdTdb`.
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
 * Aquí convierto un instante JD TDB externo en segundos relativos a `epochJdTdb`.
 */
export function jdTdbToElapsedSeconds(epochJdTdb, targetJdTdb) {
  return secondsBetweenJdTdb(epochJdTdb, targetJdTdb);
}

/**
 * Aquí descompongo `(epochJdTdb, elapsedSeconds)` en fecha y hora gregoriana dentro de la escala TDB
 * mediante aritmética entera de Número de Día Juliano (JDN), sin usar `Date` ni conversiones UTC.
 */
export function decomposeJdTdbCalendar(epochJdTdb, elapsedSeconds = 0) {
  requireJdTdb(epochJdTdb);
  requireFiniteNumber(elapsedSeconds, 'elapsedSeconds');

  // Desplazo 0,5 días porque el día juliano comienza al mediodía mientras el día civil arranca a las 00:00.
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

  // Aplico la conversión entera estándar de JDN a calendario gregoriano proléptico (Richards / Fliegel–Van Flandern).
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
 * Aquí formateo una duración de misión en el formato legible `T+DDd HHh MMm SSs` (o `T-` para tiempos previos).
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
