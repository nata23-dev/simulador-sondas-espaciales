// Etapa 15.1: modelos 3D oficiales de NASA para la flota fija (Voyager, Cassini, Dawn y Juno).
// Comprueba procedencia (tamaño y SHA-256 de los archivos servidos), extensiones glTF requeridas, decodificador Draco
// idéntico al de three, y que las mallas están en metros comparándolas con medidas documentadas del catálogo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { NASA_PROBE_MODELS, nasaModelForCore, isExportHelper, localBounds } from '../src/graphics/NasaProbeModels.js';
import { HISTORICAL_PROBES } from '../src/lab/HeritageCatalog.js';
import { getComponent } from '../src/lab/ComponentCatalog.js';

const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
function readGlb(file) {
  const b = readFileSync(`public/${file}`);
  assert.equal(b.toString('ascii', 0, 4), 'glTF', `${file}: cabecera GLB`);
  assert.equal(b.readUInt32LE(4), 2, `${file}: glTF 2.0`);
  assert.equal(b.readUInt32LE(8), b.length, `${file}: longitud declarada`);
  return { buffer: b, json: JSON.parse(b.toString('utf8', 20, 20 + b.readUInt32LE(12))) };
}
// Caja envolvente en el espacio del archivo: TRS de los nodos aplicados a las esquinas de min/max de cada POSITION.
function fileBounds(json, nodeFilter = null) {
  const lo = new THREE.Vector3(Infinity, Infinity, Infinity), hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity), corner = new THREE.Vector3();
  const local = n => n.matrix ? new THREE.Matrix4().fromArray(n.matrix)
    : new THREE.Matrix4().compose(new THREE.Vector3(...(n.translation ?? [0, 0, 0])), new THREE.Quaternion(...(n.rotation ?? [0, 0, 0, 1])), new THREE.Vector3(...(n.scale ?? [1, 1, 1])));
  const visit = (index, parent, inside) => {
    const node = json.nodes[index], world = parent.clone().multiply(local(node));
    const take = inside || !nodeFilter || nodeFilter(node);
    if (take && node.mesh != null && !(node.name === '_root')) for (const p of json.meshes[node.mesh].primitives) {
      const a = json.accessors[p.attributes.POSITION];
      for (let k = 0; k < 8; k++) {
        corner.set(k & 1 ? a.max[0] : a.min[0], k & 2 ? a.max[1] : a.min[1], k & 4 ? a.max[2] : a.min[2]).applyMatrix4(world);
        lo.min(corner); hi.max(corner);
      }
    }
    for (const child of node.children ?? []) visit(child, world, take && Boolean(nodeFilter));
  };
  for (const root of json.scenes[json.scene ?? 0].nodes) visit(root, new THREE.Matrix4(), false);
  return hi.sub(lo);
}

