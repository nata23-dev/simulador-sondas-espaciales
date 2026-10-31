import { utcTimestampToTdb } from './HistoricalTime.js';
import {
  HISTORICAL_MISSIONS_CATALOG,
  VOYAGER_1_ID,
  VOYAGER_2_ID
} from './VoyagerHistoricalMissions.js';

export const VOYAGER_ISS_NAC_FOV_DEG = 0.424; // 7,4 mrad × 7,4 mrad (f = 1500 mm, vidicón 800×800)
export const VOYAGER_ISS_WAC_FOV_DEG = 3.18;  // 55,6 mrad × 55,6 mrad (f = 200 mm, vidicón 800×800)

export const RECREATION_FIDELITY_LEVELS = Object.freeze({
  GEOMETRIC_APPROXIMATION: 'geometric_approximation'
});

const RAW_PHOTOS = [
  {
    id: 'v1-jupiter-grs-1979',
    nasaId: 'PIA00022',
    missionId: VOYAGER_1_ID,
    probeName: 'Voyager 1',
    title: 'Mosaico de la Gran Mancha Roja de Júpiter',
    dateUtc: '1979-03-04T00:00:00Z',
    displayDateUtc: 'Principios de marzo de 1979 (aproximación final a Júpiter)',
    datePrecision: 'documented_encounter_window',
    targetBody: 'Jupiter',
    targetDisplay: 'Júpiter',
    instrument: 'Voyager 1 ISS · Narrow-Angle Camera (NAC, f = 1500 mm, FOV 0,424°)',
    instrumentFovDeg: VOYAGER_ISS_NAC_FOV_DEG,
    contextFovDeg: 8.5,
    thumbPath: 'images/voyager/v1-jupiter-grs-1979-thumb.jpg',
    imagePath: 'images/voyager/v1-jupiter-grs-1979.jpg',
    sha256: 'a93621a81f268af431de65a4487a598da6feca712acfd204603642ae5a800e15',
    officialSourceUrl: 'https://photojournal.jpl.nasa.gov/catalog/PIA00022',
    pdsArchiveUrl: 'https://pds-rings.seti.org/voyager/iss/',
    provenance: 'NASA / JPL Photojournal (PIA00022) · Dominio público',
    attribution: 'NASA / JPL',
    eventId: 'v1-jupiter-1979',
    orientationAvailability: 'Posición heliocéntrica exacta JPL Horizons (-31 y 599); sin matriz SPICE CK de balanceo ni desplazamiento local del mosaico.',
    recreationFidelity: RECREATION_FIDELITY_LEVELS.GEOMETRIC_APPROXIMATION,
    recreationFidelityNote: 'Recreación geométrica aproximada: posición real Horizons + vector centro a centro hacia Júpiter y ángulo de fase solar real; la rotación longitudinal joviana y el balanceo de la plataforma de escaneo ISS no provienen de un kernel CK.',
    description: 'Mosaico en color obtenido por la cámara de ángulo estrecho (ISS-NAC) de Voyager 1 a comienzos de marzo de 1979 durante la aproximación final a Júpiter, mostrando la circulación anticiclónica y vórtices turbulentos alrededor de la Gran Mancha Roja.'
  },
  {
    id: 'v2-jupiter-europa-1979',
    nasaId: 'ARC-1979-A79-7092',
    missionId: VOYAGER_2_ID,
    probeName: 'Voyager 2',
    title: 'Corteza helada fracturada de Europa durante el sobrevuelo joviano',
    dateUtc: '1979-07-09T18:00:00Z',
    displayDateUtc: '9 jul 1979 (encuentro cercano a ~241 000 km de Europa)',
    datePrecision: 'exact_day',
    targetBody: 'Jupiter',
    targetDisplay: 'Sistema de Júpiter (encuentro con Europa)',
    instrument: 'Voyager 2 ISS · Narrow-Angle Camera (NAC, f = 1500 mm, FOV 0,424°)',
    instrumentFovDeg: VOYAGER_ISS_NAC_FOV_DEG,
    contextFovDeg: 6.0,
    thumbPath: 'images/voyager/v2-jupiter-europa-1979-thumb.jpg',
    imagePath: 'images/voyager/v2-jupiter-europa-1979.jpg',
    sha256: '8b0f3516838e3f6bfa06fd317c5b96dca8fa520a83e8b9b2e6629a49f65287fb',
    officialSourceUrl: 'https://images.nasa.gov/details/ARC-1979-A79-7092',
    pdsArchiveUrl: 'https://pds-rings.seti.org/voyager/iss/',
    provenance: 'NASA Ames / JPL Voyager 2 Archive (ARC-1979-A79-7092) · Dominio público',
    attribution: 'NASA / JPL',
    eventId: 'v2-jupiter-1979',
    orientationAvailability: 'Posición real JPL Horizons (-32 y 599) el 9 jul 1979; Europa (502) no está mallada individualmente en 3D, por lo que la cámara 3D encuadra el sistema joviano desde la posición histórica de Voyager 2.',
    recreationFidelity: RECREATION_FIDELITY_LEVELS.GEOMETRIC_APPROXIMATION,
    recreationFidelityNote: 'Recreación geométrica contextual del sistema de Júpiter desde la posición real de Voyager 2 el 9 de julio de 1979 (Europa no posee malla 3D individual en esta escena).',
    description: 'Fotografía adquirida por Voyager 2 el 9 de julio de 1979 a 241 000 km de Europa. Reveló una superficie brillante casi carente de cráteres y cruzada por fracturas lineales globales, primer indicio de un océano subsuperficial bajo una corteza de hielo.'
  },
  {
    id: 'v1-saturn-system-1980',
    nasaId: 'PIA00024',
    missionId: VOYAGER_1_ID,
    probeName: 'Voyager 1',
    title: 'Saturno, sus anillos y las lunas Tetis y Dione',
    dateUtc: '1980-11-03T12:00:00Z',
    displayDateUtc: '3 nov 1980 (a 13 millones de km de Saturno)',
    datePrecision: 'exact_day',
    targetBody: 'Saturno',
    targetDisplay: 'Saturno y sistema de anillos',
    instrument: 'Voyager 1 ISS · Narrow-Angle Camera (NAC, f = 1500 mm, FOV 0,424°)',
    instrumentFovDeg: VOYAGER_ISS_NAC_FOV_DEG,
    contextFovDeg: 2.4,
    thumbPath: 'images/voyager/v1-saturn-system-1980-thumb.jpg',
    imagePath: 'images/voyager/v1-saturn-system-1980.jpg',
    sha256: '11c498ca4ad06cdba86015a4c85a16d2c593973c318363d8cc34da82b0d308b6',
    officialSourceUrl: 'https://photojournal.jpl.nasa.gov/catalog/PIA00024',
    pdsArchiveUrl: 'https://pds-rings.seti.org/voyager/iss/',
    provenance: 'NASA / JPL Photojournal (PIA00024) · Dominio público',
    attribution: 'NASA / JPL',
    eventId: 'v1-saturn-1980',
    orientationAvailability: 'Posición heliocéntrica verificada JPL Horizons (-31 y 699) el 3 nov 1980; apuntado geométrico al centro de Saturno sin ángulo de balanceo CK.',
    recreationFidelity: RECREATION_FIDELITY_LEVELS.GEOMETRIC_APPROXIMATION,
    recreationFidelityNote: 'Recreación geométrica aproximada: posición real Horizons a ~13 × 10⁶ km de Saturno con oblicuidad de anillos e iluminación solar real; sin balanceo SPICE CK ni mallas de Tetis/Dione.',
    description: 'Capturada por Voyager 1 el 3 de noviembre de 1980 a 13 millones de kilómetros durante la aproximación a Saturno, mostrando la proyección de las sombras de los anillos A, B y C sobre el globo saturniano junto con los satélites Tetis y Dione.'
  },
  {
    id: 'v2-saturn-rings-1981',
    nasaId: 'PIA01486',
    missionId: VOYAGER_2_ID,
    probeName: 'Voyager 2',
    title: 'Estructura fina y diferencias composicionales en los anillos de Saturno',
    dateUtc: '1981-08-23T12:00:00Z',
    displayDateUtc: 'Agosto de 1981 (aproximación de Voyager 2 a Saturno)',
    datePrecision: 'documented_encounter_window',
    targetBody: 'Saturno',
    targetDisplay: 'Anillos de Saturno',
    instrument: 'Voyager 2 ISS · Narrow-Angle Camera (compuesto multiespectral UV/visible)',
    instrumentFovDeg: VOYAGER_ISS_NAC_FOV_DEG,
    contextFovDeg: 4.5,
    thumbPath: 'images/voyager/v2-saturn-rings-1981-thumb.jpg',
    imagePath: 'images/voyager/v2-saturn-rings-1981.jpg',
    sha256: 'c39fe9384ce003b5fc593f17f3d8e9fe599a297e2cd2cee12bcffd5958892685',
    officialSourceUrl: 'https://photojournal.jpl.nasa.gov/catalog/PIA01486',
    pdsArchiveUrl: 'https://pds-rings.seti.org/voyager/iss/',
    provenance: 'NASA / JPL Photojournal (PIA01486) · Dominio público',
    attribution: 'NASA / JPL',
    eventId: 'v2-saturn-1981',
    orientationAvailability: 'Posición histórica JPL Horizons (-32 y 699) en ventana de sobrevuelo de agosto de 1981; apuntado geométrico hacia Saturno/anillos sin offset de plataforma CK.',
    recreationFidelity: RECREATION_FIDELITY_LEVELS.GEOMETRIC_APPROXIMATION,
    recreationFidelityNote: 'Recreación geométrica aproximada: la imagen original NASA emplea realce cromático multiespectral sobre un sector de los anillos, mientras que la vista 3D muestra la geometría física e iluminación en color natural.',
    description: 'Imagen multiespectral de archivo obtenida por Voyager 2 durante el sobrevuelo de Saturno en agosto de 1981, realzada para distinguir sutiles variaciones químicas y de tamaño de partícula entre los anillos C, B y A y la división de Cassini.'
  },
  {
    id: 'v2-uranus-crescent-1986',
    nasaId: 'PIA00143',
    missionId: VOYAGER_2_ID,
    probeName: 'Voyager 2',
    title: 'Creciente final de Urano al alejarse rumbo a Neptuno',
    dateUtc: '1986-01-25T12:00:00Z',
    displayDateUtc: '25 ene 1986 (salida del sistema de Urano)',
    datePrecision: 'exact_day',
    targetBody: 'Urano',
    targetDisplay: 'Urano (fase creciente de salida)',
    instrument: 'Voyager 2 ISS · Narrow-Angle Camera (NAC, f = 1500 mm, FOV 0,424°)',
    instrumentFovDeg: VOYAGER_ISS_NAC_FOV_DEG,
    contextFovDeg: 2.5,
    thumbPath: 'images/voyager/v2-uranus-crescent-1986-thumb.jpg',
    imagePath: 'images/voyager/v2-uranus-crescent-1986.jpg',
    sha256: 'f01898cf2636fb81db534edad198af4031c81274db9e5289f1207d8a982d6cbe',
    officialSourceUrl: 'https://photojournal.jpl.nasa.gov/catalog/PIA00143',
    pdsArchiveUrl: 'https://pds-rings.seti.org/voyager/iss/',
    provenance: 'NASA / JPL Photojournal (PIA00143) · Dominio público',
    attribution: 'NASA / JPL',
    eventId: 'v2-uranus-1986',
    orientationAvailability: 'Posición heliocéntrica exacta JPL Horizons (-32 y 799) en la trayectoria antisolar de salida el 25 ene 1986; reproduce de forma natural el ángulo de fase creciente alto.',
    recreationFidelity: RECREATION_FIDELITY_LEVELS.GEOMETRIC_APPROXIMATION,
    recreationFidelityNote: 'Recreación geométrica de alta coherencia de fase: reproduce con posiciones reales Horizons el ángulo Sol–Urano–Voyager 2 que genera el fino creciente imposible de observar desde la Tierra; el ángulo de balanceo (roll) es aproximado.',
    description: 'Registrada por Voyager 2 el 25 de enero de 1986 tras dejar atrás el periapsis uraniano rumbo a Neptuno. Muestra a Urano como un delgado creciente azul verdoso visto desde el lado nocturno, una geometría de fase inalcanzable desde telescopios terrestres.'
  },
  {
    id: 'v2-neptune-gds-1989',
    nasaId: 'PIA01492',
    missionId: VOYAGER_2_ID,
    probeName: 'Voyager 2',
    title: 'Neptuno de disco completo con la Gran Mancha Oscura y Scooter',
    dateUtc: '1989-08-20T08:00:00Z',
    displayDateUtc: '20 ago 1989 · ~08:00 UTC (4 d 20 h antes del periapsis, a 7,1 × 10⁶ km)',
    datePrecision: 'documented_hours_before_periapse',
    targetBody: 'Neptuno',
    targetDisplay: 'Neptuno',
    instrument: 'Voyager 2 ISS · Narrow-Angle Camera (filtros verde y naranja, FOV 0,424°)',
    instrumentFovDeg: VOYAGER_ISS_NAC_FOV_DEG,
    contextFovDeg: 1.8,
    thumbPath: 'images/voyager/v2-neptune-gds-1989-thumb.jpg',
    imagePath: 'images/voyager/v2-neptune-gds-1989.jpg',
    sha256: '2cb5d6be0b64fd94cb4b7a5d511f9a6b5a89a558b03a63f38972e67b0c1dfc09',
    officialSourceUrl: 'https://photojournal.jpl.nasa.gov/catalog/PIA01492',
    pdsArchiveUrl: 'https://pds-rings.seti.org/voyager/iss/',
    provenance: 'NASA / JPL Photojournal (PIA01492) · Dominio público',
    attribution: 'NASA / JPL',
    eventId: 'v2-neptune-1989',
    orientationAvailability: 'Posición heliocéntrica verificada JPL Horizons (-32 y 899) a ~7,08 millones de km de Neptuno; apuntado centro a centro con FOV NAC 0,424°.',
    recreationFidelity: RECREATION_FIDELITY_LEVELS.GEOMETRIC_APPROXIMATION,
    recreationFidelityNote: 'Recreación geométrica aproximada: diámetro angular e iluminación de Neptuno a ~7,1 millones de km corresponden a las efemérides reales; la fase rotacional exacta de la Gran Mancha Oscura y el balanceo CK no están modelados.',
    description: 'Última fotografía de disco completo de Neptuno tomada por la cámara de ángulo estrecho de Voyager 2 (filtros verde y naranja) a 7,08 millones de kilómetros, 4 días y 20 horas antes del máximo acercamiento, mostrando la Gran Mancha Oscura, sus cirrus brillantes de metano y la nube rápida Scooter.'
  },
  {
    id: 'v2-triton-flyby-1989',
    nasaId: 'ARC-1989-AC89-7055',
    missionId: VOYAGER_2_ID,
    probeName: 'Voyager 2',
    title: 'Superficie criovolcánica de Tritón durante el sobrevuelo cercano',
    dateUtc: '1989-08-25T09:10:00Z',
    displayDateUtc: '25 ago 1989 · ~09:10 UTC (sobrevuelo cercano a ~40 000 km de Tritón)',
    datePrecision: 'exact_hour',
    targetBody: 'Triton',
    targetDisplay: 'Tritón (satélite de Neptuno)',
    instrument: 'Voyager 2 ISS · Narrow-Angle Camera (NAC, f = 1500 mm, FOV 0,424°)',
    instrumentFovDeg: VOYAGER_ISS_NAC_FOV_DEG,
    contextFovDeg: 5.5,
    thumbPath: 'images/voyager/v2-triton-flyby-1989-thumb.jpg',
    imagePath: 'images/voyager/v2-triton-flyby-1989.jpg',
    sha256: '6e06ab17b3fbcb839c5ade09264ef8396f9df62bab779579ca26df325239fd10',
    officialSourceUrl: 'https://images.nasa.gov/details/ARC-1989-AC89-7055',
    pdsArchiveUrl: 'https://pds-rings.seti.org/voyager/iss/',
    provenance: 'NASA Ames / JPL Voyager 2 Archive (ARC-1989-AC89-7055) · Dominio público',
    attribution: 'NASA / JPL',
    eventId: 'v2-neptune-1989',
    orientationAvailability: 'Posición exacta JPL Horizons tanto de Voyager 2 (-32) como de Tritón (801) con cadencia de 15 minutos en la ventana de sobrevuelo.',
    recreationFidelity: RECREATION_FIDELITY_LEVELS.GEOMETRIC_APPROXIMATION,
    recreationFidelityNote: 'Recreación geométrica con efemérides reales de Tritón (NAIF 801): posición y tamaño angular verdaderos a ~39 800 km; esfera 3D de Tritón con sombreado básico sin mapa topográfico de alta resolución ni balanceo CK.',
    description: 'Una de las vistas de mayor detalle de Tritón obtenidas por Voyager 2 en la mañana del 25 de agosto de 1989 desde apenas ~40 000 km, almacenada en grabadora de cinta y retransmitida posteriormente a la Tierra.'
  },
  {
    id: 'v1-pale-blue-dot-1990',
    nasaId: 'PIA23645',
    legacyNasaId: 'PIA00452',
    missionId: VOYAGER_1_ID,
    probeName: 'Voyager 1',
    title: 'Pale Blue Dot — La Tierra a 40,47 AU en el Retrato de Familia',
    dateUtc: '1990-02-14T04:48:00Z',
    displayDateUtc: '14 feb 1990 · 04:48:00 UTC (34 min antes del apagado definitivo de ISS)',
    datePrecision: 'exact_minute',
    targetBody: 'Tierra',
    targetDisplay: 'Tierra (0,12 píxeles a ~6 050 millones de km)',
    instrument: 'Voyager 1 ISS · Narrow-Angle Camera (filtros violeta, azul y verde, FOV 0,424°)',
    instrumentFovDeg: VOYAGER_ISS_NAC_FOV_DEG,
    contextFovDeg: 18.0,
    thumbPath: 'images/voyager/v1-pale-blue-dot-1990-thumb.jpg',
    imagePath: 'images/voyager/v1-pale-blue-dot-1990.jpg',
    sha256: 'e8db7430b6d350c9a52895e13704b5bb7ef3317b402b3e287d65f20be5dd49d4',
    officialSourceUrl: 'https://photojournal.jpl.nasa.gov/catalog/PIA23645',
    pdsArchiveUrl: 'https://pds-rings.seti.org/voyager/iss/',
    provenance: 'NASA / JPL-Caltech (PIA23645 / original PIA00452) · Dominio público',
    attribution: 'NASA / JPL-Caltech',
    eventId: 'v1-pale-blue-dot-1990',
    orientationAvailability: 'Posición heliocéntrica exacta JPL Horizons (-31 y 399) el 14 feb 1990 04:48 UTC (~40,47 AU, ~32° sobre la eclíptica); tiempo de viaje de la luz ~5 h 36 min (~100 km de desplazamiento orbital terrestre durante el tránsito fotónico, < 1″ angular).',
    recreationFidelity: RECREATION_FIDELITY_LEVELS.GEOMETRIC_APPROXIMATION,
    recreationFidelityNote: 'Recreación geométrica veraz: a 40,47 AU la Tierra subtiende solo ~0,43″ (0,12 píxeles de ISS-NAC) a escasos grados del Sol. En 3D no se agranda artificialmente el planeta y no se simulan los haces de luz difractada dentro de la óptica vidicón de Voyager 1.',
    description: 'Fotografía histórica tomada por la cámara de ángulo estrecho de Voyager 1 a las 04:48 UTC del 14 de febrero de 1990 desde más de 6 000 millones de kilómetros (~40,47 AU) y 32° sobre el plano eclíptico, mostrando a la Tierra como una mota subpíxel cruzada por luz solar dispersada en la óptica antes de apagar las cámaras para siempre.'
  }
];

