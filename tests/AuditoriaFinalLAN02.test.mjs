// Auditoría final, fase 5 — LAN-02: el lanzamiento 3D no deja retenido su renderizador al cerrarse.
// Causa medida en Chrome (instantáneas del montón, docs/auditoria-final/FASE_5_RESULTADOS.md): el renderizador de three r186 añade
// un oyente «dispose» a cada geometría y textura que dibuja y `renderer.dispose()` no lo retira. Los objetos que sobreviven al
// lanzamiento (plantilla Voyager de la escena principal, geometría global de los sprites, caché del resplandor, textura DFG global)
// retenían así el renderizador destruido, su contexto y su lienzo: uno más por cada lanzamiento.
// Aquí se ejercitan en Node los objetos propios que comparten datos y, por lectura del código, su uso y su liberación.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { geometriaQueComparteDatos, crearSpritePropio, texturaDfgCompartida, separarRecursosCompartidos } from '../src/launch/LaunchSharedResources.js';

const leer = ruta => readFileSync(new URL(`../${ruta}`, import.meta.url), 'utf8');
const oyentes = objeto => objeto._listeners?.dispose?.length ?? 0;
// Imita a WebGLGeometries/WebGLTextures: un oyente por renderizador que se retira a sí mismo al desecharse el objeto.
const registrarComoRenderizador = objeto => {
  const alDesechar = () => objeto.removeEventListener('dispose', alDesechar);
  objeto.addEventListener('dispose', alDesechar);
};
const contarDesechos = objeto => { const n = { v: 0 }; objeto.addEventListener('dispose', () => n.v++); return n; };

function geometriaCompleta() {
  const g = new THREE.BoxGeometry(1, 2, 3);
  g.morphAttributes.position = [g.attributes.position.clone()];
  g.addGroup(0, 6, 1);
  g.setDrawRange(0, 30);
  g.computeBoundingBox(); g.computeBoundingSphere();
  g.userData.origen = 'plantilla';
  return g;
}

test('LAN-02 · la geometría propia comparte índice, atributos y grupos sin copiar datos', () => {
  const fuente = geometriaCompleta();
  const g = geometriaQueComparteDatos(fuente);
  assert.notEqual(g, fuente);
  assert.equal(g.index, fuente.index, 'mismo índice');
  for (const [nombre, atributo] of Object.entries(fuente.attributes)) assert.equal(g.attributes[nombre], atributo, `mismo atributo ${nombre}`);
  assert.equal(g.attributes.position.array, fuente.attributes.position.array, 'el array no se duplica');
  assert.equal(g.morphAttributes.position[0], fuente.morphAttributes.position[0]);
  assert.notEqual(g.morphAttributes.position, fuente.morphAttributes.position, 'la lista es propia');
  assert.deepEqual(g.groups, fuente.groups);
  assert.deepEqual(g.drawRange, fuente.drawRange);
  assert.ok(g.boundingBox.equals(fuente.boundingBox) && g.boundingBox !== fuente.boundingBox);
  assert.ok(g.boundingSphere.equals(fuente.boundingSphere) && g.boundingSphere !== fuente.boundingSphere);
  const desechosFuente = contarDesechos(fuente);
  g.dispose();
  assert.equal(desechosFuente.v, 0, 'desechar la propia no desecha la fuente');
});

