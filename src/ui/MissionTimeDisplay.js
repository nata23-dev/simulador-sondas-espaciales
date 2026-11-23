// En este módulo formateo las épocas TDB y las duraciones de vuelo para los paneles del planificador y del Centro de Misión.
import { jdToGregorianComponents } from '../science/Time.js';

const decimal = (value, places) => new Intl.NumberFormat('es-MX', {
  minimumFractionDigits: places, maximumFractionDigits: places
}).format(value);

// Formateo la fecha juliana directamente en la escala TDB sin aplicar conversión a UTC.
export function formatMissionTdb(jdTdb) {
  const value = jdToGregorianComponents(jdTdb);
  return `${value.dateIso} ${value.timeHms}.${String(value.millisecond).padStart(3, '0')} TDB`;
}

// Convierto una duración de vuelo en segundos a días formateados y lanzo un error si el valor no es finito o es negativo.
export function formatMissionFlightDays(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) throw Error('Duración de misión inválida.');
  return `${decimal(seconds / 86400, 6)} días`;
}

// Formateo una duración de vuelo en segundos con tres decimales y rechazo valores inválidos o negativos.
export function formatMissionFlightSeconds(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) throw Error('Duración de misión inválida.');
  return `${decimal(seconds, 3)} s`;
}
