// Etapa 12F — registro de perfiles físicos de cuerpos para misiones multicuerpo.
//
// Fuente única de verdad para "qué podemos simular en cada destino". Se DERIVA de los catálogos del proyecto:
//   · SOLAR_SYSTEM_GM_CATALOG (Sol, 8 planetas y Luna: GM y radio de referencia, JPL DE440),
//   · MOONS / MOON_CATALOG (10 satélites con efemérides: id NAIF, planeta, radio medio, cobertura),
//   · PLANETAS (los 8 planetas con efemérides heliocéntricas locales).
// Lo único que este módulo añade son datos que el proyecto NO tenía y que se declaran con procedencia propia:
//   · SATELLITE_GM_JPL: GM de los 9 satélites sin GM en el catálogo (JPL SSD, Planetary Satellite Physical Parameters).
//   · PHYSICAL_CLASS: clasificación CUALITATIVA (tipo y relevancia atmosférica). No contiene números físicos.
// Rotación: ningún dato del proyecto la define → `rotation: null` y se declara qué falta. No se inventan períodos.
import { SOLAR_SYSTEM_GM_CATALOG } from '../science/GravitationalParameters.js';
import { MOONS } from '../science/PlanetaryMoons.js';
import { PLANETAS } from '../astronomy/Ephemerides.js';

export const REGISTRY_VERSION = 'celestial-body-mission-registry-v1';
export const CAPABILITY = Object.freeze({ operational: 'OPERATIVO', experimental: 'EXPERIMENTAL', pending: 'PENDIENTE', notApplicable: 'NO APLICABLE' });
export const DESTINATION_GROUP = Object.freeze({
  airless: 'A · sólido sin atmósfera significativa para el modelo', atmospheric: 'B · sólido con atmósfera relevante',
  giant: 'C · gigante gaseoso o helado', star: 'D · estrella (no es destino de aterrizaje)'
});

// Gaseosos/helados y Sol: sin superficie sólida convencional.
const NAIF_NAME = { 199: 'Mercurio', 299: 'Venus', 399: 'Tierra', 499: 'Marte', 599: 'Jupiter', 699: 'Saturno', 799: 'Urano', 899: 'Neptuno' };

// GM de satélites (km³/s²) y su incertidumbre 1σ, leídos de https://ssd.jpl.nasa.gov/sats/phys_par/ (consulta 2026-11-17).
// Los radios medios de esa tabla coinciden con los de PlanetaryMoons.js (que sigue siendo la fuente de radios).
// Titania y Miranda tienen incertidumbre grande (≈2 % y ≈5 %): se conservan como están publicados.
export const SATELLITE_GM_JPL = Object.freeze({
  501: Object.freeze({ gm: 5959.91547, sigma: 0.00135 }), 502: Object.freeze({ gm: 3202.71210, sigma: 0.00181 }),
  503: Object.freeze({ gm: 9887.83275, sigma: 0.00247 }), 504: Object.freeze({ gm: 7179.28340, sigma: 0.00324 }),
  606: Object.freeze({ gm: 8978.13710, sigma: 0.00025 }), 602: Object.freeze({ gm: 7.21037, sigma: 0.00009 }),
  703: Object.freeze({ gm: 226.9, sigma: 4.1 }), 705: Object.freeze({ gm: 4.3, sigma: 0.2 }), 801: Object.freeze({ gm: 1428.49546, sigma: 0.61603 })
});
export const SATELLITE_GM_SOURCE = Object.freeze({ source: 'NASA/JPL SSD — Planetary Satellite Physical Parameters', url: 'https://ssd.jpl.nasa.gov/sats/phys_par/',
  note: 'GM tomado de la efeméride especificada por JPL; leído por el proyecto el 2026-11-17 y pendiente de verificación independiente.' });

