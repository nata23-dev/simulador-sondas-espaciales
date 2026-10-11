
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { crearPlaneta } from './PlanetFactory.js';
import { crearControladorCamara } from './CameraController.js';
import { crearSol } from './Sun.js';
import { crearProteccionTransitosSolares } from './SolarTransitGuard.js';
import { crearFondoEstelar } from './StarField.js';
import { crearEtiquetasPlanetas } from '../ui/PlanetLabels.js';
import { UNIDADES_POR_AU, posicionEscenaProporcional } from './SpatialScale.js';

const PLANETAS = [
  { nombre: 'Mercurio', radio: 0.7, orbitaAU: 0.387, color: 0xaaaaaa },
  { nombre: 'Venus', radio: 1.1, orbitaAU: 0.723, color: 0xe5bd82 },
  { nombre: 'Tierra', radio: 1.3, orbitaAU: 1.000, color: 0x3989ff },
  { nombre: 'Marte', radio: 0.9, orbitaAU: 1.524, color: 0xd9693d },
  { nombre: 'Jupiter', radio: 3.2, orbitaAU: 5.203, color: 0xc9a07a },
  { nombre: 'Saturno', radio: 2.8, orbitaAU: 9.537, color: 0xd5bd88 },
  { nombre: 'Urano', radio: 2.1, orbitaAU: 19.191, color: 0x86d8dd },
  { nombre: 'Neptuno', radio: 2.1, orbitaAU: 30.070, color: 0x4269ed }
];

function crearReferenciaOrbital(radio, interior) {
  const puntos = [];
  const colores = [];
  const color = new THREE.Color(0x82a3b4);
  const muestras = 192;

  // Arco parcial alrededor del planeta: referencia ilustrativa, no trayectoria
  // calculada. El desvanecimiento elimina el aspecto de círculos concéntricos.
  for (let i = 0; i <= muestras; i++) {
    const t = i / muestras;
    const angulo = (t - 0.5) * Math.PI * 1.56;
    const brillo = Math.pow(Math.sin(Math.PI * t), 1.3);
    puntos.push(new THREE.Vector3(Math.cos(angulo) * radio, 0, Math.sin(angulo) * radio));
    colores.push(color.r * brillo, color.g * brillo, color.b * brillo);
  }

  const geometria = new THREE.BufferGeometry().setFromPoints(puntos);
  geometria.setAttribute('color', new THREE.Float32BufferAttribute(colores, 3));
  const opacidadBase = interior ? 0.11 : 0.15;
  const orbita = new THREE.Line(geometria, new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    opacity: opacidadBase
  }));
  orbita.userData.opacidadBase = opacidadBase;
  return orbita;
}

