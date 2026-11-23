// En este módulo relaciono la irradiancia solar bolométrica inversa al cuadrado con
// las unidades de la escena (32 unidades/AU) y la compensación de exposición fotográfica de la cámara.
import { UNIDADES_POR_AU } from './SceneScale.js';

// Tomo la irradiancia solar total media a 1 AU de NASA SORCE (flujo bolométrico en W/m², no radiancia RGB).
export const IRRADIANCIA_SOLAR_1_AU = 1361;

/** Calculo la irradiancia solar (W/m²) a una distancia heliocéntrica dada en AU según la ley 1/r². */
export function irradianciaSolar(distanceAU) {
  if (!Number.isFinite(distanceAU) || distanceAU <= 0) return null;
  return IRRADIANCIA_SOLAR_1_AU / (distanceAU * distanceAU);
}

/** Convierto una posición en coordenadas de la escena a distancia heliocéntrica en AU dividiendo por 32 unidades/AU. */
export function distanciaHeliocentricaAU(positionScene) {
  if (!positionScene) return null;
  const { x, y, z } = positionScene;
  if (![x, y, z].every(Number.isFinite)) return null;
  const distanceAU = Math.hypot(x, y, z) / UNIDADES_POR_AU;
  return distanceAU > 0 ? distanceAU : null;
}

// Aplico una ganancia de exposición fotográfica deliberadamente más suave que 1/r²;
// ajusto la ganancia visual de cámara sin alterar nunca la irradiancia física del Sol.
export function exposicionFotografica(distanceAU) {
  if (!Number.isFinite(distanceAU) || distanceAU <= 0) return 1;
  return Math.min(300, Math.max(0.18, distanceAU ** 1.65));
}

// Escalo la irradiancia bolométrica al sistema de unidades de la luz puntual (decay = 2) mediante el factor visual 0,003.
export const INTENSIDAD_SOL_ESCENA = IRRADIANCIA_SOLAR_1_AU * UNIDADES_POR_AU ** 2 * 0.003;
