import { requireFiniteNumber } from './Units.js';

export const GM_UNIT = 'km^3/s^2';
export const SUN_BODY_ID = '10';

export const DE440_ASTRODYNAMIC_SOURCE = Object.freeze({
  id: 'jpl-ssd-de440-v1',
  source: 'NASA/JPL Solar System Dynamics — Astrodynamic Parameters',
  sourceUrl: 'https://ssd.jpl.nasa.gov/astro_par.html',
  version: 'JPL DE440 (Park et al. 2021, AJ 161, 105)',
  radiusSource: 'IAU 2015 Resolution B3 (Sol) y NASA/JPL SSD Planetary Physical Parameters / IAU WGCCRE',
  radiusSourceUrl: 'https://ssd.jpl.nasa.gov/planets/phys_par.html'
});

function requireNonEmptyString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${name} debe ser una cadena no vacía.`);
  }
  return value.trim();
}

function requirePositiveFinite(value, name) {
  requireFiniteNumber(value, name);
  if (value <= 0) {
    throw new RangeError(`${name} debe ser estrictamente positivo.`);
  }
  return value;
}

const VALID_MASS_SCOPES = new Set([
  'body',
  'planetary_system_at_body_center',
  'planetary_system_barycenter',
  'synthetic'
]);

function normalizeParameterEntry(raw, index, isSyntheticCatalog) {
  const path = `entries[${index}]`;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError(`${path} debe ser un objeto.`);
  }
  const bodyId = requireNonEmptyString(raw.bodyId, `${path}.bodyId`);
  const name = requireNonEmptyString(raw.name, `${path}.name`);
  const muKm3PerS2 = requirePositiveFinite(raw.muKm3PerS2, `${path}.muKm3PerS2`);
  if (raw.unit !== undefined && raw.unit !== GM_UNIT) {
    throw new RangeError(`${path}.unit incompatible: se esperaba ${GM_UNIT}.`);
  }
  const referenceRadiusKm = raw.referenceRadiusKm === null || raw.referenceRadiusKm === undefined
    ? null
    : requirePositiveFinite(raw.referenceRadiusKm, `${path}.referenceRadiusKm`);
  const minSafeDistanceKm = raw.minSafeDistanceKm === undefined
    ? (referenceRadiusKm ?? 1e-6)
    : requirePositiveFinite(raw.minSafeDistanceKm, `${path}.minSafeDistanceKm`);
  const massScope = raw.massScope ?? (isSyntheticCatalog ? 'synthetic' : 'body');
  if (!VALID_MASS_SCOPES.has(massScope)) {
    throw new RangeError(`${path}.massScope desconocido: ${massScope}.`);
  }
  if (!isSyntheticCatalog && massScope === 'synthetic') {
    throw new RangeError(`${path}: no se permiten parámetros sintéticos en un catálogo físico real.`);
  }
  const source = requireNonEmptyString(raw.source, `${path}.source`);
  const version = raw.version === null || raw.version === undefined
    ? null
    : requireNonEmptyString(raw.version, `${path}.version`);
  const sourceUrl = raw.sourceUrl === null || raw.sourceUrl === undefined
    ? null
    : requireNonEmptyString(raw.sourceUrl, `${path}.sourceUrl`);
  const notes = raw.notes === null || raw.notes === undefined
    ? null
    : requireNonEmptyString(raw.notes, `${path}.notes`);

  return Object.freeze({
    bodyId,
    name,
    muKm3PerS2,
    unit: GM_UNIT,
    referenceRadiusKm,
    minSafeDistanceKm,
    massScope,
    isSynthetic: Boolean(isSyntheticCatalog),
    source,
    version,
    sourceUrl,
    notes
  });
}

function buildCatalog({ id, entries, isSynthetic, description }) {
  const catalogId = requireNonEmptyString(id, 'catalog.id');
  const catalogDescription = requireNonEmptyString(description, 'catalog.description');
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new TypeError('catalog.entries debe ser una lista no vacía.');
  }
  const byId = new Map();
  const normalized = entries.map((raw, index) => {
    const entry = normalizeParameterEntry(raw, index, isSynthetic);
    if (byId.has(entry.bodyId)) {
      throw new RangeError(`catalog.entries contiene bodyId duplicado: ${entry.bodyId}.`);
    }
    byId.set(entry.bodyId, entry);
    return entry;
  });

  const frozenRecord = Object.freeze(Object.fromEntries(
    normalized.map(entry => [entry.bodyId, entry])
  ));

  return Object.freeze({
    id: catalogId,
    description: catalogDescription,
    unit: GM_UNIT,
    isSynthetic: Boolean(isSynthetic),
    entries: Object.freeze(normalized),
    byBodyId: frozenRecord,
    hasBody(bodyId) {
      return typeof bodyId === 'string' && Object.hasOwn(frozenRecord, bodyId);
    },
    getParameter(bodyId) {
      const idText = requireNonEmptyString(bodyId, 'bodyId');
      if (!Object.hasOwn(frozenRecord, idText)) {
        throw new RangeError(`No existe parámetro gravitacional verificado para el cuerpo ${idText} en ${catalogId}.`);
      }
      return frozenRecord[idText];
    },
    getMu(bodyId) {
      return this.getParameter(bodyId).muKm3PerS2;
    },
    listBodyIds() {
      return Object.freeze(normalized.map(entry => entry.bodyId));
    },
    snapshotForBodies(bodyIds) {
      if (!Array.isArray(bodyIds) || bodyIds.length === 0) {
        throw new TypeError('bodyIds debe ser una lista no vacía.');
      }
      const selected = {};
      for (const bodyId of bodyIds) {
        const entry = this.getParameter(bodyId);
        selected[entry.bodyId] = entry.muKm3PerS2;
      }
      return Object.freeze({
        catalogId,
        isSynthetic: Boolean(isSynthetic),
        unit: GM_UNIT,
        valuesKm3PerS2: Object.freeze(selected)
      });
    }
  });
}

/**
 * Crea un catálogo físico validado e inmutable. Rechaza entradas sintéticas.
 */
export function createPhysicalGravitationalCatalog({ id, description, entries }) {
  return buildCatalog({ id, description, entries, isSynthetic: false });
}

/**
 * Crea un catálogo explícitamente etiquetado como sintético para pruebas controladas.
 * No debe utilizarse como sustituto de constantes astronómicas reales.
 */
export function createSyntheticGravitationalCatalog({
  id = 'synthetic-test-catalog',
  description = 'Catálogo gravitacional sintético exclusivo para pruebas numéricas controladas',
  entries
}) {
  const taggedEntries = Array.isArray(entries)
    ? entries.map(entry => (entry && typeof entry === 'object' && !Array.isArray(entry)
      ? {
        source: 'Parámetro sintético de prueba controlada',
        version: null,
        sourceUrl: null,
        massScope: 'synthetic',
        ...entry
      }
      : entry))
    : entries;
  return buildCatalog({ id, description, entries: taggedEntries, isSynthetic: true });
}

/**
 * Catálogo físico autoritativo del Sistema Solar (JPL DE440).
 *
 * Notas científicas importantes:
 * - Sol ('10'), Mercurio ('199'), Venus ('299'), Tierra ('399') y Luna ('301')
 *   corresponden a parámetros GM del cuerpo individual en DE440.
 * - Para Marte ('499') y los planetas gigantes ('599', '699', '799', '899'),
 *   NASA/JPL SSD astro_par.html (DE440) publica el GM del sistema planetario
 *   (planeta + satélites naturales). Mientras las efemérides locales no incluyan
 *   satélites naturales por separado, asignar el GM del sistema al centro
 *   planetario constituye la aproximación monopolar estándar para cruceros
 *   interplanetarios lejanos a dichos sistemas de satélites.
 */
export const SOLAR_SYSTEM_GM_CATALOG = createPhysicalGravitationalCatalog({
  id: DE440_ASTRODYNAMIC_SOURCE.id,
  description: 'Parámetros gravitacionales estándar GM (km^3/s^2) de NASA/JPL SSD basados en la efeméride planetaria DE440',
  entries: [
    {
      bodyId: '10',
      name: 'Sol',
      muKm3PerS2: 132712440041.279419,
      referenceRadiusKm: 695700,
      massScope: 'body',
      source: DE440_ASTRODYNAMIC_SOURCE.source,
      version: DE440_ASTRODYNAMIC_SOURCE.version,
      sourceUrl: DE440_ASTRODYNAMIC_SOURCE.sourceUrl,
      notes: 'GM heliocéntrico DE440 (1.32712440041279419e20 m^3/s^2); radio solar nominal IAU 2015 Res. B3.'
    },
    {
      bodyId: '199',
      name: 'Mercurio',
      muKm3PerS2: 22031.868551,
      referenceRadiusKm: 2439.4,
      massScope: 'body',
      source: DE440_ASTRODYNAMIC_SOURCE.source,
      version: DE440_ASTRODYNAMIC_SOURCE.version,
      sourceUrl: DE440_ASTRODYNAMIC_SOURCE.sourceUrl,
      notes: 'Sin satélites naturales; GM del cuerpo coincide con el sistema.'
    },
    {
      bodyId: '299',
      name: 'Venus',
      muKm3PerS2: 324858.592000,
      referenceRadiusKm: 6051.8,
      massScope: 'body',
      source: DE440_ASTRODYNAMIC_SOURCE.source,
      version: DE440_ASTRODYNAMIC_SOURCE.version,
      sourceUrl: DE440_ASTRODYNAMIC_SOURCE.sourceUrl,
      notes: 'Sin satélites naturales; GM del cuerpo coincide con el sistema.'
    },
    {
      bodyId: '399',
      name: 'Tierra',
      muKm3PerS2: 398600.435507,
      referenceRadiusKm: 6371.0084,
      massScope: 'body',
      source: DE440_ASTRODYNAMIC_SOURCE.source,
      version: DE440_ASTRODYNAMIC_SOURCE.version,
      sourceUrl: DE440_ASTRODYNAMIC_SOURCE.sourceUrl,
      notes: 'GM exclusivo del planeta Tierra (sin la Luna 301).'
    },
    {
      bodyId: '301',
      name: 'Luna',
      muKm3PerS2: 4902.800118,
      referenceRadiusKm: 1737.4,
      massScope: 'body',
      source: DE440_ASTRODYNAMIC_SOURCE.source,
      version: DE440_ASTRODYNAMIC_SOURCE.version,
      sourceUrl: DE440_ASTRODYNAMIC_SOURCE.sourceUrl,
      notes: 'GM lunar DE440; requiere efemérides del cuerpo 301 para incluirse en propagación.'
    },
    {
      bodyId: '499',
      name: 'Marte',
      muKm3PerS2: 42828.375816,
      referenceRadiusKm: 3389.50,
      massScope: 'planetary_system_at_body_center',
      source: DE440_ASTRODYNAMIC_SOURCE.source,
      version: DE440_ASTRODYNAMIC_SOURCE.version,
      sourceUrl: DE440_ASTRODYNAMIC_SOURCE.sourceUrl,
      notes: 'GM del sistema marciano DE440 concentrado en 499 en ausencia de efemérides de Fobos y Deimos.'
    },
    {
      bodyId: '599',
      name: 'Jupiter',
      muKm3PerS2: 126712764.100000,
      referenceRadiusKm: 69911,
      massScope: 'planetary_system_at_body_center',
      source: DE440_ASTRODYNAMIC_SOURCE.source,
      version: DE440_ASTRODYNAMIC_SOURCE.version,
      sourceUrl: DE440_ASTRODYNAMIC_SOURCE.sourceUrl,
      notes: 'GM del sistema joviano DE440 concentrado en 599 para perturbación interplanetaria lejana.'
    },
    {
      bodyId: '699',
      name: 'Saturno',
      muKm3PerS2: 37940584.841800,
      referenceRadiusKm: 58232,
      massScope: 'planetary_system_at_body_center',
      source: DE440_ASTRODYNAMIC_SOURCE.source,
      version: DE440_ASTRODYNAMIC_SOURCE.version,
      sourceUrl: DE440_ASTRODYNAMIC_SOURCE.sourceUrl,
      notes: 'GM del sistema saturniano DE440 concentrado en 699 para perturbación interplanetaria lejana.'
    },
    {
      bodyId: '799',
      name: 'Urano',
      muKm3PerS2: 5794556.400000,
      referenceRadiusKm: 25362,
      massScope: 'planetary_system_at_body_center',
      source: DE440_ASTRODYNAMIC_SOURCE.source,
      version: DE440_ASTRODYNAMIC_SOURCE.version,
      sourceUrl: DE440_ASTRODYNAMIC_SOURCE.sourceUrl,
      notes: 'GM del sistema uraniano DE440 concentrado en 799 para perturbación interplanetaria lejana.'
    },
    {
      bodyId: '899',
      name: 'Neptuno',
      muKm3PerS2: 6836527.100580,
      referenceRadiusKm: 24622,
      massScope: 'planetary_system_at_body_center',
      source: DE440_ASTRODYNAMIC_SOURCE.source,
      version: DE440_ASTRODYNAMIC_SOURCE.version,
      sourceUrl: DE440_ASTRODYNAMIC_SOURCE.sourceUrl,
      notes: 'GM del sistema neptuniano DE440 concentrado en 899 para perturbación interplanetaria lejana.'
    }
  ]
});
