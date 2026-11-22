// Etapa 18 · Carga rápida: texturas, modelos y código bajo demanda. Pruebas de comportamiento (sin navegador) de la lógica
// que decide cuándo se descarga cada recurso; la descarga real se mide en el navegador (scripts/measure-startup.mjs).
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  UMBRAL_TEXTURA_PX, radioAparentePx, registrarTexturaDiferida, vincularMallaTextura, solicitarTextura,
  solicitarTexturasVisibles, texturasPendientes, texturasSolicitadas, precargarEnReposo, conexionLimitada
} from '../src/graphics/DeferredTextures.js';
import { crearPlaneta, claveTexturaPlaneta } from '../src/graphics/PlanetFactory.js';
import { crearMaterialSuperficie, claveTexturaLuna } from '../src/graphics/MoonVisuals.js';

const camara = (z, fov = 45) => { const c = new THREE.PerspectiveCamera(fov, 16 / 9, 1e-6, 1e6); c.position.set(0, 0, z); c.updateMatrixWorld(); return c; };
const esfera = (radio, padre = null) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial());
  m.scale.setScalar(radio); (padre ?? new THREE.Group()).add(m); m.parent.updateMatrixWorld(true); return m;
};

test('18: radio aparente de una esfera en píxeles (proyección perspectiva)', () => {
  // r/d · (h/2) / tan(fov/2): 1 unidad a 100 con fov 90° y 800 px de alto → 4 px.
  assert.ok(Math.abs(radioAparentePx(1, 100, 90, 800) - 4) < 1e-12);
  assert.ok(Math.abs(radioAparentePx(1, 100, 90, 800, 2) - 8) < 1e-12, 'el zoom de la cámara amplía');
  assert.equal(radioAparentePx(1, 0.5, 45, 800), Infinity, 'cámara dentro de la esfera');
  assert.equal(radioAparentePx(0, 10, 45, 800), 0);
});

test('18: una textura diferida se descarga una sola vez y solo cuando su cuerpo se ve con ≥ 2 px de radio', () => {
  let cargas = 0;
  const clave = 'prueba:visible';
  registrarTexturaDiferida(clave, () => { cargas++; });
  const malla = esfera(1);
  vincularMallaTextura(clave, malla);
  const alto = 800; // fov 45° → (h/2)/tan(22,5°) ≈ 965,7 px por unidad de r/d
  solicitarTexturasVisibles(camara(1000), alto); // ≈ 0,97 px
  assert.equal(cargas, 0, 'lejos: sigue pendiente');
  assert.ok(texturasPendientes().includes(clave));
  malla.parent.visible = false;
  solicitarTexturasVisibles(camara(100), alto); // ≈ 9,7 px pero oculta
  assert.equal(cargas, 0, 'oculta: no se descarga aunque esté cerca');
  malla.parent.visible = true;
  solicitarTexturasVisibles(camara(400), alto); // ≈ 2,4 px ≥ 2
  assert.equal(cargas, 1);
  assert.ok(texturasSolicitadas().includes(clave) && !texturasPendientes().includes(clave));
  solicitarTexturasVisibles(camara(10), alto);
  assert.equal(solicitarTextura(clave), false, 'no se repite');
  registrarTexturaDiferida(clave, () => { cargas += 100; });
  solicitarTexturasVisibles(camara(10), alto);
  assert.equal(cargas, 1, 'un registro posterior de la misma clave no vuelve a descargar');
  assert.equal(UMBRAL_TEXTURA_PX, 2);
});

