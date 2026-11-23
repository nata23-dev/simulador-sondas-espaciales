// Aquí modelo la atmósfera estándar terrestre para la fase de ascenso.
//
// - De 0 a 86 km geométricos (0 a 84,852 km geopotenciales): aplico la U.S. Standard Atmosphere 1976
//   por capas con gradiente térmico constante, calculo la presión con la fórmula barométrica de cada capa
//   y obtengo la densidad mediante ρ = P·M/(R*·T).
// - De 86 a 200 km: extrapolo exponencialmente desde 86 km con la escala de altura RT/(Mg) de ese nivel.
//   Es una aproximación gruesa para estimar un arrastre ya muy pequeño (la atmósfera real varía con la actividad solar).
// - De 180 a 200 km: multiplico la densidad y la presión exponenciales por un suavizado cúbico
//   s(u) = 1 − (3u² − 2u³), con u = (h − 180)/20, tal que s(180)=1, s(200)=0 y s'(180)=s'(200)=0.
//   Con este artificio numérico evito un corte brusco y mantengo continuidad C¹ hasta anular el arrastre en 200 km.
// - Por encima de 200 km: devuelvo densidad y presión nulas (vacío en este modelo).
//
// Asumo una atmósfera corrotante en reposo respecto a la Tierra, sin viento ni variaciones diurnas,
// estacionales o latitudinales; cualquier altitud negativa la acoto a 0 km.
// Unidades: entrada de altitud geométrica en km; salidas en Pa, kg/m³ y K.
const G0 = 9.80665, MOLAR_MASS = 0.0289644, R_STAR = 8.31432, EARTH_R0_KM = 6356.766;
export const SEA_LEVEL_PRESSURE_PA = 101325;
export const ATMOSPHERE_TOP_KM = 200;
export const ATMOSPHERE_BLEND_START_KM = 180;
// Calculo el factor de transición cúbica entre 180 y 200 km para llevar presión y densidad suavemente a cero.
export function blendFactor(altitudeKm) {
  const u = Math.min(1, Math.max(0, (altitudeKm - ATMOSPHERE_BLEND_START_KM) / (ATMOSPHERE_TOP_KM - ATMOSPHERE_BLEND_START_KM)));
  return 1 - (3 * u * u - 2 * u * u * u);
}
export const STANDARD_LAYER_TOP_KM = 86;
// Defino cada capa de la US-1976 como [altitud geopotencial base (km), temperatura base (K), gradiente (K/km)].
const LAYERS = [[0, 288.15, -6.5], [11, 216.65, 0], [20, 216.65, 1], [32, 228.65, 2.8], [47, 270.65, 0], [51, 270.65, -2.8], [71, 214.65, -2], [84.852, 186.946, 0]];

// Precalculo la presión en la base de cada capa atmosférica encadenando la fórmula barométrica desde el nivel del mar.
const bases = [];
{ let pressure = SEA_LEVEL_PRESSURE_PA;
  for (let i = 0; i < LAYERS.length; i++) {
    bases.push(pressure);
    if (i < LAYERS.length - 1) pressure = layerPressure(i, LAYERS[i + 1][0], pressure);
  } }
// Calculo la presión (Pa) dentro de una capa isotérmica o con gradiente térmico lineal a partir de su altitud geopotencial.
function layerPressure(index, geopotentialKm, basePressure) {
  const [hb, tb, lapse] = LAYERS[index];
  if (lapse === 0) return basePressure * Math.exp(-G0 * MOLAR_MASS * (geopotentialKm - hb) * 1000 / (R_STAR * tb));
  const t = tb + lapse * (geopotentialKm - hb);
  return basePressure * (tb / t) ** (G0 * MOLAR_MASS / (R_STAR * lapse / 1000));
}
// Convierto altitud geométrica (km) a altitud geopotencial (km) usando el radio nominal terrestre.
const geopotentialKm = geometricKm => EARTH_R0_KM * geometricKm / (EARTH_R0_KM + geometricKm);
// Evalúo temperatura (K), presión (Pa) y densidad (kg/m³) dentro del rango estándar US-1976 (0–86 km).
function standard(altitudeKm) {
  const h = geopotentialKm(altitudeKm);
  let index = 0;
  for (let i = 0; i < LAYERS.length; i++) if (h >= LAYERS[i][0]) index = i;
  const [hb, tb, lapse] = LAYERS[index];
  const temperatureK = tb + lapse * (h - hb);
  const pressurePa = layerPressure(index, h, bases[index]);
  return { temperatureK, pressurePa, densityKgM3: pressurePa * MOLAR_MASS / (R_STAR * temperatureK) };
}
// Calculo el estado en el techo estándar (86 km) y su escala de altura en km para la extrapolación superior.
const top = standard(STANDARD_LAYER_TOP_KM);
const g86 = G0 * (EARTH_R0_KM / (EARTH_R0_KM + STANDARD_LAYER_TOP_KM)) ** 2; // Gravedad local aproximada a 86 km (m/s²).
const scaleHeightKm = R_STAR * top.temperatureK / (MOLAR_MASS * g86) / 1000;

// Devuelvo temperatura (K), presión (Pa), densidad (kg/m³) y región del modelo para una altitud geométrica en km.
export function atmosphereAt(altitudeKm) {
  if (!Number.isFinite(altitudeKm)) throw Error('Altitud atmosférica no finita.');
  const h = Math.max(0, altitudeKm);
  if (h <= STANDARD_LAYER_TOP_KM) return { ...standard(h), region: 'estándar US-1976' };
  if (h <= ATMOSPHERE_TOP_KM) {
    const f = Math.exp(-(h - STANDARD_LAYER_TOP_KM) / scaleHeightKm) * blendFactor(h);
    return { temperatureK: top.temperatureK, pressurePa: top.pressurePa * f, densityKgM3: top.densityKgM3 * f, region: h > ATMOSPHERE_BLEND_START_KM ? 'extrapolación exponencial con transición cúbica' : 'extrapolación exponencial' };
  }
  return { temperatureK: 0, pressurePa: 0, densityKgM3: 0, region: 'vacío (modelo)' };
}
// Expongo los metadatos e hipótesis principales del modelo atmosférico para trazabilidad en telemetría e informes.
export const ATMOSPHERE_MODEL = Object.freeze({
  id: 'us-standard-1976-layers-v2-smooth-cutoff', topKm: ATMOSPHERE_TOP_KM, standardTopKm: STANDARD_LAYER_TOP_KM, scaleHeightAbove86Km: scaleHeightKm,
  assumptions: 'Atmósfera corrotante, sin viento ni variaciones; densidad 0 por encima de 200 km.'
});
