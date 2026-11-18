import { jdToGregorianComponents } from '../science/Time.js';

const decimal = (value, places) => new Intl.NumberFormat('es-MX', {
  minimumFractionDigits: places, maximumFractionDigits: places
}).format(value);

// TDB es la escala de la etiqueta de entrada; no hay conversión UTC.
export function formatMissionTdb(jdTdb) {
  const value = jdToGregorianComponents(jdTdb);
  return `${value.dateIso} ${value.timeHms}.${String(value.millisecond).padStart(3, '0')} TDB`;
}

export function formatMissionFlightDays(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) throw Error('Duración de misión inválida.');
  return `${decimal(seconds / 86400, 6)} días`;
}

export function formatMissionFlightSeconds(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) throw Error('Duración de misión inválida.');
  return `${decimal(seconds, 3)} s`;
}
