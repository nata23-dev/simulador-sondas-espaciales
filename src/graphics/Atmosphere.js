import * as THREE from 'three';

const vertexShader = `
  varying vec3 vNormalMundo;
  varying vec3 vPosicionMundo;

  void main() {
    vNormalMundo = normalize(mat3(modelMatrix) * normal);
    vPosicionMundo = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  varying vec3 vNormalMundo;
  varying vec3 vPosicionMundo;

  void main() {
    vec3 normal = normalize(vNormalMundo);
    vec3 vista = normalize(cameraPosition - vPosicionMundo);
    vec3 haciaSol = normalize(-vPosicionMundo);
    float borde = pow(1.0 - abs(dot(normal, vista)), 3.2);
    float dia = smoothstep(-0.28, 0.55, dot(normal, haciaSol));
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
