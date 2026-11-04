import { VOYAGER_HISTORICAL_EVENTS, getHistoricalEventById } from '../science/VoyagerHistoricalEvents.js';
import { VOYAGER_PHOTO_CATALOG, getVoyagerPhotoById } from '../science/VoyagerPhotoCatalog.js';
import { VOYAGER_1_ID, VOYAGER_2_ID } from '../science/VoyagerHistoricalMissions.js';

/**
 * 12 Hitos clave seleccionados para el Recorrido Histórico Guiado (1977–2026)
 */
export const HITOS_RECORRIDO_GUIADO = Object.freeze([
  {
    indice: 1,
    idEvento: 'v2-launch-1977',
    misionId: VOYAGER_2_ID,
    nombre: 'Lanzamiento de Voyager 2',
    fechaDisplay: '20 ago 1977 · 14:29 UTC',
    subtitulo: 'Inicio del Grand Tour planetario',
    descripcion: 'Voyager 2 despega desde el Complejo 41 en Cabo Cañaveral a bordo de un Titan IIIE-Centaur. Fue lanzada 16 días antes que Voyager 1 para aprovechar una alineación planetaria única que ocurre cada 175 años.',
    fotoId: null,
    esLanzamiento: true
  },
  {
    indice: 2,
    idEvento: 'v1-launch-1977',
    misionId: VOYAGER_1_ID,
    nombre: 'Lanzamiento de Voyager 1',
    fechaDisplay: '5 sep 1977 · 12:56 UTC',
    subtitulo: 'Rumbo veloz hacia Júpiter y Saturno',
    descripcion: 'Voyager 1 es lanzada en una trayectoria más rápida para alcanzar primero a Júpiter y realizar un sobrevuelo prioritario del misterioso satélite Titán en Saturno.',
    fotoId: null,
    esLanzamiento: true
  },
  {
    indice: 3,
    idEvento: 'v1-io-encounter-1979',
    misionId: VOYAGER_1_ID,
    nombre: 'Voyager 1 en Júpiter: Volcanes en Ío',
    fechaDisplay: '5 mar 1979',
    subtitulo: 'Descubrimiento de vulcanismo activo extraterrestre',
    descripcion: 'Voyager 1 observó Ío durante el encuentro joviano del 5 de marzo. El penacho quedó registrado el 8 de marzo y fue identificado como volcánico el 9. La trayectoria local de Voyager aún presenta la discrepancia SPK documentada.',
    fotoId: 'v1-io-plumes-1979'
  },
  {
    indice: 4,
    idEvento: 'v2-jupiter-1979',
    misionId: VOYAGER_2_ID,
    nombre: 'Voyager 2 en Júpiter: Océano en Europa',
    fechaDisplay: '9 jul 1979',
    subtitulo: 'Inspección de las lunas galileanas',
    descripcion: 'Voyager 2 fotografía la superficie helada y agrietada de Europa durante su encuentro con Júpiter. La distancia mostrada por la trayectoria local aún difiere de Horizons directo.',
    fotoId: 'v2-jupiter-europa-1979'
  },
  {
    indice: 5,
    idEvento: 'v1-saturn-1980',
    misionId: VOYAGER_1_ID,
    nombre: 'Voyager 1 en Saturno y Titán',
    fechaDisplay: '12 nov 1980',
    subtitulo: 'Exploración de la atmósfera densa de Titán',
    descripcion: 'Pasa a solo 6,490 km de la capa de niebla de Titán y confirma una atmósfera densa de nitrógeno e hidrocarburos. La gravedad de Titán desvía a Voyager 1 fuera del plano de la eclíptica hacia el norte.',
    fotoId: 'v1-saturn-system-1980'
  },
  {
    indice: 6,
    idEvento: 'v2-saturn-1981',
    misionId: VOYAGER_2_ID,
    nombre: 'Voyager 2 en Saturno: Anillos y Encelado',
    fechaDisplay: '26 ago 1981',
    subtitulo: 'Estructura fina y asistencia a Urano',
    descripcion: 'Voyager 2 analiza miles de anillos concéntricos con sus cámaras y fotopolarímetro. La gravedad de Saturno impulsa la sonda con precisión absoluta hacia Urano.',
    fotoId: 'v2-saturn-rings-1981'
  },
  {
    indice: 7,
    idEvento: 'v2-uranus-1986',
    misionId: VOYAGER_2_ID,
    nombre: 'Voyager 2 en Urano: El Primer Encuentro',
    fechaDisplay: '24 ene 1986',
    subtitulo: 'Única nave en la historia en visitar Urano',
    descripcion: 'Voyager 2 visita Urano y estudia sus anillos y el terreno de Miranda. La distancia local del simulador sigue pendiente de reconciliación con el vector directo de Horizons.',
    fotoId: 'v2-uranus-crescent-1986'
  },
  {
    indice: 8,
    idEvento: 'v2-neptune-1989',
    misionId: VOYAGER_2_ID,
    nombre: 'Voyager 2 en Neptuno y Tritón',
    fechaDisplay: '25 ago 1989',
    subtitulo: 'El borde final del Sistema Solar planetario',
    descripcion: 'Voyager 2 sobrevuela Neptuno y observa la Gran Mancha Oscura y Tritón. La vista conserva la trayectoria local, cuya distancia difiere de Horizons directo.',
    fotoId: 'v2-neptune-gds-1989'
  },
  {
    indice: 9,
    idEvento: 'v1-pale-blue-dot-1990',
    misionId: VOYAGER_1_ID,
    nombre: 'Retrato de Familia: Un Pálido Punto Azul',
    fechaDisplay: '14 feb 1990',
    subtitulo: 'Última fotografía de las cámaras de Voyager 1',
    descripcion: 'A 6,000 millones de kilómetros del Sol, Voyager 1 gira sus cámaras por última vez a petición de Carl Sagan y toma un mosaico del Sistema Solar, capturando la Tierra como una mota de luz.',
    fotoId: 'v1-pale-blue-dot-1990'
  },
  {
    indice: 10,
    idEvento: 'v1-termination-shock-2004',
    misionId: VOYAGER_1_ID,
    nombre: 'Voyager 1: Choque de Terminación',
    fechaDisplay: '16 dic 2004',
    subtitulo: 'Frenado del viento solar a 94 AU',
    descripcion: 'Voyager 1 cruza la frontera donde el viento solar supersónico se frena abruptamente a velocidad subsónica al chocar con la presión del medio interestelar local.',
    fotoId: null
  },
  {
    indice: 11,
    idEvento: 'v1-heliopause-2012',
    misionId: VOYAGER_1_ID,
    nombre: 'Voyager 1 cruza al Espacio Interestelar',
    fechaDisplay: '25 ago 2012',
    subtitulo: 'Primer objeto humano más allá de la heliopausa',
    descripcion: 'A 121.6 AU del Sol, los detectores de partículas registran una caída del 99% en iones solares y un aumento masivo de rayos cósmicos galácticos: la entrada oficial al espacio interestelar.',
    fotoId: null
  },
  {
    indice: 12,
    idEvento: 'v2-heliopause-2018',
    misionId: VOYAGER_2_ID,
    nombre: 'Voyager 2 cruza la heliopausa',
    fechaDisplay: '5 nov 2018',
    subtitulo: 'Exploración de la frontera galáctica',
    descripcion: 'Voyager 2 cruza la heliopausa a 119.7 AU con su instrumento de plasma funcionando intacto. Ambas naves continúan enviando datos científicos interestelares a más de 20 horas luz de la Tierra.',
    fotoId: null
  }
]);

