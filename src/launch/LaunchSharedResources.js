/**
 * En este módulo aíslo los objetos WebGL de geometría y textura que el
 * lanzamiento 3D comparte con la escena principal para evitar fugas de memoria
 * al destruir el renderizador temporal del lanzamiento.
 * En Three.js cada `WebGLRenderer` suscribe un oyente `dispose` sobre cada
 * geometría y textura dibujada y `renderer.dispose()` no lo desregistra. Aquí
 * creo envoltorios propios que apuntan exactamente a los mismos búferes e
 * imágenes subyacentes (sin duplicar memoria) para poder desecharlos al cerrar
 * el lanzamiento sin tocar las plantillas activas en la escena principal.
 */

import * as THREE from 'three';

// Creo una `BufferGeometry` nueva que reutiliza los mismos atributos, índices y morphTargets de `fuente` sin copiar arrays.
export function geometriaQueComparteDatos(fuente) {
  const g = new THREE.BufferGeometry();
  g.name = fuente.name;
  g.setIndex(fuente.index);
  for (const [nombre, atributo] of Object.entries(fuente.attributes)) g.setAttribute(nombre, atributo);
  for (const [nombre, lista] of Object.entries(fuente.morphAttributes)) g.morphAttributes[nombre] = lista.slice();
  g.morphTargetsRelative = fuente.morphTargetsRelative;
  for (const { start, count, materialIndex } of fuente.groups) g.addGroup(start, count, materialIndex);
  g.setDrawRange(fuente.drawRange.start, fuente.drawRange.count);
  g.boundingBox = fuente.boundingBox?.clone() ?? null;
  g.boundingSphere = fuente.boundingSphere?.clone() ?? null;
  g.userData = fuente.userData;
  return g;
}

// Construyo un `THREE.Sprite` con geometría propia para evitar que el renderizador del lanzamiento deje oyentes en la geometría global compartida por todos los sprites de Three.js.
export function crearSpritePropio(material) {
  const sprite = new THREE.Sprite(material);
  sprite.geometry = geometriaQueComparteDatos(sprite.geometry);
  return sprite;
}

// Localizo la textura DFG LUT interna de Three.js usada por los materiales físicos de `escena` para desechar su oyente antes de cerrar el renderizador; los demás renderizadores la vuelven a subir si la necesitan.
export function texturaDfgCompartida(renderer, escena) {
  let lut = null;
  escena.traverse(o => {
    if (lut || !o.material) return;
    for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
      const valor = renderer.properties.get(material)?.uniforms?.dfgLUT?.value;
      if (valor?.isTexture) { lut = valor; break; }
    }
  });
  return lut;
}

// Sustituyo en un árbol clonado sus geometrías y texturas por envoltorios propios sobre los mismos datos y devuelvo una función idempotente que libera solo esos envoltorios al cerrar.
export function separarRecursosCompartidos(objeto) {
  const geometrias = new Map(), texturas = new Map();
  objeto.traverse(o => {
    if (!o.isMesh) return;
    if (o.geometry) {
      if (!geometrias.has(o.geometry)) geometrias.set(o.geometry, geometriaQueComparteDatos(o.geometry));
      o.geometry = geometrias.get(o.geometry);
    }
    for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!material) continue;
      for (const [clave, valor] of Object.entries(material)) {
        if (!valor?.isTexture) continue;
        // Al clonar la textura comparto el mismo `Texture.source` para no duplicar la imagen en memoria.
        if (!texturas.has(valor)) texturas.set(valor, valor.clone());
        material[clave] = texturas.get(valor);
      }
    }
  });
  let liberado = false;
  return () => {
    if (liberado) return;
    liberado = true;
    for (const g of geometrias.values()) g.dispose();
    for (const t of texturas.values()) t.dispose();
  };
}
