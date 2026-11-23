// En este módulo construyo las mallas 3D de los ocho planetas, sus capas secundarias
// (nubes, atmósferas y anillos con sombra mutua), el registro de descarga diferida de texturas
// y la gestión del nivel de detalle geométrico (LOD) compartido con las lunas.
import * as THREE from 'three';
import { aplicarMapaColor, cargarTextura } from './TextureLoader.js';
import { crearAtmosferaTierra, crearAtmosferaUrano } from './Atmosphere.js';
import { registrarTexturaDiferida, vincularMallaTextura, texturasLigeras } from './DeferredTextures.js';

// Genero la clave de carga diferida para las texturas superficiales y capas atmosféricas de cada planeta.
export const claveTexturaPlaneta = nombre => `planeta:${nombre}`;

// Defino la oblicuidad axial aproximada y el periodo de rotación ilustrativo según fichas planetarias de NASA;
// este giro es solo visual y no altera las efemérides ni modela la orientación sideral en una fecha concreta.
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

// Comparto tres esferas unitarias entre planetas y lunas para reducir vértices según el nivel de detalle (LOD).
export const GEOMETRIAS_ESFERA_LOD = Object.freeze({
  alto: new THREE.SphereGeometry(1, 48, 32),
  medio: new THREE.SphereGeometry(1, 32, 24),
  bajo: new THREE.SphereGeometry(1, 16, 12)
});
const sphereGeometry = GEOMETRIAS_ESFERA_LOD.alto;

/**
 * Decido el nivel de detalle geométrico ('alto' = 48×32, 'medio' = 32×24, 'bajo' = 16×12)
 * y si muestro las capas secundarias (nubes y atmósfera de limbo) a partir del perfil de calidad,
 * el radio aparente en píxeles y si el cuerpo está enfocado o seleccionado.
 */
export function resolverNivelLodEsfera({ detalle = 'alto', radioPx = Infinity, seleccionado = false } = {}) {
  if (detalle === 'alto') return { nivel: 'alto', mostrarCapas: true };
  if (seleccionado || radioPx >= 18) return { nivel: 'alto', mostrarCapas: true };
  if (detalle === 'medio') {
    return { nivel: radioPx >= 6 ? 'alto' : 'medio', mostrarCapas: radioPx >= 3 };
  }
  // Con detalle bajo o mínimo evito miles de triángulos subpíxel cuando el disco lejano mide menos de 7 px.
  if (radioPx >= 7) return { nivel: 'medio', mostrarCapas: true };
  return { nivel: 'bajo', mostrarCapas: false };
}

// Construyo una geometría anular remapeando la coordenada U a lo largo del radio porque la textura es una tira radial.
function crearGeometriaAnillos(interior, exterior, divisiones) {
  const geometria = new THREE.RingGeometry(interior, exterior, divisiones, 1);
  const posicion = geometria.getAttribute('position');
  const uv = geometria.getAttribute('uv');
  for (let i = 0; i < posicion.count; i++) {
    const r = Math.hypot(posicion.getX(i), posicion.getY(i));
    uv.setXY(i, (r - interior) / (exterior - interior), 0.5);
  }
  return geometria;
}

// Agrego una capa esférica translúcida de nubes que permanece oculta hasta que su textura termina de cargar.
function agregarCapaNubes(grupo, radio, nombre, opacidad, cargas) {
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
  capa.userData.texturaLista = false;
  capa.userData.ocultaPorLod = false;
  grupo.add(capa);

  cargas.push(() => cargarTextura(nombre, texture => {
    if (nombre === 'earth_clouds.jpg') {
      // Uso la luminancia del mapa en escala de grises de la Tierra como máscara alfa de cobertura nubosa.
      material.alphaMap = texture;
    } else {
      material.map = texture;
    }
    material.needsUpdate = true;
    capa.userData.texturaLista = true;
    capa.visible = !capa.userData.ocultaPorLod;
  }, { color: nombre !== 'earth_clouds.jpg' }));

  return capa;
}

// Construyo los anillos de Saturno con tres niveles de subdivisión LOD y proyección de sombra del planeta.
function agregarAnillos(grupo, radio, centroPlaneta, uniformeMapaSombra, cargas) {
  const interior = radio * 1.32;
  const exterior = radio * 2.02;
  const geometriasAnillo = {
    alto: crearGeometriaAnillos(interior, exterior, 128),
    medio: crearGeometriaAnillos(interior, exterior, 64),
    bajo: crearGeometriaAnillos(interior, exterior, 32)
  };
  const geometria = geometriasAnillo.alto;

  const material = new THREE.MeshStandardMaterial({
    color: 0xc4b08b,
    side: THREE.DoubleSide,
    roughness: 1,
    transparent: true,
    opacity: 0.75,
    depthWrite: false
  });
  // Proyecto una sombra geométrica aproximada de Saturno sobre el plano del anillo evaluando el vector local
  // respecto al centro y escalando el radio con modelMatrix para conservar precisión tanto en escala 1:1 como exploratoria.
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
  anillos.userData.geometriasLod = geometriasAnillo;
  grupo.add(anillos);
  cargas.push(() => cargarTextura('saturn_ring_alpha.png', texture => {
    material.map = texture;
    material.color.set(0xffffff);
    material.opacity = 1;
    material.needsUpdate = true;
    uniformeMapaSombra.value = texture;
  }));
  return anillos;
}

