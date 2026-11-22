// Etapa 26 · Medidor de fotogramas por segundo, opcional y discreto (Menú → Calidad gráfica → «Mostrar FPS», o ?fps=1).
// Solo presentación: mide la cadencia real de requestAnimationFrame del navegador, sea cual sea la vista (Sistema Solar,
// misiones históricas, laboratorio o lanzamiento 3D). Mientras está oculto no ejecuta nada.

const CLAVE = 'simulador:mostrar-fps';

/**
 * Resumen de una ventana de intervalos entre fotogramas (ms). Función pura (probada).
 * Devuelve FPS medios, intervalo medio, el peor intervalo y cuántos superan 1,5 veces el intervalo de 60 Hz (tirones).
 */
export function resumirFotogramas(intervalosMs) {
  const validos = intervalosMs.filter(ms => Number.isFinite(ms) && ms > 0 && ms < 1000);
  if (!validos.length) return null;
  const total = validos.reduce((s, ms) => s + ms, 0);
  const mediaMs = total / validos.length;
  return {
    fps: 1000 / mediaMs,
    mediaMs,
    peorMs: Math.max(...validos),
    tirones: validos.filter(ms => ms > 25).length,
    fotogramas: validos.length
  };
}

/** Estado de color del medidor: 'bien' (≥ 50 FPS), 'aviso' (30–50) o 'mal' (< 30). Función pura (probada). */
export function estadoFps(fps) {
  if (!(fps >= 30)) return 'mal';
  return fps >= 50 ? 'bien' : 'aviso';
}

const coma = (x, d = 0) => x.toFixed(d).replace('.', ',');
/** Texto del medidor, p. ej. «60 FPS» y «16,7 ms · peor 18». Función pura (probada). */
export function textoFps(resumen) {
  if (!resumen) return { principal: '— FPS', detalle: 'midiendo…' };
  return { principal: `${Math.round(resumen.fps)} FPS`, detalle: `${coma(resumen.mediaMs, 1)} ms · peor ${coma(resumen.peorMs)}` };
}

function leerPreferencia() {
  try {
    if (/[?&]fps=1\b/.test(globalThis.location?.search ?? '')) return true;
    return globalThis.localStorage?.getItem(CLAVE) === '1';
  } catch { return false; }
}
function guardarPreferencia(valor) { try { globalThis.localStorage?.setItem(CLAVE, valor ? '1' : '0'); } catch { /* sin persistencia */ } }

/**
 * Crea el medidor dentro de `contenedor` y lo conecta con la casilla `casilla` (opcional). Devuelve { mostrar, visible, destruir }.
 * `ventanaMs`: cada cuánto se actualiza el texto (por defecto 500 ms).
 */
export function crearMedidorFps({ contenedor = document.body, casilla = null, ventanaMs = 500 } = {}) {
  const raiz = document.createElement('div');
  raiz.className = 'fps-meter';
  raiz.hidden = true;
  raiz.title = 'Fotogramas por segundo medidos en este navegador: media de los últimos 0,5 s, tiempo medio por fotograma y el peor fotograma. Más de 25 ms en un fotograma se nota como un tirón.';
  raiz.innerHTML = '<span class="fps-meter__value">— FPS</span><span class="fps-meter__detail">midiendo…</span>';
  const valor = raiz.querySelector('.fps-meter__value'), detalle = raiz.querySelector('.fps-meter__detail');
  contenedor.append(raiz);

  let activo = false, id = 0, ultimo = null, inicioVentana = 0;
  const intervalos = [];
  function pintar() {
    const resumen = resumirFotogramas(intervalos);
    const texto = textoFps(resumen);
    valor.textContent = texto.principal; detalle.textContent = texto.detalle;
    raiz.dataset.state = resumen ? estadoFps(resumen.fps) : 'bien';
    intervalos.length = 0;
  }
  function bucle(ahora) {
    if (!activo) return;
    if (ultimo !== null) intervalos.push(ahora - ultimo);
    ultimo = ahora;
    if (ahora - inicioVentana >= ventanaMs) { pintar(); inicioVentana = ahora; }
    id = requestAnimationFrame(bucle);
  }
  function mostrar(valorMostrar, { guardar = true } = {}) {
    const nuevo = Boolean(valorMostrar);
    if (casilla) casilla.checked = nuevo;
    if (guardar) guardarPreferencia(nuevo);
    if (nuevo === activo) return;
    activo = nuevo;
    raiz.hidden = !activo;
    if (activo) { ultimo = null; intervalos.length = 0; inicioVentana = performance.now(); id = requestAnimationFrame(bucle); }
    else cancelAnimationFrame(id);
  }
  // Con la pestaña oculta el navegador no da fotogramas: al volver se descarta el intervalo largo de la espera.
  const alCambiarVisibilidad = () => { ultimo = null; };
  document.addEventListener('visibilitychange', alCambiarVisibilidad);
  const alCambiarCasilla = () => mostrar(casilla.checked);
  casilla?.addEventListener('change', alCambiarCasilla);
  mostrar(leerPreferencia(), { guardar: false });
  return {
    mostrar,
    visible: () => activo,
    destruir() {
      mostrar(false, { guardar: false });
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
      casilla?.removeEventListener('change', alCambiarCasilla);
      raiz.remove();
    }
  };
}
