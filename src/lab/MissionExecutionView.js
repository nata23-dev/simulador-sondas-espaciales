// Aquí creo la vista 3D en Three.js del Centro de Misión para reproducir lanzamientos, transferencias lunares,
// cruceros heliocéntricos y descensos locales. Recibo estados físicos ya calculados en km y km/s y solo gestiono
// su representación visual, las cámaras, las estelas y el modelo 3D de la sonda sin alterar ningún dato científico.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createProbeAssemblyModel, disposeProbeAssemblyModel } from './ProbeAssemblyView.js';
import { registerRenderer, opcionesRenderizador } from '../graphics/QualityProfile.js';
import { crearRenderizadorWebGL } from '../graphics/WebGLSupport.js';
import { attachNasaModel, localBounds } from '../graphics/NasaProbeModels.js';

const SCENE_SCALE = 1 / 10000;
export const CENTRAL_BODY_SCENE_RADIUS = 0.63710084; // Radio de la esfera central en unidades de escena (Tierra con 1 u = 10 000 km).
// Ajusto la escala (unidades de escena por km) según cada ejecución: 1/10 000 para Tierra–Luna o la escala propia de un descenso local.
let sceneScale = SCENE_SCALE;
const scenePoint = position => new THREE.Vector3(position[0] * sceneScale, position[2] * sceneScale, -position[1] * sceneScale);
const scaleOf = execution => execution?.transfer?.sceneScale ?? SCENE_SCALE;
const sceneVelocity = velocity => new THREE.Vector3(velocity[0], velocity[2], -velocity[1]).normalize();
export const MISSION_CAMERA_MODES = Object.freeze(['overview', 'exterior', 'onboard', 'destination', 'cinematic', 'local']);
// Calculo un factor puramente ilustrativo para escalar marcadores en escenas heliocéntricas (≈1/10 del radio encuadrado)
// o respetar un `markerScale` personalizado del contexto; los centros geométricos mantienen intacta su posición científica.
export const heliocentricMarkerScale = execution => execution?.transfer?.markerScale ?? (execution?.transfer?.heliocentric ? Math.max(1, (execution.transfer.overviewRadiusScene ?? 40) / 10) : 1);

