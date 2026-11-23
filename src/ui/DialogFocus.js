// Fase 5 de la auditoría final (UX-01, UX-02) — foco en los diálogos modales: Tab y Mayús+Tab recorren solo sus controles y, al
// cerrarse, el foco vuelve al control que los abrió. Lo usan la paleta «Buscar» (CommandPalette.js) y la bienvenida histórica
// (HistoricalWelcomeModal.js). Sin estado propio; las funciones aceptan cualquier objeto con la interfaz mínima del DOM que usan.

export const SELECTOR_ENFOCABLES = 'button, input, select, textarea, a[href], summary, [tabindex]:not([tabindex="-1"])';

/** Visible y en el documento: no es <body>, ocupa espacio y no está dentro de un elemento oculto o inerte. */
export function esVisible(el, body = globalThis.document?.body) {
  return Boolean(el?.isConnected && el !== body && el.getClientRects?.().length && !el.closest?.('[hidden], [inert]'));
}

/** Índice del siguiente control con Tab (o el anterior con Mayús+Tab), cíclico. Fuera del diálogo (`actual` < 0): el primero o el último. */
export function indiceTab(total, actual, haciaAtras) {
  if (!(total > 0)) return -1;
  if (!(actual >= 0)) return haciaAtras ? total - 1 : 0;
  return (actual + (haciaAtras ? -1 : 1) + total) % total;
}

/** Controles enfocables y visibles de `contenedor`, en orden del documento. */
export function controlesEnfocables(contenedor) {
  return [...contenedor.querySelectorAll(SELECTOR_ENFOCABLES)].filter(el => !el.disabled && esVisible(el));
}

/** Mueve el foco con Tab dentro de `contenedor`. Devuelve el control enfocado (o null si no hay ninguno). */
export function moverFocoConTab(contenedor, haciaAtras, activo = globalThis.document?.activeElement) {
  const controles = controlesEnfocables(contenedor);
  const i = indiceTab(controles.length, controles.indexOf(activo), haciaAtras);
  if (i < 0) return null;
  controles[i].focus({ preventScroll: true });
  return controles[i];
}

/**
 * A dónde vuelve el foco al cerrar un diálogo: al control que lo abrió si sigue visible y no es del propio diálogo; si no, a la
 * alternativa (p. ej. el botón «Buscar» de la cabecera) si es visible; si tampoco, null.
 */
export function destinoFocoAlCerrar(previo, dialogo, alternativa = null) {
  if (previo && !dialogo?.contains?.(previo) && esVisible(previo)) return previo;
  return esVisible(alternativa) ? alternativa : null;
}
