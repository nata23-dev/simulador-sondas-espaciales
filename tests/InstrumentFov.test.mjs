import test from 'node:test';
import assert from 'node:assert/strict';
import {
  horizontalFovFromVertical,
  verticalFovForSquareFootprint
} from '../src/graphics/InstrumentFov.js';

test('campo ISS cuadrado conserva 0,424 grados por lado en paisaje y retrato', () => {
  for (const aspect of [16 / 9, 4 / 3, 1, 390 / 844]) {
    const vertical = verticalFovForSquareFootprint(0.424, aspect);
    const horizontal = horizontalFovFromVertical(vertical, aspect);
    const squareSide = aspect >= 1 ? vertical : horizontal;
    assert.ok(Math.abs(squareSide - 0.424) < 1e-12);
    if (aspect < 1) assert.ok(vertical > 0.424);
    if (aspect > 1) assert.ok(horizontal > 0.424);
  }
});

test('FOV de cámara rechaza valores sin significado geométrico', () => {
  assert.throws(() => verticalFovForSquareFootprint(0.424, 0), RangeError);
  assert.throws(() => horizontalFovFromVertical(NaN, 1), RangeError);
});
