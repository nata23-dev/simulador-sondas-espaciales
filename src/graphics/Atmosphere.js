// En este módulo construyo las capas atmosféricas de limbo para la Tierra y Urano
// con sombreadores aditivos y geometrías compartidas de nivel de detalle (LOD).
import * as THREE from 'three';

const vertexShader = `
  varying vec3 vNormalVista;
  varying vec3 vPosicionVista;
  varying vec3 vNormalMundo;
  varying vec3 vPosicionMundo;

  void main() {
    vNormalVista = normalize(normalMatrix * normal);
    vPosicionVista = (modelViewMatrix * vec4(position, 1.0)).xyz;
    vNormalMundo = normalize(mat3(modelMatrix) * normal);
    vPosicionMundo = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * vec4(vPosicionVista, 1.0);
  }
`;

// Calculo el brillo en el limbo diurno y lo atenúo en el hemisferio nocturno.
// Evalúo el ángulo de visión en espacio de cámara (modelViewMatrix en Float64 en CPU)
// para evitar pérdida de precisión Float32 al observar radios físicos 1:1 a distancias en AU.
const fragmentShader = `
  varying vec3 vNormalVista;
  varying vec3 vPosicionVista;
  varying vec3 vNormalMundo;
  varying vec3 vPosicionMundo;

  void main() {
    vec3 normalVista = normalize(vNormalVista);
    vec3 vista = normalize(-vPosicionVista);
    vec3 normalMundo = normalize(vNormalMundo);
    vec3 haciaSol = normalize(-vPosicionMundo);
    float borde = pow(1.0 - abs(dot(normalVista, vista)), 3.2);
    float dia = smoothstep(-0.28, 0.55, dot(normalMundo, haciaSol));
    float alfa = borde * 0.18 * dia;
    gl_FragColor = vec4(0.25, 0.49, 0.95, alfa);
    #include <colorspace_fragment>
  }
`;

// Reutilizo tres esferas unitarias según el nivel de detalle geométrico (LOD) activo.
const geometriasAtmosfera = {
  alto: new THREE.SphereGeometry(1, 48, 32),
  medio: new THREE.SphereGeometry(1, 32, 24),
  bajo: new THREE.SphereGeometry(1, 20, 14)
};

// Vinculo a la malla atmosférica un cambiador de geometría LOD sin recrear el material.
function configurarLodAtmosfera(atmosfera) {
  atmosfera.userData.establecerNivelDetalle = nivel => {
    const sig = geometriasAtmosfera[nivel] ?? geometriasAtmosfera.alto;
    if (atmosfera.geometry !== sig) atmosfera.geometry = sig;
  };
  return atmosfera;
}

/** Construyo el halo atmosférico aditivo de la Tierra escalado ligeramente por encima de su superficie. */
export function crearAtmosferaTierra(radio) {
  const atmosfera = new THREE.Mesh(
    geometriasAtmosfera.alto,
    new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    })
  );
  atmosfera.scale.setScalar(radio * 1.055);
  return configurarLodAtmosfera(atmosfera);
}

// Modelo la atmósfera de Urano con dispersión frontal (forward scattering) para reproducir
// el arco creciente cian característico de la fotografía Voyager 2 PIA00143.
const fragmentShaderUrano = `
  varying vec3 vNormalVista;
  varying vec3 vPosicionVista;
  varying vec3 vNormalMundo;
  varying vec3 vPosicionMundo;

  void main() {
    vec3 normalVista = normalize(vNormalVista);
    vec3 vista = normalize(-vPosicionVista);
    vec3 normalMundo = normalize(vNormalMundo);
    vec3 haciaSol = normalize(-vPosicionMundo);
    float borde = pow(1.0 - abs(dot(normalVista, vista)), 2.6);
    float incidenciaSolar = dot(normalMundo, haciaSol);
    float iluminacionLimb = smoothstep(-0.25, 0.45, incidenciaSolar);
    float dispersionFrontal = pow(max(0.0, dot(-vista, haciaSol)), 1.6);
    float alfa = borde * iluminacionLimb * (0.38 + 0.28 * dispersionFrontal);
    gl_FragColor = vec4(0.38, 0.78, 0.88, alfa);
    #include <colorspace_fragment>
  }
`;

/** Construyo el halo atmosférico cian de Urano con soporte de cambio de LOD geométrico. */
export function crearAtmosferaUrano(radio) {
  const atmosfera = new THREE.Mesh(
    geometriasAtmosfera.alto,
    new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: fragmentShaderUrano,
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    })
  );
  atmosfera.scale.setScalar(radio * 1.045);
  return configurarLodAtmosfera(atmosfera);
}
