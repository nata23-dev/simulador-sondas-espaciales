import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getComponent } from './ComponentCatalog.js';

const metal = new THREE.MeshStandardMaterial({ color: 0x9da8b5, metalness: 0.82, roughness: 0.3 });
const dark = new THREE.MeshStandardMaterial({ color: 0x252d39, metalness: 0.62, roughness: 0.43 });
const gold = new THREE.MeshStandardMaterial({ color: 0xc5a56b, metalness: 0.68, roughness: 0.34 });
const blue = new THREE.MeshStandardMaterial({ color: 0x153b74, metalness: 0.28, roughness: 0.32, emissive: 0x081a32 });
const glass = new THREE.MeshStandardMaterial({ color: 0x84c8e9, metalness: 0.5, roughness: 0.17, emissive: 0x163e52 });

function mesh(group, geometry, material, position = [0, 0, 0], rotation = null) {
  const item = new THREE.Mesh(geometry, material);
  item.position.set(...position);
  if (rotation) item.rotation.set(...rotation);
  group.add(item);
  return item;
}
function box(group, size, material, position = [0, 0, 0]) {
  return mesh(group, new THREE.BoxGeometry(...size), material, position);
}
function cylinder(group, top, bottom, height, material, position = [0, 0, 0], sides = 12, rotation = null) {
  return mesh(group, new THREE.CylinderGeometry(top, bottom, height, sides), material, position, rotation);
}
function rod(group, a, b, radius = 0.035, material = metal) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const direction = end.clone().sub(start);
  const item = mesh(group, new THREE.CylinderGeometry(radius, radius, direction.length(), 8), material,
    start.add(end).multiplyScalar(0.5).toArray());
  item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return item;
}
function makeCore(component) {
  const group = new THREE.Group();
  const [width, height] = component.dimensionsM;
  const radius = width * 0.48;
  cylinder(group, radius, radius, height * 0.74, dark, [0, 0, 0], component.id === 'bus-lander' ? 8 : 10).name = 'bus-shell';
  cylinder(group, radius * 1.04, radius * 1.04, 0.1, gold, [0, height * 0.39, 0], 10);
  cylinder(group, radius * 1.04, radius * 1.04, 0.1, metal, [0, -height * 0.39, 0], 10);
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    const x = Math.cos(angle) * radius * 0.91, z = Math.sin(angle) * radius * 0.91;
    box(group, [0.16, height * 0.58, 0.12], i % 2 ? gold : metal, [x, 0, z]).rotation.y = -angle;
  }
  if (component.id === 'bus-lander') {
    box(group, [1.8, 0.12, 1.8], metal, [0, -height * 0.36, 0]);
  } else {
    box(group, [0.78, 0.06, 0.78], gold, [0, height * 0.47, 0]);
  }
  return group;
}
function makePart(component, socketId) {
  const group = new THREE.Group();
  switch (component.category) {
    case 'engine':
      rod(group, [0, 0.37, 0], [0, 0.76, 0], 0.1, dark);
      cylinder(group, 0.29, 0.42, 0.52, metal, [0, 0.16, 0], 16);
      cylinder(group, 0.22, 0.52, 0.37, dark, [0, -0.29, 0], 20);
      cylinder(group, 0.37, 0.37, 0.06, gold, [0, -0.48, 0], 20);
      if (component.id === 'engine-ion') cylinder(group, 0.31, 0.31, 0.05, glass, [0, -0.51, 0], 20);
      break;
    case 'tank':
      // Collar visible: el depósito queda externo y unido al bus.
      rod(group, [0, 0, 0.35], [0, 0, 0.52], 0.08, dark).name = 'tank-mount';
      cylinder(group, 0.38, 0.38, 0.76, metal, [0, 0, 0], 16);
      mesh(group, new THREE.SphereGeometry(0.38, 16, 8), gold, [0, 0.37, 0]).scale.y = 0.28;
      mesh(group, new THREE.SphereGeometry(0.38, 16, 8), gold, [0, -0.37, 0]).scale.y = 0.28;
      for (const y of [-0.24, 0.24]) cylinder(group, 0.4, 0.4, 0.05, dark, [0, y, 0], 16);
      break;
    case 'solar':
      rod(group, [socketId === 'solar-left' ? 0.9 : -0.9, 0, 0], [0, 0, 0], 0.04);
      box(group, [1.68, 0.06, 0.84], gold);
      box(group, [1.57, 0.07, 0.73], blue, [0, 0.015, 0]);
      for (const x of [-0.39, 0, 0.39]) rod(group, [x, 0.06, -0.36], [x, 0.06, 0.36], 0.011, metal);
      for (const z of [-0.18, 0.18]) rod(group, [-0.77, 0.06, z], [0.77, 0.06, z], 0.011, metal);
      break;
    case 'battery': case 'storage':
      rod(group, [-0.39, 0, 0], [-0.22, 0, 0], 0.055, metal);
      box(group, component.dimensionsM, dark);
      box(group, [component.dimensionsM[0] * 0.78, component.dimensionsM[1] * 0.67, 0.045], component.category === 'battery' ? gold : blue,
        [0, 0, component.dimensionsM[2] * 0.51]);
      break;
    case 'antenna':
      rod(group, [0, 0, -0.46], [0, 0, 0.1], 0.045);
      mesh(group, new THREE.CylinderGeometry(0.41, 0.15, 0.18, 24), metal, [0, 0, 0.2], [Math.PI / 2, 0, 0]);
      rod(group, [0, 0, 0.24], [0, 0, 0.56], 0.018, gold);
      break;
    case 'camera':
      rod(group, [0, 0, 0.17], [0, 0, 0.34], 0.055, dark).name = 'camera-mount';
      box(group, [0.44, 0.34, 0.39], metal).name = 'camera-body';
      cylinder(group, 0.18, 0.18, 0.22, dark, [0, 0, -0.31], 20, [Math.PI / 2, 0, 0]);
      cylinder(group, 0.12, 0.12, 0.025, glass, [0, 0, -0.43], 20, [Math.PI / 2, 0, 0]);
      break;
    case 'sensor':
      rod(group, [0, -0.4, 0], [0, -0.13, 0], 0.045, gold);
      box(group, [0.32, 0.16, 0.32], metal, [0, -0.1, 0]);
      mesh(group, new THREE.ConeGeometry(0.18, 0.35, 4), dark, [0, 0.16, 0]);
      break;
    case 'instrument':
      rod(group, [0, -0.4, 0], [0, -0.17, 0], 0.055, dark);
      box(group, [0.46, 0.45, 0.43], gold);
      cylinder(group, 0.17, 0.17, 0.3, dark, [0, 0.28, 0], 12);
      cylinder(group, 0.12, 0.12, 0.03, glass, [0, 0.45, 0], 12);
      break;
    case 'landing':
      for (const x of [-1, 1]) for (const z of [-1, 1]) {
        rod(group, [x * 0.44, 0.5, z * 0.44], [x * 1.18, -0.77, z * 1.18], 0.055, metal);
        cylinder(group, 0.18, 0.18, 0.04, gold, [x * 1.18, -0.8, z * 1.18], 12);
      }
      break;
    case 'tool':
      rod(group, [0.14, 0, 0], [0.39, 0, 0], 0.055, metal);
      box(group, [0.35, 0.25, 0.36], dark);
      rod(group, [0, 0, 0], [-0.4, -0.17, -0.2], 0.055, metal);
      rod(group, [-0.4, -0.17, -0.2], [-0.62, -0.28, -0.38], 0.045, gold);
      for (const offset of [-0.09, 0.09]) rod(group, [-0.62, -0.28, -0.38], [-0.72 + offset, -0.33, -0.51], 0.025, metal);
      break;
  }
  return group;
}

