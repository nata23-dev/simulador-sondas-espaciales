import { MODOS_ESCALA_VISUAL, REGIONES_SISTEMA } from '../graphics/ScaleModeConfig.js';

export function crearControlesVisualizacion(simulador) {
  const menu = document.querySelector('#view-menu');
  const menuDestino = document.querySelector('#destination-menu');
  const orbitas = document.querySelector('#show-orbits');
  const etiquetas = document.querySelector('#show-labels');
  const estrellas = document.querySelector('#show-stars');
  const perspectiva = document.querySelector('#perspective-button');
  const etiquetaVista = document.querySelector('#view-mode-label');
  const tituloEscena = document.querySelector('#scene-title');

  const insigniaEscala = document.querySelector('#scale-mode-badge');
  const botonEscala = document.querySelector('#scale-mode-button');
  const textoBotonEscala = document.querySelector('#scale-mode-button-label');
  const opcionEscalaCientifica = document.querySelector('#scale-scientific-option');
  const opcionEscalaExploratoria = document.querySelector('#scale-exploratory-option');
  const botonRegionInterior = document.querySelector('#region-inner-button');
  const botonDestinoInterior = document.querySelector('#dest-inner-button');

  function actualizarEncabezadoVista(modo) {
    const cine = modo === 'cinematografica';
    const esInterior = !cine && simulador.regionSistemaActual?.() === REGIONES_SISTEMA.INTERIOR;
    perspectiva.setAttribute('aria-pressed', String(cine));
    perspectiva.setAttribute('aria-label', cine
      ? 'Volver a la vista científica completa'
      : 'Activar vista cinematográfica parcial');
    perspectiva.querySelector('.perspective-full').textContent = cine
      ? 'Vista científica'
      : 'Vista cinematográfica';
    perspectiva.querySelector('.perspective-short').textContent = cine
      ? 'General'
      : 'Cine';
    etiquetaVista.innerHTML = cine
      ? 'PERSPECTIVA PARCIAL <span class="heading-divider">/</span> 02'
      : (esInterior
        ? 'REGIÓN INTERIOR <span class="heading-divider">/</span> 01B'
        : 'VISTA CIENTÍFICA <span class="heading-divider">/</span> 01');
    tituloEscena.textContent = cine
      ? 'Observación planetaria'
      : (esInterior ? 'Sistema Solar interior' : 'Sistema Solar');
  }

  simulador.alCambiarVista(actualizarEncabezadoVista);

  if (simulador.alCambiarModoEscala) {
    simulador.alCambiarModoEscala(modoEscala => {
      const esCientifica = modoEscala === MODOS_ESCALA_VISUAL.CIENTIFICA;
      if (insigniaEscala) {
        insigniaEscala.textContent = esCientifica
          ? 'ESCALA CIENTÍFICA · 1:1'
          : 'ESCALA EXPLORATORIA';
        insigniaEscala.dataset.mode = modoEscala;
      }
      if (botonEscala) {
        botonEscala.setAttribute('aria-pressed', String(esCientifica));
        botonEscala.setAttribute(
          'aria-label',
          esCientifica ? 'Cambiar a escala exploratoria' : 'Cambiar a escala científica 1:1'
        );
      }
      if (textoBotonEscala) {
        textoBotonEscala.textContent = esCientifica ? 'Escala 1:1' : 'Exploratoria';
      }
      if (opcionEscalaCientifica) {
        opcionEscalaCientifica.setAttribute('aria-pressed', String(esCientifica));
      }
      if (opcionEscalaExploratoria) {
        opcionEscalaExploratoria.setAttribute('aria-pressed', String(!esCientifica));
      }
    });
  }

  function actualizar() {
    // Las capas cambian la presentación sin alterar las posiciones astronómicas.
    simulador.configurarVisualizacion({
      orbitas: orbitas.checked,
      etiquetas: etiquetas.checked,
      estrellas: estrellas.checked
    });
  }

  for (const control of [orbitas, etiquetas, estrellas]) {
    control.addEventListener('change', actualizar);
  }

  if (botonEscala) {
    botonEscala.addEventListener('click', () => {
      const siguiente = simulador.modoEscalaActual() === MODOS_ESCALA_VISUAL.CIENTIFICA
        ? MODOS_ESCALA_VISUAL.EXPLORATORIA
        : MODOS_ESCALA_VISUAL.CIENTIFICA;
      simulador.establecerModoEscala(siguiente);
    });
  }
  opcionEscalaCientifica?.addEventListener('click', () => {
    simulador.establecerModoEscala(MODOS_ESCALA_VISUAL.CIENTIFICA);
  });
  opcionEscalaExploratoria?.addEventListener('click', () => {
    simulador.establecerModoEscala(MODOS_ESCALA_VISUAL.EXPLORATORIA);
  });

  botonRegionInterior?.addEventListener('click', () => {
    simulador.enfocarRegionSistema(REGIONES_SISTEMA.INTERIOR);
    menu.open = false;
  });
  botonDestinoInterior?.addEventListener('click', () => {
    simulador.enfocarRegionSistema(REGIONES_SISTEMA.INTERIOR);
    if (menuDestino) menuDestino.open = false;
  });

  document.querySelector('#reset-button').addEventListener('click', simulador.restablecerCamara);
  document.querySelector('#options-overview-button').addEventListener('click', () => {
    simulador.vistaGeneral();
    menu.open = false;
  });
  perspectiva.addEventListener('click', () => {
    if (simulador.modoVistaActual() === 'cientifica') simulador.vistaCinematografica();
    else simulador.vistaGeneral();
  });
  menu.querySelector('summary').addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      menu.open = !menu.open;
    }
  });
  document.addEventListener('pointerdown', event => {
    if (menu.open && !menu.contains(event.target)) menu.open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') menu.open = false;
  });
  actualizar();
}
