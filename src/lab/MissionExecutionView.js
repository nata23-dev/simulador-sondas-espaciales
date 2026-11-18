import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createProbeAssemblyModel, disposeProbeAssemblyModel } from './ProbeAssemblyView.js';

const SCENE_SCALE = 1 / 10000;
export const CENTRAL_BODY_SCENE_RADIUS = 0.63710084; // radio de la esfera central en unidades de escena (Tierra a 1 u = 10 000 km)
// La escala (unidades por km) es parte de la ejecución: Tierra y Luna 1/10 000; un descenso local usa R_cuerpo -> 0,6371 u.
let sceneScale = SCENE_SCALE;
const scenePoint = position => new THREE.Vector3(position[0] * sceneScale, position[2] * sceneScale, -position[1] * sceneScale);
const scaleOf = execution => execution?.transfer?.sceneScale ?? SCENE_SCALE;
const sceneVelocity = velocity => new THREE.Vector3(velocity[0], velocity[2], -velocity[1]).normalize();
export const MISSION_CAMERA_MODES = Object.freeze(['overview', 'exterior', 'onboard', 'destination', 'cinematic', 'local']);

// Encuadre puramente visual: recibe estados científicos y nunca los modifica.
// Cámara local (12E.1): encuadre ilustrativo cerca del vehículo. Solo la cámara y la escala del modelo cambian;
// las posiciones científicas (km) no se alteran. Distancia = 0,0002·R + 0,45·altitud (unidades de escena).
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
  return { position, up, side, distance, modelScale: distance / 15 };
}
export function missionCameraPose(cameraMode, sample, execution, { lookTarget = 'moon', aspect = 1, fov = 46 } = {}) {
  if (!MISSION_CAMERA_MODES.includes(cameraMode)) throw Error('Cámara de misión desconocida.');
  sceneScale = scaleOf(execution);
  if (cameraMode === 'local') {
    const g = localCameraGeometry(sample, execution);
    return { position: g.position.clone().addScaledVector(g.side, g.distance).addScaledVector(g.up, 0.3 * g.distance), target: g.position.clone() };
  }
  const position = sample ? scenePoint(sample.positionKm) : new THREE.Vector3();
  const moonPosition = sample ? scenePoint(sample.moonPositionKm) : new THREE.Vector3(36, 0, 0);
  const direction = sample ? sceneVelocity(sample.velocityKmS) : new THREE.Vector3(1, 0, 0);
  if (cameraMode === 'overview') {
    const destination = execution ? scenePoint(execution.transfer.moonArrivalPositionKm) : moonPosition;
    const target = destination.clone().multiplyScalar(0.5);
    const distance = Math.max(execution?.transfer?.overviewMinDistance ?? 53, (destination.length() * 0.58 + 3)
      / (Math.tan(THREE.MathUtils.degToRad(fov / 2)) * Math.max(0.1, aspect)));
    return { position: target.clone().add(new THREE.Vector3(0, 0.42 * distance, distance)), target };
  }
  if (cameraMode === 'exterior') return { position: position.clone().add(new THREE.Vector3(0, 1.7, 3.4)), target: position };
  if (cameraMode === 'onboard') {
    const target = lookTarget === 'earth' ? new THREE.Vector3(0, 0, 0)
      : lookTarget === 'velocity' ? position.clone().add(direction) : moonPosition;
    return { position, target };
  }
  if (cameraMode === 'destination') return {
    position: moonPosition.clone().add(new THREE.Vector3(0, 2.4, 6)),
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

export function createMissionExecutionView(host) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#050a13');
  const camera = new THREE.PerspectiveCamera(46, 1, 0.005, 300);
  camera.position.set(0, 22, 53);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.append(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 1.4; controls.maxDistance = 160;
  controls.target.set(18, 0, 0); controls.update();
  scene.add(new THREE.AmbientLight('#9aaed0', 1.3));
  const sun = new THREE.DirectionalLight('#fff0ce', 2.25); sun.position.set(-18, 17, 20); scene.add(sun);
  scene.add(stars());
  const earth = new THREE.Mesh(new THREE.SphereGeometry(0.63710084, 40, 28), new THREE.MeshStandardMaterial({ color: '#245c92', roughness: 0.8 }));
  scene.add(earth);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(0.17374, 30, 22), new THREE.MeshStandardMaterial({ color: '#bfc4c9', roughness: 1 }));
  scene.add(moon);
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
    probeAssembly = null; execution = null; sample = null; points = null; visited = null; pending = null;
    marker.visible = false; arrow.visible = false; moon.visible = false;
  }
  function applyBody(next) {
    sceneScale = scaleOf(next);
    const body = next?.transfer?.centralBody;
    earth.scale.setScalar(next?.transfer?.bodyRadiusKm ? next.transfer.bodyRadiusKm * sceneScale / CENTRAL_BODY_SCENE_RADIUS : 1);
    earth.material.color.set(body?.color ?? '#245c92');
  }
  function setExecution(next) {
    clearPlan();
    if (!next) return;
    execution = next; applyBody(next);
    points = next.transfer.trajectory.map(point => scenePoint(point.positionKm));
    const moonTrack = new THREE.Line(new THREE.BufferGeometry().setFromPoints(next.transfer.trajectory.map(point => scenePoint(point.moonPositionKm))),
      new THREE.LineDashedMaterial({ color: '#849ab6', dashSize: 0.5, gapSize: 0.3, transparent: true, opacity: 0.5 }));
    moonTrack.computeLineDistances(); pathGroup.add(moonTrack);
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
    const departure = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), new THREE.MeshBasicMaterial({ color: '#8ad0ea' }));
    departure.position.copy(scenePoint(next.transfer.initialPositionKm)); pathGroup.add(departure);
    const arrival = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), new THREE.MeshBasicMaterial({ color: '#e4ba78' }));
    arrival.position.copy(scenePoint(next.transfer.arrivalPositionKm)); pathGroup.add(arrival);
    if (next.transfer.target === 'flyby') {
      const closest = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), new THREE.MeshBasicMaterial({ color: '#d8a4ea' }));
      closest.position.copy(scenePoint(next.transfer.closestApproach.positionKm)); pathGroup.add(closest);
    }
    probeAssembly = createProbeAssemblyModel(next.design);
    probeAssembly.scale.setScalar(0.25); // metros del Hangar -> unidades ilustrativas, solo visuales.
    scene.add(probeAssembly);
    marker.visible = true; moon.visible = !next.transfer.hideMoon;
    setCameraMode('overview', { instant: true });
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
  function setSample(next, { beforeManeuver = false } = {}) {
    if (!execution || !next) return;
    sample = next;
    const shipPosition = scenePoint(next.positionKm);
    marker.position.copy(shipPosition); moon.position.copy(scenePoint(next.moonPositionKm));
    probeAssembly.position.copy(shipPosition);
    const direction = sceneVelocity(next.velocityKmS);
    probeAssembly.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    probeAssembly.visible = mode !== 'overview' && mode !== 'onboard';
    probeAssembly.scale.setScalar(mode === 'local' ? localCameraGeometry(next, execution).modelScale : 0.25);
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
    camera.near = 0.005; camera.updateProjectionMatrix();
    if (probeAssembly && sample) {
      probeAssembly.visible = mode !== 'overview' && mode !== 'onboard';
      probeAssembly.scale.setScalar(mode === 'local' ? localCameraGeometry(sample, execution).modelScale : 0.25);
      marker.visible = mode === 'overview' || mode === 'destination'; arrow.visible = mode === 'overview';
    }
    const pose = desiredPose(mode);
    if (instant) { camera.position.copy(pose.position); controls.target.copy(pose.target); camera.lookAt(pose.target); transition = null; }
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
      controls.target.lerp(pose.target, 0.18);
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
    renderer.renderLists.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
  }
  setVisible(false);
  return { setExecution, setSample, setCameraMode, setLookTarget, setTouchInteraction, setVisible, dispose,
    getCameraMode: () => mode };
}
