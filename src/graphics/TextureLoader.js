import * as THREE from 'three';

const loader = new THREE.TextureLoader();

/** Loads a local texture and leaves the supplied fallback material intact on error. */
export function cargarTextura(nombre, onLoad, { color = true } = {}) {
  const ruta = `${import.meta.env.BASE_URL}textures/${nombre}`;
  loader.load(
    ruta,
    texture => {
      texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.anisotropy = 4;
      onLoad(texture);
    },
    undefined,
    error => console.warn(`No se pudo cargar ${ruta}; se conserva el material de respaldo.`, error)
  );
}

export function aplicarMapaColor(material, nombre) {
  cargarTextura(nombre, texture => {
    material.map = texture;
    material.color.set(0xffffff);
    material.needsUpdate = true;
  });
}
