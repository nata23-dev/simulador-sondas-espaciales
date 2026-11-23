// Aquí modelo la generación eléctrica (paneles solares y RTG) y la propulsión eléctrica de una sonda del Hangar.
//
// Aplico tres modelos físicos puros (unidades: W, AU, años, N, s, kg/s):
// · Fotovoltaica: P(r) = P₁·r^(−k) con r en AU. Uso k = 2 (ley del inverso del cuadrado) salvo que el componente declare
//   un exponente ajustado a dos puntos documentados (como Dawn o Juno), asumiendo iluminación normal y sin eclipses.
// · RTG: P(t) = P₀·e^(−λt) con t en años desde el lanzamiento. Uso el decaimiento λ propio de la pieza o, por defecto,
//   la desintegración pura del Pu-238 (semivida 87,7 años, cota optimista que omite la degradación de termopares).
// · Propulsión eléctrica: T = 2·η·P / (g₀·Isp) con potencia útil P en [P_min, P_max] e Isp constante; si P < P_min no opera.
// Defino la gravedad normal convencional g₀ (NIST SP 811, B.9), que ProbeEngineering.js reexporta.
export const STANDARD_GRAVITY_M_S2 = 9.80665;

export const AU_KM = 149597870.7; // Defino la unidad astronómica exacta según la resolución B2 de la IAU 2012 (km).
export const PU238_HALF_LIFE_YEARS = 87.7;
export const PU238_DECAY_PER_YEAR = Math.LN2 / PU238_HALF_LIFE_YEARS;
export const JULIAN_YEAR_DAYS = 365.25;

// Calculo la potencia fotovoltaica (W) de un panel a una distancia heliocéntrica dada en AU.
export function solarArrayPowerW(component, distanceAu) {
  if (!(distanceAu > 0)) throw RangeError('La distancia al Sol debe ser positiva.');
  const k = Number.isFinite(component.solarExponent) ? component.solarExponent : 2;
  return component.generationW * distanceAu ** -k;
}

// Calculo la potencia eléctrica remanente (W) de un generador RTG tras `yearsSinceLaunch` años.
export function rtgPowerW(component, yearsSinceLaunch) {
  if (!(yearsSinceLaunch >= 0)) throw RangeError('El tiempo desde el lanzamiento debe ser no negativo.');
  const lambda = Number.isFinite(component.rtgDecayPerYear) ? component.rtgDecayPerYear : PU238_DECAY_PER_YEAR;
  return component.generationW * Math.exp(-lambda * yearsSinceLaunch);
}

const isRtg = component => component.category === 'rtg' || component.powerSource === 'rtg';

/** Sumo la generación eléctrica total (W) separando contribución solar y RTG a `distanceAu` y `yearsSinceLaunch`. */
export function generationAt(components, { distanceAu = 1, yearsSinceLaunch = 0 } = {}) {
  let solarW = 0, rtgW = 0;
  for (const component of components) {
    if (!(component.generationW > 0)) continue;
    if (isRtg(component)) rtgW += rtgPowerW(component, yearsSinceLaunch);
    else solarW += solarArrayPowerW(component, distanceAu);
  }
  return { solarW, rtgW, totalW: solarW + rtgW };
}

/** Calculo el empuje (N), la potencia consumida (W), el flujo másico (kg/s) y el nivel de aceleración de un motor eléctrico. */
export function electricThrust(engine, availableInputW) {
  const e = engine.electric;
  if (!e) throw TypeError('El motor no declara un modelo eléctrico.');
  const inputW = Math.min(e.maxInputPowerW, Math.max(0, availableInputW));
  if (inputW < e.minInputPowerW) return { operable: false, inputW: 0, thrustN: 0, ispS: engine.ispS, massFlowKgS: 0, throttle: 0 };
  const thrustN = 2 * e.efficiency * inputW / (STANDARD_GRAVITY_M_S2 * engine.ispS);
  return { operable: true, inputW, thrustN, ispS: engine.ispS, massFlowKgS: thrustN / (STANDARD_GRAVITY_M_S2 * engine.ispS), throttle: inputW / e.maxInputPowerW };
}

/** Encuentro por bisección logarítmica la distancia solar (AU) donde la generación iguala a `loadW` (o Infinity si siempre la supera). */
export function breakEvenDistanceAu(components, loadW, yearsSinceLaunch = 0) {
  const at = r => generationAt(components, { distanceAu: r, yearsSinceLaunch }).totalW - loadW;
  if (at(1e-3) < 0) return 0;
  if (at(200) >= 0) return Infinity;
  let lo = 1e-3, hi = 200;
  for (let i = 0; i < 80; i++) { const mid = Math.sqrt(lo * hi); if (at(mid) >= 0) lo = mid; else hi = mid; }
  return lo;
}
