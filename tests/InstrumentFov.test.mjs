import test from 'node:test';
import assert from 'node:assert/strict';
import {
  horizontalFovFromVertical,
  verticalFovForSquareFootprint
} from '../src/graphics/InstrumentFov.js';

test('campo ISS cuadrado conserva 0,424 grados por lado en paisaje y retrato', () => {
  for (const aspect of [1920 / 1080, 1366 / 768, 1280 / 720, 768 / 1024, 1, 390 / 844, 320 / 568]) {
    const vertical = verticalFovForSquareFootprint(0.424, aspect);
    const horizontal = horizontalFovFromVertical(vertical, aspect);
    const squareSide = aspect >= 1 ? vertical : horizontal;
    assert.ok(Math.abs(squareSide - 0.424) < 1e-12);
    if (aspect < 1) assert.ok(vertical > 0.424);
    if (aspect > 1) assert.ok(horizontal > 0.424);
  }
});

test('0,917564 grados verticales en 390×844 preservan 0,424 grados horizontales', () => {
  const aspect = 390 / 844;
  const vertical = verticalFovForSquareFootprint(0.424, aspect);
  assert.ok(Math.abs(vertical - 0.9175640639128076) < 1e-10);
  assert.ok(Math.abs(horizontalFovFromVertical(vertical, aspect) - 0.424) < 1e-12);
});

test('FOV de cámara rechaza valores sin significado geométrico', () => {
  assert.throws(() => verticalFovForSquareFootprint(0.424, 0), RangeError);
  assert.throws(() => horizontalFovFromVertical(NaN, 1), RangeError);
});
