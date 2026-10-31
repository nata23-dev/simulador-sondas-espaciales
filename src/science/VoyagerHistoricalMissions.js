import { gregorianTimestampToJdTdb } from './Time.js';
import { utcTimestampToTdb } from './HistoricalTime.js';

export const VOYAGER_1_ID = 'voyager-1';
export const VOYAGER_2_ID = 'voyager-2';
export const VOYAGER_1_NAIF_ID = '-31';
export const VOYAGER_2_NAIF_ID = '-32';

const v2Launch = utcTimestampToTdb('1977-08-20T14:29:00Z');
const v1Launch = utcTimestampToTdb('1977-09-05T12:56:00Z');

/**
 * Registro extensible de misiones históricas (preparado para incorporar
 * futuras misiones como Cassini o New Horizons sin alterar contratos).
 */
export const HISTORICAL_MISSIONS_CATALOG = Object.freeze({
  [VOYAGER_1_ID]: Object.freeze({
    id: VOYAGER_1_ID,
    name: 'Voyager 1',
    naifId: VOYAGER_1_NAIF_ID,
    agency: 'NASA / Jet Propulsion Laboratory (JPL-Caltech)',
    launchDateUtc: '1977-09-05T12:56:00Z',
    launchDateDisplayUtc: '5 sep 1977 · 12:56:00 UTC',
    launchJdTdb: v1Launch.jdTdb,
    launchSite: 'Cabo Cañaveral (CCAFS SLC-41), Florida',
    launchVehicle: 'Titan IIIE-Centaur (TC-6)',
    earliestHorizonsSpkTdbLabel: '1977-09-05 13:59:24.3830 TDB',
    firstSampleTdbLabel: '1977-09-05 14:00:00 TDB',
    firstValidJdTdb: gregorianTimestampToJdTdb('1977-09-05 14:00:00'),
    spkSegmentSplice: Object.freeze({
      beforeJdTdb: gregorianTimestampToJdTdb('1981-01-01 00:00:00'),
      afterJdTdb: gregorianTimestampToJdTdb('1981-01-01 00:01:00'),
      beforeLabelTdb: '1981-01-01 00:00:00 TDB',
      afterLabelTdb: '1981-01-01 00:01:00 TDB',
      positionJumpKm: 65177.72,
      note: 'Transición documentada en JPL Horizons (Voyager_1_ST+refit2022_m) entre el tramo #1 de diseño cónico (1977–1981) y el tramo #2 reconstruido por R. Jacobson en 2022 con DE440 (1981–2100). No se interpola a través de esta unión.'
    }),
    cameraShutdownUtc: '1990-02-14T05:30:00Z',
    cameraShutdownJdTdb: utcTimestampToTdb('1990-02-14T05:30:00Z').jdTdb,
    cameraShutdownNote: 'Las cámaras ISS de Voyager 1 fueron apagadas permanentemente tras completar el Retrato de Familia del Sistema Solar el 14 de febrero de 1990 para reservar energía y memoria a la Misión Interestelar.',
    historicalObjectives: 'Exploración cercana de los sistemas de Júpiter (1979) y Saturno/Titán (1980), seguida del desvío 35° al norte de la eclíptica y estudio in situ de la heliosfera exterior y el medio interestelar.',
    ephemerisSource: 'NASA/JPL Horizons (NAIF -31 · solución Voyager_1_ST+refit2022_m / DE440)',
    officialUrls: Object.freeze([
      'https://science.nasa.gov/mission/voyager/voyager-1/',
      'https://science.nasa.gov/mission/voyager/interstellar-mission/',
      'https://ssd.jpl.nasa.gov/horizons/'
    ]),
    trajectoryColorHex: 0xe6c88a,
    trajectoryFutureColorHex: 0x8f7a4e,
    markerCssColor: '#e6c88a'
  }),
  [VOYAGER_2_ID]: Object.freeze({
    id: VOYAGER_2_ID,
    name: 'Voyager 2',
    naifId: VOYAGER_2_NAIF_ID,
    agency: 'NASA / Jet Propulsion Laboratory (JPL-Caltech)',
    launchDateUtc: '1977-08-20T14:29:00Z',
    launchDateDisplayUtc: '20 ago 1977 · 14:29:00 UTC',
    launchJdTdb: v2Launch.jdTdb,
    launchSite: 'Cabo Cañaveral (CCAFS SLC-41), Florida',
    launchVehicle: 'Titan IIIE-Centaur (TC-7)',
    earliestHorizonsSpkTdbLabel: '1977-08-20 15:32:32.1830 TDB',
    firstSampleTdbLabel: '1977-08-20 15:33:00 TDB',
    firstValidJdTdb: gregorianTimestampToJdTdb('1977-08-20 15:33:00'),
    spkSegmentSplice: Object.freeze({
      beforeJdTdb: 2447767.833333333,
      afterJdTdb: 2447767.834027778,
      beforeLabelTdb: '1989-08-29 08:00:00 TDB',
      afterLabelTdb: '1989-08-29 08:01:00 TDB',
      positionJumpKm: 13362.11,
      note: 'Transición documentada en JPL Horizons (Voyager_2_ST+refit2022_m) entre el tramo #1 planetario (1977–1989) y el tramo #2 reconstruido por R. Jacobson en 2022 con DE440 (1989–2100). No se interpola a través de esta unión.'
    }),
    cameraShutdownUtc: '1989-10-02T00:00:00Z',
    cameraShutdownJdTdb: utcTimestampToTdb('1989-10-02T00:00:00Z').jdTdb,
    cameraShutdownNote: 'Las cámaras ISS de Voyager 2 fueron desactivadas tras concluir las observaciones del encuentro con Neptuno y Tritón en el otoño de 1989.',
    historicalObjectives: 'Gran Tour Planetario de los cuatro gigantes exteriores —Júpiter (1979), Saturno (1981), Urano (1986) y Neptuno/Tritón (1989)— seguido del desvío 48° al sur de la eclíptica hacia la heliopausa y el espacio interestelar.',
    ephemerisSource: 'NASA/JPL Horizons (NAIF -32 · solución Voyager_2_ST+refit2022_m / DE440)',
    officialUrls: Object.freeze([
      'https://science.nasa.gov/mission/voyager/voyager-2/',
      'https://science.nasa.gov/mission/voyager/interstellar-mission/',
      'https://ssd.jpl.nasa.gov/horizons/'
    ]),
    trajectoryColorHex: 0x76b8cf,
    trajectoryFutureColorHex: 0x416b7a,
    markerCssColor: '#76b8cf'
  })
});

