import * as THREE from 'three';
import { aplicarMapaColor, cargarTextura } from './TextureLoader.js';
import { crearAtmosferaTierra } from './Atmosphere.js';

// Oblicuidad aproximada en grados: NASA Planetary Fact Sheet.
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

function agregarAnillos(grupo, radio, centroPlaneta) {
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
  // Sombra geométrica aproximada del planeta sobre el anillo. Usa las
  // posiciones de escena proporcionales a AU; no requiere sombras cúbicas.
  material.onBeforeCompile = shader => {
    shader.uniforms.centroPlaneta = { value: centroPlaneta };
    shader.uniforms.radioPlaneta = { value: radio };
    shader.vertexShader = `varying vec3 vPosicionAnillo;\n${shader.vertexShader}`
      .replace('#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvPosicionAnillo = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = `varying vec3 vPosicionAnillo;\nuniform vec3 centroPlaneta;\nuniform float radioPlaneta;\n${shader.fragmentShader}`
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 haciaSol = normalize(-vPosicionAnillo);
        vec3 haciaPlaneta = centroPlaneta - vPosicionAnillo;
        float delante = dot(haciaPlaneta, haciaSol);
        float distanciaEje = length(haciaPlaneta - haciaSol * max(delante, 0.0));
        float sombra = step(0.0, delante) *
          (1.0 - smoothstep(radioPlaneta * 0.92, radioPlaneta * 1.25, distanciaEje));
        diffuseColor.rgb *= 1.0 - 0.6 * sombra;
      `);
  };
  material.customProgramCacheKey = () => 'sombra-anillos-v1';
  const anillos = new THREE.Mesh(geometria, material);
  anillos.rotation.x = -Math.PI / 2;
  grupo.add(anillos);
  cargarTextura('saturn_ring_alpha.png', texture => {
    material.map = texture;
    material.color.set(0xffffff);
    material.opacity = 1;
    material.needsUpdate = true;
  });
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
    roughness: planeta.nombre === 'Tierra' ? 0.72 : 0.88,
    metalness: 0,
    ...(planeta.nombre === 'Tierra' ? { specularIntensity: 0.42 } : {})
  });
  if (planeta.nombre === 'Tierra') {
    // El mapa original deja el océano casi negro (muy especular). Conservamos
    // la textura y limitamos solo la rugosidad mínima en el shader.
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

  if (planeta.nombre === 'Saturno') agregarAnillos(eje, planeta.radio, posicion.position);

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
