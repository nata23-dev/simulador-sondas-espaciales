// Etapa 18 — texturas bajo demanda. Solo presentación: decide CUÁNDO se descargan las texturas, no cuáles ni cómo se dibujan.
//
// Cada cuerpo registra su carga diferida (una función que pide sus archivos) y las mallas que la muestran. El bucle de la escena
// llama a solicitarTexturasVisibles() en cada fotograma: cuando una de esas mallas está visible y su disco mide al menos
// UMBRAL_TEXTURA_PX de radio en pantalla, se lanza la carga (una sola vez). Mientras tanto la malla conserva su color de respaldo,
// indistinguible a ese tamaño. precargarEnReposo() permite adelantar alguna textura cuando el navegador está libre.
import * as THREE from 'three';
import { getQualityState } from './QualityProfile.js';

export const UMBRAL_TEXTURA_PX = 2;
const pendientes = new Map(); // clave → { cargar, mallas: Set }
const solicitadas = new Set();

/** Registra la carga diferida de `clave` (idempotente: la primera función registrada es la que vale). */
export function registrarTexturaDiferida(clave, cargar) {
  if (solicitadas.has(clave)) return;
  if (!pendientes.has(clave)) pendientes.set(clave, { cargar, mallas: new Set() });
}
/** Asocia una malla (esfera de radio 1 escalada) a la carga de `clave`. */
export function vincularMallaTextura(clave, malla) {
  pendientes.get(clave)?.mallas.add(malla);
}
/** Lanza la carga de `clave` si sigue pendiente. Devuelve true si la lanzó. */
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

/** Radio aparente (px) de una esfera de radio `radio` a `distancia` con una cámara perspectiva (función pura, probada). */
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
/** Pide las texturas de los cuerpos visibles cuyo disco mide ya UMBRAL_TEXTURA_PX o más. Barato: solo recorre lo pendiente. */
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

/** Adelanta las cargas de `claves` de una en una cuando el navegador está libre (requestIdleCallback; si no existe, un retardo). */
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

/** ¿Conviene ahorrar datos? (modo «ahorro de datos» del navegador o conexión 2G/3G). */
export function conexionLimitada(nav = globalThis.navigator) {
  const c = nav?.connection;
  return Boolean(c?.saveData) || /(^|-)(2g|3g)$/.test(c?.effectiveType ?? '');
}

/** Perfil de texturas ligero (móvil o conexión lenta): con calidad «Baja» o ahorro de datos se omiten los mapas que solo
 *  matizan la luz (relieve y rugosidad de la Tierra, 0,7 MB). Los mapas de color, que muestran la superficie, se conservan. */
export function texturasLigeras({ calidad = getQualityState().profile, nav = globalThis.navigator } = {}) {
  return calidad === 'bajo' || conexionLimitada(nav);
}
