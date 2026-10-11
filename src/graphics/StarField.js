import * as THREE from 'three';
import { cargarCatalogoHipparcos, direccionICRSEscena } from './StarCatalog.js';

// La esfera sigue a la cámara y permanece dentro del far=10000 sin paralaje.
const RADIO_CIELO = 1800;

function colorEstelar(indiceBV, destino) {
  if (!Number.isFinite(indiceBV)) return destino.set(0xf5f3ed);
  if (indiceBV < 0) return destino.set(0xa9c7ff);
  if (indiceBV < 0.35) return destino.set(0xd2e0ff);
  if (indiceBV < 0.8) return destino.set(0xf5f3ed);
  if (indiceBV < 1.3) return destino.set(0xffdfb2);
  return destino.set(0xffb17d);
}

function crearGeometriaCatalogo(registros) {
  const posiciones = [];
  const colores = [];
  const tamanos = [];
  const color = new THREE.Color();

  for (let i = 0; i < registros.length; i += 4) {
    const direccion = direccionICRSEscena(registros[i], registros[i + 1]);
    posiciones.push(direccion.x * RADIO_CIELO, direccion.y * RADIO_CIELO, direccion.z * RADIO_CIELO);

    // La magnitud y B-V son medidos; su conversión a píxeles y RGB es ilustrativa.
    const brillo = THREE.MathUtils.clamp((6.5 - registros[i + 2]) / 7.94, 0, 1);
    const intensidad = 0.024 + 0.84 * Math.pow(brillo, 2.1);
    colorEstelar(registros[i + 3], color).multiplyScalar(intensidad);
    colores.push(color.r, color.g, color.b);
    tamanos.push(1.2 + 2.8 * Math.pow(brillo, 1.7));
  }

  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute('position', new THREE.Float32BufferAttribute(posiciones, 3));
  geometria.setAttribute('aColor', new THREE.Float32BufferAttribute(colores, 3));
  geometria.setAttribute('aSize', new THREE.Float32BufferAttribute(tamanos, 1));
  return geometria;
}

function crearBandaGalactica() {
  // Polo galáctico norte J2000. La luminosidad y el detalle de la banda son ilustrativos.
  const polo = direccionICRSEscena(192.8594812065348, 27.12825118085622);
  const material = new THREE.ShaderMaterial({
    uniforms: { uPoloGalactico: { value: polo } },
    vertexShader: `
      varying vec3 vDireccion;
      void main() {
        vDireccion = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uPoloGalactico;
      varying vec3 vDireccion;
      void main() {
        vec3 direccion = normalize(vDireccion);
        float latitud = abs(dot(direccion, uPoloGalactico));
        float banda = exp(-pow(latitud / 0.21, 2.0));
        float detalle = 0.82
          + 0.10 * sin(direccion.x * 23.0 + direccion.z * 17.0)
          + 0.08 * sin(direccion.y * 43.0 - direccion.z * 31.0);
        gl_FragColor = vec4(vec3(0.10, 0.13, 0.22), 0.13 * banda * detalle);
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    toneMapped: false
  });
  const banda = new THREE.Mesh(new THREE.SphereGeometry(RADIO_CIELO + 10, 32, 16), material);
  banda.renderOrder = -20;
  return banda;
}

function crearMaterialEstrellas(pixelRatio) {
  return new THREE.ShaderMaterial({
    uniforms: { uPixelRatio: { value: pixelRatio } },
    vertexShader: `
      attribute vec3 aColor;
      attribute float aSize;
      uniform float uPixelRatio;
      varying vec3 vColor;
      void main() {
        vColor = aColor;
        gl_PointSize = aSize * uPixelRatio;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        float radio = length(gl_PointCoord - vec2(0.5));
        float opacidad = 1.0 - smoothstep(0.22, 0.5, radio);
        gl_FragColor = vec4(vColor, opacidad);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    toneMapped: false
  });
}

export function crearFondoEstelar(camera, pixelRatio) {
  const grupo = new THREE.Group();
  grupo.add(crearBandaGalactica());

  cargarCatalogoHipparcos()
    .then(registros => {
      const estrellas = new THREE.Points(crearGeometriaCatalogo(registros), crearMaterialEstrellas(pixelRatio));
      estrellas.renderOrder = -19;
      grupo.add(estrellas);
    })
    .catch(error => console.error('Error al cargar el fondo estelar:', error));

  function actualizar() {
    // Traslación solidaria con la cámara, orientación inercial: sin paralaje artificial.
    grupo.position.copy(camera.position);
  }

  actualizar();
  return { grupo, actualizar };
}
