// En este módulo controlo la herramienta científica de medición tridimensional de distancias entre cuerpos celestes y sondas.
// Calculo siempre a partir de estados físicos en km en el mismo marco y época TDB, y sincronizo la línea visual en la escena 3D.
import {
  computeScientificDistance,
  formatLightTime
} from '../science/DistanceMeasurement.js';

const formatoAU = new Intl.NumberFormat('es-MX', {
  minimumFractionDigits: 4,
  maximumFractionDigits: 6
});
const formatoKmEntero = new Intl.NumberFormat('es-MX', {
  maximumFractionDigits: 0
});
const formatoKmDecimal = new Intl.NumberFormat('es-MX', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

export const CUERPOS_BASE_SISTEMA = Object.freeze([
  { id: 'Sol', etiqueta: 'Sol' },
  { id: 'Mercurio', etiqueta: 'Mercurio' },
  { id: 'Venus', etiqueta: 'Venus' },
  { id: 'Tierra', etiqueta: 'Tierra' },
  { id: 'Marte', etiqueta: 'Marte' },
  { id: 'Jupiter', etiqueta: 'Júpiter' },
  { id: 'Saturno', etiqueta: 'Saturno' },
  { id: 'Urano', etiqueta: 'Urano' },
  { id: 'Neptuno', etiqueta: 'Neptuno' }
]);

// Mantengo la misma lista base de cuerpos medibles tanto para el modo de exploración como para el laboratorio.
export const CUERPOS_MEDIBLES_SISTEMA = Object.freeze([
  ...CUERPOS_BASE_SISTEMA
]);

// En modo histórico añado Voyager 1 y 2 junto con las lunas de sobrevuelo relevantes.
export const CUERPOS_MEDIBLES_HISTORICOS = Object.freeze([
  { id: 'voyager-1', etiqueta: 'Voyager 1 (-31)' },
  { id: 'voyager-2', etiqueta: 'Voyager 2 (-32)' },
  ...CUERPOS_BASE_SISTEMA,
  { id: 'Io', etiqueta: 'Ío (501 · sobrevuelo)' },
  { id: 'Titan', etiqueta: 'Titán (606 · sobrevuelo)' },
  { id: 'Triton', etiqueta: 'Tritón (801 · sobrevuelo)' }
]);

// Creo y conecto los controles del panel de distancias, sus selectores, la línea 3D fijable y el refresco de resultados.
export function crearControlesDistancia({
  obtenerDescriptorCuerpo,
  alActualizarLineaEscena,
  cuerpos = CUERPOS_MEDIBLES_SISTEMA
}) {
  const menu = document.querySelector('#distance-menu');
  const selectorA = document.querySelector('#distance-body-a');
  const selectorB = document.querySelector('#distance-body-b');
  const botonInvertir = document.querySelector('#distance-swap-button');
  const casillaLinea = document.querySelector('#distance-show-line');
  const botonFijar = document.querySelector('#distance-pin-button');

  const mensajeEstado = document.querySelector('#distance-status-msg');
  const bloqueResultados = document.querySelector('#distance-results');
  const campoAu = document.querySelector('#distance-value-au');
  const campoKm = document.querySelector('#distance-value-km');
  const campoLuz = document.querySelector('#distance-light-time');
  const campoEpoca = document.querySelector('#distance-epoch');
  const campoFuente = document.querySelector('#distance-source');

  // Relleno ambos selectores preservando la elección previa cuando sigue disponible y evitando seleccionar el mismo cuerpo dos veces.
  function poblarOpciones(listaCuerpos, defectoA, defectoB) {
    const prevA = selectorA.value;
    const prevB = selectorB.value;
    selectorA.innerHTML = '';
    selectorB.innerHTML = '';
    const ids = new Set();
    for (const cuerpo of listaCuerpos) {
      selectorA.add(new Option(cuerpo.etiqueta, cuerpo.id));
      selectorB.add(new Option(cuerpo.etiqueta, cuerpo.id));
      ids.add(cuerpo.id);
    }
    selectorA.value = ids.has(prevA) && prevA !== defectoB ? prevA : defectoA;
    selectorB.value = ids.has(prevB) && prevB !== selectorA.value ? prevB : defectoB;
    if (selectorA.value === selectorB.value) {
      selectorA.value = defectoA;
      selectorB.value = defectoB;
    }
  }

  poblarOpciones(cuerpos, 'Tierra', 'Jupiter');

  let lineaFijada = false;
  let ultimaMedicion = null;

  // Sincronizo el estado visual y aria-pressed del botón que mantiene visible la línea 3D aunque se pliegue el menú.
  function sincronizarBotonFijar() {
    botonFijar.setAttribute('aria-pressed', String(lineaFijada));
    botonFijar.classList.toggle('is-active', lineaFijada);
    botonFijar.textContent = lineaFijada ? 'Fijado' : 'Fijar';
  }

  // Consulto los extremos actuales, calculo la distancia científica y actualizo tanto las cifras del panel como el vector 3D.
  function actualizar() {
    const idA = selectorA.value;
    const idB = selectorB.value;
    const descA = obtenerDescriptorCuerpo(idA);
    const descB = obtenerDescriptorCuerpo(idB);

    const resultado = computeScientificDistance(
      descA?.endpoint ?? null,
      descB?.endpoint ?? null
    );
    ultimaMedicion = resultado;

    if (resultado.status !== 'valid') {
      const razonDetallada = resultado.status === 'unavailable'
        ? (descA?.motivoNoDisponible ?? descB?.motivoNoDisponible ?? resultado.reason)
        : resultado.reason;

      mensajeEstado.hidden = false;
      mensajeEstado.textContent = razonDetallada;
      bloqueResultados.classList.add('is-disabled');
      campoAu.textContent = '—';
      campoKm.textContent = 'Sin medición válida';
      campoLuz.textContent = '—';
      campoEpoca.textContent = '—';
      campoFuente.textContent = '—';
      alActualizarLineaEscena?.(null, null, false);
      return resultado;
    }

    mensajeEstado.hidden = true;
    mensajeEstado.textContent = '';
    bloqueResultados.classList.remove('is-disabled');

    const textoKm = resultado.distanceKm < 100000
      ? `${formatoKmDecimal.format(resultado.distanceKm)} km`
      : `${formatoKmEntero.format(resultado.distanceKm)} km`;

    campoAu.textContent = `${formatoAU.format(resultado.distanceAu)} AU`;
    campoKm.textContent = textoKm;
    campoLuz.textContent = formatLightTime(resultado.lightTimeSeconds);
    campoEpoca.textContent = resultado.epochLabelTdb;
    campoEpoca.title = `JD ${resultado.jdTdb.toFixed(6)} TDB`;
    campoFuente.textContent = `Heliocéntrico J2000/ICRF · ${resultado.sourceSummary}`;

    const debeMostrarVector = casillaLinea.checked && (menu.open || lineaFijada);
    alActualizarLineaEscena?.(
      descA?.posicionEscena ?? null,
      descB?.posicionEscena ?? null,
      debeMostrarVector
    );
    return resultado;
  }

  // Reacciono a cambios de cuerpos, inversión de extremos, visibilidad de la línea y apertura del panel desplegable.
  selectorA.addEventListener('change', actualizar);
  selectorB.addEventListener('change', actualizar);

  botonInvertir.addEventListener('click', () => {
    const previoA = selectorA.value;
    selectorA.value = selectorB.value;
    selectorB.value = previoA;
    actualizar();
  });

  casillaLinea.addEventListener('change', () => {
    if (!casillaLinea.checked && lineaFijada) {
      lineaFijada = false;
      sincronizarBotonFijar();
    }
    actualizar();
  });

  botonFijar.addEventListener('click', () => {
    lineaFijada = !lineaFijada;
    if (lineaFijada) casillaLinea.checked = true;
    sincronizarBotonFijar();
    actualizar();
  });

  menu.addEventListener('toggle', actualizar);
  menu.querySelector('summary').addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      menu.open = !menu.open;
    }
  });

  sincronizarBotonFijar();

  return {
    actualizar,
    obtenerUltimaMedicion: () => ultimaMedicion,
    // Permito fijar un par concreto desde fuera y recalcular de inmediato.
    seleccionarPar(idA, idB) {
      selectorA.value = idA;
      selectorB.value = idB;
      return actualizar();
    },
    // Adapto la lista de cuerpos disponibles al cambiar entre el modo histórico y el resto de modos.
    configurarModoOperacion(modo) {
      if (modo === 'historico') {
        poblarOpciones(CUERPOS_MEDIBLES_HISTORICOS, 'Tierra', 'voyager-1');
        selectorA.value = 'Tierra';
        selectorB.value = 'voyager-1';
      } else {
        poblarOpciones(CUERPOS_BASE_SISTEMA, 'Tierra', 'Jupiter');
      }
      return actualizar();
    }
  };
}
