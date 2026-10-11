import { PLANETAS } from '../astronomy/Ephemerides.js';

const ETIQUETAS = { Jupiter: 'Júpiter' };

export function crearSelectorPlanetas({ alElegir, alExplorar, alVistaGeneral }) {
  const selector = document.querySelector('#planet-select');
  const seleccionado = document.querySelector('#selected-planet');
  const explorar = document.querySelector('#explore-button');
  const general = document.querySelector('#overview-button');

  for (const nombre of PLANETAS) {
    const opcion = document.createElement('option');
    opcion.value = nombre;
    opcion.textContent = ETIQUETAS[nombre] ?? nombre;
    selector.append(opcion);
  }

  selector.addEventListener('change', () => {
    if (selector.value) alElegir(selector.value);
  });
  explorar.addEventListener('click', alExplorar);
  general.addEventListener('click', alVistaGeneral);

  function actualizar(nombre) {
    selector.value = nombre ?? '';
    seleccionado.textContent = nombre
      ? `Seleccionado · ${ETIQUETAS[nombre] ?? nombre}`
      : 'Ningún planeta seleccionado';
    explorar.disabled = !nombre;
  }

  function habilitar(valor) {
    selector.disabled = !valor;
  }

  actualizar(null);
  habilitar(false);
  return { actualizar, habilitar };
}
