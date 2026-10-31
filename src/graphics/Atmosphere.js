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

// El brillo aparece en el borde del planeta y se atenúa en el lado nocturno.
// El ángulo de visión se evalúa en espacio de cámara (modelViewMatrix en Float64 CPU)
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
    float alfa = borde * (0.035 + 0.18 * dia);
    gl_FragColor = vec4(0.25, 0.49, 0.95, alfa);
    #include <colorspace_fragment>
  }
`;

export function crearAtmosferaTierra(radio) {
  const atmosfera = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 32),
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
  return atmosfera;
}