test('LAN-02 · el modelo del lanzamiento usa objetos propios y la plantilla queda intacta', () => {
  const geo = geometriaCompleta(), mapa = new THREE.Texture(), normales = new THREE.Texture();
  const plantilla = new THREE.Group();
  const matA = new THREE.MeshStandardMaterial({ map: mapa, normalMap: normales }), matB = new THREE.MeshStandardMaterial({ map: mapa });
  plantilla.add(new THREE.Mesh(geo, matA), new THREE.Mesh(geo, [matA, matB]));
  const desechosPlantilla = [geo, mapa, normales, matA, matB].map(contarDesechos);

  const envoltura = plantilla.clone(true); // como VoyagerLaunchDirector: comparte geometrías, materiales y texturas
  envoltura.traverse(o => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone(); }); // prepararFundido
  const liberar = separarRecursosCompartidos(envoltura);
  const [m1, m2] = envoltura.children;

  assert.notEqual(m1.geometry, geo);
  assert.equal(m1.geometry, m2.geometry, 'una geometría propia por geometría de la plantilla');
  assert.equal(m1.geometry.attributes.position, geo.attributes.position);
  assert.notEqual(m1.material.map, mapa);
  assert.equal(m1.material.map.source, mapa.source, 'misma imagen');
  assert.equal(m1.material.map, m2.material[1].map, 'una textura propia por textura de la plantilla');
  assert.equal(m1.material.normalMap.source, normales.source);
  assert.equal(matA.map, mapa, 'los materiales de la plantilla no cambian');
  assert.equal(matA.normalMap, normales);
  assert.equal(plantilla.children[0].geometry, geo);

  // El «renderizador del lanzamiento» deja sus oyentes en los objetos propios, no en la plantilla.
  const propios = [m1.geometry, m1.material.map, m1.material.normalMap];
  const oyentesPlantilla = () => [geo, mapa, normales].map(oyentes);
  const antes = oyentesPlantilla(); // solo los contadores de esta prueba
  propios.forEach(registrarComoRenderizador);
  assert.deepEqual(oyentesPlantilla(), antes, 'ningún oyente nuevo en la plantilla');
  liberar();
  assert.deepEqual(propios.map(oyentes), [0, 0, 0], 'al cerrar se retiran los oyentes');
  liberar();
  assert.deepEqual(desechosPlantilla.map(n => n.v), [0, 0, 0, 0, 0], 'la plantilla no se desecha (la usa la escena principal)');
});

test('LAN-02 · liberar es idempotente: cada objeto propio se desecha una sola vez', () => {
  const plantilla = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial({ map: new THREE.Texture() }));
  const envoltura = plantilla.clone(); envoltura.material = envoltura.material.clone();
  const liberar = separarRecursosCompartidos(envoltura);
  const nGeo = contarDesechos(envoltura.geometry), nTex = contarDesechos(envoltura.material.map);
  liberar(); liberar();
  assert.equal(nGeo.v, 1); assert.equal(nTex.v, 1);
});

test('LAN-02 · los sprites del lanzamiento no usan la geometría global de three', () => {
  const global = new THREE.Sprite().geometry;
  const desechosGlobal = contarDesechos(global);
  const a = crearSpritePropio(new THREE.SpriteMaterial()), b = crearSpritePropio(new THREE.SpriteMaterial());
  assert.ok(a.isSprite);
  assert.notEqual(a.geometry, global); assert.notEqual(b.geometry, global); assert.notEqual(a.geometry, b.geometry);
  assert.equal(a.geometry.attributes.position, global.attributes.position, 'mismos vértices (atributo intercalado compartido)');
  assert.equal(a.geometry.index, global.index);
  registrarComoRenderizador(a.geometry);
  a.geometry.dispose(); b.geometry.dispose();
  assert.equal(oyentes(a.geometry), 0);
  assert.equal(desechosGlobal.v, 0, 'la geometría global sigue intacta para la escena principal');
  assert.ok(new THREE.Sprite().geometry === global);
});

