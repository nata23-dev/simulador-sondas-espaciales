// En este módulo construyo los materiales y las mallas de las lunas planetarias con
// iluminación solar inversa al cuadrado (escala 32 unidades/AU), caché de materiales,
// carga diferida de texturas, máscara de zonas observadas frente a relleno ilustrativo y LOD geométrico.
import * as THREE from 'three';
import { MOON_CATALOG as MOONS } from '../science/MoonCatalog.js';
import { UNIDADES_ESCENA_POR_KM } from './ScaleModeConfig.js';
import { cargarTextura } from './TextureLoader.js';
import { MOON_TEXTURES } from './MoonTextureCatalog.js';
import { crearPenachoIo } from './IoVolcanism.js';
import { registrarTexturaDiferida, vincularMallaTextura } from './DeferredTextures.js';
import { GEOMETRIAS_ESFERA_LOD, resolverNivelLodEsfera } from './PlanetFactory.js';

// Genero la clave única de carga diferida para las texturas de cada luna (mosaico, ilustración y máscara).
export const claveTexturaLuna = key => `luna:${key}`;

// Reutilizo una caché en memoria de materiales superficiales para no duplicar programas ni texturas por luna.
const surfaceMaterials = new Map();
// Mantengo esta ayuda opcional de lectura del mosaico de Ío; en 0 conservo intacta la iluminación solar.
const ioInspection = { value: 0 };

/** Activo o desactivo el modo auxiliar de inspección visual para el mosaico superficial de Ío. */
export function establecerInspeccionVisualIo(activa) {
  ioInspection.value = activa ? 1 : 0;
}

/**
 * Creo o devuelvo desde caché el material superficial de una luna, configurando su iluminación solar,
 * la mezcla entre cartografía observada y relleno ilustrativo y el registro de descarga diferida.
 */
