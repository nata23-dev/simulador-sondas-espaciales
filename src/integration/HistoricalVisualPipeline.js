import { createStaticJsonReader } from '../science/EphemerisFileReader.js';
import { createHistoricalEphemerisResolver } from '../science/HistoricalEphemerisResolver.js';
import { createHistoricalEncounterContextResolver } from '../science/HistoricalEncounterContext.js';
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
  const encounterResolver = createHistoricalEncounterContextResolver({ loadJson });
  const visualBackboneCache = new Map();

  async function queryVisualHistoricalSnapshot(jdTdb) {
    const [snapshot, planetContexts, moonContexts] = await Promise.all([
      resolver.queryHistoricalSnapshot(jdTdb),
      encounterResolver.resolveAvailable(jdTdb),
      encounterResolver.resolveAvailableMoons(jdTdb)
    ]);

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

    // A local view has its own target-anchored observer. These coordinates are
    // never inserted into the global probe state or its trajectory backbone.
    const localFrames = {};
    for(const result of Object.values(planetContexts)) {
      const state=result.state;
      if(!state)continue;
      const target=snapshot.planets[state.planet]?.state.position;
      if(!target)continue;
      const p=state.positionKm,v=state.velocityKmS;
      const observerKm={x:target.x+p.x,y:target.y+p.y,z:target.z+p.z};
      localFrames[`${state.missionId}:${state.planet}`]=Object.freeze({
        missionId:state.missionId,target:state.planet,kind:'planet',
        observerPositionScene:physicalKmToScenePosition(observerKm),
        targetMinusObserverKm:Object.freeze({x:-p.x,y:-p.y,z:-p.z}),
        targetMinusObserverVelocityKmS:Object.freeze({x:-v.x,y:-v.y,z:-v.z}),
        distanceKm:Math.hypot(p.x,p.y,p.z),source:state.source,
        datasetId:state.datasetId,sourceSha256:state.sourceSha256,
        sampleJdTdbs:state.sampleJdTdbs,coordinateContext:'local target anchored'
      });
    }
    for(const result of Object.values(moonContexts)) {
      const state=result.state;
      if(!state)continue;
      const target=snapshot.moons[state.moon]?.state.position;
      if(!target)continue;
      const p=state.positionKm,v=state.velocityKmS;
      const observerKm={x:target.x-p.x,y:target.y-p.y,z:target.z-p.z};
      localFrames[`${state.missionId}:${state.moon}`]=Object.freeze({
        missionId:state.missionId,target:state.moon,kind:'moon',
        observerPositionScene:physicalKmToScenePosition(observerKm),
        targetMinusObserverKm:p,targetMinusObserverVelocityKmS:v,
        distanceKm:Math.hypot(p.x,p.y,p.z),source:state.source,
        datasetId:state.datasetId,sourceSha256:state.sourceSha256,
        sampleJdTdbs:state.sampleJdTdbs,coordinateContext:'local target anchored'
      });
    }

    return Object.freeze({
      jdTdb: snapshot.jdTdb,
      timeLabels: snapshot.timeLabels,
      planets: Object.freeze(visualPlanets),
      rawPlanets: snapshot.planets,
      moons: Object.freeze(visualMoons),
      probes: Object.freeze(visualProbes),
      localFrames: Object.freeze(localFrames)
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
          breakBefore: k.breakBefore,
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
