// IAU 2012: la unidad astronómica es exactamente 149 597 870 700 m.
export const KM_PER_AU = 149597870.7;
export const SECONDS_PER_DAY = 86400;

export function requireFiniteNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} debe ser un número finito.`);
  }
  return value;
}

function converted(value, factor, name) {
  requireFiniteNumber(value, name);
  const result = value * factor;
  if (!Number.isFinite(result)) {
    throw new RangeError(`${name} excede el rango numérico al convertir unidades.`);
  }
  return result;
}

/** Convierte una distancia de AU a km. */
export function auToKm(au) {
  return converted(au, KM_PER_AU, 'au');
}

/** Convierte una distancia de km a AU. */
export function kmToAu(km) {
  return converted(km, 1 / KM_PER_AU, 'km');
}

/** Convierte velocidad de AU/día a km/s. */
export function auPerDayToKmPerSecond(auPerDay) {
  return converted(auPerDay, KM_PER_AU / SECONDS_PER_DAY, 'auPerDay');
}

/** Convierte velocidad de km/s a AU/día. */
export function kmPerSecondToAuPerDay(kmPerSecond) {
  return converted(kmPerSecond, SECONDS_PER_DAY / KM_PER_AU, 'kmPerSecond');
}
