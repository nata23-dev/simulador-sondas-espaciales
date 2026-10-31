import { utcTimestampToTdb } from './HistoricalTime.js';
import { VOYAGER_1_ID, VOYAGER_2_ID } from './VoyagerHistoricalMissions.js';

/**
 * Clasificación explícita de acontecimientos para distinguir con rigor:
 * - `launch`: instante oficial de despegue desde Cabo Cañaveral (UTC).
 * - `closest_approach`: instante exacto de máximo acercamiento planetario/satelital (periapsis).
 * - `trajectory_deflection`: cambio de plano orbital inducido por asistencia gravitacional.
 * - `photographic_observation`: instante documentado de observación fotográfica histórica.
 * - `retrospective_boundary_crossing`: cruce de frontera heliosférica confirmado retrospectivamente por instrumentos de plasma/partículas.
 */
export const EVENT_KINDS = Object.freeze({
  LAUNCH: 'launch',
  CLOSEST_APPROACH: 'closest_approach',
  TRAJECTORY_DEFLECTION: 'trajectory_deflection',
  PHOTOGRAPHIC_OBSERVATION: 'photographic_observation',
  RETROSPECTIVE_BOUNDARY_CROSSING: 'retrospective_boundary_crossing'
});

export const EVENT_KIND_LABELS = Object.freeze({
  [EVENT_KINDS.LAUNCH]: 'Lanzamiento oficial',
  [EVENT_KINDS.CLOSEST_APPROACH]: 'Máximo acercamiento (periapsis)',
  [EVENT_KINDS.TRAJECTORY_DEFLECTION]: 'Asistencia gravitacional y cambio de plano',
  [EVENT_KINDS.PHOTOGRAPHIC_OBSERVATION]: 'Observación fotográfica histórica',
  [EVENT_KINDS.RETROSPECTIVE_BOUNDARY_CROSSING]: 'Cruce de frontera confirmado retrospectivamente'
});

