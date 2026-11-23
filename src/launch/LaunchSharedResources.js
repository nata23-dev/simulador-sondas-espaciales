// LAN-02 — recursos compartidos entre el lanzamiento 3D y la escena principal.
//
// El modelo de NASA del lanzamiento es un clon (`clone(true)`) de la plantilla Voyager que también dibuja la escena principal:
// sus geometrías y texturas son los mismos objetos. Cada WebGLRenderer que dibuja una geometría o una textura le añade su propio
// oyente «dispose» (three r186: WebGLGeometries y WebGLTextures), y `renderer.dispose()` no lo retira. Al cerrar el lanzamiento
// quedaban en la plantilla 5 oyentes de geometría y 3 de textura más por cada lanzamiento, y con ellos el estado interno del
// renderizador destruido (su contexto perdido y su lienzo). La plantilla no se puede desechar: la sigue usando la escena principal.
//
// Aquí cada malla recibe una geometría propia que apunta a los MISMOS atributos (los mismos arrays: no se duplica memoria ni se
// cambia la forma) y cada material, texturas propias que apuntan a la MISMA imagen (`Texture.source`). El renderizador del
// lanzamiento registra sus oyentes en esos objetos propios, que se desechan al cerrar; la plantilla no se toca.

import * as THREE from 'three';

/** Geometría nueva que comparte índice, atributos y atributos de morfología con `fuente` (sin copiar sus datos). */
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

/**
 * Todos los `THREE.Sprite` comparten una única geometría global de three (`Sprite.js`), también los de la escena principal: el
 * renderizador del lanzamiento dejaba en ella su oyente y quedaba retenido al cerrarse. Este sprite tiene geometría propia con los
 * mismos datos; quien lo crea desecha `sprite.geometry` al terminar.
 */
export function crearSpritePropio(material) {
  const sprite = new THREE.Sprite(material);
  sprite.geometry = geometriaQueComparteDatos(sprite.geometry);
  return sprite;
}

/**
 * three r186 usa en todos los WebGLRenderer una única textura DFG para los materiales físicos (`DFGLUTData.js`, no exportada); cada
 * renderizador le añade su oyente «dispose» y `renderer.dispose()` no lo retira. Devuelve esa textura si `renderer` la usó en algún
 * material de `escena` (o null). Hay que pedirla antes de desechar los materiales. Desecharla es seguro: es de 16 × 16, sus datos
 * siguen en memoria y cualquier otro renderizador la vuelve a subir la próxima vez que la use.
 */
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

/**
 * Sustituye en `objeto` las geometrías y las texturas de sus materiales por objetos propios que comparten los datos. Sus materiales
 * deben ser ya propios (p. ej. clonados por `prepararFundido`): las texturas se cambian en ellos. Devuelve la función que desecha
 * solo esos objetos propios (geometrías y texturas), nunca los de la plantilla.
 */
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
        if (!texturas.has(valor)) texturas.set(valor, valor.clone()); // mismo `source`: la imagen no se duplica
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