// Calculo la geometría de encuadre de la cámara local cercana al vehículo sin modificar las posiciones científicas en km.
// Mantengo el horizonte alineado con la vertical local (`up`) y calculo una distancia proporcional a 0,0002·R + 0,45·altitud
// para enfocar exactamente la sonda y evitar retardos de suavizado tras saltos temporales.
export function localCameraGeometry(sample, execution) {
  sceneScale = scaleOf(execution);
  const radiusScene = execution?.transfer?.bodyRadiusKm ? execution.transfer.bodyRadiusKm * scaleOf(execution) : CENTRAL_BODY_SCENE_RADIUS;
  const position = sample ? scenePoint(sample.positionKm) : new THREE.Vector3(radiusScene, 0, 0);
  const up = position.clone().normalize();
  if (!Number.isFinite(up.x)) up.set(0, 1, 0);
  const altitude = Math.max(0, position.length() - radiusScene);
  const distance = Math.min(0.5 * radiusScene, 0.0002 * radiusScene + 0.45 * altitude);
  let side = new THREE.Vector3().crossVectors(up, new THREE.Vector3(0, 1, 0));
  if (side.lengthSq() < 1e-9) side = new THREE.Vector3(1, 0, 0);
  side.normalize();
  return { position, up, side, distance, radiusScene, altitude, modelScale: distance / 15 };
}
// Uso 6 m como altura visual típica de referencia del modelo del Hangar solo para centrar el punto de mira en cámara local.
const LOCAL_MODEL_HEIGHT_M = 6;
/** Calculo el punto exacto sobre el radio R bajo el vehículo (sin error de teselado) para apoyar el parche de suelo local. */
export function localGroundPoint(sample, execution) {
  const g = localCameraGeometry(sample, execution);
  return g.up.clone().multiplyScalar(g.radiusScene);
}
// Determino la posición, el objetivo y el vector vertical de la cámara según el modo activo y el instante muestreado.
export function missionCameraPose(cameraMode, sample, execution, { lookTarget = 'moon', aspect = 1, fov = 46 } = {}) {
  if (!MISSION_CAMERA_MODES.includes(cameraMode)) throw Error('Cámara de misión desconocida.');
  sceneScale = scaleOf(execution);
  if (cameraMode === 'local') {
    const g = localCameraGeometry(sample, execution);
    const target = execution?.kind === 'landing' ? g.position.clone().addScaledVector(g.up, 0.5 * LOCAL_MODEL_HEIGHT_M * g.modelScale) : g.position.clone();
    return { position: target.clone().addScaledVector(g.side, g.distance).addScaledVector(g.up, 0.3 * g.distance), target, up: g.up.clone() };
  }
  const position = sample ? scenePoint(sample.positionKm) : new THREE.Vector3();
  const moonPosition = sample ? scenePoint(sample.moonPositionKm) : new THREE.Vector3(36, 0, 0);
  const direction = sample ? sceneVelocity(sample.velocityKmS) : new THREE.Vector3(1, 0, 0);
  if (cameraMode === 'overview' && execution?.transfer?.heliocentric) {
    // En escenas heliocéntricas centro la vista general en el Sol para abarcar la transferencia y las órbitas planetarias.
    const radius = execution.transfer.overviewRadiusScene ?? 40;
    const distance = radius * 1.15 / (Math.tan(THREE.MathUtils.degToRad(fov / 2)) * Math.min(1, Math.max(0.1, aspect)));
    return { position: new THREE.Vector3(0, 0.93 * distance, 0.38 * distance), target: new THREE.Vector3() };
  }
  if (cameraMode === 'overview') {
    const destination = execution ? scenePoint(execution.transfer.moonArrivalPositionKm) : moonPosition;
    const target = destination.clone().multiplyScalar(0.5);
    const distance = Math.max(execution?.transfer?.overviewMinDistance ?? 53, (destination.length() * 0.58 + 3)
      / (Math.tan(THREE.MathUtils.degToRad(fov / 2)) * Math.max(0.1, aspect)));
    return { position: target.clone().add(new THREE.Vector3(0, 0.42 * distance, distance)), target };
  }
  if (cameraMode === 'exterior') return { position: position.clone().add(new THREE.Vector3(0, 1.7, 3.4)), target: position };
  if (cameraMode === 'onboard') {
    // En escenas heliocéntricas el origen es el Sol, así que al mirar a la Tierra apunto a la posición efemérica de origen.
    const target = lookTarget === 'earth' ? (sample?.originPositionKm ? scenePoint(sample.originPositionKm) : new THREE.Vector3(0, 0, 0))
      : lookTarget === 'velocity' ? position.clone().add(direction) : moonPosition;
    return { position, target };
  }
  if (cameraMode === 'destination') return {
    position: moonPosition.clone().add(new THREE.Vector3(0, 2.4, 6).multiplyScalar(heliocentricMarkerScale(execution))),
    target: moonPosition.clone().add(position.sub(moonPosition).multiplyScalar(0.15))
  };
  return { position: position.clone().add(direction.clone().multiplyScalar(-4)).add(new THREE.Vector3(0, 2, 0)),
    target: position.clone().add(direction.multiplyScalar(1.3)) };
}