// Clasificación cualitativa (literatura general; sin modelo atmosférico numérico en el proyecto).
//  atmosphere: 'none-significant' → el vacío es una aproximación defendible para un descenso corto;
//              'tenuous' → atmósfera muy tenue pero no analizada; 'relevant' → arrastre/calentamiento no despreciables;
//              'envelope' → sin superficie sólida convencional.
const PHYSICAL_CLASS = Object.freeze({
  10: { type: 'star', atmosphere: 'envelope', note: 'Estrella: sin superficie sólida.' },
  199: { type: 'rocky-planet', atmosphere: 'none-significant', note: 'Exosfera despreciable para el modelo; entorno térmico extremo no modelado.' },
  299: { type: 'rocky-planet', atmosphere: 'relevant', note: 'Atmósfera muy densa: exige entrada atmosférica.' },
  399: { type: 'rocky-planet', atmosphere: 'relevant', note: 'Atmósfera densa; el ascenso se modela en 12E, el descenso atmosférico queda pendiente.' },
  301: { type: 'rocky-moon', atmosphere: 'none-significant', note: 'Exosfera despreciable.' },
  499: { type: 'rocky-planet', atmosphere: 'relevant', note: 'Atmósfera tenue pero relevante para la entrada y el paracaídas.' },
  599: { type: 'gas-giant', atmosphere: 'envelope', note: 'Sin superficie sólida convencional.' }, 699: { type: 'gas-giant', atmosphere: 'envelope', note: 'Sin superficie sólida convencional.' },
  799: { type: 'ice-giant', atmosphere: 'envelope', note: 'Sin superficie sólida convencional.' }, 899: { type: 'ice-giant', atmosphere: 'envelope', note: 'Sin superficie sólida convencional.' },
  501: { type: 'rocky-moon', atmosphere: 'none-significant', note: 'Atmósfera extremadamente tenue (SO₂ volcánico); radiación y vulcanismo no modelados.' },
  502: { type: 'icy-moon', atmosphere: 'none-significant', note: 'Exosfera tenue; entorno de radiación joviana no modelado.' },
  503: { type: 'icy-moon', atmosphere: 'none-significant', note: 'Exosfera tenue; entorno de radiación joviana no modelado.' },
  504: { type: 'icy-moon', atmosphere: 'none-significant', note: 'Exosfera tenue.' },
  606: { type: 'icy-moon', atmosphere: 'relevant', note: 'Atmósfera densa de N₂: exige descenso atmosférico (paracaídas/arrastre).' },
  602: { type: 'icy-moon', atmosphere: 'none-significant', note: 'Sin atmósfera permanente; penacho austral no modelado.' },
  703: { type: 'icy-moon', atmosphere: 'none-significant', note: 'Sin atmósfera significativa.' }, 705: { type: 'icy-moon', atmosphere: 'none-significant', note: 'Sin atmósfera significativa.' },
  801: { type: 'icy-moon', atmosphere: 'tenuous', note: 'Atmósfera de N₂ muy tenue (≈ Pa): su efecto en el descenso no está analizado.' }
});

const MISSING_ROTATION = 'período de rotación y orientación del polo (IAU WGCCRE); sin ellos la velocidad respecto al suelo se evalúa en el marco local sin rotación del cuerpo';
const PLANET_EPHEMERIS = Object.freeze({ source: 'public/data/efemerides-2026.json (NASA/JPL Horizons)', center: 'Sol (500@10)', frame: 'ICRF eclíptico J2000', timeScale: 'TDB', coverageTdb: ['2026-10-01', '2026-11-01'], kind: 'heliocéntrica' });
const MOON_EPHEMERIS = Object.freeze({ source: 'public/data/moons-*.json (NASA/JPL Horizons)', frame: 'ICRF eclíptico J2000', timeScale: 'TDB', coverageTdb: ['2026-10-01', '2026-11-01'], kind: 'planetocéntrica' });

const finitePositive = value => Number.isFinite(value) && value > 0;

