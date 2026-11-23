// En este módulo gestiono los controles temporales de la vista del Sistema Solar: selección de fecha, avance diario,
// velocidad de reproducción y validación del rango de efemérides diarias.
import { obtenerEstados, PLANETAS } from '../astronomy/Ephemerides.js';

const MILISEGUNDOS_DIA = 86400000;
const fechaLegible = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'
});

// Conecto los controles de fecha, barra temporal y reproducción con el callback que actualiza la escena astronómica.
export function crearControlesTemporales(alCambiarFecha) {
  const fechaInput = document.querySelector('#date-input');
  const anterior = document.querySelector('#previous-button');
  const siguiente = document.querySelector('#next-button');
  const reproducir = document.querySelector('#play-button');
  const textoReproducir = document.querySelector('#play-label');
  const iconoReproducir = document.querySelector('#play-icon use');
  const velocidad = document.querySelector('#playback-speed');
  const barra = document.querySelector('#timeline-range');
  const fechaTexto = document.querySelector('#timeline-date');
  const estado = document.querySelector('#playback-status');

  let fechas = [];
  let indice = 0;
  let temporizador = null;
  let observadorVelocidad = null;

  // Sincronizo el estado habilitado, los textos y los atributos accesibles de todos los controles temporales.
  function actualizar() {
    const disponible = fechas.length > 0;
    fechaInput.disabled = !disponible;
    barra.disabled = !disponible;
    anterior.disabled = !disponible || indice === 0;
    siguiente.disabled = !disponible || indice === fechas.length - 1;
    reproducir.disabled = !disponible || (indice === fechas.length - 1 && temporizador === null);
    velocidad.disabled = !disponible;
    textoReproducir.textContent = temporizador === null ? 'Reproducir' : 'Pausar';
    iconoReproducir.setAttribute('href', temporizador === null ? '#icon-play' : '#icon-pause');
    estado.textContent = temporizador === null ? 'Pausado' : `Reproduciendo · ${velocidad.value}×`;
    if (!disponible) return;
    fechaInput.value = fechas[indice];
    barra.value = String(indice);
    barra.setAttribute('aria-valuetext', `${fechas[indice]}, muestra TDB`);
    fechaTexto.textContent = `${fechaLegible.format(new Date(`${fechas[indice]}T00:00:00Z`))} · 00:00 TDB`;
  }

  // Detengo la reproducción automática si está activa y actualizo el estado visual de los botones.
  function detener() {
    if (temporizador !== null) clearInterval(temporizador);
    temporizador = null;
    actualizar();
  }

  // Cambio a una fecha válida del conjunto disponible, notifico a la escena y detengo el avance al llegar al extremo final.
  function establecerFecha(fecha) {
    const nuevoIndice = fechas.indexOf(fecha);
    if (nuevoIndice < 0) {
      actualizar();
      return false;
    }
    alCambiarFecha(fecha);
    indice = nuevoIndice;
    if (indice === fechas.length - 1 && temporizador !== null) detener();
    actualizar();
    return true;
  }

  // Actualizo el indicador de fecha sin disparar el callback principal, útil cuando otra reproducción sincroniza el reloj.
  function sincronizarFechaSilenciosa(fecha, textoEstado = null, etiquetaHoraTdb = null) {
    const nuevoIndice = fechas.indexOf(fecha);
    if (nuevoIndice >= 0) indice = nuevoIndice;
    actualizar();
    if (etiquetaHoraTdb && fechas[indice]) {
      fechaTexto.textContent = `${fechaLegible.format(new Date(`${fechas[indice]}T00:00:00Z`))} · ${etiquetaHoraTdb} TDB`;
    }
    if (textoEstado !== null) {
      estado.textContent = textoEstado;
    }
  }

  // Inicio el temporizador de reproducción avanzando una muestra diaria por pulso y deteniéndolo si ocurre algún error de datos.
  function iniciarTemporizador() {
    if (temporizador !== null) clearInterval(temporizador);
    temporizador = setInterval(() => {
      if (indice + 1 >= fechas.length) {
        detener();
        return;
      }
      try {
        establecerFecha(fechas[indice + 1]);
      } catch (error) {
        detener();
        estado.textContent = `Error de datos: ${error.message}`;
      }
    }, 1000 / Number(velocidad.value));
    actualizar();
  }

  // Conecto los eventos de navegación paso a paso, entrada manual de fecha, barra deslizante, reproducción y velocidad.
  anterior.addEventListener('click', () => { detener(); establecerFecha(fechas[indice - 1]); });
  siguiente.addEventListener('click', () => { detener(); establecerFecha(fechas[indice + 1]); });
  fechaInput.addEventListener('change', () => {
    const fecha = fechaInput.value;
    detener();
    try { establecerFecha(fecha); } catch (error) { estado.textContent = error.message; }
  });
  barra.addEventListener('input', () => {
    const fecha = fechas[Number(barra.value)];
    detener();
    try { establecerFecha(fecha); } catch (error) { estado.textContent = error.message; }
  });
  reproducir.addEventListener('click', () => {
    if (temporizador !== null) detener();
    else if (indice < fechas.length - 1) iniciarTemporizador();
  });
  velocidad.addEventListener('change', () => {
    if (temporizador !== null) iniciarTemporizador();
    else actualizar();
    observadorVelocidad?.(Number(velocidad.value) || 1);
  });

  // Valido la cobertura completa de fechas diarias en las efemérides y configuro los límites de la barra y del selector.
  function configurar(datos, fechaInicial) {
    const inicio = Date.parse(`${datos.metadatos.inicio}T00:00:00Z`);
    const fin = Date.parse(`${datos.metadatos.fin}T00:00:00Z`);
    if (!Number.isFinite(inicio) || !Number.isFinite(fin) || fin < inicio) {
      throw new Error('El intervalo de fechas de Horizons no es válido.');
    }

    // Recorro los días civiles del intervalo verificando cada muestra etiquetada en TDB.
    const disponibles = [];
    for (let dia = inicio; dia <= fin; dia += MILISEGUNDOS_DIA) {
      const fecha = new Date(dia).toISOString().slice(0, 10);
      obtenerEstados(datos, fecha);
      disponibles.push(fecha);
    }
    if (PLANETAS.some(nombre => datos.planetas[nombre].length !== disponibles.length)) {
      throw new Error('Las muestras diarias de Horizons están incompletas.');
    }
    fechas = disponibles;
    fechaInput.min = fechas[0];
    fechaInput.max = fechas.at(-1);
    barra.min = '0';
    barra.max = String(fechas.length - 1);
    barra.step = '1';
    establecerFecha(fechas.includes(fechaInicial) ? fechaInicial : fechas[0]);
  }

  actualizar();
  return {
    configurar,
    detener,
    sincronizarFechaSilenciosa,
    obtenerFecha: () => fechas[indice] ?? null,
    obtenerVelocidad: () => Number(velocidad.value) || 1,
    alCambiarVelocidad(fn) { observadorVelocidad = fn; }
  };
}
