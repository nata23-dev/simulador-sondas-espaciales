import * as THREE from 'three';
import {
  MODOS_ESCALA_VISUAL,
  calcularEscalaObjetivoSol
} from './ScaleModeConfig.js';

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

function crearTexturaDestelloSolar() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const grad = ctx.createRadialGradient(64, 64, 1, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255, 250, 236, 1.0)');
  grad.addColorStop(0.12, 'rgba(255, 214, 145, 0.85)');
  grad.addColorStop(0.35, 'rgba(255, 138, 48, 0.25)');
  grad.addColorStop(0.7, 'rgba(255, 102, 24, 0.05)');
  grad.addColorStop(1, 'rgba(255, 90, 15, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function crearSol() {
  const grupo = new THREE.Group();
  const material = new THREE.ShaderMaterial({
    uniforms: { uTiempo: { value: 0 } },
    vertexShader: superficieVertex,
    fragmentShader: superficieFragment
  });
  const superficie = new THREE.Mesh(new THREE.SphereGeometry(5, 64, 48), material);
  grupo.add(superficie);

  // El resplandor usa una sola lámina aditiva, sin desenfocar planetas ni estrellas.
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

  // Resplandor estelar puntual cuando el Sol se observa a escala física 1:1 desde grandes distancias.
  const materialDestello = new THREE.SpriteMaterial({
    map: crearTexturaDestelloSolar(),
    color: 0xffe8c2,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });
  const destelloLejano = new THREE.Sprite(materialDestello);
  destelloLejano.renderOrder = 2;
  grupo.add(destelloLejano);

  // La intensidad se calibra para las unidades de la escena; las posiciones
  // heliocéntricas siguen proporcionales y la luz no simula luminosidad física.
  const luz = new THREE.PointLight(0xfff3db, 4300, 0, 2);
  grupo.add(luz);

  let modoEscala = MODOS_ESCALA_VISUAL.CIENTIFICA;
  let escalaActual = calcularEscalaObjetivoSol({ modoEscala, distanciaCamaraSol: 900 });
  superficie.scale.setScalar(escalaActual);
  corona.scale.setScalar(escalaActual);

  return {
    grupo,
    luz,
    radioActualEscena: () => 5 * escalaActual,
    establecerModoEscala(nuevoModo) {
      if (nuevoModo === MODOS_ESCALA_VISUAL.CIENTIFICA || nuevoModo === MODOS_ESCALA_VISUAL.EXPLORATORIA) {
        modoEscala = nuevoModo;
      }
    },
    actualizar(segundos, camera) {
      material.uniforms.uTiempo.value += segundos;
      superficie.rotation.y += segundos * 0.0025;
      corona.quaternion.copy(camera.quaternion);

      const distanciaSol = camera.position.length();
      const objetivoEscala = calcularEscalaObjetivoSol({
        modoEscala,
        distanciaCamaraSol: distanciaSol
      });
      const mezcla = 1 - Math.exp(-7 * Math.max(segundos, 0.001));
      escalaActual += (objetivoEscala - escalaActual) * mezcla;
      superficie.scale.setScalar(escalaActual);
      corona.scale.setScalar(escalaActual);

      intensidadCorona.value = THREE.MathUtils.lerp(
        0.62, 1, THREE.MathUtils.smoothstep(distanciaSol, 30 * escalaActual, 140 * escalaActual)
      );

      // Si el disco físico solar subtiende un ángulo muy pequeño, el destello puntual mantiene su presencia estelar
      // compensando el FOV activo para conservar tamaño angular aparente limpio incluso con teleobjetivo ISS (0,424°).
      const radioEfectivo = 5 * escalaActual;
      const factorFov = Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) * 0.5)
        / Math.tan(THREE.MathUtils.degToRad(48) * 0.5);
      const anguloAparente = (radioEfectivo / Math.max(distanciaSol, 1e-3)) / Math.max(factorFov, 1e-3);
      const factorPuntual = 1 - THREE.MathUtils.smoothstep(anguloAparente, 0.0015, 0.008);
      materialDestello.opacity = 0.88 * factorPuntual;
      destelloLejano.visible = materialDestello.opacity > 0.01;
      if (destelloLejano.visible) {
        const tamanoDestello = THREE.MathUtils.clamp(distanciaSol * 0.028 * factorFov, 0.02, 160);
        destelloLejano.scale.setScalar(tamanoDestello);
      }
    }
  };
}
