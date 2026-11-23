import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createProbeAssemblyModel, disposeProbeAssemblyModel } from './ProbeAssemblyView.js';
import { registerRenderer, opcionesRenderizador } from '../graphics/QualityProfile.js';
import { crearRenderizadorWebGL } from '../graphics/WebGLSupport.js';
import { attachNasaModel, localBounds } from '../graphics/NasaProbeModels.js';

const SCENE_SCALE = 1 / 10000;
export const CENTRAL_BODY_SCENE_RADIUS = 0.63710084; // radio de la esfera central en unidades de escena (Tierra a 1 u = 10 000 km)
// La escala (unidades por km) es parte de la ejecución: Tierra y Luna 1/10 000; un descenso local usa R_cuerpo -> 0,6371 u.
let sceneScale = SCENE_SCALE;
const scenePoint = position => new THREE.Vector3(position[0] * sceneScale, position[2] * sceneScale, -position[1] * sceneScale);
const scaleOf = execution => execution?.transfer?.sceneScale ?? SCENE_SCALE;
const sceneVelocity = velocity => new THREE.Vector3(velocity[0], velocity[2], -velocity[1]).normalize();
export const MISSION_CAMERA_MODES = Object.freeze(['overview', 'exterior', 'onboard', 'destination', 'cinematic', 'local']);
// 12G: factor ILUSTRATIVO de tamaño de marcadores en escenas heliocéntricas (≈1/10 del radio abarcado, en unidades de escena).
// Solo cambia tamaños dibujados; los centros siguen a 32 unidades/AU.
// 13: un contexto puede declarar su propio factor (`transfer.markerScale`, p. ej. < 1 en la escena de Europa).
export const heliocentricMarkerScale = execution => execution?.transfer?.markerScale ?? (execution?.transfer?.heliocentric ? Math.max(1, (execution.transfer.overviewRadiusScene ?? 40) / 10) : 1);

// Encuadre puramente visual: recibe estados científicos y nunca los modifica.
// Cámara local (12E.1): encuadre ilustrativo cerca del vehículo. Solo la cámara y la escala del modelo cambian;
// las posiciones científicas (km) no se alteran. Distancia = 0,0002·R + 0,45·altitud (unidades de escena).
// 12F.1: la cámara local se orienta con la vertical local (horizonte horizontal), mira EXACTAMENTE al vehículo (sin
// retardo de suavizado, que tras un salto temporal dejaba el encuadre apuntando al suelo) y apunta a la mitad del
// modelo ampliado, que en esta vista se apoya por su base sobre el punto material calculado (ver `localModelPlacement`).
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
// Altura visual del modelo en la cámara local (unidades de escena) para encuadrar su centro; 6 m es la altura típica
// del modelo del Hangar y solo afecta al punto de mira, no a ningún estado.
const LOCAL_MODEL_HEIGHT_M = 6;
/** Punto del suelo bajo el vehículo, a radio R EXACTO (no la esfera facetada), para el parche de superficie local. */
export function localGroundPoint(sample, execution) {
  const g = localCameraGeometry(sample, execution);
  return g.up.clone().multiplyScalar(g.radiusScene);
}
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
    // 12G: vista heliocéntrica centrada en el Sol que abarca la trayectoria y las órbitas recorridas por ambos planetas.
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
    // En una ejecución heliocéntrica el origen es el Sol: «Tierra» apunta a la posición efemérica del planeta de origen.
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

