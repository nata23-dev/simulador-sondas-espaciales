import { MOONS } from './PlanetaryMoons.js';
import { MOON_TEXTURES } from '../graphics/MoonTextureCatalog.js';

const HISTORICAL_WINDOWS_TDB = Object.freeze({
  Luna: [['1977-08-20', '1977-08-29'], ['1977-09-05', '1977-09-14']],
  Io: [['1979-03-01', '1979-03-10'], ['1979-07-05', '1979-07-14']],
  Europa: [['1979-03-01', '1979-03-10'], ['1979-07-05', '1979-07-14']],
  Ganymede: [['1979-03-01', '1979-03-10'], ['1979-07-05', '1979-07-14']],
  Callisto: [['1979-03-01', '1979-03-10'], ['1979-07-05', '1979-07-14']],
  Titan: [['1980-11-08', '1980-11-17'], ['1981-08-22', '1981-08-30']],
  Enceladus: [['1980-11-08', '1980-11-17'], ['1981-08-22', '1981-08-30']],
  Titania: [['1986-01-20', '1986-01-29']],
  Miranda: [['1986-01-20', '1986-01-29']],
  Triton: [['1989-08-21', '1989-08-29']]
});

// Display/provenance index; numerical coverage is always enforced by the data
// provider's catalog and never inferred from these rounded calendar labels.
export const MOON_CATALOG = Object.freeze(Object.fromEntries(
  Object.entries(MOONS).map(([key, moon]) => [key, Object.freeze({
    ...moon,
    ephemerisSource: 'NASA/JPL Horizons',
    ephemerisUrl: 'https://ssd.jpl.nasa.gov/horizons/',
    currentDataFile: ['Io', 'Ganymede', 'Callisto', 'Enceladus', 'Miranda'].includes(key)
      ? 'data/moons-stage6-2026-10.json' : 'data/moons-2026-10.json',
    historicalCatalogFile: 'data/historical-ephemerides-catalog-v1.json',
    currentCoverageTdb: ['2026-10-01 00:00', '2026-11-01 00:00'],
    historicalWindowsTdb: HISTORICAL_WINDOWS_TDB[key],
    texture: MOON_TEXTURES[key],
    scientificStatus: 'Luna–planeta contrastado con Horizons directo; nave–luna Voyager pendiente de reconciliación SPK'
  })])
));