function clearAssembly(assembly) {
  while (assembly.children.length) {
    const child = assembly.children[0]; assembly.remove(child);
    child.traverse(node => {
      node.geometry?.dispose();
      if (node.userData.selectionHelper) node.material?.dispose();
    });
  }
}

function mountAssembly(assembly, design) {
  const nodes = new Map();
  const core = getComponent(design.coreId);
  if (!core) return nodes;
  const body = makeCore(core); body.userData.partId = 'core'; assembly.add(body); nodes.set('core', body);
  for (const entry of design.parts) {
    const component = getComponent(entry.componentId);
    const socket = core.slots.find(item => item.id === entry.socketId);
    if (!component || !socket) continue;
    const node = makePart(component, socket.id);
    node.position.set(...socket.position);
    node.userData.partId = entry.id;
    assembly.add(node); nodes.set(entry.id, node);
  }
  assembly.updateMatrixWorld(true);
  return nodes;
}

// El Centro de misión usa exactamente las mismas piezas y conexiones del
// Hangar, con materiales propios para no liberar recursos compartidos.
export function createProbeAssemblyModel(design) {
  const assembly = new THREE.Group();
  mountAssembly(assembly, design);
  const ownedMaterials = new Map();
  assembly.traverse(node => {
    if (!node.isMesh) return;
    const clone = material => {
      if (!ownedMaterials.has(material)) ownedMaterials.set(material, material.clone());
      return ownedMaterials.get(material);
    };
    node.material = Array.isArray(node.material) ? node.material.map(clone) : clone(node.material);
  });
  return assembly;
}

