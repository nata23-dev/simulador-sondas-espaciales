function formatearMillonesKm(valorKm) {
  const signo = valorKm < 0 ? '−' : '';
  return `${signo}${(Math.abs(valorKm) / 1e6).toFixed(2)}`;
}

export function crearControlesMision({
  alAlternarEjecucion,
  alReiniciar,
  alEnfocarSonda,
  alAlternarTrayectoria,
  alSeleccionarAparienciaSonda
}) {
  const panel = document.querySelector('#mission-panel');
  const puntoEstado = document.querySelector('#mission-dot');
  const nombreSonda = document.querySelector('#mission-probe-name');
  const etiquetaEstado = document.querySelector('#mission-status');
  const botonEjecucion = document.querySelector('#mission-play-button');
  const iconoEjecucion = document.querySelector('#mission-play-icon use');
  const textoEjecucion = document.querySelector('#mission-play-label');
  const botonReiniciar = document.querySelector('#mission-reset-button');
  const botonEnfocar = document.querySelector('#mission-focus-button');
  const textoEnfocar = document.querySelector('#mission-focus-label');
  const casillaTrayectoria = document.querySelector('#show-probe-trajectory');
  const selectorApariencia = document.querySelector('#probe-visual-select');
  const notaApariencia = document.querySelector('#probe-visual-note');

  const campoTranscurrido = document.querySelector('#mission-elapsed');
  const campoEpoca = document.querySelector('#mission-epoch');
  const campoRapidez = document.querySelector('#mission-speed');
  const campoMarco = document.querySelector('#mission-frame');
  const campoDistanciaAu = document.querySelector('#mission-distance-au');
  const campoDistanciaKm = document.querySelector('#mission-distance-km');
  const campoPosicion = document.querySelector('#mission-position');
  const campoModelo = document.querySelector('#mission-model');

  // En pantallas móviles el panel comienza contraído para preservar el área libre del lienzo 3D.
  if (window.matchMedia('(max-width: 760px)').matches) {
    panel.open = false;
  }

  let sondaEnfocada = false;
  let sondaVisibleEnEscena = false;
  let habilitado = false;

  botonEjecucion.addEventListener('click', () => {
    if (!habilitado) return;
    alAlternarEjecucion?.();
  });

  botonReiniciar.addEventListener('click', () => {
    if (!habilitado) return;
    alReiniciar?.();
  });

  botonEnfocar.addEventListener('click', () => {
    if (!habilitado || !sondaVisibleEnEscena) return;
    alEnfocarSonda?.();
  });

  casillaTrayectoria.addEventListener('change', () => {
    alAlternarTrayectoria?.(casillaTrayectoria.checked);
  });

  selectorApariencia?.addEventListener('change', () => {
    alSeleccionarAparienciaSonda?.(selectorApariencia.value);
  });

  function configurarMision({ definicionSonda, descripcionModelo, marco }) {
    habilitado = true;
    nombreSonda.textContent = definicionSonda.name;
    if (descripcionModelo) campoModelo.textContent = descripcionModelo;
    if (marco) campoMarco.textContent = marco;
    botonEjecucion.disabled = false;
    botonReiniciar.disabled = false;
    casillaTrayectoria.disabled = false;
  }

  function actualizarEstadoModelo3D(info) {
    if (!info || !notaApariencia) return;
    if (selectorApariencia && selectorApariencia.value !== info.aparienciaPreferida) {
      selectorApariencia.value = info.aparienciaPreferida;
    }

    if (info.modeloActivo === 'voyager' && info.voyagerCargado) {
      notaApariencia.textContent = 'Geometría 3D oficial Voyager (NASA/JPL-Caltech/VTAD) · Trayectoria experimental ficticia (no Voyager 1 histórica).';
    } else if (info.aparienciaPreferida === 'voyager' && info.errorCargaVoyager) {
      notaApariencia.textContent = 'Respaldo procedural activo (Voyager.glb no disponible) · Trayectoria experimental ficticia.';
    } else if (info.aparienciaPreferida === 'voyager' && !info.voyagerCargado) {
      notaApariencia.textContent = 'Cargando geometría oficial Voyager (NASA/JPL-Caltech/VTAD)…';
    } else {
      notaApariencia.textContent = 'Bus procedural genérico activo · Trayectoria experimental ficticia.';
    }
  }

  function actualizarEstadoEjecucion(modo, factorVelocidad = 1) {
    panel.dataset.executionState = modo;
    puntoEstado.classList.toggle('is-running', modo === 'simulando');

    if (modo === 'simulando') {
      etiquetaEstado.textContent = `Simulando · ${String(factorVelocidad).replace('.', ',')}×`;
      textoEjecucion.textContent = 'Pausar';
      iconoEjecucion.setAttribute('href', '#icon-pause');
    } else if (modo === 'pausado') {
      etiquetaEstado.textContent = 'Pausado';
      textoEjecucion.textContent = 'Reanudar';
      iconoEjecucion.setAttribute('href', '#icon-play');
    } else if (modo === 'fin_cobertura') {
      etiquetaEstado.textContent = 'Fin de cobertura';
      textoEjecucion.textContent = 'Iniciar';
      iconoEjecucion.setAttribute('href', '#icon-play');
    } else if (modo === 'anterior_epoca') {
      etiquetaEstado.textContent = 'Anterior a época T0';
      textoEjecucion.textContent = 'Iniciar';
      iconoEjecucion.setAttribute('href', '#icon-play');
    } else if (modo === 'error') {
      etiquetaEstado.textContent = 'Sin propagación';
      textoEjecucion.textContent = 'Iniciar';
      iconoEjecucion.setAttribute('href', '#icon-play');
    } else {
      etiquetaEstado.textContent = 'Listo · T+0';
      textoEjecucion.textContent = 'Iniciar';
      iconoEjecucion.setAttribute('href', '#icon-play');
    }
  }

  function actualizarTelemetria(estadoVisualSonda) {
    if (!estadoVisualSonda) {
      sondaVisibleEnEscena = false;
      botonEnfocar.disabled = true;
      campoTranscurrido.textContent = 'Anterior a 2026-10-10';
      campoEpoca.textContent = 'Época inicial: 2026-10-10 · 00:00:00 TDB';
      campoRapidez.textContent = '—';
      campoDistanciaAu.textContent = '—';
      campoDistanciaKm.textContent = 'Sonda inactiva antes de T0';
      campoPosicion.textContent = '—';
      campoPosicion.removeAttribute('title');
      return;
    }

    sondaVisibleEnEscena = true;
    botonEnfocar.disabled = !habilitado;

    const pos = estadoVisualSonda.posicionKm;
    campoTranscurrido.textContent = estadoVisualSonda.tiempoTranscurridoTexto;
    campoEpoca.textContent = estadoVisualSonda.fechaTDB;
    campoRapidez.textContent = `${estadoVisualSonda.rapidezHeliocentricaKmPorS.toFixed(3)} km/s`;
    campoDistanciaAu.textContent = `${estadoVisualSonda.distanciaHeliocentricaAU.toFixed(4)} AU`;
    campoDistanciaKm.textContent = `${Math.round(estadoVisualSonda.distanciaHeliocentricaKm).toLocaleString('es-MX')} km`;
    campoPosicion.textContent = `(${formatearMillonesKm(pos.x)}, ${formatearMillonesKm(pos.y)}, ${formatearMillonesKm(pos.z)}) ×10⁶`;
    campoPosicion.title = `X: ${pos.x.toFixed(1)} km · Y: ${pos.y.toFixed(1)} km · Z: ${pos.z.toFixed(1)} km`;
    if (estadoVisualSonda.modeloFisicoTexto) {
      campoModelo.textContent = `Partícula de prueba · ${estadoVisualSonda.modeloFisicoTexto}`;
    }
  }

  function actualizarEnfoqueSonda(enfocada) {
    sondaEnfocada = Boolean(enfocada);
    botonEnfocar.setAttribute('aria-pressed', String(sondaEnfocada));
    botonEnfocar.classList.toggle('is-active', sondaEnfocada);
    textoEnfocar.textContent = sondaEnfocada ? 'Enfocada' : 'Enfocar';
  }

  function informarError(mensaje) {
    habilitado = false;
    botonEjecucion.disabled = true;
    botonReiniciar.disabled = true;
    botonEnfocar.disabled = true;
    actualizarEstadoEjecucion('error');
    campoModelo.textContent = mensaje;
  }

  return {
    configurarMision,
    actualizarEstadoModelo3D,
    actualizarEstadoEjecucion,
    actualizarTelemetria,
    actualizarEnfoqueSonda,
    informarError,
    trayectoriaMarcada: () => casillaTrayectoria.checked
  };
}
