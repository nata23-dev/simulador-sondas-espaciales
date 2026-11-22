// 17.1 — Reproducción de la misión planificada en el Sistema Solar principal.
//
// Adaptador entre el Centro de Misión del laboratorio (reloj, paneles, eventos y telemetría) y la escena principal
// (SolarSystem.js). No calcula física ni inventa estados:
//   · la sonda toma, en cada instante, el estado heliocéntrico que ya calculó la misión (Kepler exacto en tramos balísticos,
//     nudos DOPRI54 con Hermite en encendidos), convertido al marco del Sol con las mismas efemérides y la misma época TDB;
//   · los ocho planetas se colocan con las efemérides interplanetarias (ICRF eclíptico J2000, centro del Sol, TDB) en esa
//     misma época. La Tierra y el destino usan exactamente la ventana del cálculo; en los planetas exteriores el destino es el
//     baricentro del sistema, igual que en el cálculo, para que la órbita de llegada quede centrada en el cuerpo dibujado;
//   · si algún planeta no tiene cobertura en todo el intervalo de la misión, la escena principal no se usa (no se extrapola);
//   · 23: en las misiones con un satélite galileano (C1/C2), Ío, Europa, Ganímedes y Calisto se dibujan con la misma ventana de
//     Horizons que usó el cálculo (centro: baricentro del sistema de Júpiter, el mismo punto en el que se dibuja Júpiter), solo
//     dentro de su cobertura: fuera de ella no se dibujan.
// Ejes y escala: los de la escena principal, (x,y,z) → (x,z,-y) y 32 unidades por AU (physicalPositionKmToScene).
import { physicalPositionKmToScene } from './ProbeVisualAdapter.js';
import { sampleIntegratedExecution, autoContextAt } from '../lab/IntegratedMissionPlayback.js';
import { MOON_WINDOW_KEYS } from '../lab/IntegratedMission.js';
import { sampleInterplanetaryExecution } from '../lab/InterplanetaryPlayback.js';

export const MAIN_SCENE_CAMERA_MODES = Object.freeze(['overview', 'exterior', 'destination']);
// Cuerpos de la escena principal y su identificador de efemérides (centro del planeta).
export const MAIN_SCENE_PLANETS = Object.freeze([['Mercurio', '199'], ['Venus', '299'], ['Tierra', '399'], ['Marte', '499'],
  ['Jupiter', '599'], ['Saturno', '699'], ['Urano', '799'], ['Neptuno', '899']]);
const PLANET_OF_BARYCENTER = Object.freeze({ '5': '599', '6': '699', '7': '799', '8': '899' });
// Vista general: radios de los discos que deben quedar en el cuadro (unidades de escena; 32 = 1 AU). Solo encuadre.
// Los planetas siguen moviéndose durante la reproducción: la Tierra y el destino entran con su recorrido en toda la misión.
const OVERVIEW_TRAJECTORY_RADIUS = 0.05, OVERVIEW_BODY_RADIUS = 0.35, OVERVIEW_MAX_TRAJECTORY_POINTS = 96, OVERVIEW_BODY_EPOCHS = 24;
// Cerca del destino (tramos planetocéntricos) la nave ampliada se reduce para no tapar el planeta, que está a escala 1:1.
export const NEAR_BODY_PROBE_SCALE = 0.1;
// 23: cerca del satélite (radio de Europa ≈ 1 561 km, sobrevuelo a ≈ 100 km) la nave se reduce más: sin enfocar mide unas decenas
// de km y no atraviesa la superficie dibujada; enfocada sigue por encima del plano cercano de la cámara (4·10⁻⁵ unidades).
export const NEAR_MOON_PROBE_SCALE = 0.03;
// Satélites de la ventana galileana: clave de la ventana = clave de la escena (MoonVisuals). Centro de la ventana: baricentro 5.
export const MAIN_SCENE_MOONS = Object.freeze(Object.values(MOON_WINDOW_KEYS));
const MOON_PARENT_BARYCENTER = '5';
const SCIENTIFIC_SCALE = 'cientifica';
// Las efemérides y los tramos dan [x, y, z] en km; la conversión de ejes de la escena espera { x, y, z }.
export const kmToScene = p => physicalPositionKmToScene(Array.isArray(p) ? { x: p[0], y: p[1], z: p[2] } : p);

