// Auditoría final, fase 1 — STAB-01: creación de renderizadores WebGL 2 con un fallo reconocible.
// `new THREE.WebGLRenderer` lanza una excepción síncrona cuando el navegador no puede dar un contexto WebGL 2 (aceleración
// desactivada sin dibujo por software, controlador bloqueado, límite de contextos…). Aquí se convierte en
// `WebGLUnavailableError` para que cada vista explique el motivo en lugar de romper el arranque. Cuando WebGL 2 está
// disponible se crea exactamente el mismo renderizador, con las mismas opciones: no cambia nada del dibujo.
import * as THREE from 'three';

export const WEBGL2_UNAVAILABLE_TITLE = 'WebGL 2 no disponible';
export const WEBGL2_UNAVAILABLE_MESSAGE = 'Este dispositivo o navegador no pudo inicializar WebGL 2, que el simulador necesita para dibujar sus escenas 3D.';
export const WEBGL2_UNAVAILABLE_HINTS = Object.freeze([
  'Activa la aceleración por hardware (aceleración gráfica) en la configuración del navegador y vuelve a cargar la página.',
  'Actualiza el navegador y los controladores de la tarjeta gráfica, o prueba con otro navegador.',
  'Si hay muchas pestañas o ventanas con contenido 3D abiertas, ciérralas: el navegador limita los contextos WebGL.'
]);

export class WebGLUnavailableError extends Error {
  constructor(contexto, cause) {
    super(`${WEBGL2_UNAVAILABLE_MESSAGE} (${contexto}: ${cause?.message ?? String(cause)})`, { cause });
    this.name = 'WebGLUnavailableError';
    this.contexto = contexto;
  }
}

export const esFalloWebGL = error => error instanceof WebGLUnavailableError || error?.name === 'WebGLUnavailableError';

/**
 * `new Renderizador(opciones)` (por defecto `THREE.WebGLRenderer`); si el contexto no se puede crear lanza
 * `WebGLUnavailableError` con la causa original. `contexto` nombra la vista para el mensaje y la consola.
 */
export function crearRenderizadorWebGL(opciones, contexto = 'escena 3D', Renderizador = THREE.WebGLRenderer) {
  try {
    return new Renderizador(opciones);
  } catch (error) {
    throw new WebGLUnavailableError(contexto, error);
  }
}
