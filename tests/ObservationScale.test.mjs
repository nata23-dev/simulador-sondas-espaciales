import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { crearProteccionTransitosSolares } from '../src/graphics/SolarTransitGuard.js';

test('el primer plano reduce solo los tamaños secundarios y cambia suavemente de protagonista', () => {
  const camera = { position: new THREE.Vector3(1000, 0, 0) };
  const objetos = new Map([
    ['Tierra', { planeta: { radio: 1.3 }, posicion: new THREE.Group() }],
    ['Venus', { planeta: { radio: 1.1 }, posicion: new THREE.Group() }]
  ]);
  objetos.get('Tierra').posicion.position.set(32, 0, 0);
  objetos.get('Venus').posicion.position.set(24, 0, 0);
  const centros = [...objetos.values()].map(objeto => objeto.posicion.position.clone());
  let seleccionado = null;
  const politica = crearProteccionTransitosSolares({
    camera, objetos, nombreSeleccionado: () => seleccionado
  });

  for (let i = 0; i < 180; i++) politica.actualizar(1 / 60);
  assert.ok(objetos.get('Tierra').posicion.scale.x > 2.49);
  assert.ok(objetos.get('Venus').posicion.scale.x > 2.49);

  seleccionado = 'Tierra';
  camera.position.set(25, 2, 0);
  const escalaAnterior = objetos.get('Venus').posicion.scale.x;
  politica.actualizar(1 / 60);
  assert.ok(objetos.get('Venus').posicion.scale.x < escalaAnterior);
  assert.ok(objetos.get('Venus').posicion.scale.x > 0.18);
  for (let i = 0; i < 240; i++) politica.actualizar(1 / 60);
  assert.ok(Math.abs(objetos.get('Tierra').posicion.scale.x - 1) < 0.03);
  assert.ok(objetos.get('Venus').posicion.scale.x < 0.25);

  seleccionado = 'Venus';
  camera.position.set(19, 2, 0);
  for (let i = 0; i < 240; i++) politica.actualizar(1 / 60);
  assert.ok(Math.abs(objetos.get('Venus').posicion.scale.x - 1) < 0.03);
  assert.ok(objetos.get('Tierra').posicion.scale.x < 0.25);
  [...objetos.values()].forEach((objeto, indice) =>
    assert.ok(objeto.posicion.position.equals(centros[indice])));
});
