import test from 'node:test';
import assert from 'node:assert/strict';
import {
  projectedRingHalfTangents,
  requiredVerticalFovDeg,
  sphereAngularDiameterDeg,
  sphereHalfTangent
} from '../src/graphics/AngularGeometry.js';

test('el diámetro angular exterior de una esfera usa asin y valida el dominio', () => {
  assert.ok(Math.abs(sphereAngularDiameterDeg(1, 2) - 60) < 1e-12);
  assert.equal(sphereAngularDiameterDeg(1, 1), null);
  assert.equal(sphereAngularDiameterDeg(2, 1), null);
  assert.equal(sphereAngularDiameterDeg(0, 10), null);
  assert.equal(sphereAngularDiameterDeg(1, Number.NaN), null);
  assert.ok(Math.abs(sphereHalfTangent(1, 2) - 1 / Math.sqrt(3)) < 1e-12);
});

test('Neptuno cercano requiere más campo que la aproximación atan y el área móvil puede recortarlo', () => {
  const distanceKm = 34377.100576;
  const radiusKm = 24622;
  const diameter = sphereAngularDiameterDeg(radiusKm, distanceKm);
  assert.ok(diameter > 90 && diameter < 93);
  assert.ok(diameter > 2 * Math.atan(radiusKm / distanceKm) * 180 / Math.PI + 15);
  const halfTangent = sphereHalfTangent(radiusKm, distanceKm);
  const desktop = requiredVerticalFovDeg({
    halfTangentX: halfTangent, halfTangentY: halfTangent,
    aspect: 1366 / 768, freeFractionX: 0.65, freeFractionY: 0.7, margin: 0.88
  });
  const mobile = requiredVerticalFovDeg({
    halfTangentX: halfTangent, halfTangentY: halfTangent,
    aspect: 390 / 844, freeFractionX: 0.9, freeFractionY: 0.24, margin: 0.88
  });
  assert.ok(desktop > diameter && desktop < 130);
  assert.ok(mobile > 130);
});

test('el anillo proyectado cambia con la orientación y no se trata como esfera', () => {
  const common = {
    observer: { x: 0, y: 0, z: 10 }, center: { x: 0, y: 0, z: 0 },
    axisX: { x: 1, y: 0, z: 0 }, outerRadius: 2,
    forward: { x: 0, y: 0, z: -1 }, right: { x: 1, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 }
  };
  const faceOn = projectedRingHalfTangents({ ...common, axisY: { x: 0, y: 1, z: 0 } });
  const edgeOn = projectedRingHalfTangents({ ...common, axisY: { x: 0, y: 0, z: 1 } });
  assert.ok(Math.abs(faceOn.horizontal - 0.2) < 1e-12);
  assert.ok(Math.abs(faceOn.vertical - 0.2) < 1e-12);
  assert.ok(edgeOn.horizontal > 0.2);
  assert.equal(edgeOn.vertical, 0);
  assert.equal(faceOn.fullyInFront, true);
});

test('el campo requerido rechaza datos inválidos', () => {
  assert.equal(requiredVerticalFovDeg({ halfTangentX: 1, halfTangentY: 1, aspect: 0 }), null);
  assert.equal(requiredVerticalFovDeg({ halfTangentX: Infinity, halfTangentY: 1, aspect: 1 }), null);
});