export const VOYAGER_MISSION_LIST = Object.freeze([
  HISTORICAL_MISSIONS_CATALOG[VOYAGER_1_ID],
  HISTORICAL_MISSIONS_CATALOG[VOYAGER_2_ID]
]);

export function getHistoricalMissionById(missionId) {
  return HISTORICAL_MISSIONS_CATALOG[missionId] ?? null;
}

export function getHistoricalMissionByNaifId(naifId) {
  return VOYAGER_MISSION_LIST.find(m => m.naifId === String(naifId)) ?? null;
}

/**
 * Clasifica la fase histórica de misión de cada sonda en función del instante JD TDB.
 */
export function resolveMissionPhase(missionId, jdTdb) {
  const mission = getHistoricalMissionById(missionId);
  if (!mission) return 'Desconocida';
  if (jdTdb < mission.launchJdTdb) {
    return 'Pre-lanzamiento en Cabo Cañaveral';
  }
  if (jdTdb < mission.firstValidJdTdb) {
    return 'Ascenso e inyección Titan IIIE-Centaur (introducción visual)';
  }

  if (missionId === VOYAGER_1_ID) {
    if (jdTdb < utcTimestampToTdb('1979-01-06T00:00:00Z').jdTdb) return 'Crucero Tierra → Júpiter';
    if (jdTdb < utcTimestampToTdb('1979-04-13T00:00:00Z').jdTdb) return 'Encuentro con el sistema de Júpiter';
    if (jdTdb < utcTimestampToTdb('1980-08-22T00:00:00Z').jdTdb) return 'Crucero Júpiter → Saturno';
    if (jdTdb < utcTimestampToTdb('1980-12-15T00:00:00Z').jdTdb) return 'Encuentro con Saturno y Titán · desvío fuera de la eclíptica';
    if (jdTdb < utcTimestampToTdb('1990-01-01T00:00:00Z').jdTdb) return 'Ascenso fuera del plano eclíptico (+35°)';
    if (jdTdb < utcTimestampToTdb('1990-02-15T00:00:00Z').jdTdb) return 'Retrato de Familia · Pale Blue Dot';
    if (jdTdb < utcTimestampToTdb('2004-12-16T00:00:00Z').jdTdb) return 'Misión Interestelar · Heliosfera exterior';
    if (jdTdb < utcTimestampToTdb('2012-08-25T00:00:00Z').jdTdb) return 'Heliovaina (tras choque de terminación)';
    return 'Espacio interestelar (más allá de la heliopausa)';
  }

  if (jdTdb < utcTimestampToTdb('1979-04-25T00:00:00Z').jdTdb) return 'Crucero Tierra → Júpiter';
  if (jdTdb < utcTimestampToTdb('1979-08-05T00:00:00Z').jdTdb) return 'Encuentro con el sistema de Júpiter';
  if (jdTdb < utcTimestampToTdb('1981-06-05T00:00:00Z').jdTdb) return 'Crucero Júpiter → Saturno';
  if (jdTdb < utcTimestampToTdb('1981-09-25T00:00:00Z').jdTdb) return 'Encuentro con Saturno';
  if (jdTdb < utcTimestampToTdb('1985-11-04T00:00:00Z').jdTdb) return 'Crucero Saturno → Urano';
  if (jdTdb < utcTimestampToTdb('1986-02-25T00:00:00Z').jdTdb) return 'Encuentro con Urano (primera visita histórica)';
  if (jdTdb < utcTimestampToTdb('1989-06-05T00:00:00Z').jdTdb) return 'Crucero Urano → Neptuno';
  if (jdTdb < utcTimestampToTdb('1989-10-02T00:00:00Z').jdTdb) return 'Encuentro con Neptuno y Tritón · desvío sur (−48°)';
  if (jdTdb < utcTimestampToTdb('2007-08-30T00:00:00Z').jdTdb) return 'Misión Interestelar · Heliosfera exterior';
  if (jdTdb < utcTimestampToTdb('2018-11-05T00:00:00Z').jdTdb) return 'Heliovaina (tras choque de terminación)';
  return 'Espacio interestelar (más allá de la heliopausa)';
}
