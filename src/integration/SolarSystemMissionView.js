/**
 * En este módulo adapto la reproducción de una misión planificada en el
 * laboratorio para dibujarla directamente dentro de la escena principal del
 * Sistema Solar (`SolarSystem.js`).
 * No recalculo física ni extrapolo datos:
 *   · Tomo el estado heliocéntrico ya calculado para la sonda (Kepler en tramos
 *     balísticos, nudos DOPRI54 con Hermite en encendidos) en el marco del Sol.
 *   · Sitúo los ocho planetas con las efemérides interplanetarias en el marco
 *     eclíptico J2000/ICRF centrado en el Sol (época TDB). Para la Tierra y el
 *     destino reutilizo exactamente la ventana del cálculo (usando el baricentro
 *     del sistema en los planetas exteriores para alinear la órbita de llegada).
 *   · En misiones con satélites galileanos, coloco Ío, Europa, Ganímedes y Calisto
 *     con la misma ventana de Horizons centrada en el baricentro de Júpiter,
 *     ocultándolos fuera de su cobertura verificada.
 * Ejes y escala: convención de la escena principal `(x, y, z) -> (x, z, -y)` a
 * 32 unidades por AU mediante `physicalPositionKmToScene`.
 */
import { physicalPositionKmToScene } from './ProbeVisualAdapter.js';
import { sampleIntegratedExecution, autoContextAt } from '../lab/IntegratedMissionPlayback.js';
import { MOON_WINDOW_KEYS } from '../lab/IntegratedMission.js';
import { sampleInterplanetaryExecution } from '../lab/InterplanetaryPlayback.js';

export const MAIN_SCENE_CAMERA_MODES = Object.freeze(['overview', 'exterior', 'destination']);
// Relaciono cada planeta de la escena principal con su identificador NAIF de efemérides (centro del cuerpo).
export const MAIN_SCENE_PLANETS = Object.freeze([['Mercurio', '199'], ['Venus', '299'], ['Tierra', '399'], ['Marte', '499'],
  ['Jupiter', '599'], ['Saturno', '699'], ['Urano', '799'], ['Neptuno', '899']]);
const PLANET_OF_BARYCENTER = Object.freeze({ '5': '599', '6': '699', '7': '799', '8': '899' });
// Defino radios de encuadre (en unidades de escena, 32 = 1 AU) para que la vista general abarque trayectoria, Tierra y destino.
const OVERVIEW_TRAJECTORY_RADIUS = 0.05, OVERVIEW_BODY_RADIUS = 0.35, OVERVIEW_MAX_TRAJECTORY_POINTS = 96, OVERVIEW_BODY_EPOCHS = 24;
// Reduzco el factor visual de la nave en tramos planetocéntricos para que no tape el planeta a escala 1:1.
export const NEAR_BODY_PROBE_SCALE = 0.1;
// Reduzco aún más la nave cerca de un satélite galileano (radio de Europa ≈ 1 561 km) para evitar que atraviese su superficie sin desaparecer bajo el plano cercano.
export const NEAR_MOON_PROBE_SCALE = 0.03;
// Claves de los satélites galileanos compartidas con `MoonVisuals`, referidas al baricentro de Júpiter ('5').
export const MAIN_SCENE_MOONS = Object.freeze(Object.values(MOON_WINDOW_KEYS));
const MOON_PARENT_BARYCENTER = '5';
const SCIENTIFIC_SCALE = 'cientifica';
// Acepto tanto tuplas `[x, y, z]` como objetos `{ x, y, z }` en km y los paso a coordenadas de escena.
export const kmToScene = p => physicalPositionKmToScene(Array.isArray(p) ? { x: p[0], y: p[1], z: p[2] } : p);

