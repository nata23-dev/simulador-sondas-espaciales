// Este módulo solo cambia la presentación; la selección, el viaje y la fecha tienen sus propios controladores.
export function crearControlesHUD() {
  const app = document.querySelector('#app');
  const boton = document.querySelector('#immersive-button');
  const etiqueta = document.querySelector('#immersive-label');
  const anuncio = document.querySelector('#hud-announcement');
  const destino = document.querySelector('#destination-menu');
  const mision = document.querySelector('#mission-panel');
  const info = document.querySelector('#planet-info');
  const cuerpo = document.querySelector('#observed-body');
  const instrumentos = [...document.querySelectorAll('.hud-secondary')];
  const menus = [...document.querySelectorAll('#destination-menu, #distance-menu, #view-menu, #source-menu, #camera-help')];
  let inmersivo = false;
  let focoAnterior = null;
  let planetaActual = null;
  let sondaActiva = false;
  let nombreSondaActual = 'Sonda Experimental 01';

  function actualizarObservacion() {
    const etiquetaPlaneta = planetaActual === 'Jupiter' ? 'Júpiter' : planetaActual;
    const observando = Boolean(etiquetaPlaneta) || sondaActiva;
    app.classList.toggle('is-observing', observando);
    cuerpo.hidden = !observando;
    if (etiquetaPlaneta) {
      cuerpo.textContent = `Observando · ${etiquetaPlaneta}`;
    } else if (sondaActiva) {
      cuerpo.textContent = `Observando · ${nombreSondaActual}`;
    } else {
      cuerpo.textContent = '';
    }
  }

  function establecerInmersivo(valor) {
    if (inmersivo === valor) return;
    inmersivo = valor;
    if (valor) focoAnterior = document.activeElement;
    app.classList.toggle('is-immersive', valor);
    // Los controles ocultos tampoco deben recibir foco con el teclado.
    for (const instrumento of instrumentos) instrumento.inert = valor;
    boton.setAttribute('aria-pressed', String(valor));
    boton.setAttribute('aria-label', valor ? 'Mostrar controles' : 'Activar modo inmersivo');
    boton.title = valor ? 'Mostrar controles (I o Esc)' : 'Modo inmersivo (I)';
    etiqueta.textContent = valor ? 'Mostrar controles' : 'Modo inmersivo';
    anuncio.textContent = valor
      ? 'Modo inmersivo. Pulsa I, Escape o Mostrar controles para recuperar los instrumentos.'
      : 'Controles visibles.';
    if (valor) boton.focus({ preventScroll: true });
    else if (focoAnterior?.isConnected && focoAnterior.getClientRects().length) {
      focoAnterior.focus({ preventScroll: true });
    }
  }

  boton.addEventListener('click', () => establecerInmersivo(!inmersivo));
  document.querySelector('#explore-button').addEventListener('click', () => {
    destino.open = false;
    destino.querySelector('summary').focus({ preventScroll: true });
  });
  info.addEventListener('toggle', () => {
    info.querySelector('.collapse-hint').textContent = info.open ? 'Contraer' : 'Ver datos';
  });
  if (mision) {
    destino.addEventListener('toggle', () => {
      if (destino.open) mision.open = false;
    });
    mision.addEventListener('toggle', () => {
      if (mision.open) destino.open = false;
    });
  }
  document.addEventListener('keydown', event => {
    const editando = event.target.closest('input, select, textarea, [contenteditable="true"]');
    if (event.key === 'Escape') {
      if (inmersivo) establecerInmersivo(false);
      else {
        for (const menu of menus) {
          if (menu.open && menu.contains(document.activeElement)) menu.querySelector('summary').focus();
          menu.open = false;
        }
      }
    } else if (event.key.toLowerCase() === 'i' && !event.repeat && !editando
      && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      establecerInmersivo(!inmersivo);
    }
  });

  for (const menu of menus) {
    menu.addEventListener('toggle', () => {
      if (menu.open) for (const otro of menus) if (otro !== menu) otro.open = false;
    });
  }
  document.addEventListener('pointerdown', event => {
    for (const menu of menus) if (menu.open && !menu.contains(event.target)) menu.open = false;
  });

  function actualizarSeleccion(nombre) {
    planetaActual = nombre;
    if (nombre) sondaActiva = false;
    const etiquetaNombre = nombre === 'Jupiter' ? 'Júpiter' : nombre;
    document.querySelector('#destination-current').textContent = etiquetaNombre ?? 'Explorar destinos';
    actualizarObservacion();
    if (destino.contains(document.activeElement)) destino.querySelector('summary').focus();
    destino.open = false;
    // En móviles la ficha empieza contraída para dejar libre la escena.
    if (nombre) info.open = !window.matchMedia('(max-width: 760px)').matches;
  }

  function actualizarSeleccionSonda(activa, nombreSonda = 'Sonda Experimental 01') {
    sondaActiva = Boolean(activa);
    nombreSondaActual = nombreSonda;
    if (sondaActiva) planetaActual = null;
    actualizarObservacion();
  }

  return { actualizarSeleccion, actualizarSeleccionSonda };
}
