// Etapa 15 — energía eléctrica y propulsión eléctrica de una sonda del Hangar. Sin DOM ni Three.js.
//
// Modelos (documentados en docs/STAGE15_HERITAGE_HANGAR.md):
// · Fotovoltaica: P(r) = P₁·r^(−k), r en AU. k = 2 (inverso del cuadrado) salvo que la pieza declare un exponente ajustado a dos
//   puntos documentados (Dawn: 10,3 kW a 1 AU y 1,3 kW a 3 AU; Juno: 14 kW a 1 AU y ~400 W en Júpiter). El ajuste agrega
//   temperatura de célula y degradación; sin ajuste, el inverso del cuadrado puede desviarse ±25 % lejos de 1 AU.
//   Se supone iluminación normal y sin sombras ni eclipses.
// · RTG: P(t) = P₀·e^(−λt), t en años desde el lanzamiento. λ por pieza ajustado a dos puntos documentados (Voyager, Cassini);
//   sin ajuste, solo la desintegración del Pu-238 (semivida 87,7 años), que es una cota optimista (omite la degradación de los
//   termopares).
// · Propulsión eléctrica: T = 2·η·P / (g₀·Isp) con P limitada a [P_min, P_max]; con P < P_min el motor no opera. Isp constante.
// Aceleración normal convencional, no gravedad local (NIST SP 811, B.9). ProbeEngineering.js la reexporta.
export const STANDARD_GRAVITY_M_S2 = 9.80665;

export const AU_KM = 149597870.7; // IAU 2012, resolución B2 (definición exacta)
export const PU238_HALF_LIFE_YEARS = 87.7;
export const PU238_DECAY_PER_YEAR = Math.LN2 / PU238_HALF_LIFE_YEARS;
export const JULIAN_YEAR_DAYS = 365.25;

export function solarArrayPowerW(component, distanceAu) {
  if (!(distanceAu > 0)) throw RangeError('La distancia al Sol debe ser positiva.');
  const k = Number.isFinite(component.solarExponent) ? component.solarExponent : 2;
  return component.generationW * distanceAu ** -k;
}

export function rtgPowerW(component, yearsSinceLaunch) {
  if (!(yearsSinceLaunch >= 0)) throw RangeError('El tiempo desde el lanzamiento debe ser no negativo.');
  const lambda = Number.isFinite(component.rtgDecayPerYear) ? component.rtgDecayPerYear : PU238_DECAY_PER_YEAR;
  return component.generationW * Math.exp(-lambda * yearsSinceLaunch);
}

const isRtg = component => component.category === 'rtg' || component.powerSource === 'rtg';

/** Generación total (W) de las piezas montadas a `distanceAu` y `yearsSinceLaunch`. */
export function generationAt(components, { distanceAu = 1, yearsSinceLaunch = 0 } = {}) {
  let solarW = 0, rtgW = 0;
  for (const component of components) {
    if (!(component.generationW > 0)) continue;
    if (isRtg(component)) rtgW += rtgPowerW(component, yearsSinceLaunch);
    else solarW += solarArrayPowerW(component, distanceAu);
  }
  return { solarW, rtgW, totalW: solarW + rtgW };
}

/** Motor eléctrico con una potencia de entrada disponible (W). Devuelve empuje, potencia usada y caudal. */
export function electricThrust(engine, availableInputW) {
  const e = engine.electric;
  if (!e) throw TypeError('El motor no declara un modelo eléctrico.');
  const inputW = Math.min(e.maxInputPowerW, Math.max(0, availableInputW));
  if (inputW < e.minInputPowerW) return { operable: false, inputW: 0, thrustN: 0, ispS: engine.ispS, massFlowKgS: 0, throttle: 0 };
  const thrustN = 2 * e.efficiency * inputW / (STANDARD_GRAVITY_M_S2 * engine.ispS);
  return { operable: true, inputW, thrustN, ispS: engine.ispS, massFlowKgS: thrustN / (STANDARD_GRAVITY_M_S2 * engine.ispS), throttle: inputW / e.maxInputPowerW };
}

/** Distancia solar (AU) a la que la generación iguala a `loadW` en t = `yearsSinceLaunch`; Infinity si nunca cae por debajo. */
export function breakEvenDistanceAu(components, loadW, yearsSinceLaunch = 0) {
  const at = r => generationAt(components, { distanceAu: r, yearsSinceLaunch }).totalW - loadW;
  if (at(1e-3) < 0) return 0;
  if (at(200) >= 0) return Infinity;
  let lo = 1e-3, hi = 200;
  for (let i = 0; i < 80; i++) { const mid = Math.sqrt(lo * hi); if (at(mid) >= 0) lo = mid; else hi = mid; }
  return lo;
}
