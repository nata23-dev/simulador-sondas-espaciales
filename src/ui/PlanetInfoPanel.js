// En este módulo derivo las magnitudes visibles y actualizo la ficha informativa del planeta seleccionado.
import { KM_PER_AU as KILOMETROS_POR_AU, SECONDS_PER_DAY as SEGUNDOS_POR_DIA } from '../science/Units.js';

// Mantengo estas reexportaciones desde la fuente única de constantes para conservar compatibilidad con otros módulos.
export { KM_PER_AU as KILOMETROS_POR_AU, SECONDS_PER_DAY as SEGUNDOS_POR_DIA } from '../science/Units.js';

const ETIQUETAS = { Jupiter: 'Júpiter' };
const formatoAU = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
const formatoKm = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
const formatoVelocidad = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 3 });

// Calculo distancias y rapidez a partir de los vectores heliocéntricos sin redondear los datos originales.
export function derivarDatos(estado) {
  const p = estado.posicionAU;
  const v = estado.velocidadAUporDia;
  const distanciaAU = Math.hypot(p.x, p.y, p.z);
  const velocidadAUporDia = Math.hypot(v.x, v.y, v.z);
  return {
    distanciaAU,
    distanciaKm: distanciaAU * KILOMETROS_POR_AU,
    velocidadAUporDia,
    velocidadKmPorSegundo: velocidadAUporDia * KILOMETROS_POR_AU / SEGUNDOS_POR_DIA
  };
}

// Conecto el panel desplegable del planeta y gestiono el plegado por teclado y su actualización con cada selección o cambio de fecha.
export function crearPanelInfoPlaneta() {
  const panel = document.querySelector('#planet-info');
  // Permito desplegar o contraer la ficha al pulsar Enter sobre el encabezado.
  panel.querySelector('summary').addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      panel.open = !panel.open;
    }
  });
  const campos = Object.fromEntries([
    'title', 'distance-au', 'distance-km', 'pos-x', 'pos-y', 'pos-z',
    'speed', 'speed-au', 'date', 'reference'
  ].map(nombre => [nombre, document.querySelector(`#info-${nombre}`)]));

  // Vuelco los datos derivados y los metadatos de referencia en la ficha, contrayéndola al aparecer en pantallas estrechas.
  function actualizar(nombre, estado, metadatos, fechaISO) {
    if (!nombre || !estado) {
      panel.hidden = true;
      return;
    }

    const aparece = panel.hidden;
    const calculados = derivarDatos(estado);
    panel.hidden = false;
    if (aparece && window.matchMedia('(max-width: 760px)').matches) panel.open = false;
    campos.title.textContent = ETIQUETAS[nombre] ?? nombre;
    campos['distance-au'].textContent = `${formatoAU.format(calculados.distanciaAU)} AU`;
    campos['distance-km'].textContent = `${formatoKm.format(calculados.distanciaKm)} km`;
    campos['pos-x'].textContent = `${formatoAU.format(estado.posicionAU.x)} AU`;
    campos['pos-y'].textContent = `${formatoAU.format(estado.posicionAU.y)} AU`;
    campos['pos-z'].textContent = `${formatoAU.format(estado.posicionAU.z)} AU`;
    campos.speed.textContent = `${formatoVelocidad.format(calculados.velocidadKmPorSegundo)} km/s`;
    campos['speed-au'].textContent = `${formatoAU.format(calculados.velocidadAUporDia)} AU/día`;
    campos.date.textContent = `${fechaISO} · 00:00 TDB`;
    campos.date.title = estado.fechaTDB;
    campos.reference.textContent = `${metadatos.plano} · ${metadatos.referencia} · centro: Sol`;
  }

  actualizar(null);
  return { actualizar };
}
