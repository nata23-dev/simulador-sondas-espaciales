import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { calcularEncuadreVista } from '../src/graphics/OverviewFraming.js';
import { posicionEscenaProporcional } from '../src/graphics/SpatialScale.js';

const datos = JSON.parse(fs.readFileSync(
  new URL('../public/data/efemerides-2026.json', import.meta.url), 'utf8'
));
const radios = {
  Mercurio: 0.7, Venus: 1.1, Tierra: 1.3, Marte: 0.9,
  Jupiter: 3.2, Saturno: 2.8, Urano: 2.1, Neptuno: 2.1
};
const zonas = [
  { width: 1920, height: 975, left: 312, right: 1876, top: 140, bottom: 853 },
  { width: 1351, height: 663, left: 302, right: 1307, top: 140, bottom: 541 },
  { width: 900, height: 650, left: 292, right: 856, top: 140, bottom: 606 },
  { width: 390, height: 610, left: 18, right: 372, top: 222, bottom: 566 }
];

function objetosEnFecha(indice) {
  return new Map(Object.entries(radios).map(([nombre, radio]) => {
    const p = datos.planetas[nombre][indice].posicionAU;
    return [nombre, {
      planeta: { radio },
      posicion: { position: posicionEscenaProporcional(p) }
    }];
  }));
}

test('los cuerpos del encuadre caben entre los paneles con distintas fechas y tamaños', () => {
  for (const indice of [0, 9, 19, 31]) {
    const objetos = objetosEnFecha(indice);
    for (const zona of zonas) {
      const camera = new THREE.PerspectiveCamera(60, zona.width / zona.height, 0.5, 10000);
      const { posicion, objetivo } = calcularEncuadreVista(camera, objetos, zona);
      camera.position.copy(posicion);
      camera.lookAt(objetivo);
      camera.updateMatrixWorld();

      for (const nombre of ['Sol', ...objetos.keys()]) {
        const centro = nombre === 'Sol'
          ? new THREE.Vector3()
          : objetos.get(nombre).posicion.position;
        const radio = nombre === 'Sol' ? 5.8
          : objetos.get(nombre).planeta.radio * (nombre === 'Saturno' ? 2.02 : 1.055) * 2.5;
        const proyectado = centro.clone().project(camera);
        const profundidad = camera.position.distanceTo(centro);
        const margen = zona.height * radio /
          (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * (profundidad - radio));
        const x = (proyectado.x + 1) * zona.width / 2;
        const y = (1 - proyectado.y) * zona.height / 2;
        assert.ok(x - margen >= zona.left - 2 && x + margen <= zona.right + 2,
          nombre + ': eje X fuera de zona en muestra ' + indice);
        assert.ok(y - margen >= zona.top - 2 && y + margen <= zona.bottom + 2,
          nombre + ': eje Y fuera de zona en muestra ' + indice);
        assert.ok(profundidad > radio * 1.2,
          nombre + ': cámara dentro del cuerpo');
      }
    }
  }
});

test('el encuadre científico responde a las posiciones de otra fecha', () => {
  const zona = zonas[1];
  const camera = new THREE.PerspectiveCamera(60, zona.width / zona.height, 0.5, 10000);
  const primera = calcularEncuadreVista(camera, objetosEnFecha(0), zona);
  const ultima = calcularEncuadreVista(camera, objetosEnFecha(31), zona);
  assert.ok(primera.posicion.distanceTo(ultima.posicion) > 0.1);
});
