import * as THREE from 'three';
import { aplicarMapaColor, cargarTextura } from './TextureLoader.js';
import { crearAtmosferaTierra, crearAtmosferaUrano } from './Atmosphere.js';

// Oblicuidad aproximada en grados, según la ficha de datos planetarios de la NASA.
// El giro es visual; no modifica las efemérides ni modela la orientación a una fecha dada.
const ASPECTO = {
  Mercurio: { textura: 'mercury.jpg', inclinacion: 0.034, horas: 1407.6 },
  Venus: { textura: 'venus_surface.jpg', inclinacion: 177.4, horas: -5832.5 },
  Tierra: { textura: 'earth_daymap.jpg', inclinacion: 23.4, horas: 23.9 },
  Marte: { textura: 'mars.jpg', inclinacion: 25.2, horas: 24.6 },
  Jupiter: { textura: 'jupiter.jpg', inclinacion: 3.1, horas: 9.9 },
  Saturno: { textura: 'saturn.jpg', inclinacion: 26.7, horas: 10.7 },
  Urano: { textura: 'uranus.jpg', inclinacion: 97.8, horas: -17.2 },
  Neptuno: { textura: 'neptune.jpg', inclinacion: 28.3, horas: 16.1 }
};

const sphereGeometry = new THREE.SphereGeometry(1, 48, 32);

function agregarCapaNubes(grupo, radio, nombre, opacidad) {
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    transparent: true,
    opacity: opacidad,
    depthWrite: false,
    alphaTest: 0.04,
    side: THREE.FrontSide
  });
  const capa = new THREE.Mesh(sphereGeometry, material);
  capa.scale.setScalar(radio * 1.014);
  capa.visible = false;
  grupo.add(capa);

  cargarTextura(nombre, texture => {
    if (nombre === 'earth_clouds.jpg') {
      // El mapa es blanco y negro: su luminancia controla la cobertura.
      material.alphaMap = texture;
    } else {
      material.map = texture;
    }
    material.needsUpdate = true;
    capa.visible = true;
  }, { color: nombre !== 'earth_clouds.jpg' });

  return capa;
}

