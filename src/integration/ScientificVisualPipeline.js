/**
 * En este módulo conecto el proveedor científico de efemérides (catálogo
 * NASA/JPL Horizons con interpolación cúbica de Hermite) con el formato visual
 * que espera la escena 3D y las fichas de cuerpos celestes.
 * Recibo estados canónicos en km y km/s (marco eclíptico J2000, tiempo TDB) y
 * los convierto a coordenadas de escena `(x, z, -y)` y unidades AU / AU por día.
 */
import { createEphemerisProvider } from '../science/EphemerisProvider.js';
import { createStaticJsonReader } from '../science/EphemerisFileReader.js';
import { HORIZONS_PLANETS } from '../science/HorizonsEphemerides.js';
import { createScientificState } from '../science/ScientificState.js';
import { KM_PER_AU, SECONDS_PER_DAY } from '../science/Units.js';
import { UNIDADES_POR_AU } from '../graphics/SceneScale.js';

// Compruebo si el usuario activó el flujo científico opcional mediante el parámetro URL `?ephemeris=scientific`.
export function scientificPipelineEnabled(search) {
  return new URLSearchParams(search).get('ephemeris') === 'scientific';
}

// Convierto un estado científico canónico en coordenadas visuales de escena y datos de ficha, verificando su identidad.
export function scientificStateToVisual(input, expectedId) {
  const state = createScientificState(input);
  if (state.identity.id !== expectedId) throw new RangeError(`Identidad inesperada: ${state.identity.id}.`);
  const p = state.position;
  const v = state.velocity;
  const scale = UNIDADES_POR_AU / KM_PER_AU;
  return Object.freeze({
    posicionEscena: Object.freeze({ x: p.x * scale, y: p.z * scale, z: -p.y * scale }),
    posicionAU: Object.freeze({ x: p.x / KM_PER_AU, y: p.y / KM_PER_AU, z: p.z / KM_PER_AU }),
    velocidadAUporDia: Object.freeze({ x: v.x * SECONDS_PER_DAY / KM_PER_AU,
      y: v.y * SECONDS_PER_DAY / KM_PER_AU, z: v.z * SECONDS_PER_DAY / KM_PER_AU }),
    fechaTDB: state.provenance.sourceMetadata.sourceRecordDateTdb
      ?? `JD ${state.time.jdTdb} TDB (${state.provenance.source})`,
    scientificStatus: state.provenance.source === 'Interpolación cúbica de Hermite'
      ? 'interpolated' : 'exact',
    scientificState: state
  });
}

// Cargo el catálogo de efemérides científicas y construyo el proveedor listo para consultas interpoladas.
export async function loadScientificPipeline({ baseUrl, fetchImpl = globalThis.fetch }) {
  const readJson = createStaticJsonReader({ baseUrl, fetchImpl });
  const catalog = await readJson('data/ephemerides-catalog-v1.json');
  return createEphemerisProvider({ catalog, loadJson: readJson });
}

// Consulto de forma atómica los ocho planetas en un instante JD TDB; si alguno falla o queda fuera de rango, aborto todo el lote.
export async function queryVisualStates(provider, jdTdb) {
  const names = Object.entries(HORIZONS_PLANETS);
  const results = await Promise.all(names.map(([, id]) => provider.getInterpolated(id, jdTdb)));
  const states = {};
  const modes = new Set();
  results.forEach((result, index) => {
    const [name, id] = names[index];
    if (result.status !== 'exact' && result.status !== 'interpolated') {
      throw new Error(`${name}: ${result.status}${result.reason ? ` (${result.reason})` : ''}`);
    }
    states[name] = scientificStateToVisual(result.state, id);
    modes.add(result.status);
  });
  return Object.freeze({ states: Object.freeze(states),
    status: modes.size === 1 ? [...modes][0] : 'mixed' });
}