const RAW_EVENTS = [
  {
    id: 'v2-launch-1977',
    missionId: VOYAGER_2_ID,
    probeName: 'Voyager 2',
    title: 'Lanzamiento de Voyager 2',
    dateUtc: '1977-08-20T14:29:00Z',
    displayDateUtc: '20 ago 1977 · 14:29:00 UTC',
    kind: EVENT_KINDS.LAUNCH,
    encounterWindowUtc: '1977-08-20',
    description: 'Despegue desde Cabo Cañaveral (SLC-41) a bordo de un Titan IIIE-Centaur. Aunque lleva el número 2, partió 16 días antes que Voyager 1 en una trayectoria capaz de aprovechar la alineación planetaria hacia Urano y Neptuno. Primera muestra heliocéntrica Horizons disponible: 1977-08-20 15:33 TDB.',
    officialSource: 'NASA Science · Voyager 2 Mission & JPL Horizons (-32)',
    officialUrl: 'https://science.nasa.gov/mission/voyager/voyager-2/',
    relatedBodies: ['Tierra'],
    focusTarget: 'Tierra',
    recommendedSpeedId: '1h_s',
    photoIds: []
  },
  {
    id: 'v1-launch-1977',
    missionId: VOYAGER_1_ID,
    probeName: 'Voyager 1',
    title: 'Lanzamiento de Voyager 1',
    dateUtc: '1977-09-05T12:56:00Z',
    displayDateUtc: '5 sep 1977 · 12:56:00 UTC',
    kind: EVENT_KINDS.LAUNCH,
    encounterWindowUtc: '1977-09-05',
    description: 'Despegue desde Cabo Cañaveral (SLC-41) mediante un Titan IIIE-Centaur en una trayectoria más rápida y directa que adelantó a Voyager 2 el 19 de diciembre de 1977 rumbo a Júpiter. Primera muestra heliocéntrica Horizons disponible: 1977-09-05 14:00 TDB.',
    officialSource: 'NASA Science · Voyager 1 Mission & JPL Horizons (-31)',
    officialUrl: 'https://science.nasa.gov/mission/voyager/voyager-1/',
    relatedBodies: ['Tierra'],
    focusTarget: 'Tierra',
    recommendedSpeedId: '1h_s',
    photoIds: []
  },
  {
    id: 'v1-jupiter-1979',
    missionId: VOYAGER_1_ID,
    probeName: 'Voyager 1',
    title: 'Voyager 1 · Máximo acercamiento a Júpiter',
    dateUtc: '1979-03-05T12:05:26Z',
    displayDateUtc: '5 mar 1979 · 12:05:26 UTC',
    kind: EVENT_KINDS.CLOSEST_APPROACH,
    encounterWindowUtc: '6 ene – 13 abr 1979 (observación)',
    officialPeriapseNote: '4,89 R_J (~348 890 km al centro de Júpiter · NSSDCA)',
    description: 'Periapsis joviano a 4,89 radios de Júpiter, seguido del sobrevuelo cercano de Ío donde se descubrió por primera vez vulcanismo activo fuera de la Tierra y del tenue sistema de anillos de Júpiter. La asistencia gravitacional aceleró la nave hacia Saturno.',
    officialSource: 'NASA NSSDCA · Voyager Planetary Closest Approaches',
    officialUrl: 'https://nssdc.gsfc.nasa.gov/planetary/voyager-periapse-old.html',
    relatedBodies: ['Jupiter', 'Io'],
    focusTarget: 'Jupiter',
    recommendedSpeedId: '1h_s',
    photoIds: ['v1-jupiter-grs-1979']
  },
  {
    id: 'v2-jupiter-1979',
    missionId: VOYAGER_2_ID,
    probeName: 'Voyager 2',
    title: 'Voyager 2 · Máximo acercamiento a Júpiter',
    dateUtc: '1979-07-09T22:29:51Z',
    displayDateUtc: '9 jul 1979 · 22:29:51 UTC',
    kind: EVENT_KINDS.CLOSEST_APPROACH,
    encounterWindowUtc: '25 abr – 5 ago 1979 (observación)',
    officialPeriapseNote: '10,11 R_J (~721 670 km al centro de Júpiter · NSSDCA)',
    description: 'Segundo sobrevuelo histórico del sistema joviano a 10,11 radios de Júpiter, obteniendo imágenes de alta resolución de la corteza helada fracturada de Europa, la actividad volcánica persistente en Ío y la dinámica atmosférica joviana antes de recibir impulso gravitacional hacia Saturno.',
    officialSource: 'NASA NSSDCA · Voyager Planetary Closest Approaches',
    officialUrl: 'https://nssdc.gsfc.nasa.gov/planetary/voyager-periapse-old.html',
    relatedBodies: ['Jupiter', 'Io'],
    focusTarget: 'Jupiter',
    recommendedSpeedId: '1h_s',
    photoIds: ['v2-jupiter-europa-1979']
  },
  {
    id: 'v1-titan-1980',
    missionId: VOYAGER_1_ID,
    probeName: 'Voyager 1',
    title: 'Voyager 1 · Encuentro cercano con Titán',
    dateUtc: '1980-11-12T05:41:21Z',
    displayDateUtc: '12 nov 1980 · 05:41:21 UTC',
    kind: EVENT_KINDS.CLOSEST_APPROACH,
    encounterWindowUtc: '12 nov 1980 (previo al periapsis de Saturno)',
    officialPeriapseNote: '~5 570 km al centro de Titán (~2 995 km sobre la superficie · Horizons/SPICE; diseño preliminar: ~6 490 km)',
    description: 'Sobrevuelo prioritario de Titán antes del periapsis saturniano. Determinó la composición densa de nitrógeno e hidrocarburos y la presión superficial (~1,5 bar) de su atmósfera opaca. La geometría requerida para interceptar Titán dirigió a Voyager 1 hacia el polo sur de Saturno.',
    officialSource: 'NASA Science · Voyager 1 & PDS Ring-Moon Systems Node',
    officialUrl: 'https://science.nasa.gov/mission/voyager/voyager-1/',
    relatedBodies: ['Saturno', 'Titan'],
    focusTarget: 'Saturno',
    recommendedSpeedId: '1h_s',
    photoIds: ['v1-saturn-system-1980']
  },
  {
    id: 'v1-saturn-1980',
    missionId: VOYAGER_1_ID,
    probeName: 'Voyager 1',
    title: 'Voyager 1 · Máximo acercamiento a Saturno y salida del plano eclíptico',
    dateUtc: '1980-11-12T23:46:30Z',
    displayDateUtc: '12 nov 1980 · 23:46:30 UTC',
    kind: EVENT_KINDS.CLOSEST_APPROACH,
    secondaryKind: EVENT_KINDS.TRAJECTORY_DEFLECTION,
    encounterWindowUtc: '22 ago – 15 dic 1980 (observación)',
    officialPeriapseNote: '3,09 R_S (~186 400 km al centro de Saturno · NSSDCA)',
    description: 'Periapsis bajo el hemisferio sur de Saturno a 3,09 radios saturnianos. Reveló la estructura fina trenzada de los anillos y pastores lunares, e inclinó definitivamente la trayectoria heliocéntrica de Voyager 1 unos 35° hacia el norte del plano de la eclíptica.',
    officialSource: 'NASA NSSDCA · Voyager Planetary Closest Approaches',
    officialUrl: 'https://nssdc.gsfc.nasa.gov/planetary/voyager-periapse-old.html',
    relatedBodies: ['Saturno', 'Titan'],
    focusTarget: 'Saturno',
    recommendedSpeedId: '1h_s',
    photoIds: ['v1-saturn-system-1980']
  },
  {
    id: 'v2-saturn-1981',
    missionId: VOYAGER_2_ID,
    probeName: 'Voyager 2',
    title: 'Voyager 2 · Máximo acercamiento a Saturno',
    dateUtc: '1981-08-26T03:24:57Z',
    displayDateUtc: '26 ago 1981 · 03:24:57 UTC',
    kind: EVENT_KINDS.CLOSEST_APPROACH,
    encounterWindowUtc: '5 jun – 25 sep 1981 (observación)',
    officialPeriapseNote: '2,67 R_S (~161 000 km al centro de Saturno · NSSDCA)',
    description: 'Sobrevuelo a 2,67 radios de Saturno con estudios fotométricos detallados de los anillos, Encélado, Tetis, Jápeto y Titán. La asistencia gravitacional mantuvo a Voyager 2 cerca del plano orbital rumbo al primer encuentro histórico con Urano.',
    officialSource: 'NASA NSSDCA · Voyager Planetary Closest Approaches',
    officialUrl: 'https://nssdc.gsfc.nasa.gov/planetary/voyager-periapse-old.html',
    relatedBodies: ['Saturno'],
    focusTarget: 'Saturno',
    recommendedSpeedId: '1h_s',
    photoIds: ['v2-saturn-rings-1981']
  },
  {
    id: 'v2-uranus-1986',
    missionId: VOYAGER_2_ID,
    probeName: 'Voyager 2',
    title: 'Voyager 2 · Máximo acercamiento a Urano',
    dateUtc: '1986-01-24T17:59:47Z',
    displayDateUtc: '24 ene 1986 · 17:59:47 UTC',
    kind: EVENT_KINDS.CLOSEST_APPROACH,
    encounterWindowUtc: '4 nov 1985 – 25 feb 1986 (observación)',
    officialPeriapseNote: '~102 310 km al centro de Urano (~4,03 R_U · Horizons; preliminar NSSDCA: 4,19 R_U ~107 090 km)',
    description: 'Primer y único encuentro de una nave espacial con Urano (4,19 radios uranianos). Descubrió 11 lunas nuevas, 2 nuevos anillos, un campo magnético fuertemente inclinado (59°) y fotografió de cerca los cañones tectónicos de Miranda antes de curvar su ruta hacia Neptuno.',
    officialSource: 'NASA NSSDCA · Voyager Planetary Closest Approaches',
    officialUrl: 'https://nssdc.gsfc.nasa.gov/planetary/voyager-periapse-old.html',
    relatedBodies: ['Urano'],
    focusTarget: 'Urano',
    recommendedSpeedId: '1h_s',
    photoIds: ['v2-uranus-crescent-1986']
  },
  {
    id: 'v2-neptune-1989',
    missionId: VOYAGER_2_ID,
    probeName: 'Voyager 2',
    title: 'Voyager 2 · Máximo acercamiento a Neptuno y Tritón',
    dateUtc: '1989-08-25T03:56:36Z',
    displayDateUtc: '25 ago 1989 · 03:56:36 UTC',
    kind: EVENT_KINDS.CLOSEST_APPROACH,
    secondaryKind: EVENT_KINDS.TRAJECTORY_DEFLECTION,
    encounterWindowUtc: '5 jun – 2 oct 1989 (observación; Tritón 09:10 UTC)',
    officialPeriapseNote: '~34 380 km al centro de Neptuno (~9 750 km sobre la atmósfera · Horizons; preliminar NSSDCA: 1,18 R_N ~29 240 km)',
    description: 'Primer y único encuentro con Neptuno, pasando sobre su polo norte para desviar la trayectoria hacia Tritón (09:10 UTC, donde descubrió géiseres activos de nitrógeno) y proyectar a Voyager 2 48° al sur del plano eclíptico.',
    officialSource: 'NASA NSSDCA · Voyager Planetary Closest Approaches',
    officialUrl: 'https://nssdc.gsfc.nasa.gov/planetary/voyager-periapse-old.html',
    relatedBodies: ['Neptuno', 'Triton'],
    focusTarget: 'Neptuno',
    recommendedSpeedId: '1h_s',
    photoIds: ['v2-neptune-gds-1989', 'v2-triton-flyby-1989']
  },
  {
    id: 'v1-pale-blue-dot-1990',
    missionId: VOYAGER_1_ID,
    probeName: 'Voyager 1',
    title: 'Voyager 1 · Fotografía Pale Blue Dot (Un punto azul pálido)',
    dateUtc: '1990-02-14T04:48:00Z',
    displayDateUtc: '14 feb 1990 · 04:48 UTC',
    kind: EVENT_KINDS.PHOTOGRAPHIC_OBSERVATION,
    encounterWindowUtc: '14 feb 1990 (01:13 – 05:13 UTC · mosaico de 60 imágenes)',
    officialPeriapseNote: 'Distancia a la Tierra: ~40,47 AU (~6,05 × 10⁹ km) · 32° sobre la eclíptica',
    description: 'Por iniciativa de Carl Sagan y el equipo Voyager, Voyager 1 giró sus cámaras ISS hacia el interior del Sistema Solar para capturar el Retrato de Familia de 60 fotogramas, mostrando a la Tierra como un creciente de 0,12 píxeles antes del apagado definitivo de las cámaras.',
    officialSource: 'NASA/JPL-Caltech · Pale Blue Dot (PIA00452 / PIA23645)',
    officialUrl: 'https://science.nasa.gov/resource/voyager-1s-pale-blue-dot/',
    relatedBodies: ['Tierra', 'Sol', 'Venus', 'Jupiter', 'Saturno', 'Urano', 'Neptuno'],
    focusTarget: 'Tierra',
    recommendedCameraMode: 'first_person',
    recommendedSpeedId: '1h_s',
    photoIds: ['v1-pale-blue-dot-1990']
  },
  {
    id: 'v1-termination-shock-2004',
    missionId: VOYAGER_1_ID,
    probeName: 'Voyager 1',
    title: 'Voyager 1 · Cruce de la onda de choque de terminación',
    dateUtc: '2004-12-16T00:00:00Z',
    displayDateUtc: '16 dic 2004 (confirmado por datos de campo y partículas)',
    kind: EVENT_KINDS.RETROSPECTIVE_BOUNDARY_CROSSING,
    encounterWindowUtc: 'Dic 2004 (~94,0 AU del Sol)',
    description: 'Cruce de la onda de choque de terminación a ~94 AU, donde el viento solar supersónico se frena abruptamente ante la presión del medio interestelar, ingresando en la heliovaina (confirmado retrospectivamente mediante MAG, LECP y CRS).',
    officialSource: 'NASA Science · Voyager Interstellar Mission',
    officialUrl: 'https://science.nasa.gov/mission/voyager/interstellar-mission/',
    relatedBodies: ['Sol'],
    focusTarget: 'voyager-1',
    recommendedSpeedId: '30d_s',
    photoIds: []
  },
  {
    id: 'v2-termination-shock-2007',
    missionId: VOYAGER_2_ID,
    probeName: 'Voyager 2',
    title: 'Voyager 2 · Cruce de la onda de choque de terminación',
    dateUtc: '2007-08-30T00:00:00Z',
    displayDateUtc: '30 ago 2007 (múltiples cruces detectados por PLS)',
    kind: EVENT_KINDS.RETROSPECTIVE_BOUNDARY_CROSSING,
    encounterWindowUtc: '30 ago – 1 sep 2007 (~83,7 AU del Sol)',
    description: 'Voyager 2 atravesó la onda de choque de terminación a ~83,7 AU en el hemisferio sur, ~10 AU más cerca del Sol que Voyager 1, demostrando directamente que la heliosfera es asimétrica bajo la influencia del campo magnético interestelar local.',
    officialSource: 'NASA Science · Voyager Interstellar Mission',
    officialUrl: 'https://science.nasa.gov/mission/voyager/interstellar-mission/',
    relatedBodies: ['Sol'],
    focusTarget: 'voyager-2',
    recommendedSpeedId: '30d_s',
    photoIds: []
  },
  {
    id: 'v1-heliopause-2012',
    missionId: VOYAGER_1_ID,
    probeName: 'Voyager 1',
    title: 'Voyager 1 · Cruce de la heliopausa y entrada al espacio interestelar',
    dateUtc: '2012-08-25T00:00:00Z',
    displayDateUtc: '25 ago 2012 (confirmado retrospectivamente por PWS)',
    kind: EVENT_KINDS.RETROSPECTIVE_BOUNDARY_CROSSING,
    encounterWindowUtc: 'Ago 2012 (~121,6 AU del Sol)',
    description: 'Voyager 1 se convirtió en el primer objeto fabricado por la humanidad en cruzar la heliopausa (~121,6 AU) y adentrarse en el plasma del medio interestelar, confirmado mediante oscilaciones de ondas de plasma (PWS) y caída abrupta de partículas heliosféricas.',
    officialSource: 'NASA Science · Voyager 1 Interstellar Mission',
    officialUrl: 'https://science.nasa.gov/mission/voyager/interstellar-mission/',
    relatedBodies: ['Sol'],
    focusTarget: 'voyager-1',
    recommendedSpeedId: '30d_s',
    photoIds: []
  },
  {
    id: 'v2-heliopause-2018',
    missionId: VOYAGER_2_ID,
    probeName: 'Voyager 2',
    title: 'Voyager 2 · Cruce de la heliopausa y entrada al espacio interestelar',
    dateUtc: '2018-11-05T00:00:00Z',
    displayDateUtc: '5 nov 2018 (fecha oficial NASA/JPL)',
    kind: EVENT_KINDS.RETROSPECTIVE_BOUNDARY_CROSSING,
    encounterWindowUtc: '5 nov 2018 (~119,0 AU del Sol)',
    description: 'El 5 de noviembre de 2018 Voyager 2 cruzó la heliopausa a ~119,0 AU del Sol con su instrumento de plasma PLS operativo, proporcionando las primeras mediciones directas in situ de densidad, velocidad y temperatura en la transición al medio interestelar.',
    officialSource: 'NASA/JPL · Voyager 2 Enters Interstellar Space (5 Nov 2018)',
    officialUrl: 'https://science.nasa.gov/mission/voyager/interstellar-mission/',
    relatedBodies: ['Sol'],
    focusTarget: 'voyager-2',
    recommendedSpeedId: '30d_s',
    photoIds: []
  }
];