test('cada sonda de la flota tiene su modelo oficial de NASA, servido sin modificar', () => {
  for (const probe of HISTORICAL_PROBES) {
    const entry = nasaModelForCore(probe.coreId);
    assert.ok(entry, `${probe.id}: modelo registrado`);
    assert.equal(entry.probeId, probe.id);
    const bytes = readFileSync(`public/${entry.file}`);
    assert.equal(bytes.length, entry.bytes, `${probe.id}: tamaño`);
    assert.equal(sha256(bytes), entry.sha256, `${probe.id}: SHA-256 del archivo original`);
    assert.match(entry.source, /^https:\/\/(github\.com\/nasa\/NASA-3D-Resources|science\.nasa\.gov)\//);
    if (entry.repositoryPath) assert.match(entry.commit, /^[0-9a-f]{40}$/, `${probe.id}: commit de procedencia`);
  }
  assert.equal(nasaModelForCore('bus-interplanetary'), null, 'las estructuras ilustrativas no tienen modelo de NASA');
  // El README de procedencia recoge las mismas sumas.
  const readme = readFileSync('public/models/nasa/README.md', 'utf8');
  for (const entry of Object.values(NASA_PROBE_MODELS)) assert.ok(readme.includes(entry.sha256), `README: ${entry.probeId}`);
});

test('extensiones requeridas soportadas y decodificador Draco idéntico al de three', () => {
  const supported = new Set(['KHR_draco_mesh_compression']);
  for (const entry of Object.values(NASA_PROBE_MODELS)) {
    const { json } = readGlb(entry.file);
    for (const ext of json.extensionsRequired ?? []) assert.ok(supported.has(ext), `${entry.probeId}: ${ext} no soportada`);
    assert.equal((json.extensionsRequired ?? []).includes('KHR_draco_mesh_compression'), entry.draco, `${entry.probeId}: marca draco`);
    assert.equal(json.animations?.length ?? 0, 0, 'sin animaciones');
  }
  for (const file of ['draco_decoder.wasm', 'draco_wasm_wrapper.js', 'draco_decoder.js']) {
    const served = `public/libs/draco/gltf/${file}`, original = `node_modules/three/examples/jsm/libs/draco/gltf/${file}`;
    assert.ok(existsSync(served), served);
    if (existsSync(original)) assert.equal(sha256(readFileSync(served)), sha256(readFileSync(original)), `${file} igual al de three`);
  }
});

test('las mallas están en metros: coinciden con medidas documentadas del catálogo', () => {
  const near = (actual, expected, tol, label) => assert.ok(Math.abs(actual - expected) <= tol, `${label}: ${actual.toFixed(3)} frente a ${expected} (±${tol})`);
  // Dawn: envergadura de 19,7 m (dato documentado del catálogo, alas dawn-wing).
  const dawn = fileBounds(readGlb(NASA_PROBE_MODELS.dawn.file).json);
  near(Math.max(dawn.x, dawn.y, dawn.z), 19.7, 0.1, 'Dawn, envergadura');
  // Cassini: antena de alta ganancia de 4 m (cas-hga, documentado).
  const cassiniDish = fileBounds(readGlb(NASA_PROBE_MODELS.cassini.file).json, n => n.name === 'dish');
  near(Math.max(cassiniDish.x, cassiniDish.z), getComponent('cas-hga').dimensionsM[0], 0.1, 'Cassini, diámetro de la antena');
  near(cassiniDish.y, 0.88, 0.05, 'Cassini, eje de la antena según +Y (profundidad)');
  // Juno: el diámetro de la antena no está contrastado en el catálogo; solo se comprueba el orden de magnitud (metros, no cm ni pulgadas).
  const junoDish = fileBounds(readGlb(NASA_PROBE_MODELS.juno.file).json, n => /^dish_top_Geometry/.test(n.name));
  assert.ok(junoDish.x > 2.2 && junoDish.x < 2.6, `Juno, antena ${junoDish.x}`);
  const juno = fileBounds(readGlb(NASA_PROBE_MODELS.juno.file).json);
  assert.ok(Math.max(juno.x, juno.z) > 17 && Math.max(juno.x, juno.z) < 23, 'Juno, alas de 9 m');
  // Voyager (modelo ya usado por el modo histórico): pértiga del magnetómetro de 13 m.
  const voyager = fileBounds(readGlb(NASA_PROBE_MODELS.voyager.file).json);
  assert.ok(Math.max(voyager.x, voyager.y, voyager.z) > 13 && Math.max(voyager.x, voyager.y, voyager.z) < 20, 'Voyager, pértiga');
});

test('el cubo auxiliar de exportación se reconoce y la caja local ignora la pose de la vista', () => {
  const helper = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); helper.name = '_root';
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2, 32), new THREE.MeshStandardMaterial({ name: 'foil_gold' }));
  assert.equal(isExportHelper(helper), true);
  assert.equal(isExportHelper(body), false);
  const root = new THREE.Group(); const child = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 6)); child.position.set(1, 0, 0); root.add(child);
  root.scale.setScalar(0.25); root.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.1); root.position.set(5, 6, 7);
  const box = localBounds(root);
  assert.deepEqual(box.min.toArray().map(v => +v.toFixed(9)), [0, -2, -3]);
  assert.deepEqual(box.max.toArray().map(v => +v.toFixed(9)), [2, 2, 3]);
  child.visible = false;
  assert.equal(localBounds(root).isEmpty(), true, 'solo cuenta mallas visibles');
});
