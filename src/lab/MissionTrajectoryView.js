// Aquí creo la vista 3D interactiva en Three.js para inspeccionar la trayectoria planificada Tierra–Luna.
// Convierto posiciones geocéntricas en km a unidades de escena (1 u = 10 000 km), dibujo la curva transferida,
// el arco lunar y los marcadores seleccionables de salida, llegada y paso mínimo.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { registerRenderer, opcionesRenderizador } from '../graphics/QualityProfile.js';
import { crearRenderizadorWebGL } from '../graphics/WebGLSupport.js';

const SCALE = 1 / 10000;
// Convierto un vector físico geocéntrico [x, y, z] en km al sistema de coordenadas Y-arriba de Three.js.
const toScene = position => new THREE.Vector3(position[0] * SCALE, position[2] * SCALE, -position[1] * SCALE);

// Monto el renderizador WebGL, la Tierra de referencia, los controles orbitales y la selección por raycasting.
export function createMissionTrajectoryView(host, onSelect) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#070c17');
  const camera = new THREE.PerspectiveCamera(46, 1, 0.01, 300);
  camera.position.set(0, 21, 55);
  const renderer = crearRenderizadorWebGL(opcionesRenderizador({ antialias: true, alpha: false }), 'trayectoria Tierra–Luna');
  const unregisterQuality = registerRenderer(renderer);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.append(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1.5;
  controls.maxDistance = 160;
  controls.target.set(15, 0, 0);
  controls.update();
  scene.add(new THREE.AmbientLight('#889ec1', 1.2));
  const sun = new THREE.DirectionalLight('#fff0cb', 2.2); sun.position.set(-20, 14, 22); scene.add(sun);
  const earth = new THREE.Mesh(new THREE.SphereGeometry(0.63710084, 36, 24), new THREE.MeshStandardMaterial({ color: '#24578a', roughness: 0.85, metalness: 0.05 }));
  scene.add(earth);
  const earthHalo = new THREE.Mesh(new THREE.SphereGeometry(0.67, 32, 20), new THREE.MeshBasicMaterial({ color: '#447cbd', transparent: true, opacity: 0.12, depthWrite: false }));
  scene.add(earthHalo);
  const trajectoryGroup = new THREE.Group(); scene.add(trajectoryGroup);
  const markers = [];
  const raycaster = new THREE.Raycaster();
  let moonPosition = null;
  let visible = false;
  let interaction = !window.matchMedia('(pointer: coarse)').matches;
  let frame = 0;
  let disposed = false;

  // Renderizo bajo demanda cuando cambia la cámara, el tamaño del contenedor o la transferencia cargada.
  function render() {
    if (disposed || !visible || frame) return;
    frame = requestAnimationFrame(() => { frame = 0; controls.update(); renderer.render(scene, camera); });
  }
  const onControlChange = () => render();
  controls.addEventListener('change', onControlChange);
  function resize() {
    const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
    camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height, false); render();
  }
  const observer = new ResizeObserver(resize); observer.observe(host);
  // Elimino y libero todas las líneas, flechas y marcadores de la transferencia anterior.
  function clearTrajectory() {
    for (const object of [...trajectoryGroup.children]) {
      trajectoryGroup.remove(object);
      object.traverse(child => {
        child.geometry?.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) material?.dispose();
      });
    }
    markers.length = 0; moonPosition = null; render();
  }
  // Añado un marcador esférico clicable etiquetado con el identificador de fase correspondiente.
  function marker(id, position, color, radius) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), new THREE.MeshBasicMaterial({ color }));
    mesh.position.copy(toScene(position)); mesh.userData.phaseId = id;
    trajectoryGroup.add(mesh); markers.push(mesh);
  }
  // Dibujo la transferencia calculada, el desplazamiento lunar, las flechas de sentido y encuadro el punto medio.
  function setTransfer(result) {
    clearTrajectory();
    if (!result) return;
    const transfer = result.transfer ?? result;
    const positions = transfer.trajectory.map(point => toScene(point.positionKm));
    const geometry = new THREE.BufferGeometry().setFromPoints(positions);
    trajectoryGroup.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#e3b86e' })));
    const moonTrack = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(transfer.trajectory.map(point => toScene(point.moonPositionKm))),
      new THREE.LineDashedMaterial({ color: '#8798b8', dashSize: 0.45, gapSize: 0.3, transparent: true, opacity: 0.55 })
    );
    moonTrack.computeLineDistances(); trajectoryGroup.add(moonTrack);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(0.17374, 28, 20), new THREE.MeshStandardMaterial({ color: '#c0c4c9', roughness: 1 }));
    moon.position.copy(toScene(transfer.moonArrivalPositionKm));
    trajectoryGroup.add(moon); moonPosition = moon.position.clone();
    marker('departure', transfer.initialPositionKm, '#82cbef', 0.28);
    marker('arrival', transfer.arrivalPositionKm, '#efbd78', 0.28);
    if (transfer.target === 'flyby') marker('closest', transfer.closestApproach.positionKm, '#d8a4ea', 0.25);
    for (let index = 18; index < positions.length - 1; index += 48) {
      const direction = positions[index + 1].clone().sub(positions[index]).normalize();
      const arrow = new THREE.ArrowHelper(direction, positions[index], 0.9, '#e3b86e', 0.3, 0.18);
      trajectoryGroup.add(arrow);
    }
    controls.target.copy(positions[0].clone().add(moon.position).multiplyScalar(0.5));
    camera.position.copy(controls.target).add(new THREE.Vector3(0, 22, 52));
    controls.update(); render();
  }
  // Enfoco la cámara sobre la Tierra o sobre la Luna de llegada.
  function focus(which) {
    if (which === 'earth') controls.target.set(0, 0, 0);
    else if (which === 'moon' && moonPosition) controls.target.copy(moonPosition);
    else return;
    camera.position.copy(controls.target).add(new THREE.Vector3(0, 3, which === 'earth' ? 8 : 5));
    controls.update(); render();
  }
  // Restauro la vista panorámica del sistema Tierra–Luna.
  function resetCamera() {
    controls.target.copy(moonPosition ? moonPosition.clone().multiplyScalar(0.5) : new THREE.Vector3(15, 0, 0));
    camera.position.copy(controls.target).add(new THREE.Vector3(0, 22, 52));
    controls.update(); render();
  }
  // Detecto clics sobre los marcadores de fase mediante raycasting y notifico la selección a la interfaz.
  function onPointerUp(event) {
    if (!interaction || event.button !== 0) return;
    const bounds = renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1,
      -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(markers, false)[0];
    if (hit) onSelect(hit.object.userData.phaseId);
  }
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  function setTouchInteraction(active) {
    interaction = active;
    controls.enabled = active;
    renderer.domElement.style.touchAction = active ? 'none' : 'pan-y';
  }
  setTouchInteraction(interaction);
  return {
    setTransfer, focus, resetCamera,
    setVisible(value) { visible = value; if (value) resize(); },
    setTouchInteraction,
    // Libero geometrías, materiales, escuchadores y contexto WebGL al destruir la vista.
    dispose() {
      disposed = true; if (frame) cancelAnimationFrame(frame);
      observer.disconnect(); controls.removeEventListener('change', onControlChange);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose(); clearTrajectory();
      earth.geometry.dispose(); earth.material.dispose(); earthHalo.geometry.dispose(); earthHalo.material.dispose();
      unregisterQuality(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    }
  };
}