export function crearMaterialSuperficie(key) {
  if (surfaceMaterials.has(key)) return surfaceMaterials.get(key);
  const map = MOON_TEXTURES[key];
  // Conservo el mapa Cassini de 938 nm de Titán como referencia documental, pero aquí muestro un disco ámbar en luz visible.
  const material = new THREE.MeshBasicMaterial({
    color: key === 'Titan' ? 0xc78e54 : 0xb9b7ad,
    toneMapped: true
  });
  surfaceMaterials.set(key, material);
  let documented = null;
  let illustration = null;
  let observedMask = null;
  const hasReconstruction = () => !!(illustration && observedMask);
  const activate = () => {
    if (!documented || (map.illustration && !hasReconstruction())) return;
    material.map = documented;
    material.color.set(0xffffff);
    material.needsUpdate = true;
  };
  material.customProgramCacheKey = () => `moon-surface-${key}-${hasReconstruction()}`;
  material.onBeforeCompile = shader => {
    if (key === 'Io') shader.uniforms.ioInspection = ioInspection;
    shader.vertexShader = `varying vec3 vMoonWorldPos; varying vec3 vMoonWorldNormal;\n${shader.vertexShader}`
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vMoonWorldPos=(modelMatrix*vec4(transformed,1.0)).xyz; vMoonWorldNormal=normalize(mat3(modelMatrix)*normal);');
    shader.fragmentShader = `varying vec3 vMoonWorldPos; varying vec3 vMoonWorldNormal;\n${shader.fragmentShader}`;
    if (hasReconstruction()) {
      shader.uniforms.moonIllustration = { value: illustration };
      shader.uniforms.moonObservedMask = { value: observedMask };
      shader.fragmentShader = `uniform sampler2D moonIllustration; uniform sampler2D moonObservedMask;\n${shader.fragmentShader}`;
      // Uso la máscara independiente para conservar intactos los píxeles fotografiados del mosaico original
      // y suavizar únicamente la transición en el borde del área cartografiada.
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec4 documentedColor = texture2D(map, vMapUv);
          vec4 illustrativeColor = texture2D(moonIllustration, vMapUv);
          float observed = texture2D(moonObservedMask, vMapUv).r;
          diffuseColor *= mix(illustrativeColor, documentedColor, observed);
        #endif`);
    }
    if (key === 'Io') shader.fragmentShader = `uniform float ioInspection;\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>',
      `#include <color_fragment>
       float solarDistanceAU = max(length(vMoonWorldPos) / 32.0, 0.1);
       float incidence = max(dot(normalize(vMoonWorldNormal), normalize(-vMoonWorldPos)), 0.0);
       float solarLight = incidence / (solarDistanceAU * solarDistanceAU);
       diffuseColor.rgb *= ${key === 'Io' ? 'mix(solarLight, 0.24 + 0.08 * incidence, ioInspection)' : 'solarLight'};
       ${key === 'Titan' ? 'diffuseColor.rgb *= 0.94 + 0.06 * smoothstep(-0.7, 0.7, -vMoonWorldNormal.y);' : ''}`);
  };
  // Registro la descarga bajo demanda para pedir los archivos únicamente cuando la luna alcance un tamaño apreciable en pantalla.
  if (key !== 'Titan') registrarTexturaDiferida(claveTexturaLuna(key), () => {
    cargarTextura(`moons/${map.file}`, texture => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      documented = texture;
      activate();
    });
    if (map.illustration && map.observedMask) {
      cargarTextura(`moons/${map.illustration}`, texture => {
        texture.wrapS = THREE.RepeatWrapping;
        illustration = texture;
        activate();
      });
      cargarTextura(`moons/${map.observedMask}`, texture => {
        texture.wrapS = THREE.RepeatWrapping;
        observedMask = texture;
        activate();
      }, { color: false });
    }
  });
  return material;
}

/** Construyo la capa de neblina atmosférica ilustrativa de Titán sobre su disco opaco en luz visible. */
export function crearNeblinaTitan(geometry, radioEscena) {
  // Simulo un halo anaranjado fino en el limbo iluminado; es una aproximación visual, no un modelo óptico calibrado.
  const material = new THREE.MeshBasicMaterial({
    color: 0xe0a768, transparent: true, opacity: 0.36,
    depthWrite: false, toneMapped: true
  });
  material.onBeforeCompile = shader => {
    shader.vertexShader = `varying vec3 vMoonWorldPos; varying vec3 vMoonWorldNormal;\n${shader.vertexShader}`
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vMoonWorldPos=(modelMatrix*vec4(transformed,1.0)).xyz; vMoonWorldNormal=normalize(mat3(modelMatrix)*normal);');
    shader.fragmentShader = `varying vec3 vMoonWorldPos; varying vec3 vMoonWorldNormal;\n${shader.fragmentShader}`
      .replace('#include <color_fragment>', `#include <color_fragment>
        float incidence = dot(normalize(vMoonWorldNormal), normalize(-vMoonWorldPos));
        float day = smoothstep(-0.08, 0.36, incidence);
        float solarDistanceAU = max(length(vMoonWorldPos) / 32.0, 0.1);
        float limb = 1.0 - max(dot(normalize(vMoonWorldNormal), normalize(cameraPosition - vMoonWorldPos)), 0.0);
        // Visual forward scattering in the orange haze; not a calibrated optical model.
        diffuseColor.rgb *= 3.5 * day / (solarDistanceAU * solarDistanceAU);
        diffuseColor.a *= 0.22 + 0.78 * limb * limb;`);
  };
  const haze = new THREE.Mesh(geometry, material);
  haze.name = 'Neblina ilustrativa de Titán';
  haze.scale.setScalar(radioEscena * 1.015);
  haze.renderOrder = 1;
  return haze;
}

/** Instancio en la escena todas las lunas planetarias del catálogo con su radio físico 1:1 y gestión de LOD. */
export function crearLunasPlanetarias(scene, objetos) {
  const moons = new Map();
  // Comparto inicialmente la esfera de mayor detalle para mantener suaves el limbo y el muestreo UV polar en vistas cercanas.
  const geometry = GEOMETRIAS_ESFERA_LOD.alto;
  let penachoIo = null;
  for (const [key, definition] of Object.entries(MOONS)) {
    const group = new THREE.Group();
    group.name = `Luna ${definition.name} (${definition.id})`;
    const radioEscena = definition.radiusKm * UNIDADES_ESCENA_POR_KM;
    const mesh = new THREE.Mesh(geometry, crearMaterialSuperficie(key));
    mesh.scale.setScalar(radioEscena);
    mesh.userData.nombreLuna = key;
    vincularMallaTextura(claveTexturaLuna(key), mesh);
    group.add(mesh);
    let neblina = null;
    if (key === 'Io') {
      penachoIo = crearPenachoIo();
      mesh.add(penachoIo.mesh);
    }
    if (key === 'Titan') {
      neblina = crearNeblinaTitan(geometry, radioEscena);
      group.add(neblina);
    }
    group.visible = false;
    scene.add(group);
    moons.set(key, { definition, posicion: group, mesh, neblina, radioEscena, nivelDetalle: 'alto' });
  }

  // Ubico cada luna respecto a su planeta anfitrión aplicando la conversión de ejes eclípticos a escena: (x, y, z) → (x, z, -y).
  function actualizar(states, visible) {
    for (const [key, moon] of moons) {
      const state = states?.[key];
      const parent = objetos.get(moon.definition.parent);
      moon.posicion.visible = !!(visible && state && parent);
      if (!moon.posicion.visible) continue;
      const [x, y, z] = state.positionSceneOffset;
      moon.posicion.position.copy(parent.posicion.position).add(new THREE.Vector3(x, z, -y));
    }
  }

  // Actualizo el nivel de detalle geométrico (LOD) y la visibilidad de la neblina de Titán en cada luna visible.
  function actualizarNivelDetalle( resolverOpciones ) {
    for (const [key, moon] of moons) {
      if (!moon.posicion.visible) continue;
      const { nivel, mostrarCapas } = resolverNivelLodEsfera(resolverOpciones(key, moon));
      moon.nivelDetalle = nivel;
      const geo = GEOMETRIAS_ESFERA_LOD[nivel] ?? GEOMETRIAS_ESFERA_LOD.alto;
      if (moon.mesh.geometry !== geo) moon.mesh.geometry = geo;
      if (moon.neblina) {
        if (moon.neblina.geometry !== geo) moon.neblina.geometry = geo;
        moon.neblina.visible = mostrarCapas;
      }
    }
  }
  function ocultar() { for (const moon of moons.values()) moon.posicion.visible = false; }
  return { moons, actualizar, ocultar, actualizarNivelDetalle,
    actualizarEfectos: time => { if (moons.get('Io')?.posicion.visible) penachoIo?.actualizar(time); } };
}