export function createSolarSystem(container, alSeleccionar) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02040c);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 10000);

  // Vista oblicua: mantiene las efemérides intactas y aporta profundidad a los planos orbitales.
  camera.position.set(320, 450, 830);

  const renderer = new THREE.WebGLRenderer({
    antialias: true
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 8;
  controls.maxDistance = 6000;

  // Relleno tenue para conservar información mínima en el hemisferio nocturno.
  scene.add(new THREE.AmbientLight(0x8398b6, 0.16));

  const sol = crearSol();
  scene.add(sol.grupo);

  const objetos = new Map();
  const orbitas = [];
  const orbitasPorNombre = new Map();

  for (const planeta of PLANETAS) {
    const orbita = crearReferenciaOrbital(
      UNIDADES_POR_AU * planeta.orbitaAU, planeta.orbitaAU < 2
    );

    scene.add(orbita);
    orbitas.push(orbita);
    orbitasPorNombre.set(planeta.nombre, orbita);

    const objeto = crearPlaneta(planeta);
    scene.add(objeto.posicion);
    objetos.set(planeta.nombre, objeto);
  }

  function obtenerZonaEncuadre() {
    const lienzo = renderer.domElement.getBoundingClientRect();
    const destino = document.querySelector('.destination-panel > summary').getBoundingClientRect();
    const tiempo = document.querySelector('.timeline-panel').getBoundingClientRect();
    const ancho = container.clientWidth;
    const alto = container.clientHeight;
    const movil = ancho <= 760;
    // Only the HUD footprint changes. The existing view solver and camera
    // controller retain their directions, travel and astronomical positions.
    const left = movil ? 24 : Math.min(ancho * 0.26, destino.right - lienzo.left + 24);
    const top = movil ? destino.bottom - lienzo.top + 22 : 100;
    const bottom = Math.max(top + 80,
      Math.min(alto - 32, tiempo.top - lienzo.top - 30));
    return { width: ancho, height: alto, left, right: ancho - (movil ? 24 : 44), top, bottom };
  }

  const controladorCamara = crearControladorCamara({
    camera,
    controls,
    canvas: renderer.domElement,
    objetos,
    orbitas,
    obtenerZonaEncuadre,
    alSeleccionar
  });

  const transitosSolares = crearProteccionTransitosSolares({
    camera,
    objetos,
    nombreSeleccionado: controladorCamara.nombreSeleccionado
  });

  const fondoEstelar = crearFondoEstelar(camera, renderer.getPixelRatio());
  scene.add(fondoEstelar.grupo);
  const etiquetas = crearEtiquetasPlanetas(container, camera, objetos);
  let orbitasVisibles = true;
  let alCambiarVista = () => {};

  function publicarVista() {
    alCambiarVista(controladorCamara.modoVistaActual());
  }

  function vistaGeneral() {
    controladorCamara.vistaGeneral();
    publicarVista();
  }

  function vistaCinematografica() {
    controladorCamara.vistaCinematografica();
    publicarVista();
  }

  function configurarVisualizacion({ orbitas, etiquetas: mostrarEtiquetas, estrellas } = {}) {
    if (typeof orbitas === 'boolean') orbitasVisibles = orbitas;
    if (typeof mostrarEtiquetas === 'boolean') etiquetas.mostrar(mostrarEtiquetas);
    if (typeof estrellas === 'boolean') fondoEstelar.grupo.visible = estrellas;
  }

  function seleccionarPlaneta(nombre) {
    if (!objetos.has(nombre)) return false;
    controladorCamara.seleccionar(nombre);
    return controladorCamara.explorarSeleccionado();
  }

  function actualizarPosiciones(estados) {
    const seleccionado = controladorCamara.nombreSeleccionado();
    const centroAnterior = seleccionado
      ? objetos.get(seleccionado).posicion.position.clone()
      : null;

    for (const [nombre, objeto] of objetos) {
      const posicion = estados[nombre].posicionAU;

      posicionEscenaProporcional(posicion, objeto.posicion.position);
      const posicionEscena = objeto.posicion.position;
      const orbita = orbitasPorNombre.get(nombre);
      // This illustrative arc passes through the rendered center at this date.
      // It is not a physical orbit or an additional Horizons sample.
      const radioHorizontal = Math.hypot(posicionEscena.x, posicionEscena.z);
      orbita.scale.setScalar(radioHorizontal / (UNIDADES_POR_AU * objeto.planeta.orbitaAU));
      orbita.position.y = posicionEscena.y;
      orbita.rotation.y = -Math.atan2(posicionEscena.z, posicionEscena.x);
    }

    controladorCamara.alActualizarPosiciones(centroAnterior);
  }

  function restablecerCamara() {
    vistaGeneral();
  }

  function ajustarTamano() {
    const ancho = container.clientWidth;
    const alto = container.clientHeight;

    if (!ancho || !alto) return;

    camera.aspect = ancho / alto;
    camera.updateProjectionMatrix();

    renderer.setSize(ancho, alto);
    controladorCamara.alCambiarTamano();
  }

  let tiempoAnterior = performance.now();

  function actualizarExposicion(segundos) {
    const seleccionado = controladorCamara.nombreSeleccionado();
    const objeto = objetos.get(seleccionado);
    let objetivo = 1.05;
    if (objeto) {
      const distancia = camera.position.distanceTo(objeto.posicion.position);
      const relacion = distancia / objeto.planeta.radio;
      const cercano = THREE.MathUtils.clamp((35 - relacion) / 23, 0, 1);
      const adaptacion = cercano * cercano * (3 - 2 * cercano);
      const distanciaAU = objeto.posicion.position.length() / UNIDADES_POR_AU;
      objetivo *= 1 + adaptacion *
        (Math.min(12, Math.pow(distanciaAU, 0.85)) - 1);
    }
    // Camera exposure adapts to a dim distant subject; light and albedo do not.
    renderer.toneMappingExposure = THREE.MathUtils.damp(
      renderer.toneMappingExposure, objetivo, 2.5, segundos
    );
  }

  function animar(tiempo) {
    requestAnimationFrame(animar);
    const delta = Math.max((tiempo - tiempoAnterior) / 1000, 0);
    tiempoAnterior = tiempo;
    for (const objeto of objetos.values()) objeto.actualizarGiro(Math.min(delta, 0.1));
    sol.actualizar(Math.min(delta, 0.1), camera);
    controladorCamara.actualizar(delta);
    actualizarExposicion(Math.min(delta, 0.1));
    if (!orbitasVisibles) for (const orbita of orbitas) orbita.visible = false;
    transitosSolares.actualizar(Math.min(delta, 0.1));
    fondoEstelar.actualizar();
    etiquetas.actualizar(controladorCamara.nombreSeleccionado());
    renderer.render(scene, camera);
  }

  window.addEventListener('resize', ajustarTamano);
  new ResizeObserver(ajustarTamano).observe(container);

  ajustarTamano();
  requestAnimationFrame(animar);

  return {
    actualizarPosiciones,
    configurarVisualizacion,
    seleccionarPlaneta,
    restablecerCamara,
    explorarSeleccionado: controladorCamara.explorarSeleccionado,
    vistaGeneral,
    vistaCinematografica,
    modoVistaActual: controladorCamara.modoVistaActual,
    alCambiarVista(fn) {
      alCambiarVista = fn;
      publicarVista();
    }
  };
}