/**
 * Crea el componente de interfaz para el Recorrido Histórico Guiado
 */
export function crearRecorridoHistoricoGuiado({
  alIrAHito,
  alVerLanzamiento,
  alAbrirFoto,
  alCerrarRecorrido
}) {
  const contenedor = document.createElement('section');
  contenedor.id = 'guided-tour-dock';
  contenedor.className = 'guided-tour-dock hud-secondary';
  contenedor.setAttribute('aria-label', 'Recorrido histórico guiado');
  contenedor.hidden = true;

  contenedor.innerHTML = `
    <div class="guided-tour-inner">
      <div class="tour-top-row">
        <div class="tour-badge-group">
          <span class="tour-tag">RECORRIDO GUIADO</span>
          <span class="tour-step-indicator" id="tour-step-counter">Paso 1 de 12</span>
          <span class="tour-probe-pill" id="tour-probe-badge">Voyager 2</span>
        </div>
        <div class="tour-window-actions">
          <button type="button" id="tour-fold-btn" class="tour-btn-icon" aria-expanded="true" aria-controls="tour-body tour-navigation">Plegar</button>
          <button type="button" id="tour-close-btn" class="tour-btn-icon" aria-label="Salir a exploración libre" title="Salir a exploración libre"><svg class="icon"><use href="#icon-close"></use></svg></button>
        </div>
      </div>

      <div class="tour-body-row" id="tour-body">
        <div class="tour-text-content">
          <h3 id="tour-title" class="tour-heading">Lanzamiento de Voyager 2</h3>
          <p class="tour-meta-line">
            <time id="tour-date">20 ago 1977 · 14:29 UTC</time>
            <span class="tour-subtitle-sep">·</span>
            <span id="tour-subtitle">Inicio del Grand Tour planetario</span>
          </p>
          <p id="tour-desc" class="tour-description">
            Voyager 2 despega desde el Complejo 41 en Cabo Cañaveral a bordo de un Titan IIIE-Centaur...
          </p>
          <button type="button" id="tour-launch-btn" class="tour-nav-btn" hidden>Ver lanzamiento 3D</button>
        </div>

        <div class="tour-photo-box" id="tour-photo-container" hidden>
          <img id="tour-photo-thumb" src="" alt="Fotografía NASA relacionada" width="72" height="72" />
          <div class="tour-photo-actions">
            <button type="button" id="tour-photo-btn" class="tour-photo-link">Comparar NASA / 3D</button>
          </div>
        </div>
      </div>

      <div class="tour-nav-row" id="tour-navigation">
        <button type="button" id="tour-prev-btn" class="tour-nav-btn">Anterior</button>
        <button type="button" id="tour-play-btn" class="tour-nav-btn tour-nav-btn--primary">Siguiente acontecimiento</button>
      </div>
    </div>
  `;

  document.querySelector('.scene-panel').append(contenedor);

  const elCounter = contenedor.querySelector('#tour-step-counter');
  const elProbe = contenedor.querySelector('#tour-probe-badge');
  const elTitle = contenedor.querySelector('#tour-title');
  const elDate = contenedor.querySelector('#tour-date');
  const elSubtitle = contenedor.querySelector('#tour-subtitle');
  const elDesc = contenedor.querySelector('#tour-desc');
  const elPhotoBox = contenedor.querySelector('#tour-photo-container');
  const elPhotoThumb = contenedor.querySelector('#tour-photo-thumb');
  const elPhotoBtn = contenedor.querySelector('#tour-photo-btn');
  const btnPrev = contenedor.querySelector('#tour-prev-btn');
  const btnPlay = contenedor.querySelector('#tour-play-btn');
  const btnLaunch = contenedor.querySelector('#tour-launch-btn');
  const btnClose = contenedor.querySelector('#tour-close-btn');
  const btnFold = contenedor.querySelector('#tour-fold-btn');
  btnFold.addEventListener('click', () => {
    const collapsed = contenedor.dataset.collapsed !== 'true';
    contenedor.dataset.collapsed = String(collapsed);
    btnFold.textContent = collapsed ? 'Desplegar' : 'Plegar';
    btnFold.setAttribute('aria-expanded', String(!collapsed));
  });

  let indiceActual = 0; // 0..11
  let comenzado = false;

  function renderizarHito(indice) {
    indiceActual = Math.max(0, Math.min(HITOS_RECORRIDO_GUIADO.length - 1, indice));
    const hito = HITOS_RECORRIDO_GUIADO[indiceActual];
    contenedor.dataset.eventId = hito.idEvento;

    const indiceCatalogo = VOYAGER_HISTORICAL_EVENTS.findIndex(evento => evento.id === hito.idEvento);
    elCounter.textContent = `Paso ${hito.indice} de ${HITOS_RECORRIDO_GUIADO.length} · acontecimiento ${indiceCatalogo + 1} de ${VOYAGER_HISTORICAL_EVENTS.length}`;
    elProbe.textContent = hito.misionId === VOYAGER_1_ID ? 'Voyager 1' : 'Voyager 2';
    elProbe.dataset.probe = hito.misionId;
    elTitle.textContent = hito.nombre;
    elDate.textContent = hito.fechaDisplay;
    elSubtitle.textContent = hito.subtitulo;
    elDesc.textContent = hito.descripcion;

    btnPrev.disabled = indiceActual === 0;
    btnPlay.textContent = indiceActual === HITOS_RECORRIDO_GUIADO.length - 1 ? 'Finalizar recorrido' : 'Siguiente paso';

    btnLaunch.hidden = !hito.esLanzamiento;

    if (hito.fotoId) {
      const foto = getVoyagerPhotoById(hito.fotoId);
      if (foto) {
        elPhotoBox.hidden = false;
        elPhotoThumb.src = foto.thumbPath;
        elPhotoThumb.alt = foto.title;
        elPhotoBtn.dataset.photoId = foto.id;
      } else {
        elPhotoBox.hidden = true;
      }
    } else {
      elPhotoBox.hidden = true;
    }
  }

  btnPrev.addEventListener('click', () => {
    if (indiceActual > 0) {
      renderizarHito(indiceActual - 1);
      alIrAHito?.(HITOS_RECORRIDO_GUIADO[indiceActual]);
    }
  });

  btnPlay.addEventListener('click', () => {
    if (indiceActual >= HITOS_RECORRIDO_GUIADO.length - 1) {
      contenedor.hidden = true;
      comenzado = false;
      alCerrarRecorrido?.();
      return;
    }
    renderizarHito(indiceActual + 1);
    alIrAHito?.(HITOS_RECORRIDO_GUIADO[indiceActual]);
  });

  btnLaunch.addEventListener('click', () => {
    const hito = HITOS_RECORRIDO_GUIADO[indiceActual];
    alVerLanzamiento?.(hito.misionId);
  });

  elPhotoBtn.addEventListener('click', () => {
    const foto = getVoyagerPhotoById(elPhotoBtn.dataset.photoId);
    if (foto) alAbrirFoto?.(foto);
  });

  btnClose.addEventListener('click', () => {
    contenedor.hidden = true;
    alCerrarRecorrido?.();
  });

  return {
    contenedor,
    mostrar(visible = true, indiceInicial = null) {
      contenedor.hidden = !visible;
      if (visible) {
        renderizarHito(indiceInicial ?? (comenzado ? indiceActual : 0));
        comenzado = true;
      }
    },
    esVisible: () => !contenedor.hidden,
    haComenzado: () => comenzado,
    obtenerIndice: () => indiceActual,
    establecerHito(indice) {
      renderizarHito(indice);
    },
    obtenerHitoActual: () => HITOS_RECORRIDO_GUIADO[indiceActual]
  };
}