export function disposeProbeAssemblyModel(assembly) {
  if (!assembly) return;
  const geometries = new Set(), materials = new Set();
  assembly.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) if (material) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  assembly.parent?.remove(assembly);
}

function landingClearanceFromNodes(design, nodes) {
  const engineId = design.parts.find(entry => getComponent(entry.componentId)?.category === 'engine')?.id;
  const landingId = design.parts.find(entry => getComponent(entry.componentId)?.category === 'landing')?.id;
  const engine = nodes.get(engineId), legs = nodes.get(landingId);
  if (!engine || !legs) return null;
  engine.updateWorldMatrix(true, true); legs.updateWorldMatrix(true, true);
  const engineBottomY = new THREE.Box3().setFromObject(engine).min.y;
  const padBottomY = new THREE.Box3().setFromObject(legs).min.y;
  return { engineBottomY, padBottomY, clearanceM: engineBottomY - padBottomY };
}

// Calculado sobre las mallas montadas con sus transformaciones mundiales reales.
export function measureLandingClearance(design) {
  const temporary = new THREE.Group();
  const nodes = mountAssembly(temporary, design);
  const result = landingClearanceFromNodes(design, nodes);
  clearAssembly(temporary);
  return result;
}

// Distancias a la pared cilíndrica posterior: cuerpo de cámara y tanque
// deben permanecer externos; sus soportes deben alcanzar la estructura.
export function measureRearMountFit(design) {
  const temporary = new THREE.Group();
  const nodes = mountAssembly(temporary, design);
  const shell = nodes.get('core')?.getObjectByName('bus-shell');
  if (!shell) { clearAssembly(temporary); return null; }
  const shellBackZ = new THREE.Box3().setFromObject(shell).min.z;
  const measure = (category, bodyName, mountName) => {
    const entry = design.parts.find(part => getComponent(part.componentId)?.category === category);
    const node = nodes.get(entry?.id);
    if (!node) return null;
    const mount = node.getObjectByName(mountName);
    const body = bodyName ? node.getObjectByName(bodyName) : null;
    const bodyBox = new THREE.Box3();
    if (body) bodyBox.setFromObject(body);
    else for (const child of node.children) if (child !== mount) bodyBox.expandByObject(child);
    return { bodyGapM: shellBackZ - bodyBox.max.z,
      mountReachM: new THREE.Box3().setFromObject(mount).max.z - shellBackZ };
  };
  const result = { tank: measure('tank', null, 'tank-mount'), camera: measure('camera', 'camera-body', 'camera-mount') };
  clearAssembly(temporary);
  return result;
}

