// En este módulo gestiono todos los controles de interfaz del Modo Histórico Voyager 1 y 2 (1977–2026):
// cambio entre modos de la aplicación, barra superior, cámara en primera persona, tarjeta de lanzamiento, catálogo de hitos,
// galería y comparador A/B de fotografías NASA, ficha científica de cada sonda y línea temporal histórica.
import {
  HISTORICAL_PLAYBACK_SPEEDS
} from '../science/HistoricalTime.js';
import {
  HISTORICAL_MISSIONS_CATALOG,
  VOYAGER_1_ID,
  VOYAGER_2_ID
} from '../science/VoyagerHistoricalMissions.js';
import {
  VOYAGER_HISTORICAL_EVENTS,
  getHistoricalEventById
} from '../science/VoyagerHistoricalEvents.js';
import {
  VOYAGER_PHOTO_CATALOG,
  evaluateHistoricalPhotoAvailability,
  getVoyagerPhotoById
} from '../science/VoyagerPhotoCatalog.js';
import { RADIOS_FISICOS_KM } from '../graphics/ScaleModeConfig.js';
import { sphereAngularDiameterDeg } from '../graphics/AngularGeometry.js';
import { HISTORICAL_ENCOUNTER_MOONS } from '../science/HistoricalEphemerisResolver.js';

const MESES_CORTOS = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
];

const fmtAu4 = new Intl.NumberFormat('es-MX', {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4
});
const fmtAu3 = new Intl.NumberFormat('es-MX', {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3
});
const fmtKm0 = new Intl.NumberFormat('es-MX', {
  maximumFractionDigits: 0
});
const fmtSpeed3 = new Intl.NumberFormat('es-MX', {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3
});
const fmtUnit3 = new Intl.NumberFormat('es-MX', {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
  signDisplay: 'always'
});

// Utilidades de calendario, rutas públicas y tamaño angular físico para la telemetría del comparador y de primera persona.
function esBisiesto(anio) {
  return (anio % 4 === 0 && anio % 100 !== 0) || (anio % 400 === 0);
}

function diasEnMes(anio, mes1a12) {
  if (mes1a12 === 2) return esBisiesto(anio) ? 29 : 28;
  if ([4, 6, 9, 11].includes(mes1a12)) return 30;
  return 31;
}

function resolverRutaPublica(baseUrl, rutaRelativa) {
  const baseLimpia = (baseUrl || '/').replace(/\/?$/, '/');
  return `${baseLimpia}${String(rutaRelativa).replace(/^\//, '')}`;
}

function formatearCadencia(segundos) {
  if (!Number.isFinite(segundos)) return '';
  if (segundos < 3600) return `cadencia ${Math.round(segundos / 60)} min`;
  if (segundos < 86400) return `cadencia ${Math.round(segundos / 3600)} h`;
  return `cadencia ${Math.round(segundos / 86400)} d`;
}

function obtenerRadioObjetivoKm(idCuerpo) {
  if (RADIOS_FISICOS_KM[idCuerpo]) return RADIOS_FISICOS_KM[idCuerpo];
  if (HISTORICAL_ENCOUNTER_MOONS[idCuerpo]) return HISTORICAL_ENCOUNTER_MOONS[idCuerpo].radiusKm;
  return null;
}

function formatearDiametroAngular(distanciaKm, radioKm) {
  const deg = sphereAngularDiameterDeg(radioKm, distanciaKm);
  if (deg === null) return null;
  if (deg >= 0.05) return `${deg.toFixed(2).replace('.', ',')}°`;
  const arcsec = deg * 3600;
  return `${arcsec.toFixed(2).replace('.', ',')}″`;
}