// Valida y congela un perfil. Rechaza datos incompletos; `gm` y `radiusKm` son obligatorios para operar.
export function createBodyProfile(raw) {
  const issues = [];
  if (!raw || typeof raw !== 'object') throw new TypeError('El perfil debe ser un objeto.');
  if (typeof raw.id !== 'string' || !raw.id) issues.push('id');
  if (typeof raw.name !== 'string' || !raw.name) issues.push('name');
  if (!['star', 'rocky-planet', 'gas-giant', 'ice-giant', 'rocky-moon', 'icy-moon'].includes(raw.type)) issues.push('type');
  if (raw.gm !== null && raw.gm !== undefined && !finitePositive(raw.gm?.value)) issues.push('gm.value');
  if (raw.radiusKm !== null && raw.radiusKm !== undefined && !finitePositive(raw.radiusKm?.value)) issues.push('radiusKm.value');
  if (raw.rotation) {
    const w = raw.rotation.angularVelocityRadS, axis = raw.rotation.axis;
    if (!Number.isFinite(w) || !Array.isArray(axis) || axis.length !== 3 || !axis.every(Number.isFinite) || !(Math.hypot(...axis) > 0)) issues.push('rotation');
  }
  if (issues.length) throw new RangeError(`Perfil de cuerpo inválido: ${issues.join(', ')}.`);
  const rotation = raw.rotation ? Object.freeze({ angularVelocityRadS: raw.rotation.angularVelocityRadS,
    axis: Object.freeze(raw.rotation.axis.map(x => x / Math.hypot(...raw.rotation.axis))), source: raw.rotation.source ?? 'no declarada' }) : null;
  return Object.freeze({ ...raw, gm: raw.gm ?? null, radiusKm: raw.radiusKm ?? null, rotation, shape: raw.shape ?? 'sphere',
    frames: Object.freeze({ inertialLocal: `inercial local del cuerpo ${raw.id} (ejes arbitrarios, sin conexión con ICRF)`,
      bodyFixed: rotation ? `fijo al cuerpo ${raw.id} (ω declarada)` : null }) });
}

function buildProfiles() {
  const profiles = [];
  const gmCatalog = id => SOLAR_SYSTEM_GM_CATALOG.hasBody(id) ? SOLAR_SYSTEM_GM_CATALOG.getParameter(id) : null;
  const gmField = (entry, scope) => entry ? { value: entry.muKm3PerS2, source: entry.source, version: entry.version, sourceUrl: entry.sourceUrl, scope } : null;
  const sun = gmCatalog('10');
  profiles.push(createBodyProfile({ id: '10', name: 'Sol', type: 'star', parentId: null, gm: gmField(sun, 'body'), radiusKm: { value: sun.referenceRadiusKm, source: sun.source },
    rotation: null, missing: ['superficie sólida'], ephemeris: { kind: 'origen heliocéntrico', frame: 'ICRF eclíptico J2000', timeScale: 'TDB', coverageTdb: null }, atmosphere: PHYSICAL_CLASS[10] }));
  for (const name of PLANETAS) {
    const id = Object.keys(NAIF_NAME).find(key => NAIF_NAME[key] === name), entry = gmCatalog(id);
    const planet = PHYSICAL_CLASS[id];
    profiles.push(createBodyProfile({ id, name, type: planet.type, parentId: '10', gm: gmField(entry, entry?.massScope),
      radiusKm: entry?.referenceRadiusKm ? { value: entry.referenceRadiusKm, source: entry.source } : null, rotation: null,
      missing: ['rotación: ' + MISSING_ROTATION], ephemeris: PLANET_EPHEMERIS, atmosphere: planet }));
  }
  for (const [key, moon] of Object.entries(MOONS)) {
    const entry = gmCatalog(moon.id), satellite = SATELLITE_GM_JPL[moon.id];
    const gm = entry ? gmField(entry, 'body') : satellite ? { value: satellite.gm, sigma: satellite.sigma, source: SATELLITE_GM_SOURCE.source, sourceUrl: SATELLITE_GM_SOURCE.url, scope: 'body', note: SATELLITE_GM_SOURCE.note } : null;
    profiles.push(createBodyProfile({ id: moon.id, name: moon.name, catalogKey: key, type: PHYSICAL_CLASS[moon.id].type, parentId: moon.center, gm,
      radiusKm: { value: moon.radiusKm, source: 'NASA/JPL SSD sats/phys_par (PlanetaryMoons.js)' }, rotation: null,
      missing: ['rotación: ' + MISSING_ROTATION], ephemeris: MOON_EPHEMERIS, atmosphere: PHYSICAL_CLASS[moon.id] }));
  }
  return profiles;
}

const PROFILES = Object.freeze(buildProfiles());
const BY_ID = new Map(PROFILES.map(p => [p.id, p]));

export const listBodyProfiles = () => PROFILES;
export function getBodyProfile(id) {
  const profile = BY_ID.get(String(id));
  if (!profile) throw new RangeError(`Cuerpo desconocido: ${id}.`);
  return profile;
}