// Compruebo si una ejecución del laboratorio puede representarse en el Sistema Solar principal o debe quedarse en la vista local del Centro de Misión.
export function mainSceneSupport(execution) {
  if (!execution) return { ok: false, reason: 'Sin misión en reproducción.' };
  if (execution.kind === 'interplanetary') return { ok: true };
  if (execution.kind !== 'integrated') {
    return { ok: false, reason: 'Las misiones alrededor de la Tierra (lanzamiento, Tierra–Luna y empuje finito) se reproducen en la escena local del Centro de Misión: a la escala del Sistema Solar no se distinguirían de la Tierra.' };
  }
  const { mission } = execution;
  if (execution.contexts.landing) {
    return { ok: false, reason: `La misión incluye un descenso en ${mission.moonName ?? 'un satélite'}: se reproduce en la escena del Centro de Misión.` };
  }
  if (mission.moonId || execution.contexts.moon) {
    const key = MOON_WINDOW_KEYS[mission.moonId], moons = execution.data?.moons;
    if (!key || !moons?.coverage?.(key) || moons.centerId !== MOON_PARENT_BARYCENTER || mission.target?.ephemerisId !== MOON_PARENT_BARYCENTER) {
      return { ok: false, reason: `La misión incluye ${mission.moonName ?? 'un satélite'}: el Sistema Solar principal solo dibuja los satélites galileanos de la ventana de Horizons del cálculo, así que se reproduce en la escena del Centro de Misión.` };
    }
  }
  return { ok: true };
}

// Evalúo los desplazamientos de los satélites galileanos respecto al baricentro de Júpiter en `jdTdb`, omitiendo los que quedan fuera de cobertura.
export function moonSceneStates(execution, jdTdb) {
  const moons = execution?.kind === 'integrated' && execution.mission.moonId ? execution.data?.moons : null;
  if (!moons || moons.centerId !== MOON_PARENT_BARYCENTER) return {};
  const states = {};
  for (const key of MAIN_SCENE_MOONS) {
    if (!moons.coverage?.(key)) continue;
    const state = moons.stateAt(key, jdTdb);
    if (state?.status !== 'available') continue;
    const s = kmToScene(state.positionKm);
    // Devuelvo el desplazamiento en ejes eclípticos ya escalados porque `MoonVisuals` aplica la rotación de ejes al sumarlo al planeta padre.
    states[key] = Object.freeze({ positionSceneOffset: [s.x, -s.z, s.y], positionKm: state.positionKm, jdTdb, bodyId: state.id, centerId: moons.centerId });
  }
  return states;
}

// Identifico qué cuerpos ya vienen resueltos en la ventana propia de la ejecución (origen y destino) para no duplicarlos con el proveedor externo.
export function missionBodies(execution) {
  if (execution.kind === 'integrated') {
    const tgt = execution.mission.target;
    return { source: execution.data.helio, byPlanet: { '399': '399', [PLANET_OF_BARYCENTER[tgt.ephemerisId] ?? tgt.ephemerisId]: tgt.ephemerisId },
      destinationPlanetId: PLANET_OF_BARYCENTER[tgt.ephemerisId] ?? tgt.ephemerisId, destinationName: execution.mission.destinationName };
  }
  const r = execution.result;
  return { source: execution.window, byPlanet: { [r.originId]: r.originId, [r.destinationId]: r.destinationId },
    destinationPlanetId: PLANET_OF_BARYCENTER[r.destinationId] ?? r.destinationId, destinationName: r.destinationName };
}

export const missionStartJd = execution => execution.kind === 'integrated' ? execution.mission.departureJdTdb : execution.result.departureJdTdb;
export const missionTrajectory = execution => execution.kind === 'integrated' ? execution.contexts.helio.transfer.trajectory : execution.transfer.trajectory;

// Obtengo la posición heliocéntrica en km de la sonda para el segundo de misión indicado.
export function heliocentricProbePositionKm(execution, elapsedSeconds) {
  return execution.kind === 'integrated'
    ? sampleIntegratedExecution(execution, elapsedSeconds, 'helio').positionKm
    : sampleInterplanetaryExecution(execution, elapsedSeconds).positionKm;
}

// Convierto la trayectoria calculada en búferes tipados (`Float32Array` de vértices de escena y `Float64Array` de tiempos en segundos).
export function trajectoryToScene(execution) {
  const points = missionTrajectory(execution);
  const vertices = new Float32Array(points.length * 3), times = new Float64Array(points.length);
  points.forEach((point, i) => {
    const p = kmToScene(point.positionKm);
    vertices[i * 3] = p.x; vertices[i * 3 + 1] = p.y; vertices[i * 3 + 2] = p.z;
    times[i] = point.elapsedSeconds;
  });
  return { vertices, times };
}