export function createProbeAssemblyView(host, onSelect) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080d16);
  scene.fog = new THREE.FogExp2(0x080d16, 0.028);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100);
  camera.position.set(5.8, 3.3, 6.8);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.append(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 2.7;
  controls.maxDistance = 17;
  controls.target.set(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0x92b9eb, 0x14191d, 2));
  const key = new THREE.DirectionalLight(0xffe2aa, 3.5); key.position.set(4, 7, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0x447db5, 2); rim.position.set(-5, 1, -4); scene.add(rim);
  const grid = new THREE.GridHelper(12, 24, 0x486078, 0x243044); grid.position.y = -2.12; scene.add(grid);
  const assembly = new THREE.Group(); scene.add(assembly);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  let visible = false, frame = null, selectedId = null, currentDesign = null, disposed = false;
  let controlsConnected = true;
  const activePointers = new Set();
  let nodes = new Map();
  function releasePointers() {
    for (const id of activePointers) {
      if (renderer.domElement.hasPointerCapture(id)) renderer.domElement.releasePointerCapture(id);
    }
    activePointers.clear();
  }
  function setTouchInteraction(enabled) {
    controls.enabled = !coarsePointer || Boolean(enabled);
    renderer.domElement.style.touchAction = coarsePointer && !enabled ? 'pan-y' : 'none';
    if (!enabled) releasePointers();
  }
  setTouchInteraction(false);
  function resize() {
    const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
    camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height, false);
  }
  const observer = new ResizeObserver(resize); observer.observe(host);
  function render() {
    if (!visible) return;
    controls.update(); renderer.render(scene, camera);
    frame = requestAnimationFrame(render);
  }
  function setVisible(value) {
    if (disposed) return;
    visible = value;
    if (frame != null) { cancelAnimationFrame(frame); frame = null; }
    if (visible) {
      if (!controlsConnected) { controls.connect(renderer.domElement); controlsConnected = true; }
      setTouchInteraction(false);
      resize(); render();
    } else {
      setTouchInteraction(false);
      if (controlsConnected) { controls.disconnect(); controlsConnected = false; }
    }
  }
  function setDesign(design, selected = selectedId) {
    if (disposed) return;
    clearAssembly(assembly);
    nodes = mountAssembly(assembly, design); selectedId = selected; currentDesign = design;
    for (const [id, node] of nodes) {
      if (id === selected) {
        const helper = new THREE.BoxHelper(node, 0xe4c781);
        helper.userData.selectionHelper = true;
        assembly.add(helper);
      }
    }
  }
  function onCanvasClick(event) {
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1,
      -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects([...nodes.values()], true);
    if (!hits.length) return;
    let node = hits[0].object;
    while (node && !node.userData.partId) node = node.parent;
    if (node) onSelect?.(node.userData.partId);
  }
  function onPointerDown(event) { if (event.pointerType === 'touch' && controls.enabled) activePointers.add(event.pointerId); }
  function onPointerEnd(event) { activePointers.delete(event.pointerId); }
  renderer.domElement.addEventListener('click', onCanvasClick);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerEnd);
  renderer.domElement.addEventListener('pointercancel', onPointerEnd);
  setVisible(false);
  function dispose() {
    if (disposed) return;
    setVisible(false);
    disposed = true;
    observer.disconnect();
    renderer.domElement.removeEventListener('click', onCanvasClick);
    renderer.domElement.removeEventListener('pointerdown', onPointerDown);
    renderer.domElement.removeEventListener('pointerup', onPointerEnd);
    renderer.domElement.removeEventListener('pointercancel', onPointerEnd);
    controls.dispose();
    clearAssembly(assembly); nodes.clear(); currentDesign = null;
    grid.geometry.dispose();
    for (const material of Array.isArray(grid.material) ? grid.material : [grid.material]) material.dispose();
    for (const material of [metal, dark, gold, blue, glass]) {
      for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
      material.dispose();
    }
    renderer.renderLists.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  }
  return { setDesign, setVisible, setTouchInteraction,
    getLandingClearance: () => currentDesign ? landingClearanceFromNodes(currentDesign, nodes) : null,
    resetCamera: () => { camera.position.set(5.8, 3.3, 6.8); controls.target.set(0, 0, 0); controls.update(); },
    dispose };
}
