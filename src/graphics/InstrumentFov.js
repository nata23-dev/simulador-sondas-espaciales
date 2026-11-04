// THREE.PerspectiveCamera.fov es vertical. El campo ISS documentado corresponde
// a un fotograma cuadrado: se mide sobre el lado del cuadrado central.
export function verticalFovForSquareFootprint(sideDeg, aspect) {
  if (!Number.isFinite(sideDeg) || sideDeg <= 0 || !Number.isFinite(aspect) || aspect <= 0) {
    throw new RangeError('FOV y relación de aspecto deben ser positivos');
  }
  if (aspect >= 1) return sideDeg;
  return 2 * Math.atan(Math.tan(sideDeg * Math.PI / 360) / aspect) * 180 / Math.PI;
}

export function horizontalFovFromVertical(verticalDeg, aspect) {
  if (!Number.isFinite(verticalDeg) || verticalDeg <= 0 || !Number.isFinite(aspect) || aspect <= 0) {
    throw new RangeError('FOV y relación de aspecto deben ser positivos');
  }
  return 2 * Math.atan(Math.tan(verticalDeg * Math.PI / 360) * aspect) * 180 / Math.PI;
}