// Genero un fondo estelar determinista sobre una esfera lejana para dar referencia espacial al rotar la cámara.
function stars() {
  const values = new Float32Array(600 * 3);
  let seed = 0x12c2026;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < values.length; i += 3) {
    const theta = random() * Math.PI * 2, z = random() * 2 - 1, r = Math.sqrt(1 - z * z) * 120;
    values[i] = Math.cos(theta) * r; values[i + 1] = Math.sin(theta) * r; values[i + 2] = z * 120;
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(values, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#9eb4d4', size: 0.08, sizeAttenuation: true, transparent: true, opacity: 0.55 }));
}

// Creo y gestiono la escena Three.js interactiva del Centro de Misión dentro del contenedor DOM indicado.
export function createMissionExecutionView(host, { onModel = null } = {}) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#050a13');
  const camera = new THREE.PerspectiveCamera(46, 1, 0.005, 300);
  camera.position.set(0, 22, 53);
  const renderer = crearRenderizadorWebGL(opcionesRenderizador({ antialias: true }), 'Centro de Misión');
  const unregisterQuality = registerRenderer(renderer);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.append(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 1.4; controls.maxDistance = 160;
  controls.target.set(18, 0, 0); controls.update();
  scene.add(new THREE.AmbientLight('#9aaed0', 1.3));
  const sun = new THREE.DirectionalLight('#fff0ce', 2.25); sun.position.set(-18, 17, 20); scene.add(sun);
  const starField = stars(); scene.add(starField);
  const earth = new THREE.Mesh(new THREE.SphereGeometry(0.63710084, 96, 64), new THREE.MeshStandardMaterial({ color: '#245c92', roughness: 0.8 }));
  scene.add(earth);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(0.17374, 30, 22), new THREE.MeshStandardMaterial({ color: '#bfc4c9', roughness: 1 }));
  scene.add(moon);
  // Preparo el marcador visual del planeta de origen para escenas heliocéntricas (centro efemérico, tamaño ilustrativo).
  const originMarker = new THREE.Mesh(new THREE.SphereGeometry(0.17374, 24, 18), new THREE.MeshStandardMaterial({ color: '#3f7cc0', roughness: 0.9 }));
  originMarker.visible = false; scene.add(originMarker);
  // Añado un parche de suelo tangente en |r| = R exacto para la cámara local, evitando que el teselado de la esfera
  // central deje un hueco visual entre el vehículo y la superficie durante un aterrizaje.
  const groundPatch = new THREE.Mesh(new THREE.CircleGeometry(1, 72), new THREE.MeshStandardMaterial({ color: '#9c9fa4', roughness: 1, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  groundPatch.visible = false; scene.add(groundPatch);
  const contactRing = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({ color: '#e4ba78', side: THREE.DoubleSide, transparent: true, opacity: 0.85,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  contactRing.visible = false; scene.add(contactRing);
  let modelBaseOffset = 0, markerScale = 1, visualFactor = 1;
  // Normalizo la escala visual del modelo 3D a una envolvente manejable (~3,6 m) y mido su base (+Y) para apoyarlo al aterrizar.
  function fitProbeModel(model) {
    visualFactor = Math.min(1, 3.6 / (model.userData.boundingRadiusM || 3.6));
    model.scale.setScalar(0.25 * visualFactor); // Convierto metros del Hangar a unidades ilustrativas solo para visualización.
    const box = localBounds(model);
    modelBaseOffset = box.isEmpty() ? 0 : -box.min.y;
    if (!Number.isFinite(modelBaseOffset) || modelBaseOffset < 0) modelBaseOffset = 0;
  }
  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), new THREE.MeshBasicMaterial({ color: '#88d5ef' }));
  scene.add(marker);
  const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 0.85, '#8acde7', 0.28, 0.16);
  scene.add(arrow);
  const pathGroup = new THREE.Group(); scene.add(pathGroup);
  let probeAssembly = null, execution = null, sample = null, points = null;
  let visited = null, pending = null;
  let mode = 'overview', lookTarget = 'moon', visible = false, disposed = false, touchEnabled = false;
  let frame = null, transition = null, framingPending = false;
  const coarse = window.matchMedia('(pointer: coarse)').matches;

  // Libero geometrías y materiales de un subárbol Three.js y lo retiro de la escena.
  function disposeObject(object) {
    const geometries = new Set(), materials = new Set();
    object.traverse(node => {
      if (node.geometry) geometries.add(node.geometry);
      for (const item of Array.isArray(node.material) ? node.material : [node.material]) if (item) materials.add(item);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    object.parent?.remove(object);
  }
  // Limpio la trayectoria, el modelo de sonda y los parámetros de escala previos antes de cargar otra ejecución.
  function clearPlan() {
    for (const child of [...pathGroup.children]) disposeObject(child);
    if (probeAssembly) disposeProbeAssemblyModel(probeAssembly);
    probeAssembly = null; lastPlacement = null; execution = null; sample = null; points = null; visited = null; pending = null;
    marker.visible = false; arrow.visible = false; moon.visible = false; originMarker.visible = false; groundPatch.visible = false; contactRing.visible = false;
    camera.far = 300; camera.updateProjectionMatrix(); controls.maxDistance = 160; controls.minDistance = 1.4; starField.scale.setScalar(1);
    markerScale = 1; for (const item of [moon, marker, arrow, originMarker]) item.scale.setScalar(1);
  }
  // Adapto el tamaño, color y emisividad de la esfera central (Tierra, Sol, Luna o cuerpo local) a la ejecución activa.
  function applyBody(next) {
    sceneScale = scaleOf(next);
    const body = next?.transfer?.centralBody;
    const visual = next?.transfer?.centralBodyVisualRadius;
    // Si la escena define un radio visual explícito (como el Sol heliocéntrico), lo aplico solo con fines ilustrativos.
    earth.scale.setScalar(visual ? visual * markerScale / CENTRAL_BODY_SCENE_RADIUS : next?.transfer?.bodyRadiusKm ? next.transfer.bodyRadiusKm * sceneScale / CENTRAL_BODY_SCENE_RADIUS : 1);
    earth.material.color.set(body?.color ?? '#245c92');
    earth.material.emissive.set(body?.emissive ? body.color : '#000000'); earth.material.emissiveIntensity = body?.emissive ? 0.9 : 1;
    groundPatch.material.color.set(body?.color ?? '#9c9fa4');
  }
  // Cargo una nueva ejecución en la vista 3D; si `keepCamera` es cierto, conservo el modo de cámara compatible.
  function setExecution(next, { keepCamera = false } = {}) {
    const previousMode = mode;
    clearPlan();
    if (!next) return;
    execution = next;
    const helio = Boolean(next.transfer.heliocentric);
    markerScale = heliocentricMarkerScale(next);
    applyBody(next);
    if (helio) {
      camera.far = next.transfer.cameraFar ?? 300; camera.updateProjectionMatrix();
      controls.maxDistance = camera.far * 0.8; starField.scale.setScalar(camera.far / 150);
      for (const item of [moon, marker, arrow, originMarker]) item.scale.setScalar(markerScale);
      moon.material.color.set(next.transfer.destinationColor ?? '#bfc4c9'); originMarker.material.color.set(next.transfer.originColor ?? '#3f7cc0');
    } else moon.material.color.set('#bfc4c9');
    points = next.transfer.trajectory.map(point => scenePoint(point.positionKm));
    const moonTrack = new THREE.Line(new THREE.BufferGeometry().setFromPoints(next.transfer.trajectory.map(point => scenePoint(point.moonPositionKm))),
      new THREE.LineDashedMaterial({ color: '#849ab6', dashSize: 0.5 * markerScale, gapSize: 0.3 * markerScale, transparent: true, opacity: 0.5 }));
    moonTrack.computeLineDistances(); pathGroup.add(moonTrack);
    if (next.transfer.showOrigin) {
      // Trazo la trayectoria efemérica del planeta de origen durante la transferencia para contextualizar el despegue.
      const originTrack = new THREE.Line(new THREE.BufferGeometry().setFromPoints(next.transfer.trajectory.map(point => scenePoint(point.originPositionKm))),
        new THREE.LineDashedMaterial({ color: '#6f95c4', dashSize: 0.5 * markerScale, gapSize: 0.3 * markerScale, transparent: true, opacity: 0.45 }));
      originTrack.computeLineDistances(); pathGroup.add(originTrack);
      originMarker.visible = true;
    }
    const visitedGeometry = new THREE.BufferGeometry();
    visitedGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((points.length + 1) * 3), 3));
    visited = new THREE.Line(visitedGeometry, new THREE.LineBasicMaterial({ color: '#d8b678', linewidth: 1 }));
    visited.frustumCulled = false;
    pathGroup.add(visited);
    const pendingGeometry = new THREE.BufferGeometry();
    pendingGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((points.length + 1) * 3), 3));
    pending = new THREE.Line(pendingGeometry, new THREE.LineBasicMaterial({ color: '#55758f', transparent: true, opacity: 0.58 }));
    pending.frustumCulled = false;
    pathGroup.add(pending);
    const departure = new THREE.Mesh(new THREE.SphereGeometry(0.19 * markerScale, 12, 10), new THREE.MeshBasicMaterial({ color: '#8ad0ea' }));
    departure.position.copy(scenePoint(next.transfer.initialPositionKm)); pathGroup.add(departure);
    const arrival = new THREE.Mesh(new THREE.SphereGeometry(0.21 * markerScale, 12, 10), new THREE.MeshBasicMaterial({ color: '#e4ba78' }));
    arrival.position.copy(scenePoint(next.transfer.arrivalPositionKm)); pathGroup.add(arrival);
    if (next.transfer.target === 'flyby') {
      const closest = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), new THREE.MeshBasicMaterial({ color: '#d8a4ea' }));
      closest.position.copy(scenePoint(next.transfer.closestApproach.positionKm)); pathGroup.add(closest);
    }
    probeAssembly = createProbeAssemblyModel(next.design);
    fitProbeModel(probeAssembly);
    scene.add(probeAssembly);
    // Monto primero el ensamblaje procedimental y, para sondas históricas no experimentales, lo sustituyo por el modelo oficial de NASA al cargarse.
    const mounted = probeAssembly;
    // Para un ensamblaje experimental mantengo la reconstrucción modular porque el modelo cerrado de NASA no refleja los cambios.
    const modelCore = next.design?.experimental ? null : next.design?.coreId;
    const report = status => onModel?.({ status, designName: next.design?.name ?? null, coreId: next.design?.coreId ?? null,
      probeId: next.design?.basedOn ?? null, experimental: Boolean(next.design?.experimental) });
    report(modelCore ? 'cargando' : next.design ? 'procedural' : 'sin-sonda');
    attachNasaModel(mounted, modelCore, { isCurrent: () => probeAssembly === mounted }).then(result => {
      if (probeAssembly !== mounted) return;
      if (modelCore) report(result.status === 'nasa' ? 'nasa' : 'procedural');
      if (result.status !== 'nasa') return;
      fitProbeModel(mounted);
      if (lastPlacement) placeProbe(...lastPlacement); // Recoloco la sonda con su nueva escala incluso si la reproducción está pausada.
      else mounted.scale.setScalar(0.25 * visualFactor);
    });
    marker.visible = true; moon.visible = !next.transfer.hideMoon;
    if (next.transfer.minDistance) controls.minDistance = next.transfer.minDistance;
    setCameraMode(keepCamera && (previousMode !== 'local' || next.kind === 'landing') ? previousMode : 'overview', { instant: true });
    framingPending = true;
  }
  // Relleno un buffer de vértices de línea con un rango de nudos y el punto exacto de la sonda en el instante actual.
  function refillLine(attribute, first, last, current, insertIndex) {
    const array = attribute.array;
    for (let i = first; i <= last; i++) {
      const point = points[i];
      const offset = i * 3;
      array[offset] = point.x; array[offset + 1] = point.y; array[offset + 2] = point.z;
    }
    if (insertIndex != null) {
      const offset = insertIndex * 3;
      array[offset] = current.x; array[offset + 1] = current.y; array[offset + 2] = current.z;
    }
    attribute.needsUpdate = true;
  }
  // Separo visualmente la estela en tramo ya recorrido (dorado) y tramo pendiente (azulado) alrededor de la posición actual.
  function updateTrail(current, segmentIndex, beforeManeuver) {
    if (!visited || !pending) return;
    const last = points.length - 1;
    if (beforeManeuver) {
      visited.geometry.setDrawRange(0, 0);
      refillLine(pending.geometry.attributes.position, 0, last, current, null);
      pending.geometry.setDrawRange(0, points.length); return;
    }
    const index = Math.min(last - 1, Math.max(0, segmentIndex));
    refillLine(visited.geometry.attributes.position, 0, index, current, index + 1);
    visited.geometry.setDrawRange(0, index + 2);
    refillLine(pending.geometry.attributes.position, index + 1, last, current, index);
    pending.geometry.setDrawRange(index, last - index + 1);
    if (sample?.elapsedSeconds >= execution.durationSeconds) pending.geometry.setDrawRange(0, 0);
  }
  function desiredPose(cameraMode) { return missionCameraPose(cameraMode, sample, execution,
    { lookTarget, aspect: camera.aspect, fov: camera.fov }); }
  // Coloco y oriento el modelo 3D de la sonda de forma puramente visual: en la cámara local de un descenso
  // lo alineo con la vertical y lo apoyo por su base sobre |r| = R; en el resto de vistas alineo +Y con la velocidad.
  let lastPlacement = null;
  function placeProbe(shipPosition, direction) {
    if (!probeAssembly) return;
    lastPlacement = [shipPosition.clone(), direction.clone()];
    const local = mode === 'local' && sample;
    const anchored = local && execution?.kind === 'landing';
    groundPatch.visible = false; contactRing.visible = false;
    if (!local) {
      probeAssembly.position.copy(shipPosition);
      probeAssembly.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
      probeAssembly.scale.setScalar(0.25 * visualFactor); return;
    }
    const g = localCameraGeometry(sample, execution);
    probeAssembly.scale.setScalar(g.modelScale * visualFactor);
    if (anchored) {
      probeAssembly.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), g.up);
      probeAssembly.position.copy(shipPosition).addScaledVector(g.up, modelBaseOffset * g.modelScale * visualFactor);
    } else {
      probeAssembly.position.copy(shipPosition);
      probeAssembly.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    }
    if (g.altitude < 0.05 * g.radiusScene) {
      const ground = g.up.clone().multiplyScalar(g.radiusScene);
      const normalRotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), g.up);
      groundPatch.position.copy(ground); groundPatch.quaternion.copy(normalRotation);
      groundPatch.scale.setScalar(Math.min(200 * g.distance, 0.03 * g.radiusScene)); groundPatch.visible = true;
      if (anchored) { contactRing.position.copy(ground); contactRing.quaternion.copy(normalRotation); contactRing.scale.setScalar(0.5 * LOCAL_MODEL_HEIGHT_M * g.modelScale); contactRing.visible = true; }
    }
  }
  // Actualizo posiciones de nave, cuerpos y estela con la muestra correspondiente al instante actual de reproducción.
  function setSample(next, { beforeManeuver = false } = {}) {
    if (!execution || !next) return;
    sample = next;
    const shipPosition = scenePoint(next.positionKm);
    marker.position.copy(shipPosition); moon.position.copy(scenePoint(next.moonPositionKm));
    if (next.originPositionKm) originMarker.position.copy(scenePoint(next.originPositionKm));
    const direction = sceneVelocity(next.velocityKmS);
    probeAssembly.visible = mode !== 'overview' && mode !== 'onboard';
    placeProbe(shipPosition, direction);
    marker.visible = mode === 'overview' || mode === 'destination';
    arrow.visible = mode === 'overview'; arrow.position.copy(shipPosition); arrow.setDirection(direction);
    updateTrail(shipPosition, next.segmentIndex, beforeManeuver);
  }
  function setLookTarget(target) {
    if (!['moon', 'earth', 'velocity'].includes(target)) throw Error('Objetivo de cámara desconocido.');
    lookTarget = target;
  }
  // Cambio el modo de cámara, ajusto planos de recorte y lanzo una transición suave (salvo en modo local o inmediato).
  function setCameraMode(nextMode, { instant = false } = {}) {
    if (!MISSION_CAMERA_MODES.includes(nextMode)) throw Error('Cámara de misión desconocida.');
    mode = nextMode;
    controls.enabled = mode === 'overview' && (!coarse || touchEnabled);
    renderer.domElement.style.touchAction = controls.enabled ? 'none' : 'pan-y';
    // Ajusto el plano cercano de inmediato para cámara local, ya que 0,005 u recortaría el vehículo cuando está a ~1e-4 u.
    camera.near = mode === 'local' && sample ? Math.max(1e-6, localCameraGeometry(sample, execution).distance * 0.02) : 0.005; camera.updateProjectionMatrix();
    camera.up.set(0, 1, 0);
    if (probeAssembly && sample) {
      probeAssembly.visible = mode !== 'overview' && mode !== 'onboard';
      placeProbe(scenePoint(sample.positionKm), sceneVelocity(sample.velocityKmS));
      marker.visible = mode === 'overview' || mode === 'destination'; arrow.visible = mode === 'overview';
    }
    const pose = desiredPose(mode);
    if (pose.up) camera.up.copy(pose.up);
    // Coloco la cámara local de forma instantánea porque interpolar desde lejos atravesaría el cuerpo central.
    if (instant || mode === 'local') { camera.position.copy(pose.position); controls.target.copy(pose.target); camera.lookAt(pose.target); transition = null; }
    else transition = { start: performance.now(), fromPosition: camera.position.clone(), fromTarget: controls.target.clone(),
      toPosition: pose.position, toTarget: pose.target };
  }
  function setTouchInteraction(enabled) {
    touchEnabled = Boolean(enabled);
    controls.enabled = mode === 'overview' && (!coarse || touchEnabled);
    renderer.domElement.style.touchAction = controls.enabled ? 'none' : 'pan-y';
  }
  function resize() {
    const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
    camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height, false);
  }
  const observer = new ResizeObserver(resize); observer.observe(host);
  // Ejecuto el bucle de renderizado aplicando transiciones de cámara, seguimiento y actualización de controles orbitales.
  function draw(now) {
    if (disposed || !visible) return;
    if (transition) {
      const u = Math.min(1, Math.max(0, (now - transition.start) / 600));
      const smooth = u * u * (3 - 2 * u);
      camera.position.copy(transition.fromPosition).lerp(transition.toPosition, smooth);
      controls.target.copy(transition.fromTarget).lerp(transition.toTarget, smooth);
      camera.lookAt(controls.target);
      if (u >= 1) transition = null;
    } else if (mode === 'overview') controls.update();
    else if (sample) {
      const pose = desiredPose(mode);
      if (mode === 'local') { const near = Math.max(1e-6, localCameraGeometry(sample, execution).distance * 0.02); if (camera.near !== near) { camera.near = near; camera.updateProjectionMatrix(); } }
      if (mode === 'onboard' || mode === 'local') camera.position.copy(pose.position);
      else camera.position.lerp(pose.position, 0.18);
      // En cámara local fijo el punto de mira exactamente sobre el vehículo para evitar que un suavizado apunte al suelo tras un salto temporal.
      if (mode === 'local') { controls.target.copy(pose.target); camera.up.copy(pose.up); }
      else controls.target.lerp(pose.target, 0.18);
      camera.lookAt(controls.target);
    }
    renderer.render(scene, camera);
    frame = requestAnimationFrame(draw);
  }
  function setVisible(value) {
    if (disposed) return;
    visible = Boolean(value);
    if (frame != null) { cancelAnimationFrame(frame); frame = null; }
    if (visible) { controls.enabled = mode === 'overview' && (!coarse || touchEnabled); resize();
      if (framingPending) { setCameraMode(mode, { instant: true }); framingPending = false; }
      frame = requestAnimationFrame(draw); }
    else { setTouchInteraction(false); controls.enabled = false; renderer.domElement.style.touchAction = 'pan-y'; }
  }
  // Libero todos los recursos WebGL, observadores y mallas al desmontar la vista.
  function dispose() {
    if (disposed) return;
    setVisible(false); disposed = true; observer.disconnect(); controls.dispose();
    clearPlan();
    disposeObject(arrow);
    for (const object of [...scene.children]) if (object.geometry) disposeObject(object);
    unregisterQuality(); renderer.renderLists.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
  }
  setVisible(false);
  return { setExecution, setSample, setCameraMode, setLookTarget, setTouchInteraction, setVisible, dispose,
    getCameraMode: () => mode };
}
