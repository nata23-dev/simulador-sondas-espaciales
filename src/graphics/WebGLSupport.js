// En este módulo envuelvo la creación de renderizadores WebGL 2 para traducir cualquier fallo
// síncrono de inicialización (aceleración desactivada, controlador bloqueado o límite de contextos)
// en un error tipado `WebGLUnavailableError` que la interfaz puede mostrar claramente al usuario.
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
 * Instancio `new Renderizador(opciones)` (por defecto `THREE.WebGLRenderer`) y, si el navegador no
 * concede un contexto WebGL 2, lanzo `WebGLUnavailableError` conservando la vista y la causa original.
 */
export function crearRenderizadorWebGL(opciones, contexto = 'escena 3D', Renderizador = THREE.WebGLRenderer) {
  try {
    return new Renderizador(opciones);
  } catch (error) {
    throw new WebGLUnavailableError(contexto, error);
  }
}
