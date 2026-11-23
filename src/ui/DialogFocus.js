// En este módulo centralizo las utilidades de foco accesible para los diálogos modales del simulador.
// Aquí atrapo el foco de Tab y Mayús+Tab dentro del diálogo activo y calculo a qué control devolverlo al cerrarse;
// no guardo estado interno y trabajo con cualquier nodo que ofrezca la interfaz mínima del DOM.

export const SELECTOR_ENFOCABLES = 'button, input, select, textarea, a[href], summary, [tabindex]:not([tabindex="-1"])';

// Compruebo si un elemento está conectado, no es <body>, ocupa espacio real y no cuelga de un contenedor oculto o inerte.
export function esVisible(el, body = globalThis.document?.body) {
  return Boolean(el?.isConnected && el !== body && el.getClientRects?.().length && !el.closest?.('[hidden], [inert]'));
}

// Calculo de forma cíclica el índice del siguiente control (o el anterior con Mayús+Tab); si el foco está fuera, entro por el extremo adecuado.
export function indiceTab(total, actual, haciaAtras) {
  if (!(total > 0)) return -1;
  if (!(actual >= 0)) return haciaAtras ? total - 1 : 0;
  return (actual + (haciaAtras ? -1 : 1) + total) % total;
}

// Reúno los controles enfocables, habilitados y visibles dentro del contenedor respetando el orden del documento.
export function controlesEnfocables(contenedor) {
  return [...contenedor.querySelectorAll(SELECTOR_ENFOCABLES)].filter(el => !el.disabled && esVisible(el));
}

// Desplazo el foco del teclado con Tab o Mayús+Tab dentro del contenedor y devuelvo el elemento enfocado o null si no hay ninguno.
export function moverFocoConTab(contenedor, haciaAtras, activo = globalThis.document?.activeElement) {
  const controles = controlesEnfocables(contenedor);
  const i = indiceTab(controles.length, controles.indexOf(activo), haciaAtras);
  if (i < 0) return null;
  controles[i].focus({ preventScroll: true });
  return controles[i];
}

// Decido a qué elemento devolver el foco al cerrar un diálogo: priorizo el control que lo abrió si sigue visible fuera del diálogo
// y, en caso contrario, recurro a una alternativa visible o devuelvo null.
export function destinoFocoAlCerrar(previo, dialogo, alternativa = null) {
  if (previo && !dialogo?.contains?.(previo) && esVisible(previo)) return previo;
  return esVisible(alternativa) ? alternativa : null;
}
