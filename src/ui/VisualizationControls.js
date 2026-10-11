export function crearControlesVisualizacion(simulador) {
  const menu = document.querySelector('#view-menu');
  const orbitas = document.querySelector('#show-orbits');
  const etiquetas = document.querySelector('#show-labels');
  const estrellas = document.querySelector('#show-stars');
  const perspectiva = document.querySelector('#perspective-button');
  const etiquetaVista = document.querySelector('#view-mode-label');
  const tituloEscena = document.querySelector('#scene-title');

  simulador.alCambiarVista(modo => {
    const cine = modo === 'cinematografica';
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
      : 'VISTA CIENTÍFICA <span class="heading-divider">/</span> 01';
    tituloEscena.textContent = cine ? 'Observación planetaria' : 'Sistema Solar';
  });

  function actualizar() {
    simulador.configurarVisualizacion({
      orbitas: orbitas.checked,
      etiquetas: etiquetas.checked,
      estrellas: estrellas.checked
    });
  }

  for (const control of [orbitas, etiquetas, estrellas]) {
    control.addEventListener('change', actualizar);
  }
  document.querySelector('#reset-button').addEventListener('click', simulador.restablecerCamara);
  document.querySelector('#options-overview-button').addEventListener('click', simulador.vistaGeneral);
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
