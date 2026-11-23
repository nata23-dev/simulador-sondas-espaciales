// En este módulo implemento el medidor discreto y opcional de fotogramas por segundo (desde el menú de calidad gráfica o con ?fps=1).
// Mido la cadencia real de requestAnimationFrame en cualquier vista del simulador y no ejecuto nada mientras el indicador permanece oculto.

const CLAVE = 'simulador:mostrar-fps';

// Resumo una ventana de intervalos entre fotogramas (en ms) calculando FPS medios, tiempo medio, peor fotograma y tirones mayores de 25 ms.
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

// Clasifico la fluidez en tres estados visuales: «bien» (≥ 50 FPS), «aviso» (30–50) o «mal» (< 30).
export function estadoFps(fps) {
  if (!(fps >= 30)) return 'mal';
  return fps >= 50 ? 'bien' : 'aviso';
}

const coma = (x, d = 0) => x.toFixed(d).replace('.', ',');

// Construyo las etiquetas principal y de detalle del medidor, añadiendo el factor de resolución y la marca «CPU» si el dibujo es por software.
export function textoFps(resumen, calidad = null) {
  const extra = calidad ? ` · ×${coma(calidad.pixelRatio, calidad.pixelRatio % 1 ? 2 : 0).replace(/(,\d)0$/, '$1')}${calidad.gpu?.software ? ' · CPU' : ''}` : '';
  if (!resumen) return { principal: '— FPS', detalle: `midiendo…${extra}` };
  return { principal: `${Math.round(resumen.fps)} FPS`, detalle: `${coma(resumen.mediaMs, 1)} ms · peor ${coma(resumen.peorMs)}${extra}` };
}

// Leo si el usuario activó el medidor por parámetro de URL (?fps=1) o mediante preferencia guardada en localStorage.
function leerPreferencia() {
  try {
    if (/[?&]fps=1\b/.test(globalThis.location?.search ?? '')) return true;
    return globalThis.localStorage?.getItem(CLAVE) === '1';
  } catch { return false; }
}
// Guardo la visibilidad elegida en localStorage, ignorando silenciosamente entornos sin almacenamiento disponible.
function guardarPreferencia(valor) { try { globalThis.localStorage?.setItem(CLAVE, valor ? '1' : '0'); } catch { /* Ignoro errores si no hay almacenamiento disponible. */ } }

// Creo el medidor dentro del contenedor indicado, lo enlazo con su casilla de control y actualizo las cifras cada ventanaMs milisegundos.
export function crearMedidorFps({ contenedor = document.body, casilla = null, ventanaMs = 500, calidad = null } = {}) {
  const raiz = document.createElement('div');
  raiz.className = 'fps-meter';
  raiz.hidden = true;
  raiz.title = 'Fotogramas por segundo medidos en este navegador: media de los últimos 0,5 s, tiempo medio por fotograma, el peor fotograma y la resolución de render (×1 = un píxel de render por píxel de la pantalla; «CPU»: dibujo por software). Más de 25 ms en un fotograma se nota como un tirón.';
  raiz.innerHTML = '<span class="fps-meter__value">— FPS</span><span class="fps-meter__detail">midiendo…</span>';
  const valor = raiz.querySelector('.fps-meter__value'), detalle = raiz.querySelector('.fps-meter__detail');
  contenedor.append(raiz);

  let activo = false, id = 0, ultimo = null, inicioVentana = 0;
  const intervalos = [];
  // Pinto el resumen acumulado de la ventana actual y reinicio el búfer de intervalos.
  function pintar() {
    const resumen = resumirFotogramas(intervalos);
    const texto = textoFps(resumen, calidad?.() ?? null);
    valor.textContent = texto.principal; detalle.textContent = texto.detalle;
    raiz.dataset.state = resumen ? estadoFps(resumen.fps) : 'bien';
    intervalos.length = 0;
  }
  // Registro el tiempo transcurrido entre fotogramas consecutivos y refresco la lectura al completar la ventana.
  function bucle(ahora) {
    if (!activo) return;
    if (ultimo !== null) intervalos.push(ahora - ultimo);
    ultimo = ahora;
    if (ahora - inicioVentana >= ventanaMs) { pintar(); inicioVentana = ahora; }
    id = requestAnimationFrame(bucle);
  }
  // Activo o detengo por completo el bucle de medición y sincronizo la casilla asociada.
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
  // Cuando la pestaña pasa a segundo plano descarto la marca temporal para no contar la pausa como un tirón al volver.
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
