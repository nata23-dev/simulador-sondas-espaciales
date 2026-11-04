import { UNIDADES_POR_AU } from './SceneScale.js';

// NASA SORCE mean total solar irradiance at 1 AU. Bolometric flux, not RGB radiance.
export const IRRADIANCIA_SOLAR_1_AU = 1361;

export function irradianciaSolar(distanceAU) {
  if (!Number.isFinite(distanceAU) || distanceAU <= 0) return null;
  return IRRADIANCIA_SOLAR_1_AU / (distanceAU * distanceAU);
}

export function distanciaHeliocentricaAU(positionScene) {
  if (!positionScene) return null;
  const { x, y, z } = positionScene;
  if (![x, y, z].every(Number.isFinite)) return null;
  const distanceAU = Math.hypot(x, y, z) / UNIDADES_POR_AU;
  return distanceAU > 0 ? distanceAU : null;
}

// Photographic exposure compensation, deliberately weaker than inverse square.
// It changes the camera's display gain, never the solar irradiance.
export function exposicionFotografica(distanceAU) {
  if (!Number.isFinite(distanceAU) || distanceAU <= 0) return 1;
  return Math.min(300, Math.max(0.18, distanceAU ** 1.65));
}

// PointLight works in scene units, with decay=2. The 0.003 coefficient maps
// bolometric W/m² to a non-calibrated visual RGB intensity at 1 AU.
export const INTENSIDAD_SOL_ESCENA = IRRADIANCIA_SOLAR_1_AU * UNIDADES_POR_AU ** 2 * 0.003;
