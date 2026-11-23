// Aquí centralizo las constantes exactas de unidades astronómicas y las conversiones físicas del núcleo científico.
// Unidades: AU, km, AU/día, km/s y segundos (marco agnóstico; independiente de escalas de escena).
// Adopto la definición exacta de la resolución IAU 2012 B2: 1 AU = 149 597 870 700 m.
export const KM_PER_AU = 149597870.7;
export const SECONDS_PER_DAY = 86400;

/** Aquí valido que `value` sea un número finito antes de operar con él. */
export function requireFiniteNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} debe ser un número finito.`);
  }
  return value;
}

/** Aplico un factor de conversión validando finitud tanto en la entrada como en el resultado. */
function converted(value, factor, name) {
  requireFiniteNumber(value, name);
  const result = value * factor;
  if (!Number.isFinite(result)) {
    throw new RangeError(`${name} excede el rango numérico al convertir unidades.`);
  }
  return result;
}

/** Aquí convierto una distancia de unidades astronómicas (AU) a kilómetros (km). */
export function auToKm(au) {
  return converted(au, KM_PER_AU, 'au');
}

/** Aquí convierto una distancia de kilómetros (km) a unidades astronómicas (AU). */
export function kmToAu(km) {
  return converted(km, 1 / KM_PER_AU, 'km');
}

/** Aquí convierto una velocidad de AU/día a km/s. */
export function auPerDayToKmPerSecond(auPerDay) {
  return converted(auPerDay, KM_PER_AU / SECONDS_PER_DAY, 'auPerDay');
}

/** Aquí convierto una velocidad de km/s a AU/día. */
export function kmPerSecondToAuPerDay(kmPerSecond) {
  return converted(kmPerSecond, SECONDS_PER_DAY / KM_PER_AU, 'kmPerSecond');
}