// ---- Capacidad de descenso propulsado --------------------------------------------------------------------------------
// Nivel por cuerpo: OPERATIVO solo para destinos con escenario de integración comprobado por pruebas locales
// (siguen pendientes de la auditoría independiente). El resto, con datos suficientes, es EXPERIMENTAL.
const VERIFIED_SCENARIOS = Object.freeze(new Set(['301', '502']));
export function landingCapability(profileOrId) {
  const p = typeof profileOrId === 'object' ? profileOrId : getBodyProfile(profileOrId);
  const missing = [];
  if (p.type === 'star') return { state: CAPABILITY.notApplicable, group: DESTINATION_GROUP.star, reason: 'El Sol no es un destino de aterrizaje.', missing };
  if (p.type === 'gas-giant' || p.type === 'ice-giant') return { state: CAPABILITY.notApplicable, group: DESTINATION_GROUP.giant,
    reason: `${p.name} no tiene una superficie sólida convencional: el aterrizaje superficial no aplica. Corresponde una sonda de entrada atmosférica (categoría futura, no implementada).`, missing,
    futureCategory: 'Sonda de entrada atmosférica' };
  if (!p.gm) missing.push('GM (parámetro gravitacional)');
  if (!p.radiusKm) missing.push('radio medio');
  if (missing.length) return { state: CAPABILITY.pending, group: DESTINATION_GROUP.airless, reason: `Faltan datos físicos para descender: ${missing.join(', ')}.`, missing };
  if (p.atmosphere.atmosphere === 'relevant') return { state: CAPABILITY.pending, group: DESTINATION_GROUP.atmospheric,
    reason: `Descenso atmosférico pendiente: ${p.name} tiene una atmósfera relevante y el modelo de vacío no representa un aterrizaje completo (faltan arrastre, entrada, calentamiento, paracaídas y propulsión terminal).`, missing: ['modelo atmosférico', 'entrada y calentamiento', 'paracaídas'] };
  if (p.atmosphere.atmosphere === 'tenuous') return { state: CAPABILITY.pending, group: DESTINATION_GROUP.atmospheric,
    reason: `${p.name}: atmósfera muy tenue cuyo efecto no está analizado; no se usa el modelo de vacío hasta justificarlo.`, missing: ['análisis de la atmósfera tenue'] };
  const verified = VERIFIED_SCENARIOS.has(p.id);
  return { state: verified ? CAPABILITY.operational : CAPABILITY.experimental, group: DESTINATION_GROUP.airless,
    reason: `Descenso propulsado en vacío justificado: ${p.atmosphere.note} Modelo de un solo cuerpo; sin rotación del cuerpo ni perturbaciones de terceros cuerpos.`,
    missing: p.rotation ? [] : ['rotación del cuerpo'], vacuumJustification: p.atmosphere.note };
}

// ---- Contratos de marcos y tiempo (documentales y verificables) ----------------------------------------------------------
export const FRAME_CONTRACTS = Object.freeze({
  'barycentric-or-heliocentric': { description: 'Estado respecto al Sol/baricentro en ICRF eclíptico J2000 (efemérides locales).', timeScale: 'TDB', absolute: true },
  'planet-relative': { description: 'Estado respecto al centro de un planeta; ejes ICRF salvo que se indique otra cosa.', timeScale: 'TDB', absolute: true },
  'moon-relative': { description: 'Estado respecto al centro de un satélite (planetocéntrico para sus efemérides).', timeScale: 'TDB', absolute: true },
  'local-inertial': { description: 'Marco inercial local de un cuerpo: origen en su centro, ejes arbitrarios autoconsistentes; NO conectado con ICRF.', timeScale: 'tiempo de simulación (s)', absolute: false },
  'body-fixed': { description: 'Marco fijo al cuerpo: exige eje y velocidad de rotación definidos; si faltan, no existe.', timeScale: 'tiempo de simulación (s)', absolute: false }
});
export function localFrameDescriptor(profile, { epochUtc = null, orientation = 'arbitraria' } = {}) {
  return Object.freeze({ type: 'local-inertial', originBodyId: profile.id, originBodyName: profile.name, axes: `ejes ${orientation}; z = eje de referencia local`,
    simulationTimeUnit: 's', epochUtcLabel: epochUtc, epochTdbJd: null, connectedToIcrf: false,
    warning: 'Simulación local autoconsistente: no es una trayectoria ICRF absoluta ni sitúa al cuerpo en el Sistema Solar. Una transformación exige marcos, época, orientación y estados conocidos.' });
}
