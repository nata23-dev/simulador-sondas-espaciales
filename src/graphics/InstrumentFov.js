// En este módulo convierto el campo de visión cuadrado de instrumentos científicos (como Voyager ISS)
// al campo vertical y horizontal que espera THREE.PerspectiveCamera según la relación de aspecto del lienzo.

/** Calculo el FOV vertical necesario para que el cuadrado central cubra exactamente `sideDeg` grados. */
export function verticalFovForSquareFootprint(sideDeg, aspect) {
  if (!Number.isFinite(sideDeg) || sideDeg <= 0 || !Number.isFinite(aspect) || aspect <= 0) {
    throw new RangeError('FOV y relación de aspecto deben ser positivos');
  }
  if (aspect >= 1) return sideDeg;
  return 2 * Math.atan(Math.tan(sideDeg * Math.PI / 360) / aspect) * 180 / Math.PI;
}

/** Derivo el FOV horizontal equivalente a partir del FOV vertical y la relación de aspecto activa. */
export function horizontalFovFromVertical(verticalDeg, aspect) {
  if (!Number.isFinite(verticalDeg) || verticalDeg <= 0 || !Number.isFinite(aspect) || aspect <= 0) {
    throw new RangeError('FOV y relación de aspecto deben ser positivos');
  }
  return 2 * Math.atan(Math.tan(verticalDeg * Math.PI / 360) * aspect) * 180 / Math.PI;
}