// Creo el controlador que toma posesión temporal de la escena principal para reproducir una misión del laboratorio y la restaura al salir.
export function createSolarSystemMissionView({ scene, loadEphemeris, createModel = null, onRelease = () => {}, onModel = () => {} }) {
  let execution = null, prepared = null, token = 0, visible = false, controlling = false;
  let cameraMode = 'overview', elapsed = 0, previousScale = null, zoneProvider = null, lastError = null, modelStatus = null;
  let moonsShown = [], framedFocus = null;

  // Evalúo la posición de los ocho planetas en `jdTdb`, lanzando un error si falta cobertura para impedir extrapolaciones.
  function planetStates(jdTdb) {
    const states = {};
    for (const [name, planetId] of MAIN_SCENE_PLANETS) {
      const own = prepared.bodies.byPlanet[planetId];
      const state = own ? prepared.bodies.source.stateAt(own, jdTdb) : prepared.window.stateAt(planetId, jdTdb);
      if (state?.status !== 'available') throw new RangeError(`Efemérides de ${name} no disponibles en JD ${jdTdb.toFixed(5)} TDB: no se extrapola.`);
      states[name] = { posicionEscena: kmToScene(state.positionKm), jdTdb, bodyId: own ?? planetId };
    }
    return states;
  }

  // Determino si la cámara de destino debe encuadrar el satélite objetivo durante su fase o el planeta principal.
  function destinationFocus() {
    if (!prepared) return null;
    const ctx = execution.kind === 'integrated' ? autoContextAt(execution, elapsed) : 'helio';
    return prepared.moonKey && ctx === 'moon' && moonsShown.includes(prepared.moonKey) ? prepared.moonKey : prepared.destinationScene;
  }

  // Sincronizo planetas, satélites galileanos, posición y escala visual de la sonda, y el foco de cámara para el instante `elapsed`.
  function apply() {
    if (!controlling || !prepared) return;
    const jdTdb = prepared.startJd + elapsed / 86400;
    try {
      scene.actualizarPosiciones(planetStates(jdTdb), { reencuadrarVista: false });
      if (prepared.moonKey) {
        const moons = moonSceneStates(execution, jdTdb);
        moonsShown = Object.keys(moons);
        scene.actualizarLunas(moons, true);
      }
      scene.actualizarEstadoSonda(kmToScene(heliocentricProbePositionKm(execution, elapsed)), elapsed);
      const ctx = execution.kind === 'integrated' ? autoContextAt(execution, elapsed) : 'helio';
      scene.establecerFactorEscalaSonda(ctx === 'moon' ? NEAR_MOON_PROBE_SCALE : ctx !== 'helio' ? NEAR_BODY_PROBE_SCALE : 1);
      // Reencuadro automáticamente cuando la cámara de destino cambia entre la fase planetaria y la fase lunar.
      const focus = destinationFocus();
      if (cameraMode === 'destination' && focus !== framedFocus) { framedFocus = focus; if (focus) scene.encuadrarDestinoConSonda(focus); }
      lastError = null;
    } catch (error) { lastError = error.message; }
  }

  // Precalculo los discos de referencia estáticos (muestreo de trayectoria + recorrido orbital de origen y destino) para estabilizar la vista general.
  function overviewStaticBodies(trajectory, bodies, startJd, endJd) {
    const v = trajectory.vertices, n = v.length / 3, step = Math.max(1, Math.ceil(n / OVERVIEW_MAX_TRAJECTORY_POINTS)), list = [];
    for (let i = 0; i < n; i += step) list.push({ x: v[i * 3], y: v[i * 3 + 1], z: v[i * 3 + 2], radio: OVERVIEW_TRAJECTORY_RADIUS });
    if (n) list.push({ x: v[(n - 1) * 3], y: v[(n - 1) * 3 + 1], z: v[(n - 1) * 3 + 2], radio: OVERVIEW_TRAJECTORY_RADIUS });
    for (const ephemerisId of Object.values(bodies.byPlanet)) {
      for (let k = 0; k <= OVERVIEW_BODY_EPOCHS; k++) {
        const state = bodies.source.stateAt(ephemerisId, startJd + (endJd - startJd) * k / OVERVIEW_BODY_EPOCHS);
        if (state?.status === 'available') list.push({ ...kmToScene(state.positionKm), radio: OVERVIEW_BODY_RADIUS });
      }
    }
    return list;
  }

  // Añado la posición instantánea de la sonda a los discos fijos de la vista general para el cálculo del encuadre.
  function overviewBodies() {
    if (!prepared) return [];
    const probe = kmToScene(heliocentricProbePositionKm(execution, elapsed));
    return [...prepared.overview, { x: probe.x, y: probe.y, z: probe.z, radio: OVERVIEW_BODY_RADIUS }];
  }

  // Cambio entre vista general, seguimiento exterior de la sonda y encuadre del destino.
  function setCameraMode(mode) {
    if (!MAIN_SCENE_CAMERA_MODES.includes(mode)) return false;
    cameraMode = mode;
    if (!controlling || !prepared) return true;
    if (mode === 'exterior') scene.enfocarSonda();
    else if (mode === 'destination') { framedFocus = destinationFocus(); scene.encuadrarDestinoConSonda(framedFocus); }
    else scene.encuadrarConjuntoMision(overviewBodies);
    return true;
  }

  // Tomo el control de la escena principal: fuerzo escala 1:1, oculto las lunas de 2026, configuro sonda/trayectoria y precompilo shaders.
  function take() {
    if (controlling || !prepared) return;
    controlling = true;
    previousScale = scene.modoEscalaActual();
    // Uso radios científicos 1:1 para que la órbita de llegada no quede sepultada dentro de una esfera planetaria ampliada.
    if (previousScale !== SCIENTIFIC_SCALE) scene.establecerModoEscala(SCIENTIFIC_SCALE);
    // Limpio las lunas de exploración (2026) antes de dibujar las galileanas en la época de la misión.
    moonsShown = [];
    scene.actualizarLunas({}, false);
    scene.configurarSondaMision({ nombre: prepared.name, modelo: prepared.model?.object ?? null });
    scene.configurarTrayectoriaSonda(prepared.trajectory.vertices, prepared.trajectory.times);
    scene.establecerProveedorZonaEncuadre(zoneProvider);
    apply();
    scene.mostrarTrayectoriaSonda(true);
    setCameraMode(cameraMode);
    // Solicito compilación asíncrona de los shaders del modelo y las líneas para evitar bloqueos en el primer fotograma.
    scene.precompilarEscena?.();
  }

  // Libero el control de la escena principal, devuelvo escala y cámara a su estado previo y aviso a la aplicación para restaurar sus efemérides.
  function release() {
    if (!controlling) return;
    controlling = false;
    moonsShown = []; framedFocus = null;
    // Dejo las lunas vacías aquí; `onRelease` restaura las de exploración si corresponde.
    scene.actualizarLunas({}, false);
    scene.establecerProveedorZonaEncuadre(null);
    scene.establecerFactorEscalaSonda(1);
    scene.ocultarSonda();
    scene.configurarSondaMision({ nombre: 'Sonda', modelo: null });
    if (previousScale && previousScale !== scene.modoEscalaActual()) scene.establecerModoEscala(previousScale);
    previousScale = null;
    scene.vistaGeneral();
    onRelease();
  }

  // Descarto la misión cargada y libero los recursos WebGL del modelo 3D de la sonda.
  function discard() {
    release();
    prepared?.model?.dispose();
    prepared = null; execution = null; modelStatus = null; elapsed = 0;
  }

  return {
    cameraModes: MAIN_SCENE_CAMERA_MODES,
    supports: mainSceneSupport,
    // Preparo la misión cargando la ventana de efemérides de los planetas restantes, verificando extremos y creando el modelo 3D de la sonda.
    async prepare(next, { name } = {}) {
      discard();
      const current = ++token;
      const support = mainSceneSupport(next);
      if (!support.ok) return support;
      try {
        const startJd = missionStartJd(next), endJd = startJd + next.durationSeconds / 86400;
        const bodies = missionBodies(next);
        const others = MAIN_SCENE_PLANETS.map(([, id]) => id).filter(id => !bodies.byPlanet[id]);
        const ephemeris = await loadEphemeris();
        if (current !== token) return { ok: false, reason: 'superseded' };
        // Compruebo la cobertura únicamente de los planetas pedidos al proveedor externo; origen y destino se validan en ambos extremos con la ventana propia de la misión.
        for (const id of others) {
          const cov = ephemeris.coverage(id);
          if (!cov || cov.startJdTdb > startJd || cov.endJdTdb < endJd) {
            const label = MAIN_SCENE_PLANETS.find(([, planetId]) => planetId === (PLANET_OF_BARYCENTER[id] ?? id))?.[0] ?? id;
            return { ok: false, reason: `Las efemérides de ${label} no cubren toda la misión: el Sistema Solar principal no extrapola, así que se usa la escena del Centro de Misión.` };
          }
        }
        const window = await ephemeris.loadWindow(others, startJd, endJd);
        if (current !== token) return { ok: false, reason: 'superseded' };
        const destinationScene = MAIN_SCENE_PLANETS.find(([, id]) => id === bodies.destinationPlanetId)?.[0] ?? null;
        const design = next.design ?? null;
        const model = createModel && design ? createModel(design) : null;
        execution = next;
        const trajectory = trajectoryToScene(next);
        const moonKey = next.kind === 'integrated' ? MOON_WINDOW_KEYS[next.mission.moonId] ?? null : null;
        prepared = { startJd, endJd, bodies, window, destinationScene, trajectory, model, name: name ?? design?.name ?? 'Sonda',
          overview: overviewStaticBodies(trajectory, bodies, startJd, endJd), moonKey,
          moonCoverage: moonKey ? next.data.moons.coverage(moonKey) : null };
        // Verifico ambos extremos temporales antes de ocupar la escena para asegurar continuidad completa.
        planetStates(startJd); planetStates(endJd);
        modelStatus = model ? 'cargando' : design ? 'procedural' : 'sin-sonda';
        onModel(modelStatus);
        model?.ready.then(status => { if (prepared?.model === model) { modelStatus = status; onModel(status); } });
        elapsed = 0; cameraMode = 'overview';
        if (visible) take();
        return { ok: true };
      } catch (error) {
        if (current === token) discard();
        return { ok: false, reason: `No se pudo preparar el Sistema Solar principal: ${error.message}` };
      }
    },
    setTime(elapsedSeconds) { elapsed = elapsedSeconds; apply(); },
    // Devuelvo los datos del satélite galileano para el panel informativo en la época activa de la misión.
    moonInfoState(key) {
      if (!controlling || !prepared?.moonKey) return null;
      const jdTdb = prepared.startJd + elapsed / 86400, state = moonSceneStates(execution, jdTdb)[key];
      return state ? { distanceKm: Math.hypot(...state.positionKm), jdTdb, status: 'Horizons · ventana de la misión, distancia al baricentro del sistema de Júpiter (5)' } : null;
    },
    setVisible(value) { visible = Boolean(value); if (visible) take(); else release(); },
    setCameraMode,
    // Recalculo el encuadre de vista general cuando cambia el área libre del lienzo.
    reframe() { if (controlling && prepared && cameraMode === 'overview') scene.encuadrarConjuntoMision(overviewBodies); },
    getCameraMode: () => cameraMode,
    setFrameZoneProvider(fn) { zoneProvider = typeof fn === 'function' ? fn : null; if (controlling) scene.establecerProveedorZonaEncuadre(zoneProvider); },
    setMainSceneOccluded(occluded) { scene.establecerRenderPausado?.(Boolean(occluded), 'laboratorio'); },
    clear() { ++token; discard(); },
    isControlling: () => controlling,
    getState: () => Object.freeze({ ready: Boolean(prepared), controlling, kind: execution?.kind ?? null, probeName: prepared?.name ?? null,
      model: modelStatus, cameraMode, elapsedSeconds: elapsed, jdTdb: prepared ? prepared.startJd + elapsed / 86400 : null,
      destination: prepared?.destinationScene ?? null, destinationBodyId: prepared ? prepared.bodies.byPlanet[prepared.bodies.destinationPlanetId] : null,
      moon: prepared?.moonKey ?? null, moonCoverage: prepared?.moonCoverage ?? null, moonsShown: [...moonsShown],
      cameraFocus: cameraMode === 'destination' ? framedFocus : null,
      trajectoryPoints: prepared?.trajectory.times.length ?? 0, error: lastError }),
    dispose() { ++token; discard(); }
  };
}