test('18: crear un planeta o el material de una luna no descarga texturas; quedan registradas bajo demanda', () => {
  const tierra = crearPlaneta({ nombre: 'Tierra', radio: 1, color: 0x2244aa });
  const venus = crearPlaneta({ nombre: 'Venus', radio: 1, color: 0xccaa77 });
  assert.ok(tierra.posicion.isObject3D && venus.posicion.isObject3D);
  crearMaterialSuperficie('Europa');
  crearMaterialSuperficie('Titan');
  const pendientes = texturasPendientes();
  for (const clave of [claveTexturaPlaneta('Tierra'), claveTexturaPlaneta('Venus'), claveTexturaLuna('Europa')]) assert.ok(pendientes.includes(clave), clave);
  // El mapa infrarrojo de Titán no se dibuja en luz visible: no hay nada que descargar.
  assert.ok(!pendientes.includes(claveTexturaLuna('Titan')));
  // Sin texturas todavía: el material conserva el color de respaldo.
  const superficie = []; tierra.posicion.traverse(n => { if (n.isMesh && n.material?.isMeshPhysicalMaterial) superficie.push(n); });
  assert.equal(superficie.length, 1); assert.equal(superficie[0].material.map, null);
});

test('18: la precarga en reposo adelanta las claves pendientes de una en una y omite las ya pedidas', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const orden = [];
    registrarTexturaDiferida('reposo:a', () => orden.push('a'));
    registrarTexturaDiferida('reposo:b', () => orden.push('b'));
    solicitarTextura('reposo:b');
    precargarEnReposo(['reposo:b', 'reposo:a', 'reposo:inexistente'], { retardoMs: 1000 });
    assert.deepEqual(orden, ['b']);
    mock.timers.tick(999); assert.deepEqual(orden, ['b'], 'respeta el retardo inicial');
    mock.timers.tick(1); mock.timers.tick(400);
    assert.deepEqual(orden, ['b', 'a']);
    mock.timers.tick(5000); assert.deepEqual(orden, ['b', 'a'], 'sin repeticiones');
  } finally { mock.timers.reset(); }
});

test('18: ahorro de datos o conexión 2G/3G → sin precarga', () => {
  assert.equal(conexionLimitada({ connection: { saveData: true, effectiveType: '4g' } }), true);
  assert.equal(conexionLimitada({ connection: { saveData: false, effectiveType: '3g' } }), true);
  assert.equal(conexionLimitada({ connection: { saveData: false, effectiveType: 'slow-2g' } }), true);
  assert.equal(conexionLimitada({ connection: { saveData: false, effectiveType: '4g' } }), false);
  assert.equal(conexionLimitada({}), false, 'sin API de red: se precarga');
});

test('18: laboratorio, Voyager.glb, modelos de NASA y Draco fuera del arranque', () => {
  const main = readFileSync('src/main.js', 'utf8');
  assert.doesNotMatch(main, /^import \{ createExperimentalLaboratory \}/m, 'el laboratorio no se importa de forma estática');
  assert.match(main, /import\('\.\/ui\/ExperimentalLaboratory\.js'\)/, 'se importa al entrar en el laboratorio');
  assert.match(main, /lab:navigate/, 'la navegación pedida antes de cargarlo se repite después');
  const probe = readFileSync('src/graphics/SpaceProbeVisual.js', 'utf8');
  assert.match(probe, /function solicitarModelo\(\)/);
  assert.match(probe, /actualizarEscalaVisual[\s\S]{0,200}solicitarModelo\(\)/, 'Voyager.glb se pide al mostrarse la sonda');
  const view = readFileSync('src/lab/ProbeAssemblyView.js', 'utf8');
  assert.match(view, /pendingNasa = \(\) => attachNasaModel/, 'el GLB del laboratorio espera a que la vista 3D sea visible');
  const vite = readFileSync('vite.config.js', 'utf8');
  assert.match(vite, /name: 'three'/, 'three.js en un archivo aparte');
});

test('18: perfil de texturas ligero con calidad «Baja» o ahorro de datos', async () => {
  const { texturasLigeras } = await import('../src/graphics/DeferredTextures.js');
  const red = { connection: { saveData: false, effectiveType: '4g' } };
  assert.equal(texturasLigeras({ calidad: 'bajo', nav: red }), true);
  assert.equal(texturasLigeras({ calidad: 'alto', nav: { connection: { saveData: true } } }), true);
  assert.equal(texturasLigeras({ calidad: 'auto', nav: red }), false);
  assert.equal(texturasLigeras({ calidad: 'medio', nav: {} }), false);
});
