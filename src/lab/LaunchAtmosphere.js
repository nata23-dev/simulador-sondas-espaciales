// Etapa 12E — atmósfera estándar para el ascenso.
//
// 0–86 km (geométricos, 0–84,852 km geopotenciales): U.S. Standard Atmosphere 1976 por capas con
//   gradiente de temperatura constante; presión por la fórmula barométrica de cada capa y ρ = P·M/(R*·T).
// 86–200 km: extrapolación exponencial desde 86 km con la escala de altura RT/(Mg) de ese nivel.
//   Es una aproximación gruesa (la atmósfera real tiene una escala creciente y variabilidad solar);
//   solo sirve para estimar un arrastre ya despreciable.
// 180–200 km (12E.1): la densidad y la presión exponenciales se multiplican por un suavizado cúbico
//   s(u) = 1 − (3u² − 2u³), u = (h − 180)/20, con s(180)=1, s(200)=0 y s'(180)=s'(200)=0. Así la densidad es continua
//   y de primera derivada continua en 180 y 200 km, no negativa y exactamente nula desde 200 km. Es un artificio
//   NUMÉRICO para evitar el corte abrupto; NO representa con precisión física la exosfera terrestre.
// > 200 km: densidad y presión = 0 (vacío en este modelo).
// Hipótesis: atmósfera en reposo respecto a la Tierra (corrotante), sin viento, sin variación diaria,
// estacional ni de latitud: NO es un modelo meteorológico. Alturas negativas se tratan como 0.
// Unidades de entrada: altitud geométrica en km; salida: Pa, kg/m³, K.
const G0 = 9.80665, MOLAR_MASS = 0.0289644, R_STAR = 8.31432, EARTH_R0_KM = 6356.766;
export const SEA_LEVEL_PRESSURE_PA = 101325;
export const ATMOSPHERE_TOP_KM = 200;
export const ATMOSPHERE_BLEND_START_KM = 180;
export function blendFactor(altitudeKm) {
  const u = Math.min(1, Math.max(0, (altitudeKm - ATMOSPHERE_BLEND_START_KM) / (ATMOSPHERE_TOP_KM - ATMOSPHERE_BLEND_START_KM)));
  return 1 - (3 * u * u - 2 * u * u * u);
}
export const STANDARD_LAYER_TOP_KM = 86;
// [altura geopotencial base (km), temperatura base (K), gradiente (K/km)]
const LAYERS = [[0, 288.15, -6.5], [11, 216.65, 0], [20, 216.65, 1], [32, 228.65, 2.8], [47, 270.65, 0], [51, 270.65, -2.8], [71, 214.65, -2], [84.852, 186.946, 0]];

const bases = [];
{ let pressure = SEA_LEVEL_PRESSURE_PA;
  for (let i = 0; i < LAYERS.length; i++) {
    bases.push(pressure);
    if (i < LAYERS.length - 1) pressure = layerPressure(i, LAYERS[i + 1][0], pressure);
  } }
function layerPressure(index, geopotentialKm, basePressure) {
  const [hb, tb, lapse] = LAYERS[index];
  if (lapse === 0) return basePressure * Math.exp(-G0 * MOLAR_MASS * (geopotentialKm - hb) * 1000 / (R_STAR * tb));
  const t = tb + lapse * (geopotentialKm - hb);
  return basePressure * (tb / t) ** (G0 * MOLAR_MASS / (R_STAR * lapse / 1000));
}
const geopotentialKm = geometricKm => EARTH_R0_KM * geometricKm / (EARTH_R0_KM + geometricKm);
function standard(altitudeKm) {
  const h = geopotentialKm(altitudeKm);
  let index = 0;
  for (let i = 0; i < LAYERS.length; i++) if (h >= LAYERS[i][0]) index = i;
  const [hb, tb, lapse] = LAYERS[index];
  const temperatureK = tb + lapse * (h - hb);
  const pressurePa = layerPressure(index, h, bases[index]);
  return { temperatureK, pressurePa, densityKgM3: pressurePa * MOLAR_MASS / (R_STAR * temperatureK) };
}
const top = standard(STANDARD_LAYER_TOP_KM);
const g86 = G0 * (EARTH_R0_KM / (EARTH_R0_KM + STANDARD_LAYER_TOP_KM)) ** 2; // gravedad a 86 km
const scaleHeightKm = R_STAR * top.temperatureK / (MOLAR_MASS * g86) / 1000;

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
export const ATMOSPHERE_MODEL = Object.freeze({
  id: 'us-standard-1976-layers-v2-smooth-cutoff', topKm: ATMOSPHERE_TOP_KM, standardTopKm: STANDARD_LAYER_TOP_KM, scaleHeightAbove86Km: scaleHeightKm,
  assumptions: 'Atmósfera corrotante, sin viento ni variaciones; densidad 0 por encima de 200 km.'
});