function agregarAnillos(grupo, radio, centroPlaneta, uniformeMapaSombra) {
  const interior = radio * 1.32;
  const exterior = radio * 2.02;
  const geometria = new THREE.RingGeometry(interior, exterior, 128, 1);
  const posicion = geometria.getAttribute('position');
  const uv = geometria.getAttribute('uv');

  // La textura original es una tira radial, no una imagen de un disco.
  for (let i = 0; i < posicion.count; i++) {
    const r = Math.hypot(posicion.getX(i), posicion.getY(i));
    uv.setXY(i, (r - interior) / (exterior - interior), 0.5);
  }

  const material = new THREE.MeshStandardMaterial({
    color: 0xc4b08b,
    side: THREE.DoubleSide,
    roughness: 1,
    transparent: true,
    opacity: 0.75,
    depthWrite: false
  });
  // Sombra geométrica aproximada del planeta sobre el anillo. Evalúa el desplazamiento
  // local respecto al centro de Saturno y escala el radio con modelMatrix para conservar
  // precisión completa tanto en Escala Científica 1:1 como en Escala Exploratoria.
  material.onBeforeCompile = shader => {
    shader.uniforms.centroPlaneta = { value: centroPlaneta };
    shader.uniforms.radioPlaneta = { value: radio };
    shader.vertexShader = `varying vec3 vPosicionAnillo;\nvarying vec3 vDesplazamientoCentro;\nvarying float vEscalaMundo;\n${shader.vertexShader}`
      .replace('#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvPosicionAnillo = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvDesplazamientoCentro = mat3(modelMatrix) * transformed;\nvEscalaMundo = length(modelMatrix[0].xyz);');
    shader.fragmentShader = `varying vec3 vPosicionAnillo;\nvarying vec3 vDesplazamientoCentro;\nvarying float vEscalaMundo;\nuniform vec3 centroPlaneta;\nuniform float radioPlaneta;\n${shader.fragmentShader}`
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 haciaSol = normalize(-vPosicionAnillo);
        vec3 haciaPlaneta = -vDesplazamientoCentro;
        float radioEfectivo = radioPlaneta * max(vEscalaMundo, 1e-6);
        float delante = dot(haciaPlaneta, haciaSol);
        float distanciaEje = length(haciaPlaneta - haciaSol * max(delante, 0.0));
        float sombra = step(0.0, delante) *
          (1.0 - smoothstep(radioEfectivo * 0.92, radioEfectivo * 1.25, distanciaEje));
        diffuseColor.rgb *= 1.0 - 0.6 * sombra;
      `);
  };
  material.customProgramCacheKey = () => 'sombra-anillos-v2';
  const anillos = new THREE.Mesh(geometria, material);
  anillos.rotation.x = -Math.PI / 2;
  grupo.add(anillos);
  cargarTextura('saturn_ring_alpha.png', texture => {
    material.map = texture;
    material.color.set(0xffffff);
    material.opacity = 1;
    material.needsUpdate = true;
    uniformeMapaSombra.value = texture;
  });
}

function agregarSombraAnillosSobreSaturno(material, centroPlaneta) {
  // The same observed radial alpha strip as the visible ring controls attenuation.
  const empty = new THREE.DataTexture(new Uint8Array([255, 255, 255, 0]), 1, 1,
    THREE.RGBAFormat);
  empty.needsUpdate = true;
  const ringMap = { value: empty };
  material.onBeforeCompile = shader => {
    shader.uniforms.saturnCenter = { value: centroPlaneta };
    shader.uniforms.saturnRingMap = ringMap;
    shader.vertexShader = `varying vec3 vSaturnSurfaceWorld;
      varying vec3 vSaturnRingNormal; varying float vSaturnRadiusWorld;\n${shader.vertexShader}`
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vSaturnSurfaceWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vSaturnRingNormal = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));
        vSaturnRadiusWorld = length(modelMatrix[0].xyz);`);
    shader.fragmentShader = `varying vec3 vSaturnSurfaceWorld;
      varying vec3 vSaturnRingNormal; varying float vSaturnRadiusWorld;
      uniform vec3 saturnCenter; uniform sampler2D saturnRingMap;\n${shader.fragmentShader}`
      .replace('#include <opaque_fragment>', `
        vec3 fromCenter = vSaturnSurfaceWorld - saturnCenter;
        vec3 sunRay = normalize(-vSaturnSurfaceWorld);
        vec3 ringNormal = normalize(vSaturnRingNormal);
        float rayDotPlane = dot(sunRay, ringNormal);
        if (abs(rayDotPlane) > 1e-5) {
          float rayLength = -dot(fromCenter, ringNormal) / rayDotPlane;
          if (rayLength > 0.0) {
            float ringRadius = length(fromCenter + sunRay * rayLength);
            float inner = vSaturnRadiusWorld * 1.32;
            float outer = vSaturnRadiusWorld * 2.02;
            if (ringRadius >= inner && ringRadius <= outer) {
              float radialU = (ringRadius - inner) / (outer - inner);
              float ringOpacity = texture2D(saturnRingMap, vec2(radialU, 0.5)).a;
              outgoingLight *= 1.0 - 0.48 * ringOpacity;
            }
          }
        }
        #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => 'saturn-ring-shadow-v1';
  return ringMap;
}

export function crearPlaneta(planeta) {
  const aspecto = ASPECTO[planeta.nombre];
  const posicion = new THREE.Group();
  const eje = new THREE.Group();
  eje.rotation.z = THREE.MathUtils.degToRad(aspecto.inclinacion);
  posicion.add(eje);

  const MaterialSuperficie = planeta.nombre === 'Tierra'
    ? THREE.MeshPhysicalMaterial
    : THREE.MeshStandardMaterial;
  const material = new MaterialSuperficie({
    color: planeta.color,
    roughness: planeta.nombre === 'Tierra' ? 0.72 : 1,
    metalness: 0,
    ...(planeta.nombre === 'Tierra' ? { specularIntensity: 0.42 } : {})
  });
  if (planeta.nombre === 'Tierra') {
    // El mapa original deja el océano casi negro (muy especular). Conservamos
    // la textura y limitamos solo la rugosidad mínima en el sombreador.
    material.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = max(roughnessFactor, 0.55);'
      );
    };
    material.customProgramCacheKey = () => 'rugosidad-oceano-v1';
  }
  const superficie = new THREE.Mesh(sphereGeometry, material);
  superficie.scale.setScalar(planeta.radio);
  eje.add(superficie);
  aplicarMapaColor(material, aspecto.textura);

  if (planeta.nombre === 'Tierra') {
    cargarTextura('earth_normal_map.png', texture => {
      material.normalMap = texture;
      material.normalScale.set(0.22, 0.22);
      material.needsUpdate = true;
    }, { color: false });
    cargarTextura('earth_roughness.png', texture => {
      material.roughnessMap = texture;
      material.roughness = 1;
      material.needsUpdate = true;
    }, { color: false });
    const nubes = agregarCapaNubes(eje, planeta.radio, 'earth_clouds.jpg', 0.7);
    eje.add(crearAtmosferaTierra(planeta.radio));
    eje.userData.nubes = nubes;
  }

  if (planeta.nombre === 'Venus') {
    agregarCapaNubes(eje, planeta.radio, 'venus_atmosphere.jpg', 0.88);
  }

  if (planeta.nombre === 'Saturno') {
    const ringMap = agregarSombraAnillosSobreSaturno(material, posicion.position);
    agregarAnillos(eje, planeta.radio, posicion.position, ringMap);
  }

  if (planeta.nombre === 'Urano') {
    eje.add(crearAtmosferaUrano(planeta.radio));
    material.onBeforeCompile = shader => {
      shader.vertexShader = `
        varying vec3 vNormalMundoUrano;
        varying vec3 vPosicionMundoUrano;
        ${shader.vertexShader}
      `.replace('#include <worldpos_vertex>', `
        #include <worldpos_vertex>
        vNormalMundoUrano = normalize(mat3(modelMatrix) * normal);
        vPosicionMundoUrano = (modelMatrix * vec4(transformed, 1.0)).xyz;
      `);
      shader.fragmentShader = `
        varying vec3 vNormalMundoUrano;
        varying vec3 vPosicionMundoUrano;
        ${shader.fragmentShader}
      `.replace('#include <dithering_fragment>', `
        #include <dithering_fragment>
        vec3 haciaSolU = normalize(-vPosicionMundoUrano);
        vec3 vistaU = normalize(cameraPosition - vPosicionMundoUrano);
        float nDotLU = dot(vNormalMundoUrano, haciaSolU);
        float nDotVU = dot(vNormalMundoUrano, vistaU);
        float rimU = pow(clamp(1.0 - max(0.0, nDotVU), 0.0, 1.0), 2.5);
        float solLimbU = smoothstep(-0.2, 0.4, nDotLU);
        gl_FragColor.rgb += vec3(0.34, 0.74, 0.84) * rimU * solLimbU * 0.25;
      `);
    };
    material.customProgramCacheKey = () => 'urano-crescente-v1';
  }

  // El eje > 90° ya representa el sentido retrógrado de Venus y Urano.
  // Un día terrestre se muestra en unos 140 s; la proporción entre planetas se conserva.
  const velocidad = 2 * Math.PI / 140 * (23.9 / Math.abs(aspecto.horas));
  return {
    planeta,
    posicion,
    actualizarGiro(segundos) {
      superficie.rotation.y += velocidad * segundos;
      if (eje.userData.nubes) {
        eje.userData.nubes.rotation.y += velocidad * segundos * 1.04;
      }
    }
  };
}
