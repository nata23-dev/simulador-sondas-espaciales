import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IRRADIANCIA_SOLAR_1_AU, INTENSIDAD_SOL_ESCENA,
  irradianciaSolar, distanciaHeliocentricaAU, exposicionFotografica
} from '../src/graphics/SolarIllumination.js';
import { UNIDADES_POR_AU } from '../src/graphics/SceneScale.js';

test('solar irradiance follows measured AU distance and the inverse square law', () => {
  assert.equal(IRRADIANCIA_SOLAR_1_AU, 1361);
  assert.equal(irradianciaSolar(1), 1361);
  assert.equal(irradianciaSolar(2), 1361 / 4);
  assert.ok(irradianciaSolar(0.39) > irradianciaSolar(1));
  assert.ok(irradianciaSolar(30) < irradianciaSolar(5));
  assert.equal(irradianciaSolar(0), null);
  assert.equal(irradianciaSolar(NaN), null);
  assert.equal(distanciaHeliocentricaAU({ x: 3 * UNIDADES_POR_AU,
    y: 4 * UNIDADES_POR_AU, z: 0 }), 5);
  assert.equal(distanciaHeliocentricaAU({ x: NaN, y: 0, z: 0 }), null);
});

test('scene light normalization and photographic gain preserve distance differences', () => {
  assert.equal(INTENSIDAD_SOL_ESCENA / UNIDADES_POR_AU ** 2,
    IRRADIANCIA_SOLAR_1_AU * 0.003);
  assert.equal(exposicionFotografica(1), 1);
  assert.ok(exposicionFotografica(0.4) < 1);
  assert.ok(exposicionFotografica(30) > exposicionFotografica(5));
  assert.ok(irradianciaSolar(30) * exposicionFotografica(30)
    < irradianciaSolar(5) * exposicionFotografica(5));
});
