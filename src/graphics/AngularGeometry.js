// En este módulo calculo diámetros angulares aparentes, semitangentes proyectadas
// y el campo de visión vertical mínimo para encuadrar esferas y anillos planos en cámara perspectiva.
const DEGREES_PER_RADIAN = 180 / Math.PI;

/** Calculo el diámetro aparente en grados de una esfera observada desde fuera de su superficie. */
export function sphereAngularDiameterDeg(radius, distance) {
  if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(distance) || distance <= radius) {
    return null;
  }
  return 2 * Math.asin(Math.min(1, radius / distance)) * DEGREES_PER_RADIAN;
}

/** Calculo la semitangente angular de una esfera a partir de su radio y distancia al observador. */
export function sphereHalfTangent(radius, distance) {
  if (sphereAngularDiameterDeg(radius, distance) === null) return null;
  return radius / Math.sqrt((distance - radius) * (distance + radius));
}

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

/** Muestreo el borde exterior de un anillo plano para obtener sus semitangentes proyectadas sin aproximarlo como esfera. */
export function projectedRingHalfTangents({
  observer, center, axisX, axisY, outerRadius, forward, right, up, samples = 256
}) {
  if (!Number.isFinite(outerRadius) || outerRadius <= 0 || !Number.isInteger(samples) || samples < 16) {
    return null;
  }
  const base = { x: center.x - observer.x, y: center.y - observer.y, z: center.z - observer.z };
  let horizontal = 0;
  let vertical = 0;
  for (let i = 0; i < samples; i++) {
    const angle = 2 * Math.PI * i / samples;
    const c = Math.cos(angle) * outerRadius;
    const s = Math.sin(angle) * outerRadius;
    const delta = {
      x: base.x + c * axisX.x + s * axisY.x,
      y: base.y + c * axisX.y + s * axisY.y,
      z: base.z + c * axisX.z + s * axisY.z
    };
    const depth = dot(delta, forward);
    if (depth <= 0) return { horizontal: Infinity, vertical: Infinity, fullyInFront: false };
    horizontal = Math.max(horizontal, Math.abs(dot(delta, right) / depth));
    vertical = Math.max(vertical, Math.abs(dot(delta, up) / depth));
  }
  return { horizontal, vertical, fullyInFront: true };
}

/** Calculo el campo de visión vertical mínimo en grados para contener una proyección centrada dentro del área libre. */
export function requiredVerticalFovDeg({
  halfTangentX, halfTangentY, aspect, freeFractionX = 1, freeFractionY = 1, margin = 0.9
}) {
  if (![halfTangentX, halfTangentY, aspect, freeFractionX, freeFractionY, margin]
    .every(Number.isFinite)
    || halfTangentX < 0 || halfTangentY < 0 || aspect <= 0
    || freeFractionX <= 0 || freeFractionY <= 0 || margin <= 0 || margin > 1) return null;
  const tanHalfVertical = Math.max(
    halfTangentY / (freeFractionY * margin),
    halfTangentX / (aspect * freeFractionX * margin)
  );
  return 2 * Math.atan(tanHalfVertical) * DEGREES_PER_RADIAN;
}
