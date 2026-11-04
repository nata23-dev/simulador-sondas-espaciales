import * as THREE from 'three';
import { MOON_CATALOG as MOONS } from '../science/MoonCatalog.js';
import { UNIDADES_ESCENA_POR_KM } from './ScaleModeConfig.js';
import { cargarTextura } from './TextureLoader.js';
import { MOON_TEXTURES } from './MoonTextureCatalog.js';
import { crearPenachoIo } from './IoVolcanism.js';

const surfaceMaterials = new Map();
export function crearMaterialSuperficie(key) {
  if (surfaceMaterials.has(key)) return surfaceMaterials.get(key);
  const map = MOON_TEXTURES[key];
  // Titan's Cassini 938 nm map is retained locally but is not a visible-light surface.
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
    shader.vertexShader = `varying vec3 vMoonWorldPos; varying vec3 vMoonWorldNormal;\n${shader.vertexShader}`
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vMoonWorldPos=(modelMatrix*vec4(transformed,1.0)).xyz; vMoonWorldNormal=normalize(mat3(modelMatrix)*normal);');
    shader.fragmentShader = `varying vec3 vMoonWorldPos; varying vec3 vMoonWorldNormal;\n${shader.fragmentShader}`;
    if (hasReconstruction()) {
      shader.uniforms.moonIllustration = { value: illustration };
      shader.uniforms.moonObservedMask = { value: observedMask };
      shader.fragmentShader = `uniform sampler2D moonIllustration; uniform sampler2D moonObservedMask;\n${shader.fragmentShader}`;
      // The independent mask keeps photographed pixels from the original JPEG.
      // Its narrow transition feather blends only the edge of the mapped area.
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec4 documentedColor = texture2D(map, vMapUv);
          vec4 illustrativeColor = texture2D(moonIllustration, vMapUv);
          float observed = texture2D(moonObservedMask, vMapUv).r;
          diffuseColor *= mix(illustrativeColor, documentedColor, observed);
        #endif`);
    }
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>',
      `#include <color_fragment>
       float solarDistanceAU = max(length(vMoonWorldPos) / 32.0, 0.1);
       float incidence = max(dot(normalize(vMoonWorldNormal), normalize(-vMoonWorldPos)), 0.0);
       diffuseColor.rgb *= incidence / (solarDistanceAU * solarDistanceAU);
       ${key === 'Titan' ? 'diffuseColor.rgb *= 0.94 + 0.06 * smoothstep(-0.7, 0.7, -vMoonWorldNormal.y);' : ''}`);
  };
  if (key !== 'Titan') cargarTextura(`moons/${map.file}`, texture => {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    documented = texture;
    activate();
  });
  if (key !== 'Titan' && map.illustration && map.observedMask) {
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
  return material;
}

export function crearNeblinaTitan(geometry, radioEscena) {
  // Optically opaque visible-light disk plus a thin illustrative limb haze.
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

export function crearLunasPlanetarias(scene, objetos) {
  const moons = new Map();
  // One shared mesh keeps the limb and polar UV sampling smooth in close views.
  const geometry = new THREE.SphereGeometry(1, 48, 32);
  let penachoIo = null;
  for (const [key, definition] of Object.entries(MOONS)) {
    const group = new THREE.Group();
    group.name = `Luna ${definition.name} (${definition.id})`;
    const radioEscena = definition.radiusKm * UNIDADES_ESCENA_POR_KM;
    const mesh = new THREE.Mesh(geometry, crearMaterialSuperficie(key));
    mesh.scale.setScalar(radioEscena);
    mesh.userData.nombreLuna = key;
    group.add(mesh);
    if (key === 'Io') {
      penachoIo = crearPenachoIo();
      mesh.add(penachoIo.mesh);
    }
    if (key === 'Titan') group.add(crearNeblinaTitan(geometry, radioEscena));
    group.visible = false;
    scene.add(group);
    moons.set(key, { definition, posicion: group, mesh, radioEscena });
  }

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
  function ocultar() { for (const moon of moons.values()) moon.posicion.visible = false; }
  return { moons, actualizar, ocultar,
    actualizarEfectos: time => { if (moons.get('Io')?.posicion.visible) penachoIo?.actualizar(time); } };
}