/**
 * ¿Puede reproducirse esta ejecución en el Sistema Solar principal? Las geocéntricas y los descensos no. Las de un satélite
 * galileano sí (23), si traen la ventana de satélites del cálculo centrada en el baricentro de Júpiter.
 */
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

/**
 * 23: estados de los satélites galileanos para la escena principal en el instante `jdTdb` (TDB), con la ventana de la misión.
 * Devuelve { Clave: { positionSceneOffset, positionKm, jdTdb, bodyId, centerId } } solo con los disponibles: fuera de la
 * cobertura de la ventana un satélite no aparece (no se extrapola). `positionSceneOffset` va en los ejes eclípticos y la escala de
 * la escena (la conversión de ejes la hace MoonVisuals al sumarlo al cuerpo padre, como en exploración).
 */
export function moonSceneStates(execution, jdTdb) {
  const moons = execution?.kind === 'integrated' && execution.mission.moonId ? execution.data?.moons : null;
  if (!moons || moons.centerId !== MOON_PARENT_BARYCENTER) return {};
  const states = {};
  for (const key of MAIN_SCENE_MOONS) {
    if (!moons.coverage?.(key)) continue;
    const state = moons.stateAt(key, jdTdb);
    if (state?.status !== 'available') continue;
    const s = kmToScene(state.positionKm);
    states[key] = Object.freeze({ positionSceneOffset: [s.x, -s.z, s.y], positionKm: state.positionKm, jdTdb, bodyId: state.id, centerId: moons.centerId });
  }
  return states;
}

/** Identificadores de efemérides que usa la ejecución para la Tierra/origen y el destino (los demás se cargan aparte). */
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

/** Posición heliocéntrica (km) de la sonda en el instante de misión, siempre en el marco del Sol. */
export function heliocentricProbePositionKm(execution, elapsedSeconds) {
  return execution.kind === 'integrated'
    ? sampleIntegratedExecution(execution, elapsedSeconds, 'helio').positionKm
    : sampleInterplanetaryExecution(execution, elapsedSeconds).positionKm;
}

/** Vértices (Float32, escena principal) y tiempos (Float64, s de misión) de la trayectoria calculada. */
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

/**
 * `scene`: API de createSolarSystem. `loadEphemeris()`: proveedor de efemérides interplanetarias (createInterplanetaryEphemeris).
 * `createModel(design)`: modelo 3D de la sonda ({ object, ready, dispose }). `onRelease()`: la aplicación restaura su escena.
 */
