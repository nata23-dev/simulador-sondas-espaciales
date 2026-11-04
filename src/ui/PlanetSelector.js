import { PLANETAS } from '../astronomy/Ephemerides.js';
import { MOONS } from '../science/PlanetaryMoons.js';

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
    const moons = Object.entries(MOONS).filter(([, moon]) => moon.parent === nombre);
    if (moons.length) {
      const group = document.createElement('optgroup');
      group.label = `Lunas de ${ETIQUETAS[nombre] ?? nombre}`;
      for (const [key, moon] of moons) {
        const item = document.createElement('option');
        item.value = key;
        item.dataset.kind = 'moon';
        item.textContent = `${moon.name} · ${moon.id}`;
        group.append(item);
      }
      selector.append(group);
    }
  }

  // Elegir un destino y comenzar a explorarlo son acciones separadas.
  selector.addEventListener('change', () => {
    if (selector.value) alElegir(selector.value);
  });
  explorar.addEventListener('click', alExplorar);
  general.addEventListener('click', alVistaGeneral);

  function actualizar(nombre) {
    selector.value = nombre ?? '';
    seleccionado.textContent = nombre
      ? `Seleccionado · ${MOONS[nombre] ? `${MOONS[nombre].name} (${MOONS[nombre].parent})` : ETIQUETAS[nombre] ?? nombre}`
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
