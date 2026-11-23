// En este módulo centralizo la carga de texturas locales con un único THREE.TextureLoader,
// configurando su espacio de color (sRGB o lineal) y anisotropía, y conservando el respaldo si fallan.
import * as THREE from 'three';

const loader = new THREE.TextureLoader();

/** Cargo una textura desde `textures/`, ajusto su espacio de color y anisotropía, y mantengo el respaldo ante errores. */
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

/** Asigno de forma asíncrona un mapa de color sRGB a un material y aplico el tinte indicado al completarse la carga. */
export function aplicarMapaColor(material, nombre, tinte = 0xffffff) {
  cargarTextura(nombre, texture => {
    material.map = texture;
    material.color.set(tinte);
    material.needsUpdate = true;
  });
}