export const VOYAGER_HISTORICAL_EVENTS = Object.freeze(
  RAW_EVENTS.map(item => {
    const tdb = utcTimestampToTdb(item.dateUtc);
    return Object.freeze({
      ...item,
      kindLabel: EVENT_KIND_LABELS[item.kind],
      relatedBodies: Object.freeze([...item.relatedBodies]),
      photoIds: Object.freeze([...item.photoIds]),
      jdTdb: tdb.jdTdb,
      taiMinusUtcSeconds: tdb.taiMinusUtcSeconds,
      tdbMinusUtcSeconds: tdb.tdbMinusUtcSeconds
    });
  }).sort((a, b) => a.jdTdb - b.jdTdb)
);

export function listHistoricalEvents({ missionFilter = 'both' } = {}) {
  if (missionFilter === VOYAGER_1_ID || missionFilter === VOYAGER_2_ID) {
    return VOYAGER_HISTORICAL_EVENTS.filter(ev => ev.missionId === missionFilter);
  }
  return VOYAGER_HISTORICAL_EVENTS;
}

export function getHistoricalEventById(eventId) {
  return VOYAGER_HISTORICAL_EVENTS.find(ev => ev.id === eventId) ?? null;
}

export function findPreviousAndNextEvents(jdTdb, { missionFilter = 'both', toleranceSeconds = 2 } = {}) {
  const list = listHistoricalEvents({ missionFilter });
  const tolDays = toleranceSeconds / 86400;
  let previous = null;
  let next = null;
  let active = null;

  for (const ev of list) {
    const diffDays = ev.jdTdb - jdTdb;
    if (Math.abs(diffDays) <= Math.max(tolDays, 60 / 86400)) {
      if (!active || Math.abs(diffDays) < Math.abs(active.jdTdb - jdTdb)) {
        active = ev;
      }
    }
    if (ev.jdTdb < jdTdb - tolDays) {
      previous = ev;
    } else if (ev.jdTdb > jdTdb + tolDays && next === null) {
      next = ev;
    }
  }
  return Object.freeze({ previous, active, next });
}