test('LAN-02 · textura DFG: se localiza la que usó el renderizador y desecharla no pierde sus datos', async () => {
  const lut = new THREE.DataTexture(new Uint16Array(16 * 16 * 2), 16, 16, THREE.RGFormat, THREE.HalfFloatType);
  const fisico = new THREE.MeshStandardMaterial(), basico = new THREE.MeshBasicMaterial();
  const escena = new THREE.Scene();
  escena.add(new THREE.Mesh(new THREE.BoxGeometry(), basico), new THREE.Mesh(new THREE.BoxGeometry(), fisico));
  const propiedades = new Map([[basico, { uniforms: {} }], [fisico, { uniforms: { dfgLUT: { value: lut } } }]]);
  const renderer = { properties: { get: m => propiedades.get(m) ?? {} } };
  assert.equal(texturaDfgCompartida(renderer, escena), lut);
  assert.equal(texturaDfgCompartida({ properties: { get: () => ({}) } }, escena), null, 'sin materiales físicos dibujados');

  // La de three (no exportada en el paquete principal): sus datos siguen tras desecharla y conserva una versión > 0, así que
  // el renderizador que la vuelva a usar la sube de nuevo.
  const { getDFGLUT } = await import('three/src/renderers/shaders/DFGLUTData.js');
  const real = getDFGLUT();
  const datos = real.image.data;
  real.dispose();
  assert.equal(getDFGLUT(), real, 'three conserva la misma textura');
  assert.equal(real.image.data, datos);
  assert.ok(real.version > 0);
});

test('LAN-02 · integración: el lanzamiento crea objetos propios y los desecha al cerrarse', () => {
  const director = leer('src/launch/VoyagerLaunchDirector.js');
  const iFundido = director.indexOf('fundirNasa = prepararFundido(envoltura)');
  const iSeparar = director.indexOf('liberarRecursosNasa = separarRecursosCompartidos(envoltura)');
  assert.ok(iFundido > 0 && iSeparar > iFundido, 'las texturas se cambian en los materiales ya clonados');
  assert.match(director, /liberarRecursosNasa\?\.\(\);\s*liberarRecursosNasa = null;/);

  const efectos = leer('src/launch/LaunchEffects.js');
  assert.doesNotMatch(efectos, /new THREE\.Sprite\(/, 'ningún sprite del lanzamiento usa la geometría global');
  assert.match(efectos, /crearSpritePropio\(new THREE\.SpriteMaterial\(\{ map: resplandor\(\)\.clone\(\)/, 'el resplandor del penacho no registra oyentes en la caché del módulo');
  assert.match(efectos, /brillo\.geometry\.dispose\(\); brillo\.material\.map\.dispose\(\); brillo\.material\.dispose\(\);/);

  const mundo = leer('src/launch/LaunchWorld.js');
  const destruir = mundo.slice(mundo.indexOf('destruir() {'));
  const iDfg = destruir.indexOf('texturaDfgCompartida(renderer, escena)'), iMateriales = destruir.indexOf('escena.traverse(');
  assert.ok(iDfg > 0 && iDfg < iMateriales, 'la textura DFG se localiza antes de desechar los materiales');
  for (const llamada of ['solEspacio.geometry.dispose()', 'entornoObjetivo?.dispose()', 'pmrem.dispose()', 'dfgCompartida?.dispose()', 'renderer.dispose()', 'renderer.forceContextLoss()']) {
    assert.ok(destruir.includes(llamada), `destruir() llama a ${llamada}`);
  }
  assert.ok(destruir.indexOf('dfgCompartida?.dispose()') < destruir.indexOf('renderer.dispose()'), 'el oyente se retira mientras el renderizador existe');
  // PMREM: el objetivo de render se guarda y se desecha también al regenerar el entorno.
  assert.match(mundo, /entornoObjetivo\?\.dispose\(\);\s*entornoObjetivo = pmrem\.fromScene\(/);
  // Cierre temprano antes de terminar la carga asíncrona: ni Voyager.glb ni texturas/estrellas tardías dejan recursos abiertos.
  assert.match(director, /cargarPlantillaVoyagerCompartida\(urlGlb\)\.then\(plantilla => \{\s*if \(destruido\) return;/);
  assert.match(mundo, /if \(destruido\) \{ t\.dispose\(\); t\.image\?\.close\?\.\(\); return null; \}/);
  assert.match(mundo, /cargarCatalogoHipparcos\(\)\.then\(reg => \{\s*if \(destruido\) return;/);
  assert.match(mundo, /async function subirTexturas\(\) \{\s*for \([^)]+\) \{\s*if \(destruido\) return;/);
});