// Proyecto sobre la superficie de Saturno la sombra radial de sus anillos usando la misma textura alfa radial.
function agregarSombraAnillosSobreSaturno(material, centroPlaneta) {
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

/** Construyo el nodo 3D completo de un planeta con su inclinación axial, capas, LOD y utilidades de giro geográfico. */
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
    // Acoto la rugosidad mínima en el sombreador para evitar que el mapa original vuelva los océanos excesivamente especulares.
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
  // Aplico un tinte gris atenuado en Mercurio para compensar su mapa normalizado bajo la fuerte insolación a 0,4 AU;
  // encolo todas las texturas en el registro diferido para descargarlas solo cuando el disco es visible en pantalla.
  const cargas = [() => aplicarMapaColor(material, aspecto.textura,
    planeta.nombre === 'Mercurio' ? 0xaaaaaa : 0xffffff)];

  let nubes = null;
  let atmosfera = null;
  let anillos = null;

  if (planeta.nombre === 'Tierra') {
    // En perfil ligero (calidad baja o ahorro de datos) omito los mapas secundarios de relieve y rugosidad.
    if (!texturasLigeras()) cargas.push(() => cargarTextura('earth_normal_map.png', texture => {
      material.normalMap = texture;
      material.normalScale.set(0.22, 0.22);
      material.needsUpdate = true;
    }, { color: false }));
    if (!texturasLigeras()) cargas.push(() => cargarTextura('earth_roughness.png', texture => {
      material.roughnessMap = texture;
      material.roughness = 1;
      material.needsUpdate = true;
    }, { color: false }));
    nubes = agregarCapaNubes(eje, planeta.radio, 'earth_clouds.jpg', 0.7, cargas);
    atmosfera = crearAtmosferaTierra(planeta.radio);
    eje.add(atmosfera);
    eje.userData.nubes = nubes;
  }

  if (planeta.nombre === 'Venus') {
    nubes = agregarCapaNubes(eje, planeta.radio, 'venus_atmosphere.jpg', 0.88, cargas);
    eje.userData.nubes = nubes;
  }

  if (planeta.nombre === 'Saturno') {
    const ringMap = agregarSombraAnillosSobreSaturno(material, posicion.position);
    anillos = agregarAnillos(eje, planeta.radio, posicion.position, ringMap, cargas);
  }

  if (planeta.nombre === 'Urano') {
    atmosfera = crearAtmosferaUrano(planeta.radio);
    eje.add(atmosfera);
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

  registrarTexturaDiferida(claveTexturaPlaneta(planeta.nombre), () => { for (const cargar of cargas) cargar(); });
  vincularMallaTextura(claveTexturaPlaneta(planeta.nombre), superficie);

  // Uso la inclinación >90° para el sentido retrógrado de Venus y Urano y escalo un día terrestre a ~140 s.
  const velocidad = 2 * Math.PI / 140 * (23.9 / Math.abs(aspecto.horas));
  let nivelDetalleActual = 'alto';
  return {
    planeta,
    posicion,
    obtenerNivelDetalle: () => nivelDetalleActual,
    // Actualizo la geometría LOD de superficie, nubes, atmósfera y anillos sin recrear materiales.
    actualizarNivelDetalle({ detalle = 'alto', radioPx = Infinity, seleccionado = false } = {}) {
      const { nivel, mostrarCapas } = resolverNivelLodEsfera({ detalle, radioPx, seleccionado });
      nivelDetalleActual = nivel;
      const geoEsfera = GEOMETRIAS_ESFERA_LOD[nivel] ?? GEOMETRIAS_ESFERA_LOD.alto;
      if (superficie.geometry !== geoEsfera) superficie.geometry = geoEsfera;
      if (nubes) {
        if (nubes.geometry !== geoEsfera) nubes.geometry = geoEsfera;
        nubes.userData.ocultaPorLod = !mostrarCapas;
        nubes.visible = Boolean(nubes.userData.texturaLista) && mostrarCapas;
      }
      if (atmosfera) {
        atmosfera.visible = mostrarCapas;
        atmosfera.userData.establecerNivelDetalle?.(nivel);
      }
      if (anillos?.userData?.geometriasLod) {
        const geoAnillo = anillos.userData.geometriasLod[nivel] ?? anillos.userData.geometriasLod.alto;
        if (anillos.geometry !== geoAnillo) anillos.geometry = geoAnillo;
      }
    },
    actualizarGiro(segundos) {
      superficie.rotation.y += velocidad * segundos;
      if (eje.userData.nubes) {
        eje.userData.nubes.rotation.y += velocidad * segundos * 1.04;
      }
    },
    // Alineo el meridiano `lonDeg` (textura equirectangular con u = 0 en 180° O) con `dirMundo` proyectada en el ecuador
    // para preparar visualmente el encuadre previo a un lanzamiento 3D, arrastrando las nubes con el mismo giro.
    orientarMeridiano(lonDeg, dirMundo) {
      const a = THREE.MathUtils.degToRad(lonDeg + 180);
      const angulo = (x, z) => Math.atan2(-z, x);
      const destino = dirMundo.clone().applyQuaternion(eje.getWorldQuaternion(new THREE.Quaternion()).invert());
      const nuevo = angulo(destino.x, destino.z) - angulo(-Math.cos(a), Math.sin(a));
      if (eje.userData.nubes) eje.userData.nubes.rotation.y += nuevo - superficie.rotation.y;
      superficie.rotation.y = nuevo;
    },
    /** Calculo en coordenadas de mundo la dirección radial correspondiente a una latitud y longitud sobre el planeta. */
    direccionGeografica(latDeg, lonDeg, destino = new THREE.Vector3()) {
      const a = THREE.MathUtils.degToRad(lonDeg + 180), f = THREE.MathUtils.degToRad(latDeg);
      return destino.set(-Math.cos(a) * Math.cos(f), Math.sin(f), Math.sin(a) * Math.cos(f)).applyQuaternion(superficie.getWorldQuaternion(new THREE.Quaternion()));
    }
  };
}
