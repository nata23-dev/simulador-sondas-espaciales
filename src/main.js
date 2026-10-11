import './style.css';

import { cargarEfemerides, obtenerEstados } from './astronomy/Ephemerides.js';
import { createSolarSystem } from './graphics/SolarSystem.js';
import { crearPanelInfoPlaneta } from './ui/PlanetInfoPanel.js';
import { crearSelectorPlanetas } from './ui/PlanetSelector.js';
import { crearControlesTemporales } from './ui/TimelineControls.js';
import { crearControlesVisualizacion } from './ui/VisualizationControls.js';
import { crearControlesHUD } from './ui/HudControls.js';

const estadoDatos = document.querySelector('#data-status');
const botonReintentar = document.querySelector('#retry-button');
const fechaEscena = document.querySelector('#scene-date');
const panelInfo = crearPanelInfoPlaneta();
const hud = crearControlesHUD();

let datosAstronomicos = null;
let estadosActuales = null;
let planetaSeleccionado = null;

function actualizarPanel(fecha) {
  panelInfo.actualizar(
    planetaSeleccionado,
    estadosActuales?.[planetaSeleccionado],
    datosAstronomicos?.metadatos,
    fecha
  );
}

const selectorPlanetas = crearSelectorPlanetas({
  alElegir: nombre => {
    if (!simulador.seleccionarPlaneta(nombre)) {
      estadoDatos.textContent = `No se pudo iniciar el viaje hacia ${nombre}. Puedes explorar el planeta seleccionado con los controles de cámara.`;
    }
  },
  alExplorar: () => {
    if (!simulador.explorarSeleccionado()) {
      estadoDatos.textContent = 'No se pudo calcular una ruta segura hacia el planeta seleccionado.';
    }
  },
  alVistaGeneral: () => simulador.vistaGeneral()
});

const controlesTemporales = crearControlesTemporales(fecha => {
  if (!datosAstronomicos) return;
  const estados = obtenerEstados(datosAstronomicos, fecha);
  simulador.actualizarPosiciones(estados);
  estadosActuales = estados;
  fechaEscena.textContent = `${fecha} · 00:00 TDB`;
  estadoDatos.textContent = `NASA/JPL Horizons · muestra diaria ${fecha} (TDB)`;
  actualizarPanel(fecha);
});

const simulador = createSolarSystem(
  document.querySelector('#solar-system'),
  nombre => {
    planetaSeleccionado = nombre;
    selectorPlanetas.actualizar(nombre);
    actualizarPanel(controlesTemporales.obtenerFecha());
    hud.actualizarSeleccion(nombre);
  }
);

crearControlesVisualizacion(simulador);
botonReintentar.addEventListener('click', iniciar);

async function iniciar() {
  estadoDatos.textContent = 'Cargando efemérides de NASA/JPL Horizons…';
  botonReintentar.hidden = true;
  selectorPlanetas.habilitar(false);

  try {
    datosAstronomicos = await cargarEfemerides();
    controlesTemporales.configurar(datosAstronomicos, '2026-10-10');
    selectorPlanetas.habilitar(true);
  } catch (error) {
    datosAstronomicos = null;
    console.error(error);
    estadoDatos.textContent = `No se pudieron cargar las efemérides: ${error.message}`;
    botonReintentar.hidden = false;
    document.querySelector('#source-menu').open = true;
  }
}

iniciar();