// Conecto todos los nodos del DOM del modo histórico con los callbacks del motor temporal y de cámara.
export function crearControlesModoHistorico({
  baseUrl = import.meta.env?.BASE_URL ?? '/',
  alCambiarModoApp,
  alCambiarVisibilidadSondas,
  alActivarCamaraExterior,
  alSeguirSondaExterior,
  alVistaComparativa,
  alActivarPrimeraPersona,
  alCambiarSondaPrimeraPersona,
  alApuntarPrimeraPersona,
  alReencuadrarPrimeraPersona,
  alCambiarFovPrimeraPersona,
  alAlternarTrayectoriasHistoricas,
  alAlternarHeliosfera,
  alAlternarReproduccion,
  alAlternarRetroceso,
  alIrALanzamiento,
  alIrAUltimoDisponible,
  alEventoAnterior,
  alEventoSiguiente,
  alIrAEvento,
  alEnfocarEventoActual,
  alOmitirEventoYContinuar,
  alDeslizarProgreso,
  alSeleccionarFechaUtc,
  alCambiarVelocidad,
  alCambiarAsistenciasEventos,
  alIrAFechaFoto,
  alActivarComparadorFoto,
  alCambiarFovComparador,
  alCambiarInspeccionVisualIo,
  alCerrarComparadorFoto
}) {
  const appEl = document.querySelector('#app');
  const brandEyebrow = document.querySelector('#brand-eyebrow');
  const botonesModo = [...document.querySelectorAll('[data-mode-btn]')];

  const topbar = document.querySelector('#historical-topbar');
  const botonesVisibilidad = [...document.querySelectorAll('[data-hist-vis]')];
  const btnCamExterior = document.querySelector('#hist-cam-exterior-btn');
  const btnCamFp = document.querySelector('#hist-cam-fp-btn');
  const barraFocoExterior = document.querySelector('#hist-exterior-focus-bar');
  const btnSeguirV1 = document.querySelector('#hist-follow-v1-btn');
  const btnSeguirV2 = document.querySelector('#hist-follow-v2-btn');
  const btnComparativa = document.querySelector('#hist-compare-btn');
  const btnToggleTraj = document.querySelector('#hist-toggle-traj-btn');
  const btnToggleHelio = document.querySelector('#hist-toggle-helio-btn');

  // Controles de cámara en primera persona
  const barraPrimeraPersona = document.querySelector('#first-person-bar');
  const botonesFpSonda = [...document.querySelectorAll('[data-fp-probe]')];
  const botonesFpTarget = [...document.querySelectorAll('[data-fp-target]')];
  const selectFpExtra = document.querySelector('#fp-extra-target');
  const btnFpReframe = document.querySelector('#fp-reframe-btn');
  const botonesFpFov = [...document.querySelectorAll('[data-fp-fov]')];
  const lecturaFpFov = document.querySelector('#fp-fov-readout');
  const insigniaFpFidelidad = document.querySelector('#fp-fidelity-badge');

  // Tarjeta informativa de lanzamiento 1977
  const tarjetaLanzamiento = document.querySelector('#historical-launch-card');
  const lanzamientoEyebrow = document.querySelector('#launch-card-eyebrow');
  const lanzamientoTitulo = document.querySelector('#launch-card-title');
  const lanzamientoCuerpo = document.querySelector('#launch-card-body');
  const lanzamientoHonestidad = document.querySelector('#launch-card-honesty');
  const btnCerrarLanzamiento = document.querySelector('#launch-card-close');
  const btnSaltarPrimerSpk = document.querySelector('#launch-jump-first-spk-btn');

  // Columna izquierda: catálogo de eventos y galería de fotografías
  const columnaIzquierda = document.querySelector('#historical-left-stack');
  const panelEventos = document.querySelector('#historical-events-panel');
  const selectorEvento = document.querySelector('#historical-event-select');
  const evProbeTag = document.querySelector('#hist-ev-probe');
  const evKindTag = document.querySelector('#hist-ev-kind');
  const evTitle = document.querySelector('#hist-ev-title');
  const evDate = document.querySelector('#hist-ev-date');
  const evPeriapse = document.querySelector('#hist-ev-periapse');
  const evDesc = document.querySelector('#hist-ev-desc');
  const evSource = document.querySelector('#hist-ev-source');
  const btnEvFocus = document.querySelector('#hist-ev-focus-btn');
  const btnEvFp = document.querySelector('#hist-ev-fp-btn');
  const btnEvPhoto = document.querySelector('#hist-ev-photo-btn');

  const panelFotos = document.querySelector('#historical-photos-panel');
  const estadoFechaFoto = document.querySelector('#hist-photo-date-status');
  const notaApagadoFoto = document.querySelector('#hist-photo-shutdown-note');
  const contenedorListaFotos = document.querySelector('#hist-photo-list');

  // Panel derecho: ficha científica de Voyager 1 y 2
  const panelFichaVoyager = document.querySelector('#voyager-science-panel');
  const encabezadoFicha = document.querySelector('#voyager-card-heading');
  const pestanasFicha = [...document.querySelectorAll('[data-voyager-tab]')];
  const insigniaEstadoDato = document.querySelector('#voyager-data-status-badge');
  const etiquetaFase = document.querySelector('#voyager-phase-label');
  const campoEpochUtc = document.querySelector('#v-card-epoch-utc');
  const campoEpochTdb = document.querySelector('#v-card-epoch-tdb');
  const campoElapsed = document.querySelector('#v-card-elapsed');
  const campoLaunchRef = document.querySelector('#v-card-launch-ref');
  const campoLightTime = document.querySelector('#v-card-light-time');
  const campoDistSunAu = document.querySelector('#v-card-dist-sun-au');
  const campoDistSunKm = document.querySelector('#v-card-dist-sun-km');
  const campoDistEarthAu = document.querySelector('#v-card-dist-earth-au');
  const campoDistEarthKm = document.querySelector('#v-card-dist-earth-km');
  const campoDistMutualAu = document.querySelector('#v-card-dist-mutual-au');
  const campoDistMutualKm = document.querySelector('#v-card-dist-mutual-km');
  const campoSpeedHelio = document.querySelector('#v-card-speed-helio');
  const campoPosAu = document.querySelector('#v-card-pos-au');
  const campoPosKm = document.querySelector('#v-card-pos-km');
  const campoVelDir = document.querySelector('#v-card-vel-dir');
  const campoNextEvent = document.querySelector('#v-card-next-event');
  const campoSampleInfo = document.querySelector('#v-card-sample-info');

  const campoStaticId = document.querySelector('#v-static-id');
  const campoStaticLaunch = document.querySelector('#v-static-launch');
  const campoStaticAgency = document.querySelector('#v-static-agency');
  const campoStaticObjectives = document.querySelector('#v-static-objectives');
  const campoStaticCameras = document.querySelector('#v-static-cameras');
  const campoStaticSource = document.querySelector('#v-static-source');

  // Panel comparador A/B y visor ampliado (lightbox)
  const panelComparador = document.querySelector('#photo-comparator-panel');
  const compTitulo = document.querySelector('#comp-photo-title');
  const compImg = document.querySelector('#comp-photo-img');
  const compCaption = document.querySelector('#comp-photo-caption');
  const compInstrument = document.querySelector('#comp-photo-instrument');
  const compDate = document.querySelector('#comp-photo-date');
  const compSessionDate = document.querySelector('#comp-session-date');
  const compRecreationDate = document.querySelector('#comp-recreation-date');
  const compRecreationDateB = document.querySelector('#comp-recreation-date-b');
  const compMinimizedTime = document.querySelector('#comp-minimized-time');
  const compAssistNote = document.querySelector('#comp-assist-note');
  const btnCompIoInspection = document.querySelector('#comp-io-inspection-btn');
  const compLink = document.querySelector('#comp-photo-link');
  const btnCompCerrar = document.querySelector('#comp-close-btn');
  const btnCompCerrarMovil = document.querySelector('#comp-mobile-close-btn');
  const btnCompVistaFoto = document.querySelector('#comp-view-photo');
  const btnCompVista3d = document.querySelector('#comp-view-3d');
  const btnCompMinimizar = document.querySelector('#comp-minimize-btn');
  const selectorFotoComparador = document.querySelector('#comp-photo-select');
  const detallesComparador = document.querySelector('.comparator-details');
  const resumenDetallesComparador = detallesComparador.querySelector('summary');
  const btnCompFovIss = document.querySelector('#comp-fov-iss-btn');
  const btnCompFovCtx = document.querySelector('#comp-fov-ctx-btn');
  const btnCompFovZoom = document.querySelector('#comp-fov-zoom-btn');
  const compFidelityNote = document.querySelector('#comp-fidelity-note');
  const compTelemetry = document.querySelector('#comp-geometry-telemetry');

  const modalLightbox = document.querySelector('#photo-lightbox-modal');
  const lbEyebrow = document.querySelector('#lightbox-eyebrow');
  const lbTitulo = document.querySelector('#lightbox-title');
  const lbImg = document.querySelector('#lightbox-img');
  const lbDesc = document.querySelector('#lightbox-desc');
  const lbMeta = document.querySelector('#lightbox-meta');
  const lbLink = document.querySelector('#lightbox-source-link');
  const btnLbCompare = document.querySelector('#lightbox-compare-btn');
  const btnLbClose = document.querySelector('#lightbox-close-btn');

  // Controles de la línea temporal histórica (1977–2026)
  const panelTimelineHist = document.querySelector('#historical-timeline-panel');
  const toastEventoPausa = document.querySelector('#hist-event-pause-toast');
  const toastTexto = document.querySelector('#hist-toast-text');
  const btnOmitirEvento = document.querySelector('#hist-skip-event-btn');
  const barraHitos = document.querySelector('.hist-decade-bar');
  const rangoHist = document.querySelector('#hist-timeline-range');
  const relojUtc = document.querySelector('#hist-clock-utc');
  const relojTdb = document.querySelector('#hist-clock-tdb');
  const btnLaunch = document.querySelector('#hist-launch-btn');
  const btnPrevEv = document.querySelector('#hist-prev-event-btn');
  const btnReverse = document.querySelector('#hist-reverse-btn');
  const btnPlay = document.querySelector('#hist-play-btn');
  const iconoPlay = document.querySelector('#hist-play-icon use');
  const btnNextEv = document.querySelector('#hist-next-event-btn');
  const btnLatest = document.querySelector('#hist-latest-btn');

  const selectAnio = document.querySelector('#hist-year-select');
  const selectMes = document.querySelector('#hist-month-select');
  const selectDia = document.querySelector('#hist-day-select');
  const selectHora = document.querySelector('#hist-hour-select');

  const selectVelocidad = document.querySelector('#hist-speed-select');
  const pistaUnidadVelocidad = document.querySelector('#hist-speed-unit-hint');
  const checkAutoSlow = document.querySelector('#hist-auto-slow');
  const checkAutoPause = document.querySelector('#hist-auto-pause');

  // Guardo aquí el estado local de la interfaz para evitar actualizaciones redundantes y bucles con los selectores.
  let modoAppActual = 'exploracion';
  let pestanaFichaActiva = VOYAGER_1_ID;
  let ultimoSnapshot = null;
  let ultimoEstadoCamara = null;
  let trayectoriasVisibles = true;
  let heliosferaActiva = false;
  let lanzamientoDescartadoClave = null;
  let misionLanzamientoActiva = VOYAGER_2_ID;
  let fotoComparadorActiva = null;
  let comparadorUsaContexto = false;
  let comparadorZoomActivo = false;
  let inspeccionIoActiva = false;
  let fotoLightboxActiva = null;
  let sincronizandoSelectoresFecha = false;

  // Relleno los selectores de fecha directa UTC entre 1977 y 2026.
  for (let y = 1977; y <= 2026; y++) {
    selectAnio.add(new Option(String(y), String(y)));
  }
  for (let m = 1; m <= 12; m++) {
    const val = String(m).padStart(2, '0');
    selectMes.add(new Option(`${val} ${MESES_CORTOS[m - 1]}`, val));
  }
  for (let h = 0; h <= 23; h++) {
    const val = String(h).padStart(2, '0');
    selectHora.add(new Option(`${val}:00Z`, val));
  }

  // Ajusto los días disponibles según el mes y año elegidos para no ofrecer fechas imposibles.
  function repoblarDiasSelector(anio, mes1a12, diaDeseado) {
    const total = diasEnMes(anio, mes1a12);
    if (selectDia.options.length !== total) {
      selectDia.innerHTML = '';
      for (let d = 1; d <= total; d++) {
        const val = String(d).padStart(2, '0');
        selectDia.add(new Option(val, val));
      }
    }
    const diaSeguro = Math.min(total, Math.max(1, diaDeseado));
    selectDia.value = String(diaSeguro).padStart(2, '0');
  }
  repoblarDiasSelector(1977, 8, 20);

  // Construyo la fecha ISO UTC cuando el usuario modifica los selectores, ignorando mis propias sincronizaciones internas.
  function emitirCambioFechaDirecta() {
    if (sincronizandoSelectoresFecha) return;
    const anio = Number(selectAnio.value);
    const mes = Number(selectMes.value);
    const diaPrev = Number(selectDia.value || 1);
    repoblarDiasSelector(anio, mes, diaPrev);
    const utcIso = `${selectAnio.value}-${selectMes.value}-${selectDia.value}T${selectHora.value}:00:00Z`;
    alSeleccionarFechaUtc?.(utcIso);
  }

  for (const sel of [selectAnio, selectMes, selectDia, selectHora]) {
    sel.addEventListener('change', emitirCambioFechaDirecta);
  }

  // Cargo el selector de velocidades históricas predefinidas.
  for (const sp of HISTORICAL_PLAYBACK_SPEEDS) {
    const opt = new Option(`${sp.label}`, sp.id);
    opt.title = `${sp.longLabel} (${fmtKm0.format(sp.tdbSecondsPerRealSecond)} s TDB / s real)`;
    selectVelocidad.add(opt);
  }
  selectVelocidad.value = '1d_s';

  // Mantengo el selector oculto como referencia compartida para otros controladores y presento la lista interactiva de acontecimientos como interfaz visible.
  const listaEventos = document.createElement('div');
  listaEventos.className = 'historical-event-list';
  listaEventos.setAttribute('role', 'group');
  listaEventos.setAttribute('aria-label', `${VOYAGER_HISTORICAL_EVENTS.length} acontecimientos históricos Voyager`);
  for (const ev of VOYAGER_HISTORICAL_EVENTS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.eventId = ev.id;
    const probe = document.createElement('span');
    probe.className = 'historical-event-list-probe';
    probe.textContent = ev.probeName;
    const date = document.createElement('time');
    date.dateTime = ev.dateUtc;
    date.textContent = ev.dateUtc.slice(0, 4);
    const title = document.createElement('strong');
    title.textContent = ev.title;
    button.append(probe, date, title);
    button.addEventListener('click', () => {
      renderizarTarjetaEvento(ev);
      alIrAEvento?.(ev.id);
    });
    listaEventos.append(button);
  }
  selectorEvento.before(listaEventos);

  // Pinto la ficha del acontecimiento activo, actualizo aria-pressed en la lista y muestro el botón de fotografía si existe una asociada.
  function renderizarTarjetaEvento(ev) {
    if (!ev) return;
    if (selectorEvento.value !== ev.id) selectorEvento.value = ev.id;
    for (const button of listaEventos.children) {
      button.setAttribute('aria-pressed', String(button.dataset.eventId === ev.id));
    }
    evProbeTag.textContent = `${ev.probeName} (${ev.missionId === VOYAGER_1_ID ? '-31' : '-32'})`;
    evProbeTag.dataset.mission = ev.missionId;
    evKindTag.textContent = ev.kindLabel;
    evTitle.textContent = ev.title;
    evDate.textContent = `${ev.displayDateUtc} · Ventana: ${ev.encounterWindowUtc}`;
    if (ev.officialPeriapseNote) {
      evPeriapse.hidden = false;
      evPeriapse.textContent = ev.officialPeriapseNote;
    } else {
      evPeriapse.hidden = true;
      evPeriapse.textContent = '';
    }
    evDesc.textContent = ev.description;
    evSource.href = ev.officialUrl;
    evSource.textContent = `Fuente oficial: ${ev.officialSource} ↗`;

    if (ev.photoIds?.length > 0) {
      btnEvPhoto.hidden = false;
      btnEvPhoto.dataset.photoId = ev.photoIds[0];
    } else {
      btnEvPhoto.hidden = true;
      btnEvPhoto.dataset.photoId = '';
    }
  }
  function objetivoContextualEvento(ev) {
    return ev?.focusTarget?.startsWith('voyager-') ? 'Sol' : (ev?.focusTarget || 'Sol');
  }
  renderizarTarjetaEvento(VOYAGER_HISTORICAL_EVENTS[0]);

  selectorEvento.addEventListener('change', () => {
    const ev = getHistoricalEventById(selectorEvento.value);
    renderizarTarjetaEvento(ev);
  });

  btnEvFocus.addEventListener('click', () => {
    const ev = getHistoricalEventById(selectorEvento.value);
    if (ev) alEnfocarEventoActual?.(ev);
  });
  btnEvFp.addEventListener('click', () => {
    const ev = getHistoricalEventById(selectorEvento.value);
    if (!ev) return;
    const target = objetivoContextualEvento(ev);
    alActivarPrimeraPersona?.(ev.missionId, target);
  });
  btnEvPhoto.addEventListener('click', () => {
    const photo = getVoyagerPhotoById(btnEvPhoto.dataset.photoId);
    if (photo) abrirComparadorAB(photo);
  });

  // Construyo la galería de fotografías NASA con carga diferida de miniaturas y paginación de una tarjeta a la vez.
  const nodosFotoPorId = new Map();
  function construirGaleriaFotos() {
    contenedorListaFotos.innerHTML = '';
    for (const photo of VOYAGER_PHOTO_CATALOG) {
      const card = document.createElement('article');
      card.className = 'hist-photo-item';
      card.setAttribute('role', 'listitem');
      card.dataset.photoId = photo.id;
      card.dataset.mission = photo.missionId;

      const thumbUrl = resolverRutaPublica(baseUrl, photo.thumbPath);
      card.innerHTML = `
        <div class="hist-photo-row">
          <button type="button" class="hist-photo-preview" data-photo-act="zoom" aria-label="Ampliar fotografía: ${photo.title}"><img class="hist-photo-thumb" src="${thumbUrl}" alt="" loading="lazy" decoding="async" width="76" height="76" /></button>
          <div class="hist-photo-info">
            <div class="hist-photo-meta-top">
              <span class="hist-probe-tag" data-mission="${photo.missionId}">${photo.probeName}</span>
              <span class="hist-photo-nasaid">${photo.nasaId}</span>
            </div>
            <h4>${photo.title}</h4>
            <small class="hist-photo-target">${photo.targetDisplay} · ${photo.displayDateUtc}</small>
            <p class="hist-photo-description">${photo.description}</p>
            <a class="hist-source-link" href="${photo.officialSourceUrl}" target="_blank" rel="noopener noreferrer">${photo.provenance} ↗</a>
          </div>
        </div>
        <details class="hist-photo-actions">
          <summary>Opciones de fotografía</summary>
          <div><button type="button" data-photo-act="goto">Ir a fecha</button>
          <button type="button" data-photo-act="compare">Comparar NASA / 3D</button></div>
        </details>
      `;

      card.querySelector('[data-photo-act="goto"]').addEventListener('click', () => {
        alIrAFechaFoto?.(photo);
      });
      card.querySelector('[data-photo-act="zoom"]').addEventListener('click', () => {
        abrirLightbox(photo);
      });
      card.querySelector('[data-photo-act="compare"]').addEventListener('click', () => {
        abrirComparadorAB(photo);
      });
      card.querySelector('.hist-photo-actions').addEventListener('toggle', event => {
        if (event.currentTarget.open) for (const other of contenedorListaFotos.querySelectorAll('.hist-photo-actions')) {
          if (other !== event.currentTarget) other.open = false;
        }
      });

      contenedorListaFotos.appendChild(card);
      nodosFotoPorId.set(photo.id, card);
    }
  }
  construirGaleriaFotos();
  const navegacionFotos = document.createElement('div');
  navegacionFotos.className = 'hist-photo-navigation';
  navegacionFotos.innerHTML = '<button type="button" data-photo-nav="prev">Anterior</button><span role="status" aria-live="polite"></span><button type="button" data-photo-nav="next">Siguiente</button>';
  contenedorListaFotos.before(navegacionFotos);
  let fotoVisibleId = null;
  function actualizarNavegacionFotos() {
    const disponibles = [...nodosFotoPorId.values()].filter(card => card.dataset.inFilter !== 'false');
    if (!disponibles.some(card => card.dataset.photoId === fotoVisibleId)) fotoVisibleId = disponibles[0]?.dataset.photoId ?? null;
    for (const card of nodosFotoPorId.values()) card.hidden = card.dataset.photoId !== fotoVisibleId;
    const indice = disponibles.findIndex(card => card.dataset.photoId === fotoVisibleId);
    navegacionFotos.querySelector('[role="status"]').textContent = disponibles.length ? `${indice + 1} de ${disponibles.length}` : 'Sin fotografías';
    navegacionFotos.querySelector('[data-photo-nav="prev"]').disabled = indice <= 0;
    navegacionFotos.querySelector('[data-photo-nav="next"]').disabled = indice < 0 || indice >= disponibles.length - 1;
  }
  for (const button of navegacionFotos.querySelectorAll('button')) button.addEventListener('click', () => {
    const disponibles = [...nodosFotoPorId.values()].filter(card => card.dataset.inFilter !== 'false');
    const indice = disponibles.findIndex(card => card.dataset.photoId === fotoVisibleId);
    fotoVisibleId = disponibles[indice + (button.dataset.photoNav === 'next' ? 1 : -1)]?.dataset.photoId ?? fotoVisibleId;
    actualizarNavegacionFotos();
  });
  actualizarNavegacionFotos();

  // Abro la fotografía a tamaño completo en el lightbox manteniendo sus créditos y acceso directo al comparador A/B.
  function abrirLightbox(photo) {
    if (!photo) return;
    fotoLightboxActiva = photo;
    lbEyebrow.textContent = `${photo.probeName.toUpperCase()} · ${photo.nasaId} · ${photo.attribution}`;
    lbTitulo.textContent = photo.title;
    lbImg.src = resolverRutaPublica(baseUrl, photo.imagePath);
    lbImg.alt = `${photo.title} (${photo.nasaId})`;
    lbDesc.textContent = photo.description;
    lbMeta.textContent = `${photo.targetDisplay} · ${photo.displayDateUtc} · ${photo.instrument}`;
    lbLink.href = photo.officialSourceUrl;
    modalLightbox.hidden = false;
  }

  function cerrarLightbox() {
    modalLightbox.hidden = true;
    fotoLightboxActiva = null;
  }

  btnLbClose.addEventListener('click', cerrarLightbox);
  modalLightbox.addEventListener('click', event => {
    if (event.target === modalLightbox) cerrarLightbox();
  });
  btnLbCompare.addEventListener('click', () => {
    const photo = fotoLightboxActiva;
    cerrarLightbox();
    if (photo) abrirComparadorAB(photo);
  });

  // Abro el comparador A/B entre la fotografía NASA y la recreación 3D, plegando los paneles laterales para dar espacio al lienzo.
  function abrirComparadorAB(photo) {
    if (!photo) return;
    establecerInspeccionIo(false);
    const vistaAnterior = panelComparador.hidden ? 'foto' : panelComparador.dataset.view;
    fotoComparadorActiva = photo;
    comparadorUsaContexto = false;
    comparadorZoomActivo = false;
    compTitulo.textContent = `${photo.title} (${photo.nasaId})`;
    compImg.src = resolverRutaPublica(baseUrl, photo.imagePath);
    compImg.alt = `Fotografía original NASA ${photo.nasaId}: ${photo.title}`;
    compCaption.textContent = photo.description;
    compInstrument.textContent = `${photo.probeName} · ${photo.instrument}`;
    compDate.textContent = `${photo.displayDateUtc} · Objetivo: ${photo.targetDisplay}`;
    compSessionDate.textContent = 'Sincronizando recorrido…';
    actualizarFechaRecreacionComparador('Consultando escena…');
    btnCompIoInspection.hidden = photo.targetBody !== 'Io';
    compLink.href = photo.officialSourceUrl;
    compLink.textContent = `${photo.provenance} ↗`;
    compFidelityNote.textContent = photo.recreationFidelityNote;
    selectorFotoComparador.value = photo.id;

    btnCompFovIss.setAttribute('aria-pressed', 'true');
    btnCompFovIss.textContent = `ISS-NAC ${String(photo.instrumentFovDeg).replace('.', ',')}°/lado`;
    btnCompFovCtx.setAttribute('aria-pressed', 'false');
    btnCompFovCtx.textContent = `FOV contextual (${String(photo.contextFovDeg).replace('.', ',')}°)`;
    btnCompFovZoom.setAttribute('aria-pressed', 'false');
    resumenDetallesComparador.textContent = 'B · Recreación WebGL · campo ISS';

    // Despejo los paneles laterales mientras el comparador A/B está abierto para dar la máxima visibilidad al lienzo 3D.
    panelEventos.open = false;
    panelFotos.open = false;
    panelFichaVoyager.open = false;
    panelComparador.hidden = false;
    establecerVistaComparador(vistaAnterior === 'minimizado' ? 'foto' : vistaAnterior);
    alActivarComparadorFoto?.(photo, { usarFovContexto: false });
  }

  function establecerVistaComparador(vista) {
    panelComparador.dataset.view = vista;
    btnCompVistaFoto.setAttribute('aria-pressed', String(vista === 'foto'));
    btnCompVista3d.setAttribute('aria-pressed', String(vista === '3d'));
    btnCompMinimizar.textContent = vista === 'minimizado' ? '+' : '−';
    btnCompMinimizar.setAttribute('aria-label', vista === 'minimizado' ? 'Recuperar comparador' : 'Minimizar comparador');
    if (vista === '3d' && window.matchMedia('(max-width:760px)').matches) detallesComparador.open = false;
  }

  function cerrarComparadorAB({ notificar = true } = {}) {
    if (panelComparador.hidden && !fotoComparadorActiva) return;
    establecerInspeccionIo(false);
    panelComparador.hidden = true;
    fotoComparadorActiva = null;
    alCerrarComparadorFoto?.({ reanudar: notificar });
  }

  btnCompCerrar.addEventListener('click', () => cerrarComparadorAB({ notificar: true }));
  btnCompCerrarMovil.addEventListener('click', () => cerrarComparadorAB({ notificar: true }));
  btnCompVistaFoto.addEventListener('click', () => establecerVistaComparador('foto'));
  btnCompVista3d.addEventListener('click', () => establecerVistaComparador('3d'));
  btnCompMinimizar.addEventListener('click', () => establecerVistaComparador(
    panelComparador.dataset.view === 'minimizado' ? 'foto' : 'minimizado'));
  function actualizarFechaRecreacionComparador(label) {
    compRecreationDate.textContent = label;
    compRecreationDateB.textContent = `Escena 3D: ${label} · consulta geométrica`;
    actualizarFechaMinimizado();
  }
  function actualizarFechaRecorridoComparador(label) {
    compSessionDate.textContent = label;
    actualizarFechaMinimizado();
  }
  function actualizarFechaMinimizado() {
    compMinimizedTime.textContent = `Escena 3D: ${compRecreationDate.textContent} · Recorrido guardado: ${compSessionDate.textContent}`;
  }
  function establecerInspeccionIo(activa) {
    inspeccionIoActiva = Boolean(activa && fotoComparadorActiva?.targetBody === 'Io');
    btnCompIoInspection.setAttribute('aria-pressed', String(inspeccionIoActiva));
    btnCompIoInspection.textContent = inspeccionIoActiva
      ? 'Volver a iluminación científica' : 'Iluminación de inspección de Ío';
    compAssistNote.hidden = !inspeccionIoActiva;
    alCambiarInspeccionVisualIo?.(inspeccionIoActiva);
  }
  btnCompIoInspection.addEventListener('click', () => establecerInspeccionIo(!inspeccionIoActiva));
  // Cuando el comparador está minimizado y el usuario toca la línea temporal, cierro la comparación en captura antes de procesar el salto para no mezclar épocas.
  const cerrarComparadorAlNavegar = event => {
    if (!panelComparador.hidden && panelComparador.dataset.view === 'minimizado') {
      // Preservo el valor elegido por el usuario porque cerrar el comparador restaura el deslizador antes de que corra el listener normal.
      const control = event.target;
      const value = control instanceof HTMLInputElement || control instanceof HTMLSelectElement
        ? control.value : null;
      const checked = control instanceof HTMLInputElement ? control.checked : null;
      cerrarComparadorAB({ notificar: false });
      if (value !== null) control.value = value;
      if (checked !== null) control.checked = checked;
    }
  };
  for (const tipo of ['click', 'input', 'change']) {
    panelTimelineHist.addEventListener(tipo, cerrarComparadorAlNavegar, true);
  }
  for (const photo of VOYAGER_PHOTO_CATALOG) {
    const option = document.createElement('option');
    option.value = photo.id;
    option.textContent = `${photo.probeName} · ${photo.targetDisplay} · ${photo.nasaId}`;
    selectorFotoComparador.appendChild(option);
  }
  selectorFotoComparador.addEventListener('change', () => abrirComparadorAB(
    getVoyagerPhotoById(selectorFotoComparador.value)));
  btnCompFovIss.addEventListener('click', () => {
    if (!fotoComparadorActiva) return;
    comparadorUsaContexto = false;
    comparadorZoomActivo = false;
    btnCompFovIss.setAttribute('aria-pressed', 'true');
    btnCompFovCtx.setAttribute('aria-pressed', 'false');
    btnCompFovZoom.setAttribute('aria-pressed', 'false');
    resumenDetallesComparador.textContent = 'B · Recreación WebGL · campo ISS';
    alCambiarFovComparador?.(fotoComparadorActiva, { usarFovContexto: false });
  });
  btnCompFovCtx.addEventListener('click', () => {
    if (!fotoComparadorActiva) return;
    comparadorUsaContexto = true;
    comparadorZoomActivo = false;
    btnCompFovIss.setAttribute('aria-pressed', 'false');
    btnCompFovCtx.setAttribute('aria-pressed', 'true');
    btnCompFovZoom.setAttribute('aria-pressed', 'false');
    resumenDetallesComparador.textContent = 'B · Recreación WebGL · contextual';
    alCambiarFovComparador?.(fotoComparadorActiva, { usarFovContexto: true });
  });
  btnCompFovZoom.addEventListener('click', () => {
    if (!fotoComparadorActiva) return;
    comparadorUsaContexto = false;
    comparadorZoomActivo = true;
    btnCompFovIss.setAttribute('aria-pressed', 'false');
    btnCompFovCtx.setAttribute('aria-pressed', 'false');
    btnCompFovZoom.setAttribute('aria-pressed', 'true');
    resumenDetallesComparador.textContent = 'B · Zoom visual 3D (no ISS)';
    alCambiarFovComparador?.(fotoComparadorActiva, { zoomVisual: true });
    if (window.matchMedia('(max-width:760px)').matches) detallesComparador.open = false;
  });

  // Cierro con Escape el lightbox o, si no está abierto, el comparador fotográfico A/B.
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (!modalLightbox.hidden) {
        cerrarLightbox();
      } else if (!panelComparador.hidden) {
        cerrarComparadorAB({ notificar: true });
      }
    }
  });

  // Alterno la visibilidad de los paneles globales al cambiar entre los modos exploracion, historico y experimental.
  function establecerModoVisualApp(modo) {
    modoAppActual = modo;
    appEl.dataset.appMode = modo;
    for (const btn of botonesModo) {
      btn.setAttribute('aria-pressed', String(btn.dataset.modeBtn === modo));
    }

    const esHistorico = modo === 'historico';
    const esExperimental = modo === 'experimental';

    topbar.hidden = !esHistorico;
    columnaIzquierda.hidden = !esHistorico;
    panelFichaVoyager.hidden = !esHistorico;
    panelTimelineHist.hidden = !esHistorico;
    if (!esHistorico) {
      tarjetaLanzamiento.hidden = true;
      cerrarComparadorAB({ notificar: false });
      cerrarLightbox();
    }

    document.querySelector('#timeline-panel').hidden = esHistorico;
    document.querySelector('#destination-menu').hidden = esHistorico;
    if (esHistorico) {
      document.querySelector('#planet-info').hidden = true;
    }

    if (brandEyebrow) {
      brandEyebrow.textContent = esHistorico
        ? 'MODO HISTÓRICO · VOYAGER 1 Y 2'
        : (esExperimental ? 'LABORATORIO DE MISIONES' : 'EXPLORADOR ESPACIAL');
    }
  }

  for (const btn of botonesModo) {
    btn.addEventListener('click', () => {
      const destino = btn.dataset.modeBtn;
      if (destino === modoAppActual) return;
      establecerModoVisualApp(destino);
      alCambiarModoApp?.(destino);
    });
  }
  // Observo data-app-mode por si el laboratorio o un enlace externo cambia el modo, para mantener sincronizados los botones y el motor.
  new MutationObserver(() => {
    const modo = appEl.dataset.appMode;
    if (!botonesModo.some(btn => btn.dataset.modeBtn === modo)) return;
    if (modo !== modoAppActual) {
      establecerModoVisualApp(modo);
      alCambiarModoApp?.(modo);
    }
    for (const btn of botonesModo) btn.setAttribute('aria-pressed', String(btn.dataset.modeBtn === modo));
  }).observe(appEl, { attributes: true, attributeFilter: ['data-app-mode'] });

  // Conecto los controles de la barra superior histórica (visibilidad, cámara, seguimiento, trayectorias y heliosfera).
  for (const btn of botonesVisibilidad) {
    btn.addEventListener('click', () => {
      alCambiarVisibilidadSondas?.(btn.dataset.histVis);
    });
  }

  btnCamExterior.addEventListener('click', () => {
    cerrarComparadorAB({ notificar: false });
    alActivarCamaraExterior?.();
  });
  btnCamFp.addEventListener('click', () => {
    cerrarComparadorAB({ notificar: false });
    const ev = getHistoricalEventById(selectorEvento.value);
    alActivarPrimeraPersona?.(pestanaFichaActiva,
      ev?.missionId === pestanaFichaActiva ? objetivoContextualEvento(ev) : 'Tierra');
  });

  btnSeguirV1.addEventListener('click', () => alSeguirSondaExterior?.(VOYAGER_1_ID));
  btnSeguirV2.addEventListener('click', () => alSeguirSondaExterior?.(VOYAGER_2_ID));
  btnComparativa.addEventListener('click', () => alVistaComparativa?.());

  btnToggleTraj.addEventListener('click', () => {
    trayectoriasVisibles = !trayectoriasVisibles;
    btnToggleTraj.setAttribute('aria-pressed', String(trayectoriasVisibles));
    alAlternarTrayectoriasHistoricas?.(trayectoriasVisibles);
  });
  btnToggleHelio.addEventListener('click', () => {
    heliosferaActiva = !heliosferaActiva;
    btnToggleHelio.setAttribute('aria-pressed', String(heliosferaActiva));
    alAlternarHeliosfera?.(heliosferaActiva);
  });

  // Conecto los botones y selectores de la cámara en primera persona (sonda observadora, objetivo y campo visual).
  for (const btn of botonesFpSonda) {
    btn.addEventListener('click', () => {
      alCambiarSondaPrimeraPersona?.(btn.dataset.fpProbe);
    });
  }
  for (const btn of botonesFpTarget) {
    btn.addEventListener('click', () => {
      selectFpExtra.value = '';
      alApuntarPrimeraPersona?.(btn.dataset.fpTarget);
    });
  }
  selectFpExtra.addEventListener('change', () => {
    if (!selectFpExtra.value) return;
    alApuntarPrimeraPersona?.(selectFpExtra.value);
  });
  btnFpReframe.addEventListener('click', () => alReencuadrarPrimeraPersona?.());
  for (const btn of botonesFpFov) {
    btn.addEventListener('click', () => {
      alCambiarFovPrimeraPersona?.(Number(btn.dataset.fpFov));
    });
  }

  // Conecto el cierre de la tarjeta de lanzamiento y el salto directo al primer vector heliocéntrico verificado.
  btnCerrarLanzamiento.addEventListener('click', () => {
    lanzamientoDescartadoClave = misionLanzamientoActiva;
    tarjetaLanzamiento.hidden = true;
  });
  btnSaltarPrimerSpk.addEventListener('click', () => {
    const mission = HISTORICAL_MISSIONS_CATALOG[misionLanzamientoActiva];
    if (mission) {
      tarjetaLanzamiento.hidden = true;
      alIrAFechaFoto?.({ jdTdb: mission.firstValidJdTdb, missionId: mission.id, isFirstSpkJump: true });
    }
  });

  // Relleno los metadatos fijos de Voyager 1 o Voyager 2 al cambiar de pestaña en la ficha científica.
  function renderizarMetadatosEstaticosFicha(missionId) {
    const m = HISTORICAL_MISSIONS_CATALOG[missionId];
    if (!m) return;
    encabezadoFicha.textContent = `${m.name} · NAIF ${m.naifId}`;
    campoStaticId.textContent = `${m.name} (NAIF ID ${m.naifId})`;
    campoStaticLaunch.textContent = `${m.launchDateDisplayUtc} · ${m.launchSite} · ${m.launchVehicle}`;
    campoStaticAgency.textContent = m.agency;
    campoStaticObjectives.textContent = m.historicalObjectives;
    campoStaticCameras.textContent = m.cameraShutdownNote;
    campoStaticSource.textContent = m.ephemerisSource;
  }

  function seleccionarPestanaFicha(missionId) {
    if (missionId !== VOYAGER_1_ID && missionId !== VOYAGER_2_ID) return;
    pestanaFichaActiva = missionId;
    for (const tab of pestanasFicha) {
      tab.setAttribute('aria-selected', String(tab.dataset.voyagerTab === missionId));
    }
    renderizarMetadatosEstaticosFicha(missionId);
    if (ultimoSnapshot) actualizarFichaCientifica(ultimoSnapshot);
  }

  for (const tab of pestanasFicha) {
    tab.addEventListener('click', () => {
      seleccionarPestanaFicha(tab.dataset.voyagerTab);
    });
  }
  renderizarMetadatosEstaticosFicha(pestanaFichaActiva);

  // Conecto los controles de transporte, saltos por década, deslizador, velocidad y asistencias en hitos.
  barraHitos.addEventListener('click', event => {
    const chip = event.target.closest('[data-hist-jump]');
    if (!chip || !barraHitos.contains(chip)) return;
    alIrAEvento?.(chip.dataset.histJump);
    const menu = barraHitos.closest('.temporal-advanced');
    if (menu) menu.open = false;
  });

  rangoHist.addEventListener('input', () => {
    const frac = Number(rangoHist.value) / Number(rangoHist.max);
    alDeslizarProgreso?.(frac);
  });

  btnLaunch.addEventListener('click', () => alIrALanzamiento?.());
  btnPrevEv.addEventListener('click', () => alEventoAnterior?.());
  btnReverse.addEventListener('click', () => alAlternarRetroceso?.());
  btnPlay.addEventListener('click', () => alAlternarReproduccion?.());
  btnNextEv.addEventListener('click', () => alEventoSiguiente?.());
  btnLatest.addEventListener('click', () => alIrAUltimoDisponible?.());
  btnOmitirEvento.addEventListener('click', () => alOmitirEventoYContinuar?.());

  selectVelocidad.addEventListener('change', () => {
    alCambiarVelocidad?.(selectVelocidad.value);
  });
  checkAutoSlow.addEventListener('change', () => {
    alCambiarAsistenciasEventos?.({
      autoSlow: checkAutoSlow.checked,
      autoPause: checkAutoPause.checked
    });
  });
  checkAutoPause.addEventListener('change', () => {
    alCambiarAsistenciasEventos?.({
      autoSlow: checkAutoSlow.checked,
      autoPause: checkAutoPause.checked
    });
  });

  // Actualizo la telemetría, el estado de veracidad del dato y la procedencia de muestras en la ficha científica de la sonda seleccionada.
  function actualizarFichaCientifica(snapshot) {
    const probe = snapshot.probes[pestanaFichaActiva];
    if (!probe) return;

    campoEpochUtc.textContent = snapshot.timeLabels.labelUtc;
    campoEpochTdb.textContent = `${snapshot.timeLabels.labelTdb} (ΔTDB−UTC = +${snapshot.timeLabels.tdbMinusUtcSeconds.toFixed(3).replace('.', ',')} s)`;
    etiquetaFase.textContent = probe.phase;
    campoElapsed.textContent = probe.elapsedDisplay;
    campoLaunchRef.textContent = `Lanz.: ${probe.mission.launchDateDisplayUtc}`;

    const proximo = probe.events?.next;
    campoNextEvent.textContent = proximo
      ? `Próximo hito: ${proximo.title} (${proximo.displayDateUtc})`
      : 'Próximo hito: Continuación de la Misión Interestelar (>2026)';

    if (!probe.isRealData || !probe.state) {
      const enEmpalme = probe.status === 'spk_segment_transition';
      insigniaEstadoDato.dataset.kind = probe.status;
      insigniaEstadoDato.textContent = enEmpalme
        ? 'SIN POSICIÓN VERIFICADA · TRAYECTORIA INTERRUMPIDA'
        : probe.status === 'pre_launch'
        ? 'PRE-LANZAMIENTO (SIN SONDA EN EL ESPACIO)'
        : (probe.status === 'launch_ascent_visual'
          ? 'INTRODUCCIÓN VISUAL · ASCENSO TITAN IIIE-CENTAUR'
          : 'FUERA DE COBERTURA');

      campoLightTime.textContent = '—';
      campoDistSunAu.textContent = '—';
      campoDistSunKm.textContent = enEmpalme ? 'Sin posición verificada'
        : probe.status === 'pre_launch' ? 'En plataforma SLC-41 (Tierra)' : 'Previo a inyección heliocéntrica';
      campoDistEarthAu.textContent = '—';
      campoDistEarthKm.textContent = '—';
      campoDistMutualAu.textContent = '—';
      campoDistMutualKm.textContent = enEmpalme ? 'No calculable en este intervalo' : 'Requiere ambas sondas en vuelo';
      campoSpeedHelio.textContent = '—';
      campoPosAu.textContent = '—';
      campoPosKm.textContent = '—';
      campoVelDir.textContent = '—';
      campoSampleInfo.textContent = enEmpalme
        ? 'La trayectoria se interrumpe durante este minuto y continúa cuando regresan los datos verificados.'
        : probe.reason;
      return;
    }

    const prov = probe.provenance;
    insigniaEstadoDato.dataset.kind = probe.status;
    if (probe.status === 'exact') {
      insigniaEstadoDato.textContent = 'MUESTRA EXACTA · NASA/JPL HORIZONS';
    } else if (probe.status === 'spk_segment_transition') {
      insigniaEstadoDato.textContent = 'BORDE DE SEGMENTO SPK (SIN INTERPOLAR)';
    } else {
      insigniaEstadoDato.textContent = 'INTERPOLACIÓN HERMITE C¹ · HORIZONS';
    }

    campoLightTime.textContent = probe.oneWayLightTimeDisplay;
    campoDistSunAu.textContent = `${fmtAu4.format(probe.distanceSunAu)} AU`;
    campoDistSunKm.textContent = `${fmtKm0.format(probe.distanceSunKm)} km`;
    campoDistEarthAu.textContent = probe.distanceEarthAu !== null ? `${fmtAu4.format(probe.distanceEarthAu)} AU` : '—';
    campoDistEarthKm.textContent = probe.distanceEarthKm !== null ? `${fmtKm0.format(probe.distanceEarthKm)} km` : '—';

    if (probe.distanceBetweenVoyagersAu !== null) {
      campoDistMutualAu.textContent = `${fmtAu4.format(probe.distanceBetweenVoyagersAu)} AU`;
      campoDistMutualKm.textContent = `${fmtKm0.format(probe.distanceBetweenVoyagersKm)} km`;
    } else {
      campoDistMutualAu.textContent = 'Pre-lanzamiento';
      campoDistMutualKm.textContent = 'Voyager 1 aún en Cabo Cañaveral';
    }

    campoSpeedHelio.textContent = `${fmtSpeed3.format(probe.heliocentricSpeedKmS)} km/s`;
    campoPosAu.textContent = `(${fmtAu3.format(probe.positionAu.x)}, ${fmtAu3.format(probe.positionAu.y)}, ${fmtAu3.format(probe.positionAu.z)}) AU`;
    campoPosKm.textContent = `(${fmtKm0.format(probe.positionKm.x)}, ${fmtKm0.format(probe.positionKm.y)}, ${fmtKm0.format(probe.positionKm.z)}) km`;
    campoVelDir.textContent = `(${fmtUnit3.format(probe.velocityDirection.x)}, ${fmtUnit3.format(probe.velocityDirection.y)}, ${fmtUnit3.format(probe.velocityDirection.z)})`;

    if (prov) {
      const muestrasTxt = prov.sampleLabelsTdb.length === 1
        ? `Muestra exacta: ${prov.sampleLabelsTdb[0]}`
        : `Extremos Hermite: [${prov.sampleLabelsTdb[0]}] → [${prov.sampleLabelsTdb[prov.sampleLabelsTdb.length - 1]}]`;
      const cadTxt = formatearCadencia(prov.cadenceSeconds);
      const solTxt = prov.solutionId ? ` · Solución: ${prov.solutionId}` : '';
      const avisoSplice = prov.spliceWarning ? ` · ${prov.spliceWarning}` : '';
      campoSampleInfo.textContent = `${muestrasTxt} · Conjunto: ${prov.datasetId ?? 'local'} (${cadTxt})${solTxt}${avisoSplice}`;
    }
  }

  // Actualizo el estado fotográfico para la fecha actual, filtro las tarjetas según la sonda visible y refresco la paginación.
  function actualizarDisponibilidadFotos(snapshot, visibilityMode) {
    const evalFotos = evaluateHistoricalPhotoAvailability(snapshot.jdTdb, {
      missionFilter: visibilityMode,
      windowDays: 10
    });

    if (evalFotos.hasDocumentedPhotosForDate) {
      const titulos = evalFotos.nearbyPhotos.map(p => `${p.nasaId} (${p.probeName})`).join(' · ');
      estadoFechaFoto.dataset.hasPhotos = 'true';
      estadoFechaFoto.textContent = `Fotografías auténticas documentadas en esta ventana histórica: ${titulos}.`;
    } else {
      estadoFechaFoto.dataset.hasPhotos = 'false';
      estadoFechaFoto.textContent = evalFotos.emptyDateMessage;
    }

    if (evalFotos.cameraShutdownNotice) {
      notaApagadoFoto.hidden = false;
      notaApagadoFoto.textContent = evalFotos.cameraShutdownNotice;
    } else {
      notaApagadoFoto.hidden = true;
      notaApagadoFoto.textContent = '';
    }

    const idsCercanos = new Set(evalFotos.nearbyPhotos.map(p => p.id));
    for (const [id, card] of nodosFotoPorId.entries()) {
      const mId = card.dataset.mission;
      const visiblePorFiltro = visibilityMode === 'both' || visibilityMode === mId;
      card.dataset.inFilter = String(visiblePorFiltro);
      card.classList.toggle('is-date-match', idsCercanos.has(id));
    }
    actualizarNavegacionFotos();
  }

  // Muestro la tarjeta contextual de lanzamiento 1977 cuando la época se sitúa en la ventana de ascenso previa al primer vector SPK.
  function actualizarTarjetaLanzamiento(snapshot, visibilityMode) {
    if (modoAppActual !== 'historico' || !panelComparador.hidden) {
      tarjetaLanzamiento.hidden = true;
      return;
    }
    const candidatos = [VOYAGER_2_ID, VOYAGER_1_ID].filter(
      id => visibilityMode === 'both' || visibilityMode === id
    );
    let misionEnAscenso = null;
    for (const id of candidatos) {
      const p = snapshot.probes[id];
      const m = HISTORICAL_MISSIONS_CATALOG[id];
      const cercaLanzamiento = snapshot.jdTdb >= m.launchJdTdb - 1e-6
        && snapshot.jdTdb <= m.firstValidJdTdb + (1.5 / 24);
      if (p?.status === 'launch_ascent_visual' || cercaLanzamiento) {
        misionEnAscenso = m;
        break;
      }
    }

    if (!misionEnAscenso) {
      lanzamientoDescartadoClave = null;
      tarjetaLanzamiento.hidden = true;
      return;
    }

    if (lanzamientoDescartadoClave === misionEnAscenso.id) {
      tarjetaLanzamiento.hidden = true;
      return;
    }

    misionLanzamientoActiva = misionEnAscenso.id;
    const probeSnap = snapshot.probes[misionEnAscenso.id];
    const enAscensoPreSpk = probeSnap?.status === 'launch_ascent_visual';

    lanzamientoEyebrow.textContent = enAscensoPreSpk
      ? `INTRODUCCIÓN VISUAL DE LANZAMIENTO · ${misionEnAscenso.name.toUpperCase()}`
      : `INICIO DE TRAYECTORIA CIENTÍFICA · ${misionEnAscenso.name.toUpperCase()}`;
    lanzamientoTitulo.textContent = `${misionEnAscenso.name} · ${misionEnAscenso.launchDateDisplayUtc} · ${misionEnAscenso.launchSite}`;
    lanzamientoCuerpo.textContent = enAscensoPreSpk
      ? `Vehículo lanzador: ${misionEnAscenso.launchVehicle}. Transición desde la órbita terrestre hacia la inyección interplanetaria; primer estado heliocéntrico verificado en JPL Horizons: ${misionEnAscenso.firstSampleTdbLabel}.`
      : `Vehículo lanzador: ${misionEnAscenso.launchVehicle}. La sonda ya cuenta con vectores heliocéntricos verificados de NASA/JPL Horizons desde ${misionEnAscenso.firstSampleTdbLabel}.`;
    lanzamientoHonestidad.textContent = 'Principio de integridad: el modelo 3D Voyager.glb representa la sonda espacial, no el cohete Titan IIIE-Centaur. No se inventa ni interpola una trayectoria desde la superficie terrestre.';
    btnSaltarPrimerSpk.hidden = !enAscensoPreSpk;
    tarjetaLanzamiento.hidden = false;
  }

  // Recalculo la distancia, el tiempo luz, el diámetro angular y los avisos de encuadre mientras el comparador A/B está abierto.
  function actualizarTelemetriaComparador(snapshot) {
    if (!fotoComparadorActiva || panelComparador.hidden) return;
    actualizarFechaRecreacionComparador(snapshot.timeLabels.labelUtc);
    const probe = snapshot.probes[fotoComparadorActiva.missionId];
    if (!probe?.state) {
      compTelemetry.textContent = 'Sonda sin estado heliocéntrico en la fecha seleccionada.';
      return;
    }
    const targetName = fotoComparadorActiva.targetBody;
    let targetState = snapshot.rawPlanets?.[targetName]?.state ?? snapshot.moons?.[targetName]?.state ?? null;
    if (targetName === 'Sol') {
      targetState = { position: { x: 0, y: 0, z: 0 } };
    }
    if (!targetState) {
      compTelemetry.textContent = `Observador ${probe.mission.name} a ${fmtAu3.format(probe.distanceSunAu)} AU del Sol · ${snapshot.timeLabels.labelUtc}`;
      return;
    }
    const localFrame = snapshot.localFrames?.[`${fotoComparadorActiva.missionId}:${targetName}`] ?? null;
    const dx = localFrame?.targetMinusObserverKm.x ?? targetState.position.x - probe.positionKm.x;
    const dy = localFrame?.targetMinusObserverKm.y ?? targetState.position.y - probe.positionKm.y;
    const dz = localFrame?.targetMinusObserverKm.z ?? targetState.position.z - probe.positionKm.z;
    const distKm = Math.hypot(dx, dy, dz);
    const distAu = distKm / 149597870.7;
    const luzSeg = distKm / 299792.458;
    const luzTexto = luzSeg < 6
      ? `${luzSeg.toFixed(luzSeg < 1 ? 2 : 1).replace('.', ',')} s`
      : `${(luzSeg / 60).toFixed(1).replace('.', ',')} min`;
    const diamAng = formatearDiametroAngular(distKm, obtenerRadioObjetivoKm(targetName));
    const txtAng = diamAng ? ` · Diámetro angular físico 1:1: ${diamAng}` : '';
    const fovContextualReal = ultimoEstadoCamara?.fovTipo === 'contextual_vertical'
      ? ultimoEstadoCamara.fovGrados : fotoComparadorActiva.contextFovDeg;
    const fovVerticalPantalla = ultimoEstadoCamara?.fovGrados;
    const fovHorizontalPantalla = ultimoEstadoCamara?.fovHorizontalGrados;
    const txtFov = comparadorZoomActivo
      ? `Zoom visual 3D ${fovVerticalPantalla?.toFixed(3).replace('.', ',')}° vertical; no es el campo ISS-NAC`
      : comparadorUsaContexto
        ? `FOV contextual ${String(fovContextualReal).replace('.', ',')}° vertical`
        : `Campo ISS-NAC ${String(fotoComparadorActiva.instrumentFovDeg).replace('.', ',')}° por lado del fotograma cuadrado`
        + (Number.isFinite(fovVerticalPantalla) && Number.isFinite(fovHorizontalPantalla)
          ? `; viewport 3D ${fovHorizontalPantalla.toFixed(3).replace('.', ',')}° horizontal × ${fovVerticalPantalla.toFixed(3).replace('.', ',')}° vertical`
          : '');
    const anguloObjetivo = sphereAngularDiameterDeg(obtenerRadioObjetivoKm(targetName), distKm);
    const fovActivo = Number.isFinite(fovVerticalPantalla) && Number.isFinite(fovHorizontalPantalla)
      ? Math.min(fovVerticalPantalla, fovHorizontalPantalla)
      : comparadorUsaContexto ? fovContextualReal : fotoComparadorActiva.instrumentFovDeg;
    const planetaRecortado = anguloObjetivo !== null && anguloObjetivo > fovActivo;
    const anillosRecortados = targetName === 'Saturno'
      && ultimoEstadoCamara?.encuadreObjetivo?.incluyeAnillos
      && ultimoEstadoCamara.encuadreObjetivo.fovVerticalNecesarioGrados > ultimoEstadoCamara.fovGrados;
    const notaCampo = planetaRecortado || anillosRecortados
      ? ` · Encuadre parcial: ${anillosRecortados ? 'los anillos o el planeta exceden' : 'el cuerpo excede'} el campo activo.`
      : '';
    const notaCadena = HISTORICAL_ENCOUNTER_MOONS[targetName]
      || ['Jupiter','Saturno','Urano','Neptuno'].includes(targetName)
      ? localFrame
        ? ' · Vector directo objetivo–nave de Horizons; trayectoria global separada.'
        : ' · Sin contexto local verificado para esta fecha; la geometría global nave–objetivo conserva posibles discrepancias.'
      : '';
    const etiquetaGeometria = localFrame ? 'Geometría local verificada' : 'Geometría global';
    compTelemetry.textContent = `${etiquetaGeometria}: distancia ${probe.mission.name} → ${fotoComparadorActiva.targetDisplay} = ${fmtKm0.format(distKm)} km (${fmtAu4.format(distAu)} AU) · Tiempo de luz: ${luzTexto}${txtAng} · ${txtFov}${notaCampo}${notaCadena}`;
    if (ultimoEstadoCamara?.modo === 'photo_recreation') actualizarEstadoCamaraHistorica(ultimoEstadoCamara);
  }

  // Sincronizo todos los controles del modo histórico con el estado actual emitido por el motor temporal.
  function actualizarDesdeMotor({
    snapshot,
    engineState
  }) {
    ultimoSnapshot = snapshot;
    const {
      progress,
      playing,
      direction,
      speed,
      effectiveSpeed,
      visibilityMode,
      selectedProbeId,
      triggeredEvent,
      autoSlowNearEvents,
      autoPauseAtEvents
    } = engineState;

    // Actualizo los botones de visibilidad de Voyager 1 y Voyager 2.
    for (const btn of botonesVisibilidad) {
      btn.setAttribute('aria-pressed', String(btn.dataset.histVis === visibilityMode));
    }

    // Actualizo el deslizador, los relojes UTC/TDB y los botones de reproducción.
    rangoHist.value = String(Math.round(progress * Number(rangoHist.max)));
    relojUtc.textContent = snapshot.timeLabels.labelUtc;

    const estadoReprod = playing
      ? `${direction < 0 ? 'Retroceso' : 'Reproduciendo'} · ${effectiveSpeed.label}${effectiveSpeed.id !== speed.id ? ' (frenado por hito)' : ''}`
      : 'Pausado';
    relojTdb.textContent = `${snapshot.timeLabels.shortLabelTdb} · ${estadoReprod}`;

    iconoPlay.setAttribute('href', playing ? '#icon-pause' : '#icon-play');
    btnPlay.setAttribute('aria-label', playing ? 'Pausar tiempo continuo' : 'Reproducir tiempo continuo');
    btnPlay.title = playing ? 'Pausar el avance continuo del tiempo' : 'Reproducir el avance continuo del tiempo; no salta entre acontecimientos';
    btnReverse.setAttribute('aria-pressed', String(direction < 0));

    if (selectVelocidad.value !== speed.id) selectVelocidad.value = speed.id;
    pistaUnidadVelocidad.textContent = `${fmtKm0.format(effectiveSpeed.tdbSecondsPerRealSecond)} s/s`;
    checkAutoSlow.checked = autoSlowNearEvents;
    checkAutoPause.checked = autoPauseAtEvents;

    // Sincronizo los selectores directos Año / Mes / Día / Hora UTC bajo una bandera para no reemitir eventos de cambio.
    sincronizandoSelectoresFecha = true;
    const u = snapshot.timeLabels.utc;
    selectAnio.value = String(u.year);
    selectMes.value = String(u.month).padStart(2, '0');
    repoblarDiasSelector(u.year, u.month, u.day);
    selectHora.value = String(u.hour).padStart(2, '0');
    sincronizandoSelectoresFecha = false;

    // Habilito o deshabilito lunas de sobrevuelo y sondas en la barra de primera persona según su disponibilidad en la fecha actual.
    for (const opt of selectFpExtra.options) {
      if (HISTORICAL_ENCOUNTER_MOONS[opt.value]) {
        const activa = Boolean(snapshot.moons?.[opt.value]?.state);
        opt.disabled = !activa;
      } else if (opt.value === VOYAGER_1_ID || opt.value === VOYAGER_2_ID) {
        const activa = Boolean(snapshot.probes?.[opt.value]?.state);
        opt.disabled = !activa;
      }
    }

    for (const btn of botonesFpSonda) {
      const mId = btn.dataset.fpProbe;
      btn.disabled = !snapshot.probes?.[mId]?.state;
    }
    btnSeguirV1.disabled = !snapshot.probes?.[VOYAGER_1_ID]?.state;
    btnSeguirV2.disabled = !snapshot.probes?.[VOYAGER_2_ID]?.state;

    // Muestro el aviso de parada en hito y marco con aria-current="step" el último hito alcanzado en la barra cronológica.
    if (triggeredEvent) {
      renderizarTarjetaEvento(triggeredEvent);
      toastEventoPausa.hidden = playing;
      toastTexto.textContent = `Hito: ${triggeredEvent.title} (${triggeredEvent.displayDateUtc})`;
    } else {
      toastEventoPausa.hidden = true;
    }
    const hitoActual = triggeredEvent ?? VOYAGER_HISTORICAL_EVENTS.filter(ev => ev.jdTdb <= snapshot.jdTdb).at(-1);
    for (const chip of barraHitos.querySelectorAll('[data-hist-jump]')) {
      if (chip.dataset.histJump === hitoActual?.id) chip.setAttribute('aria-current', 'step');
      else chip.removeAttribute('aria-current');
    }

    // Si el filtro muestra una sola sonda, alineo automáticamente la pestaña de la ficha científica con esa nave.
    if ((visibilityMode === VOYAGER_1_ID || visibilityMode === VOYAGER_2_ID) && pestanaFichaActiva !== visibilityMode) {
      seleccionarPestanaFicha(visibilityMode);
    } else if (selectedProbeId && (visibilityMode === 'both') && !snapshot.probes[pestanaFichaActiva]?.state && snapshot.probes[selectedProbeId]?.state) {
      seleccionarPestanaFicha(selectedProbeId);
    }

    actualizarFichaCientifica(snapshot);
    actualizarDisponibilidadFotos(snapshot, visibilityMode);
    actualizarTarjetaLanzamiento(snapshot, visibilityMode);
    actualizarTelemetriaComparador(snapshot);
  }

  // Sincronizo los botones de cámara exterior y primera persona, el FOV activo y la insignia de fidelidad geométrica.
  function actualizarEstadoCamaraHistorica(estadoCam) {
    ultimoEstadoCamara = estadoCam;
    if (!estadoCam) return;
    const enFp = estadoCam.modo === 'first_person' || estadoCam.modo === 'photo_recreation';
    btnCamExterior.setAttribute('aria-pressed', String(!enFp));
    btnCamFp.setAttribute('aria-pressed', String(enFp));
    barraFocoExterior.hidden = enFp;
    barraPrimeraPersona.hidden = !enFp;

    btnSeguirV1.setAttribute('aria-pressed', String(!enFp && estadoCam.idSondaExterior === VOYAGER_1_ID));
    btnSeguirV2.setAttribute('aria-pressed', String(!enFp && estadoCam.idSondaExterior === VOYAGER_2_ID));

    if (enFp) {
      for (const btn of botonesFpSonda) {
        const esObs = btn.dataset.fpProbe === estadoCam.idSondaObservador;
        btn.setAttribute('aria-pressed', String(esObs));
      }
      for (const opt of selectFpExtra.options) {
        opt.disabled = opt.value === estadoCam.idSondaObservador;
      }

      let coincideBoton = false;
      for (const btn of botonesFpTarget) {
        const activo = btn.dataset.fpTarget === estadoCam.objetivoMirada;
        btn.setAttribute('aria-pressed', String(activo));
        if (activo) coincideBoton = true;
      }
      if (coincideBoton || !estadoCam.objetivoMirada) {
        selectFpExtra.value = '';
      } else {
        selectFpExtra.value = estadoCam.objetivoMirada;
      }

      for (const btn of botonesFpFov) btn.setAttribute('aria-pressed', String(Math.abs(Number(btn.dataset.fpFov) - estadoCam.fovReferenciaGrados) < 0.001));
      const refFov = estadoCam.fovReferenciaGrados;
      lecturaFpFov.textContent = estadoCam.fovTipo === 'instrumento_cuadrado'
        ? `FOV ISS ${refFov.toFixed(refFov < 1 ? 3 : 1).replace('.', ',')}° por lado · ${estadoCam.fovGrados.toFixed(3).replace('.', ',')}° vertical en pantalla`
        : estadoCam.fovTipo === 'zoom_visual_vertical'
          ? `Zoom visual 3D ${estadoCam.fovGrados.toFixed(3).replace('.', ',')}° vertical · no corresponde al campo ISS`
        : `FOV contextual ${refFov.toFixed(refFov < 2 ? 2 : 1).replace('.', ',')}° vertical`;

      const nombreObs = estadoCam.idSondaObservador === VOYAGER_1_ID ? 'Voyager 1 (-31)' : 'Voyager 2 (-32)';
      const marcoGeometrico = estadoCam.contextoGeometria === 'encuentro_local'
        ? 'vector local directo de Horizons; trayectoria global separada'
        : 'trayectoria global; sin vector local validado para este objetivo y fecha';
      if (estadoCam.tipoOrientacion === 'recreacion_fotografica_aproximada') {
        insigniaFpFidelidad.textContent = `${nombreObs} · ${marcoGeometrico} · comparación geométrica aproximada, sin CK/IK`;
      } else if (estadoCam.tipoOrientacion === 'apuntado_geometrico') {
        const etqObj = estadoCam.objetivoMirada === 'Jupiter' ? 'Júpiter' : estadoCam.objetivoMirada;
        insigniaFpFidelidad.textContent = `${nombreObs} → ${etqObj} · ${marcoGeometrico} · apuntado geométrico, sin CK/IK`;
      } else {
        insigniaFpFidelidad.textContent = `${nombreObs} · orientación libre (arrastra para girar) · ${marcoGeometrico} · sin CK/IK`;
      }
      const probe = ultimoSnapshot?.probes?.[estadoCam.idSondaObservador];
      const objetivo = ultimoSnapshot?.rawPlanets?.[estadoCam.objetivoMirada]?.state
        ?? ultimoSnapshot?.moons?.[estadoCam.objetivoMirada]?.state;
      const radio = obtenerRadioObjetivoKm(estadoCam.objetivoMirada);
      const frameLocal = ultimoSnapshot?.localFrames?.[`${estadoCam.idSondaObservador}:${estadoCam.objetivoMirada}`];
      if (probe?.positionKm && objetivo && radio) {
        const p = probe.positionKm, q = objetivo.position;
        const distancia = frameLocal?.distanceKm ?? Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
        const diametroAngular = sphereAngularDiameterDeg(radio, distancia);
        if (diametroAngular === null) {
          insigniaFpFidelidad.textContent += ' · Observador dentro del radio físico: diámetro angular exterior no definido.';
          return;
        }
        if (estadoCam.fovTipo === 'instrumento_cuadrado' && diametroAngular > estadoCam.fovReferenciaGrados) {
          insigniaFpFidelidad.textContent += ' · El cuerpo excede el campo ISS: se observa una región; el FOV contextual puede mostrar una zona mayor.';
        } else if (estadoCam.fovTipo === 'contextual_vertical' && estadoCam.encuadreObjetivo?.cabeEnAreaLibre === false) {
          insigniaFpFidelidad.textContent += ' · Encuadre parcial desde esta posición y con el espacio libre actual; cierra el panel o ajusta el campo para ver más superficie.';
        }
        if (selectorEvento.value === 'v1-pale-blue-dot-1990' && estadoCam.objetivoMirada === 'Tierra') {
          insigniaFpFidelidad.textContent += ` · Tierra ≈ ${(diametroAngular * 3600).toFixed(2).replace('.', ',')}″ desde Voyager 1: aparece como un punto subpíxel; el indicador sólo señala su dirección.`;
        }
      }
    }
  }

  return {
    obtenerModoApp: () => modoAppActual,
    establecerModoApp: modo => {
      establecerModoVisualApp(modo);
    },
    seleccionarPestanaFicha,
    renderizarTarjetaEvento,
    abrirComparadorAB,
    cerrarComparadorAB,
    establecerHeliosferaUI: activa => {
      heliosferaActiva = Boolean(activa);
      btnToggleHelio.setAttribute('aria-pressed', String(heliosferaActiva));
    },
    actualizarDesdeMotor,
    actualizarEstadoCamaraHistorica,
    actualizarTelemetriaComparador,
    actualizarFechaRecorridoComparador
  };
}