export const VOYAGER_PHOTO_CATALOG = Object.freeze(
  RAW_PHOTOS.map(photo => {
    const tdb = utcTimestampToTdb(photo.dateUtc);
    return Object.freeze({
      ...photo,
      jdTdb: tdb.jdTdb,
      taiMinusUtcSeconds: tdb.taiMinusUtcSeconds,
      tdbMinusUtcSeconds: tdb.tdbMinusUtcSeconds
    });
  }).sort((a, b) => a.jdTdb - b.jdTdb)
);

export function listVoyagerPhotos({ missionFilter = 'both' } = {}) {
  if (missionFilter === VOYAGER_1_ID || missionFilter === VOYAGER_2_ID) {
    return VOYAGER_PHOTO_CATALOG.filter(p => p.missionId === missionFilter);
  }
  return VOYAGER_PHOTO_CATALOG;
}

export function getVoyagerPhotoById(photoId) {
  return VOYAGER_PHOTO_CATALOG.find(p => p.id === photoId) ?? null;
}

/**
 * Evalúa qué fotografías documentadas corresponden a la fecha actual `jdTdb`
 * y aplica con rigor la regla de ausencia de imágenes y apagado definitivo de cámaras ISS.
 */
export function evaluateHistoricalPhotoAvailability(jdTdb, {
  missionFilter = 'both',
  windowDays = 10
} = {}) {
  const candidates = listVoyagerPhotos({ missionFilter });
  const nearbyPhotos = candidates.filter(p => Math.abs(p.jdTdb - jdTdb) <= windowDays);

  const v1 = HISTORICAL_MISSIONS_CATALOG[VOYAGER_1_ID];
  const v2 = HISTORICAL_MISSIONS_CATALOG[VOYAGER_2_ID];

  let cameraShutdownNotice = null;
  if (missionFilter === VOYAGER_1_ID && jdTdb > v1.cameraShutdownJdTdb) {
    cameraShutdownNotice = v1.cameraShutdownNote;
  } else if (missionFilter === VOYAGER_2_ID && jdTdb > v2.cameraShutdownJdTdb) {
    cameraShutdownNotice = v2.cameraShutdownNote;
  } else if (missionFilter === 'both' && jdTdb > v1.cameraShutdownJdTdb && jdTdb > v2.cameraShutdownJdTdb) {
    cameraShutdownNotice = 'En esta fecha histórica las cámaras ISS de Voyager 1 (apagadas el 14 feb 1990) y Voyager 2 (desactivadas tras Neptuno en oct 1989) ya no estaban tomando imágenes. Puede seguir utilizando libremente la cámara virtual 3D.';
  }

  return Object.freeze({
    hasDocumentedPhotosForDate: nearbyPhotos.length > 0,
    nearbyPhotos: Object.freeze(nearbyPhotos),
    allCatalogPhotos: candidates,
    emptyDateMessage: nearbyPhotos.length === 0
      ? 'No hay fotografías auténticas documentadas en el catálogo para esta fecha específica. Puede explorar libremente con la cámara virtual o seleccionar cualquiera de las fotografías históricas inferiores.'
      : null,
    cameraShutdownNotice
  });
}
