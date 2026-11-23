// En este módulo coordino la descarga diferida de texturas bajo demanda para planetas y lunas.
// Solo gestiono cuándo se piden los archivos: cada cuerpo registra su cargador y sus mallas,
// y disparo la descarga una única vez cuando su disco alcanza al menos UMBRAL_TEXTURA_PX de radio
// en pantalla (o de forma escalonada en tiempo inactivo del navegador).
import * as THREE from 'three';
import { getQualityState } from './QualityProfile.js';

export const UMBRAL_TEXTURA_PX = 2;
// Guardo en este registro de caché diferida cada clave pendiente junto con su función de carga y sus mallas asociadas.
const pendientes = new Map();
const solicitadas = new Set();

/** Registro de forma idempotente la función de carga diferida asociada a `clave`. */
export function registrarTexturaDiferida(clave, cargar) {
  if (solicitadas.has(clave)) return;
  if (!pendientes.has(clave)) pendientes.set(clave, { cargar, mallas: new Set() });
}

/** Vinculo una malla esférica de radio unitario escalado a la clave de textura pendiente. */
export function vincularMallaTextura(clave, malla) {
  pendientes.get(clave)?.mallas.add(malla);
}

/** Disparo una sola vez la carga de `clave` si aún está pendiente y devuelvo si la lancé. */
export function solicitarTextura(clave) {
  const entrada = pendientes.get(clave);
  if (!entrada) return false;
  pendientes.delete(clave);
  solicitadas.add(clave);
  entrada.cargar();
  return true;
}
export const texturasPendientes = () => [...pendientes.keys()];
export const texturasSolicitadas = () => [...solicitadas];

/** Calculo el radio aparente en píxeles de una esfera observada por una cámara perspectiva. */
export function radioAparentePx(radio, distancia, fovGrados, alturaPx, zoom = 1) {
  if (!(radio > 0) || !(alturaPx > 0)) return 0;
  if (!(distancia > radio)) return Infinity;
  return radio / distancia * (alturaPx / 2) / Math.tan(THREE.MathUtils.degToRad(fovGrados) / 2) * (zoom || 1);
}

const _centro = new THREE.Vector3();
function visibleEnEscena(malla) {
  for (let nodo = malla; nodo; nodo = nodo.parent) if (!nodo.visible) return false;
  return true;
}

/** Recorro únicamente las claves pendientes y solicito la textura de las mallas visibles que ya superan el umbral en píxeles. */
export function solicitarTexturasVisibles(camera, alturaPx) {
  if (!pendientes.size || !camera?.isPerspectiveCamera) return;
  for (const [clave, { mallas }] of [...pendientes]) {
    for (const malla of mallas) {
      if (!visibleEnEscena(malla)) continue;
      malla.getWorldPosition(_centro);
      const r = radioAparentePx(malla.matrixWorld.getMaxScaleOnAxis(), _centro.distanceTo(camera.position), camera.fov, alturaPx, camera.zoom);
      if (r >= UMBRAL_TEXTURA_PX) { solicitarTextura(clave); break; }
    }
  }
}

/** Adelanto de una en una las cargas de `claves` cuando el navegador está en reposo mediante requestIdleCallback o retardo. */
export function precargarEnReposo(claves, { retardoMs = 2500 } = {}) {
  const cola = [...claves];
  const siguiente = () => {
    while (cola.length && !pendientes.has(cola[0])) cola.shift();
    if (!cola.length) return;
    solicitarTextura(cola.shift());
    programar();
  };
  const programar = () => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(siguiente, { timeout: 8000 });
    else setTimeout(siguiente, 400);
  };
  setTimeout(programar, retardoMs);
}

/** Compruebo si el navegador declara modo de ahorro de datos o una conexión lenta 2G/3G. */
export function conexionLimitada(nav = globalThis.navigator) {
  const c = nav?.connection;
  return Boolean(c?.saveData) || /(^|-)(2g|3g)$/.test(c?.effectiveType ?? '');
}

/**
 * Decido si debo usar el perfil ligero de texturas: con calidad «Baja» o conexión limitada
 * omito mapas secundarios de relieve y rugosidad, pero mantengo siempre los mapas de color superficial.
 */
export function texturasLigeras({ calidad = getQualityState().profile, nav = globalThis.navigator } = {}) {
  return calidad === 'bajo' || conexionLimitada(nav);
}