export function createSolarSystemMissionView({ scene, loadEphemeris, createModel = null, onRelease = () => {}, onModel = () => {} }) {
  let execution = null, prepared = null, token = 0, visible = false, controlling = false;
  let cameraMode = 'overview', elapsed = 0, previousScale = null, zoneProvider = null, lastError = null, modelStatus = null;
  let moonsShown = [], framedFocus = null;

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

  /** Cuerpo que encuadra la cámara de destino: el satélite durante su fase (23) o el planeta de destino. */
  function destinationFocus() {
    if (!prepared) return null;
    const ctx = execution.kind === 'integrated' ? autoContextAt(execution, elapsed) : 'helio';
    return prepared.moonKey && ctx === 'moon' && moonsShown.includes(prepared.moonKey) ? prepared.moonKey : prepared.destinationScene;
  }

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
      // La cámara de destino pasa del planeta al satélite (y vuelve) al cambiar de fase.
      const focus = destinationFocus();
      if (cameraMode === 'destination' && focus !== framedFocus) { framedFocus = focus; if (focus) scene.encuadrarDestinoConSonda(focus); }
      lastError = null;
    } catch (error) { lastError = error.message; }
  }

  /**
   * Discos fijos de la vista general (unidades de escena): la trayectoria calculada (muestreada) y el recorrido de la Tierra y
   * del destino durante la misión, con los mismos estados que la reproducción. Así el encuadre sigue valiendo mientras avanza.
   */
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

  /** Discos de la vista general: los fijos de la misión y la sonda en su posición actual. */
  function overviewBodies() {
    if (!prepared) return [];
    const probe = kmToScene(heliocentricProbePositionKm(execution, elapsed));
    return [...prepared.overview, { x: probe.x, y: probe.y, z: probe.z, radio: OVERVIEW_BODY_RADIUS }];
  }

  function setCameraMode(mode) {
    if (!MAIN_SCENE_CAMERA_MODES.includes(mode)) return false;
    cameraMode = mode;
    if (!controlling || !prepared) return true;
    if (mode === 'exterior') scene.enfocarSonda();
    else if (mode === 'destination') { framedFocus = destinationFocus(); scene.encuadrarDestinoConSonda(framedFocus); }
    else scene.encuadrarConjuntoMision(overviewBodies);
    return true;
  }

  function take() {
    if (controlling || !prepared) return;
    controlling = true;
    previousScale = scene.modoEscalaActual();
    // Escala 1:1 de radios: con planetas ampliados la órbita de llegada quedaría dentro de la esfera del destino.
    if (previousScale !== SCIENTIFIC_SCALE) scene.establecerModoEscala(SCIENTIFIC_SCALE);
    // Las lunas de exploración (2026) no valen para la época de la misión: se ocultan; las galileanas de la misión las pone apply().
    moonsShown = [];
    scene.actualizarLunas({}, false);
    scene.configurarSondaMision({ nombre: prepared.name, modelo: prepared.model?.object ?? null });
    scene.configurarTrayectoriaSonda(prepared.trajectory.vertices, prepared.trajectory.times);
    scene.establecerProveedorZonaEncuadre(zoneProvider);
    apply();
    scene.mostrarTrayectoriaSonda(true);
    setCameraMode(cameraMode);
    // 26: el modelo de la sonda y las líneas de la misión se compilan en paralelo antes de dibujarse (sin bloquear la página).
    scene.precompilarEscena?.();
  }

  function release() {
    if (!controlling) return;
    controlling = false;
    moonsShown = []; framedFocus = null;
    scene.actualizarLunas({}, false); // la aplicación restaura las suyas (onRelease)
    scene.establecerProveedorZonaEncuadre(null);
    scene.establecerFactorEscalaSonda(1);
    scene.ocultarSonda();
    scene.configurarSondaMision({ nombre: 'Sonda', modelo: null });
    if (previousScale && previousScale !== scene.modoEscalaActual()) scene.establecerModoEscala(previousScale);
    previousScale = null;
    scene.vistaGeneral();
    onRelease();
  }

  function discard() {
    release();
    prepared?.model?.dispose();
    prepared = null; execution = null; modelStatus = null; elapsed = 0;
  }

  return {
    cameraModes: MAIN_SCENE_CAMERA_MODES,
    supports: mainSceneSupport,
    /** Carga la ventana de efemérides de los ocho planetas y el modelo. Devuelve { ok, reason }. */
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
        // 23: solo los planetas que se cargan de este proveedor. La Tierra y el destino vienen de la ventana del cálculo (en los
        // planetas exteriores, el baricentro del sistema, que este proveedor no tiene); su cobertura en todo el intervalo la
        // comprueba planetStates() en los dos extremos, con esa misma ventana continua.
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
        planetStates(startJd); planetStates(endJd); // comprobación de extremos antes de ocupar la escena
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
    /** 23: estado de un satélite para la ficha de la escena, en la época de la misión (null si no se dibuja). */
    moonInfoState(key) {
      if (!controlling || !prepared?.moonKey) return null;
      const jdTdb = prepared.startJd + elapsed / 86400, state = moonSceneStates(execution, jdTdb)[key];
      return state ? { distanceKm: Math.hypot(...state.positionKm), jdTdb, status: 'Horizons · ventana de la misión, distancia al baricentro del sistema de Júpiter (5)' } : null;
    },
    setVisible(value) { visible = Boolean(value); if (visible) take(); else release(); },
    setCameraMode,
    /** La ventana de la escena cambió de tamaño (vista inmersiva, panel oculto, ventana): la vista general se recalcula. */
    reframe() { if (controlling && prepared && cameraMode === 'overview') scene.encuadrarConjuntoMision(overviewBodies); },
    getCameraMode: () => cameraMode,
    setFrameZoneProvider(fn) { zoneProvider = typeof fn === 'function' ? fn : null; if (controlling) scene.establecerProveedorZonaEncuadre(zoneProvider); },
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