export function createMissionExecutionView(host, { onModel = null } = {}) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#050a13');
  const camera = new THREE.PerspectiveCamera(46, 1, 0.005, 300);
  camera.position.set(0, 22, 53);
  const renderer = crearRenderizadorWebGL(opcionesRenderizador({ antialias: true }), 'Centro de Misión'); // STAB-01
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
  // 12G: marcador del planeta de origen en escenas heliocéntricas (posición efemérica; tamaño ilustrativo).
  const originMarker = new THREE.Mesh(new THREE.SphereGeometry(0.17374, 24, 18), new THREE.MeshStandardMaterial({ color: '#3f7cc0', roughness: 0.9 }));
  originMarker.visible = false; scene.add(originMarker);
  // 12F.1: parche de suelo tangente a radio R exacto bajo el vehículo (solo cámara local). La esfera central es un
  // poliedro cuyas caras quedan por DEBAJO del radio real (hasta ~0,05 % de R); a la escala de la cámara local eso
  // separaba visualmente el vehículo del suelo. El parche no altera ninguna posición: marca la superficie |r| = R.
  const groundPatch = new THREE.Mesh(new THREE.CircleGeometry(1, 72), new THREE.MeshStandardMaterial({ color: '#9c9fa4', roughness: 1, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  groundPatch.visible = false; scene.add(groundPatch);
  const contactRing = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({ color: '#e4ba78', side: THREE.DoubleSide, transparent: true, opacity: 0.85,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  contactRing.visible = false; scene.add(contactRing);
  let modelBaseOffset = 0, markerScale = 1, visualFactor = 1;
  // 15: las sondas de herencia (hasta ~20 m de envergadura) se reducen a la envolvente de la sonda ilustrativa (~3,6 m de radio).
  // Base del modelo (m, eje +Y del modelo) para apoyarlo sobre el punto material en la cámara local.
  function fitProbeModel(model) {
    visualFactor = Math.min(1, 3.6 / (model.userData.boundingRadiusM || 3.6));
    model.scale.setScalar(0.25 * visualFactor); // metros del Hangar -> unidades ilustrativas, solo visuales.
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
  function clearPlan() {
    for (const child of [...pathGroup.children]) disposeObject(child);
    if (probeAssembly) disposeProbeAssemblyModel(probeAssembly);
    probeAssembly = null; lastPlacement = null; execution = null; sample = null; points = null; visited = null; pending = null;
    marker.visible = false; arrow.visible = false; moon.visible = false; originMarker.visible = false; groundPatch.visible = false; contactRing.visible = false;
    camera.far = 300; camera.updateProjectionMatrix(); controls.maxDistance = 160; controls.minDistance = 1.4; starField.scale.setScalar(1);
    markerScale = 1; for (const item of [moon, marker, arrow, originMarker]) item.scale.setScalar(1);
  }
  function applyBody(next) {
    sceneScale = scaleOf(next);
    const body = next?.transfer?.centralBody;
    const visual = next?.transfer?.centralBodyVisualRadius;
    // Un radio visual explícito (Sol en la escena heliocéntrica) es ilustrativo y se declara en el pie de la vista.
    earth.scale.setScalar(visual ? visual * markerScale / CENTRAL_BODY_SCENE_RADIUS : next?.transfer?.bodyRadiusKm ? next.transfer.bodyRadiusKm * sceneScale / CENTRAL_BODY_SCENE_RADIUS : 1);
    earth.material.color.set(body?.color ?? '#245c92');
    earth.material.emissive.set(body?.emissive ? body.color : '#000000'); earth.material.emissiveIntensity = body?.emissive ? 0.9 : 1;
    groundPatch.material.color.set(body?.color ?? '#9c9fa4');
  }
  // 13: `keepCamera` conserva el modo de cámara al cambiar de contexto (misión integrada); por defecto vuelve a la vista general.
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
      // Recorrido efemérico del planeta de origen durante la transferencia (no es la trayectoria de la sonda).
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
    // 15.1: el modelo oficial de NASA sustituye a la geometría procedimental cuando termina de cargarse (misma orientación: +Y = antena).
    const mounted = probeAssembly;
    // 17: un ensamblaje experimental no usa el modelo de NASA de su bus (no lo representaría); se queda con la reconstrucción.
    const modelCore = next.design?.experimental ? null : next.design?.coreId;
    const report = status => onModel?.({ status, designName: next.design?.name ?? null, coreId: next.design?.coreId ?? null,
      probeId: next.design?.basedOn ?? null, experimental: Boolean(next.design?.experimental) });
    report(modelCore ? 'cargando' : next.design ? 'procedural' : 'sin-sonda');
    attachNasaModel(mounted, modelCore, { isCurrent: () => probeAssembly === mounted }).then(result => {
      if (probeAssembly !== mounted) return;
      if (modelCore) report(result.status === 'nasa' ? 'nasa' : 'procedural');
      if (result.status !== 'nasa') return;
      fitProbeModel(mounted);
      if (lastPlacement) placeProbe(...lastPlacement); // recoloca con la nueva escala aunque la reproducción esté en pausa
      else mounted.scale.setScalar(0.25 * visualFactor);
    });
    marker.visible = true; moon.visible = !next.transfer.hideMoon;
    if (next.transfer.minDistance) controls.minDistance = next.transfer.minDistance;
    setCameraMode(keepCamera && (previousMode !== 'local' || next.kind === 'landing') ? previousMode : 'overview', { instant: true });
    framingPending = true;
  }
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
  // Colocación puramente visual del modelo. En la cámara local de un DESCENSO (12F.1) el modelo ampliado se orienta con
  // la vertical local y se apoya por su base en el punto material calculado: el contacto |r| = R coincide así con el
  // suelo visible. En el resto de vistas (y en el lanzamiento) se conserva la convención previa: centro en el estado y
  // eje +Y alineado con la velocidad. Ningún estado científico cambia.
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
  function setCameraMode(nextMode, { instant = false } = {}) {
    if (!MISSION_CAMERA_MODES.includes(nextMode)) throw Error('Cámara de misión desconocida.');
    mode = nextMode;
    controls.enabled = mode === 'overview' && (!coarse || touchEnabled);
    renderer.domElement.style.touchAction = controls.enabled ? 'none' : 'pan-y';
    // El plano cercano de la cámara local se fija YA (antes de la transición): con 0,005 u el vehículo, a ~1e-4 u, quedaba recortado.
    camera.near = mode === 'local' && sample ? Math.max(1e-6, localCameraGeometry(sample, execution).distance * 0.02) : 0.005; camera.updateProjectionMatrix();
    camera.up.set(0, 1, 0);
    if (probeAssembly && sample) {
      probeAssembly.visible = mode !== 'overview' && mode !== 'onboard';
      placeProbe(scenePoint(sample.positionKm), sceneVelocity(sample.velocityKmS));
      marker.visible = mode === 'overview' || mode === 'destination'; arrow.visible = mode === 'overview';
    }
    const pose = desiredPose(mode);
    if (pose.up) camera.up.copy(pose.up);
    // La cámara local se coloca sin transición: interpolar desde una vista lejana atraviesa el cuerpo central.
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
      // 12F.1: en la cámara local el objetivo se fija exactamente (el suavizado dejaba el encuadre apuntando al suelo
      // tras un salto temporal, porque la distancia de cámara es de cientos de metros y el retardo de kilómetros).
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
