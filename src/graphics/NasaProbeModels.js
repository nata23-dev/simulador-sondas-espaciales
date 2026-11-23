// En este módulo catalogo y cargo los modelos 3D oficiales de NASA en formato GLB para
// las cuatro sondas de la flota (Voyager, Cassini, Dawn y Juno). Solo gestiono su presentación
// visual: masas, potencia, propulsión y centro de masas proceden siempre de HeritageCatalog.js.
// Para Cassini, Dawn y Juno configuro la descompresión Draco (KHR_draco_mesh_compression)
// usando el decodificador empaquetado con Three.js mediante DRACO_GLTF_CONFIG.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader, DRACO_GLTF_CONFIG } from 'three/addons/loaders/DRACOLoader.js';

const NASA_REPOSITORY = 'https://github.com/nasa/NASA-3D-Resources';
const USAGE_GUIDELINES = 'https://www.nasa.gov/nasa-brand-center/images-and-media';

// Registro la ficha documental y hashes SHA-256 de los archivos GLB oficiales servidos sin modificar.
export const NASA_PROBE_MODELS = Object.freeze({
  voyager: Object.freeze({
    probeId: 'voyager', coreId: 'bus-voyager', name: 'Voyager',
    file: 'models/voyager/Voyager.glb', bytes: 3128204,
    sha256: '5338241f2e89e9cfe3ebb82f519b4cad64c97e66883cccba6fdda98667aec731',
    source: 'https://science.nasa.gov/resource/voyager-3d-model/', repositoryPath: null, commit: null,
    credit: 'NASA / JPL-Caltech (VTAD)', draco: false,
    note: 'Modelo ya usado por el modo histórico desde etapas anteriores; se reutiliza sin cambios.'
  }),
  cassini: Object.freeze({
    probeId: 'cassini', coreId: 'bus-cassini', name: 'Cassini-Huygens',
    file: 'models/nasa/cassini/Cassini-Huygens-A.glb', bytes: 1660492,
    sha256: 'f8bc110e23821021e99b88634843449cc8e98d86d0d8561c612c1cf0404e64e7',
    source: `${NASA_REPOSITORY}/tree/master/3D%20Models/Cassini-Huygens%20(A)`, repositoryPath: '3D Models/Cassini-Huygens (A)/Cassini-Huygens (A).glb',
    commit: '828fd0fb0bf18605c37aa0972cb898881b33d6c2', credit: 'NASA 3D Resources (NASA / JPL-Caltech)', draco: true,
    note: 'Orbitador con la sonda Huygens acoplada, como en el lanzamiento.'
  }),
  dawn: Object.freeze({
    probeId: 'dawn', coreId: 'bus-dawn', name: 'Dawn',
    file: 'models/nasa/dawn/Dawn.glb', bytes: 927020,
    sha256: '411249aed791994b6a2014894ad6bd7ca0445dbcf6d5342af9edc5df988f04b7',
    source: `${NASA_REPOSITORY}/tree/master/3D%20Models/Dawn`, repositoryPath: '3D Models/Dawn/Dawn.glb',
    commit: '02cdb6ecf6eeceb419a82a9ebfc19e27df5a60df', credit: 'NASA 3D Resources (NASA / Brian E. Kumanchik)', draco: true,
    note: 'Envergadura de la malla: 19,70 m (coincide con la documentada).'
  }),
  juno: Object.freeze({
    probeId: 'juno', coreId: 'bus-juno', name: 'Juno',
    file: 'models/nasa/juno/Juno-A.glb', bytes: 8999028,
    sha256: '13f6bd48ff830a1890b21ef6e0182bb1043926feebb77af9733e7374b050367a',
    source: `${NASA_REPOSITORY}/tree/master/3D%20Models/Juno%20(A)`, repositoryPath: '3D Models/Juno (A)/Juno (A).glb',
    commit: '27a613152c4ef68d1ca4d04cb92e48fc85f8bd19', credit: 'NASA 3D Resources (NASA / JPL-Caltech)', draco: true,
    note: 'Variante con texturas; se descarga solo al elegir Juno.'
  })
});
export const NASA_MODEL_USAGE = Object.freeze({ repository: NASA_REPOSITORY, guidelines: USAGE_GUIDELINES,
  statement: 'Recursos de NASA 3D Resources, publicados como libres y sin copyright. Su uso aquí no implica respaldo de NASA.' });

const MODEL_BY_CORE = new Map(Object.values(NASA_PROBE_MODELS).map(entry => [entry.coreId, entry]));
export const nasaModelForCore = coreId => MODEL_BY_CORE.get(coreId) ?? null;

