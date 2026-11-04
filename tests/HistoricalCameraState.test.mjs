import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { crearControladorCamara } from '../src/graphics/CameraController.js';

test('primera persona conserva la posición histórica y comunica FOV, objetivo y regreso exterior', () => {
  const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.00001, 36000);
  const controls = { target: new THREE.Vector3(), update() {}, enabled: true };
  const earth = new THREE.Group();
  earth.position.set(32, 0, 0);
  const objetos = new Map([['Tierra', { posicion: earth, planeta: { radio: 1.3 } }]]);
  const sondasHistoricas = new Map(['voyager1', 'voyager2'].map((id, i) => {
    const posicion = new THREE.Group();
    posicion.position.set(150 + i * 20, 7, -50);
    return [id, { posicion, establecerOcultaPorPrimeraPersona() {}, obtenerRadioObservacionActual: () => 0.025 }];
  }));
  const controller = crearControladorCamara({
    camera, controls, objetos, sondasHistoricas, orbitas: [],
    canvas: { addEventListener() {} },
    obtenerZonaEncuadre: () => ({ width: 1280, height: 720, left: 80, right: 1240, top: 100, bottom: 600 })
  });
  for (const id of sondasHistoricas.keys()) {
    const historicalPosition = sondasHistoricas.get(id).posicion.position.clone();
    assert.equal(controller.activarPrimeraPersona(id, { objetivo: 'Tierra', fovGrados: 6 }), true);
    assert.deepEqual(camera.position.toArray(), historicalPosition.toArray());
    let state = controller.obtenerEstadoCamaraHistorica();
    assert.equal(state.fovTipo, 'contextual_vertical');
    assert.equal(state.modo, 'first_person');
    assert.equal(state.idSondaObservador, id);
    assert.equal(state.objetivoMirada, 'Tierra');
    assert.equal(state.fovGrados, 6);
    assert.equal(state.transicionActiva, false);
    controller.establecerFovPrimeraPersona(0.424);
    assert.equal(camera.fov, 0.424);
    assert.equal(controller.obtenerEstadoCamaraHistorica().fovTipo, 'instrumento_cuadrado');
    assert.ok(camera.getWorldDirection(new THREE.Vector3()).dot(earth.position.clone().sub(camera.position).normalize()) > 0.999999);
    assert.equal(controller.apuntarPrimeraPersonaHacia('Sol'), true);
    assert.equal(controller.obtenerEstadoCamaraHistorica().transicionActiva, true);
    controller.actualizar(0.4);
    assert.ok(camera.getWorldDirection(new THREE.Vector3()).dot(camera.position.clone().negate().normalize()) > 0.999999);
    assert.deepEqual(camera.position.toArray(), historicalPosition.toArray());
    assert.equal(controller.obtenerEstadoCamaraHistorica().transicionActiva, false);
    controller.salirDePrimeraPersonaHaciaExterior();
    state = controller.obtenerEstadoCamaraHistorica();
    assert.equal(state.modo, 'exterior');
    assert.equal(state.fovGrados, 48);
    assert.equal(controls.enabled, true);
    assert.deepEqual(sondasHistoricas.get(id).posicion.position.toArray(), historicalPosition.toArray());
  }
});

test('restaurar cámara exterior conserva posición, objetivo y FOV tras comparación', () => {
  const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.00001, 36000);
  camera.position.set(48, 24, 72);
  const controls = { target: new THREE.Vector3(2, 3, 4), update() {}, enabled: true };
  const earth = new THREE.Group();
  earth.position.set(32, 0, 0);
  const probe = new THREE.Group();
  probe.position.set(150, 7, -50);
  const controller = crearControladorCamara({
    camera, controls,
    objetos: new Map([['Tierra', { posicion: earth, planeta: { radio: 1.3 } }]]),
    sondasHistoricas: new Map([['voyager-1', { posicion: probe, establecerOcultaPorPrimeraPersona() {}, obtenerRadioObservacionActual: () => 0.025 }]]),
    orbitas: [], canvas: { addEventListener() {} },
    obtenerZonaEncuadre: () => ({ width: 1280, height: 720, left: 80, right: 1240, top: 100, bottom: 600 })
  });
  const before = controller.obtenerEstadoCamaraHistorica();
  controller.activarPrimeraPersona('voyager-1', { objetivo: 'Tierra', fovGrados: 0.424 });
  assert.equal(controller.restaurarEstadoCamaraHistorica(before), true);
  const after = controller.obtenerEstadoCamaraHistorica();
  assert.equal(after.modo, 'exterior');
  assert.deepEqual(after.posicionEscena, before.posicionEscena);
  assert.deepEqual(after.objetivoEscena, before.objetivoEscena);
  assert.equal(after.fovGrados, before.fovGrados);
});
