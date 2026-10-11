import * as THREE from 'three';

const superficieVertex = `
  varying vec3 vPosicion;
  varying vec3 vNormalMundo;
  varying vec3 vPosicionMundo;

  void main() {
    vPosicion = position;
    vNormalMundo = normalize(mat3(modelMatrix) * normal);
    vPosicionMundo = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const superficieFragment = `
  uniform float uTiempo;
  varying vec3 vPosicion;
  varying vec3 vNormalMundo;
  varying vec3 vPosicionMundo;

  float hash(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yxz + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float ruido(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
          mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
          mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z
    );
  }

  void main() {
    vec3 p = normalize(vPosicion);
    float movimiento = uTiempo * 0.012;
    float regiones = ruido(p * 8.0 + vec3(movimiento, 0.0, 0.0));
    float celulas = ruido(p * 27.0 + vec3(0.0, movimiento, 0.0));
    float granulos = ruido(p * 84.0 + vec3(0.0, movimiento * 2.0, 0.0));
    float brillo = smoothstep(0.25, 0.75,
      0.55 * regiones + 0.38 * celulas + 0.07 * granulos);
    float filamentos = smoothstep(0.70, 0.88,
      ruido(p * 15.0 + vec3(movimiento * 0.5, 0.0, 0.0)));
    float vista = max(dot(normalize(vNormalMundo),
      normalize(cameraPosition - vPosicionMundo)), 0.0);
    vec3 color = mix(vec3(0.78, 0.22, 0.025), vec3(1.40, 0.60, 0.14), brillo);
    color *= (1.0 - 0.26 * filamentos) * mix(0.68, 1.0, sqrt(vista));
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const coronaVertex = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const coronaFragment = `
  uniform float uIntensidad;
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    float borde = 5.0 / 23.0;
    float fuera = max(r - borde, 0.0);
    // El brillo empieza fuera del disco físico, sin un segundo disco translúcido.
    float entrada = smoothstep(borde * 0.98, borde * 1.20, r);
    float angulo = atan(p.y, p.x);
    float estructura = 0.91 + 0.09 * sin(angulo * 11.0 + sin(angulo * 5.0));
    float nucleo = exp(-fuera * 8.5);
    float halo = exp(-fuera * 3.8);
    float alfa = uIntensidad * entrada * estructura * (0.27 * nucleo + 0.035 * halo);
    gl_FragColor = vec4(1.0, 0.42, 0.11, alfa);
    #include <colorspace_fragment>
  }
`;

export function crearSol() {
  const grupo = new THREE.Group();
  const material = new THREE.ShaderMaterial({
    uniforms: { uTiempo: { value: 0 } },
    vertexShader: superficieVertex,
    fragmentShader: superficieFragment
  });
  const superficie = new THREE.Mesh(new THREE.SphereGeometry(5, 64, 48), material);
  grupo.add(superficie);

  // Aproximación local de bloom: una sola lámina aditiva, sin desenfocar planetas ni estrellas.
  const corona = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 46),
    new THREE.ShaderMaterial({
      uniforms: { uIntensidad: { value: 1 } },
      vertexShader: coronaVertex,
      fragmentShader: coronaFragment,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    })
  );
  corona.renderOrder = 1;
  grupo.add(corona);
  const intensidadCorona = corona.material.uniforms.uIntensidad;

  // Las órbitas están comprimidas para la visualización: esta potencia se calibra en
  // unidades de la escena y no representa luminosidad ni distancias astronómicas.
  const luz = new THREE.PointLight(0xfff3db, 4300, 0, 2);
  grupo.add(luz);

  return {
    grupo,
    luz,
    actualizar(segundos, camera) {
      material.uniforms.uTiempo.value += segundos;
      superficie.rotation.y += segundos * 0.0025;
      corona.quaternion.copy(camera.quaternion);
      intensidadCorona.value = THREE.MathUtils.lerp(
        0.62, 1, THREE.MathUtils.smoothstep(camera.position.length(), 30, 140)
      );
    }
  };
}