function baseUrl() {
  try { return import.meta.env?.BASE_URL ?? '/'; } catch { return '/'; }
}
export const nasaModelUrl = entry => `${baseUrl()}${entry.file}`;

// Inicializo una única instancia de GLTFLoader acoplada al decodificador Draco empaquetado con Three.js.
let gltfLoader = null;
function loader() {
  if (gltfLoader) return gltfLoader;
  const draco = new DRACOLoader();
  draco.setDecoderPath(DRACO_GLTF_CONFIG);
  gltfLoader = new GLTFLoader().setDRACOLoader(draco);
  return gltfLoader;
}

// Detecto el cubo auxiliar de exportación de Blender (nodo «_root», ≤36 vértices y material vacío o «clear»);
// como suele ser el padre de toda la nave, oculto su material sin ocultar el nodo entero.
export function isExportHelper(node) {
  if (!node.isMesh) return false;
  const materials = Array.isArray(node.material) ? node.material : [node.material];
  const tiny = (node.geometry?.attributes?.position?.count ?? Infinity) <= 36;
  return tiny && (node.name === '_root' || materials.every(m => !m || m.name === 'clear' || m.name === ''));
}
function hideExportHelper(node) {
  const hide = material => { const m = material.clone(); m.visible = false; m.depthWrite = false; return m; };
  node.material = Array.isArray(node.material) ? node.material.map(hide) : hide(node.material);
  node.userData.exportHelper = true;
}

// Calculo la caja envolvente en coordenadas locales de `root` (en metros) considerando únicamente las mallas
// visibles y excluyendo el cubo auxiliar, de forma independiente de la pose aplicada por la vista.
export function localBounds(root) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert(), box = new THREE.Box3(), part = new THREE.Box3(), m = new THREE.Matrix4();
  const shown = node => { for (let n = node; n && n !== root; n = n.parent) if (!n.visible) return false; return true; };
  root.traverse(node => {
    if (!node.isMesh || node.userData.exportHelper || !shown(node)) return;
    if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
    part.copy(node.geometry.boundingBox).applyMatrix4(m.multiplyMatrices(inverse, node.matrixWorld));
    box.union(part);
  });
  return box;
}

// Guardo en caché una única plantilla GLB por archivo para que cada vista clone la jerarquía
// compartiendo geometrías y materiales marcados como compartidos.
const templates = new Map();
export function loadNasaProbeTemplate(entry) {
  if (!templates.has(entry.file)) {
    const promise = new Promise((resolve, reject) => loader().load(nasaModelUrl(entry), gltf => resolve(gltf.scene), undefined, reject))
      .then(sceneRoot => {
        sceneRoot.traverse(node => {
          if (isExportHelper(node)) hideExportHelper(node);
          if (node.isMesh) { node.userData.sharedNasaResource = true; node.castShadow = false; node.receiveShadow = false; }
        });
        sceneRoot.updateMatrixWorld(true);
        return sceneRoot;
      });
    // Elimino la entrada fallida de la caché para permitir reintentar la descarga ante un error de red.
    promise.catch(() => templates.delete(entry.file));
    templates.set(entry.file, promise);
  }
  return templates.get(entry.file);
}

// Reemplazo la geometría procedimental de un ensamblaje por el modelo GLB oficial conservando
// el contenedor padre (+Y local alineado con la antena de alta ganancia).
export async function attachNasaModel(assembly, coreId, { isCurrent = () => true } = {}) {
  const entry = nasaModelForCore(coreId);
  if (!entry) return { status: 'sin-modelo' };
  assembly.userData.modelSource = 'cargando';
  try {
    const template = await loadNasaProbeTemplate(entry);
    if (!isCurrent()) return { status: 'descartado' };
    const model = template.clone(true);
    model.name = 'nasa-model';
    model.userData.nasaModel = entry.probeId;
    for (const child of [...assembly.children]) if (child.name !== 'nasa-model') child.visible = false;
    assembly.add(model);
    assembly.updateMatrixWorld(true);
    const sphere = localBounds(assembly).getBoundingSphere(new THREE.Sphere());
    assembly.userData.boundingRadiusM = sphere.radius; assembly.userData.boundingCenterM = sphere.center.toArray();
    assembly.userData.modelSource = 'nasa';
    assembly.userData.modelEntry = entry;
    return { status: 'nasa', entry };
  } catch (error) {
    assembly.userData.modelSource = 'procedural';
    assembly.userData.modelError = error?.message ?? String(error);
    return { status: 'error', entry, error };
  }
}
