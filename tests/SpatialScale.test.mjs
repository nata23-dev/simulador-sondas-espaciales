import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { UNIDADES_POR_AU, posicionEscenaProporcional } from '../src/graphics/SpatialScale.js';

const datos = JSON.parse(fs.readFileSync(
  new URL('../public/data/efemerides-2026.json', import.meta.url), 'utf8'
));
const nombres = Object.keys(datos.planetas);

test('el factor lineal preserva distancias solares y entre cada pareja en todas las fechas', () => {
  for (let fecha = 0; fecha < datos.planetas.Tierra.length; fecha++) {
    const astronomicas = nombres.map(nombre => {
      const p = datos.planetas[nombre][fecha].posicionAU;
      return new THREE.Vector3(p.x, p.y, p.z);
    });
    const renderizadas = nombres.map(nombre =>
      posicionEscenaProporcional(datos.planetas[nombre][fecha].posicionAU));
    for (let a = 0; a < nombres.length; a++) {
      assert.ok(Math.abs(renderizadas[a].length() / astronomicas[a].length() - UNIDADES_POR_AU) < 1e-11,
        `${nombres[a]} en muestra ${fecha}`);
      for (let b = a + 1; b < nombres.length; b++) {
        const separacionAU = astronomicas[a].distanceTo(astronomicas[b]);
        const separacionEscena = renderizadas[a].distanceTo(renderizadas[b]);
        assert.ok(Math.abs(separacionEscena / separacionAU - UNIDADES_POR_AU) < 1e-11,
          `${nombres[a]} y ${nombres[b]} en muestra ${fecha}`);
      }
    }
  }
});

test('la conversión mantiene magnitud y dirección al pasar entre ejes', () => {
  const p = { x: 1.2, y: -2.4, z: 0.7 };
  const resultado = posicionEscenaProporcional(p);
  assert.deepEqual(resultado.toArray(), [
    1.2 * UNIDADES_POR_AU,
    0.7 * UNIDADES_POR_AU,
    2.4 * UNIDADES_POR_AU
  ]);
});
