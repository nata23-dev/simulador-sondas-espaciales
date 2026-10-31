import { createStaticJsonReader } from '../science/EphemerisFileReader.js';
import { createHistoricalEphemerisResolver } from '../science/HistoricalEphemerisResolver.js';
import { eclipticToSceneAxes } from '../science/Frames.js';
import { KM_PER_AU } from '../science/Units.js';
import {
  VOYAGER_1_ID,
  VOYAGER_2_ID
} from '../science/VoyagerHistoricalMissions.js';
import { UNIDADES_POR_AU } from '../graphics/SceneScale.js';
import { scientificStateToVisual } from './ScientificVisualPipeline.js';

const KM_TO_SCENE = UNIDADES_POR_AU / KM_PER_AU;

export function physicalKmToScenePosition(positionKm) {
  const rotated = eclipticToSceneAxes(positionKm);
  return Object.freeze({
    x: rotated.x * KM_TO_SCENE,
    y: rotated.y * KM_TO_SCENE,
    z: rotated.z * KM_TO_SCENE
  });
}

export function createHistoricalVisualPipeline({
  baseUrl = import.meta.env?.BASE_URL ?? '/',
  fetchImpl = globalThis.fetch
} = {}) {
  const loadJson = createStaticJsonReader({ baseUrl, fetchImpl });
  const resolver = createHistoricalEphemerisResolver({ loadJson });
  const visualBackboneCache = new Map();

  async function queryVisualHistoricalSnapshot(jdTdb) {
    const snapshot = await resolver.queryHistoricalSnapshot(jdTdb);

    const visualPlanets = {};
    for (const [name, res] of Object.entries(snapshot.planets)) {
      visualPlanets[name] = scientificStateToVisual(res.state, res.state.identity.id);
    }

    const visualMoons = {};
    for (const [key, res] of Object.entries(snapshot.moons)) {
      visualMoons[key] = Object.freeze({
        ...res,
        visual: scientificStateToVisual(res.state, res.state.identity.id)
      });
    }

    const visualProbes = {};
    for (const missionId of [VOYAGER_1_ID, VOYAGER_2_ID]) {
      const probe = snapshot.probes[missionId];
      visualProbes[missionId] = Object.freeze({
        ...probe,
        visual: probe.state
          ? scientificStateToVisual(probe.state, probe.state.identity.id)
          : null
      });
    }

    return Object.freeze({
      jdTdb: snapshot.jdTdb,
      timeLabels: snapshot.timeLabels,
      planets: Object.freeze(visualPlanets),
      rawPlanets: snapshot.planets,
      moons: Object.freeze(visualMoons),
      probes: Object.freeze(visualProbes)
    });
  }

  async function loadVisualTrajectoryBackbone(missionId) {
    if (visualBackboneCache.has(missionId)) return visualBackboneCache.get(missionId);
    const promise = (async () => {
      const backbone = await resolver.loadMissionTrajectoryBackbone(missionId);
      const sceneKnots = backbone.knots.map(k => {
        const scenePos = physicalKmToScenePosition({ x: k.xKm, y: k.yKm, z: k.zKm });
        return Object.freeze({
          jdTdb: k.jdTdb,
          x: scenePos.x,
          y: scenePos.y,
          z: scenePos.z
        });
      });
      return Object.freeze({
        missionId,
        naifId: backbone.naifId,
        knots: Object.freeze(sceneKnots)
      });
    })();
    visualBackboneCache.set(missionId, promise);
    return promise;
  }

  /**
   * Divide la polilínea histórica en tramo recorrido `<= jdTdb` y tramo futuro `>= jdTdb`,
   * insertando exactamente la posición actual interpolada en la frontera.
   */
  function sliceTrajectoryAtEpoch(sceneKnots, jdTdb, currentScenePos) {
    if (!sceneKnots || sceneKnots.length === 0 || !currentScenePos) {
      return { past: [], future: [] };
    }
    // Búsqueda binaria del primer nudo estrictamente posterior a jdTdb
    let lo = 0;
    let hi = sceneKnots.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sceneKnots[mid].jdTdb <= jdTdb) lo = mid + 1;
      else hi = mid;
    }

    const past = sceneKnots.slice(0, lo);
    past.push(currentScenePos);

    const future = [currentScenePos, ...sceneKnots.slice(lo)];
    return { past, future };
  }

  return Object.freeze({
    resolver,
    getTimelineBounds: resolver.getTimelineBounds,
    queryVisualHistoricalSnapshot,
    loadVisualTrajectoryBackbone,
    sliceTrajectoryAtEpoch
  });
}
