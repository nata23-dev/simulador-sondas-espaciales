import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';

import {
  MODOS_ESCALA_VISUAL,
  RADIOS_FISICOS_KM,
  REGIONES_SISTEMA,
  calcularEscalaObjetivoPlaneta,
  calcularEscalaObjetivoSol,
  factorEscalaCientificaCuerpo,
  obtenerRadioFisicoEscena
} from '../src/graphics/ScaleModeConfig.js';
import { UNIDADES_POR_AU } from '../src/graphics/SceneScale.js';
import { crearProteccionTransitosSolares } from '../src/graphics/SolarTransitGuard.js';
import { calcularEncuadreVista } from '../src/graphics/OverviewFraming.js';
import {
  METADATOS_MODELO_VOYAGER,
  MODELOS_VISUALES_SONDA,
  crearSondaVisual,
  normalizarEscenaVoyagerGltf
} from '../src/graphics/SpaceProbeVisual.js';
import {
  computeScientificDistance,
  createMeasurableBodyEndpoint,
  formatLightTime
} from '../src/science/DistanceMeasurement.js';
import { createEphemerisProvider } from '../src/science/EphemerisProvider.js';
import { propagateExperimentalProbe01 } from '../src/science/ExperimentalProbe01.js';
import { KM_PER_AU } from '../src/science/Units.js';

const REPO_ROOT = process.cwd();

async function crearProveedorLocal() {
  const catalogRaw = await fs.readFile(
    path.join(REPO_ROOT, 'public/data/ephemerides-catalog-v1.json'),
    'utf8'
  );
  const catalog = JSON.parse(catalogRaw);
  return createEphemerisProvider({
    catalog,
    loadJson: async relativeFile => {
      const content = await fs.readFile(path.join(REPO_ROOT, 'public', relativeFile), 'utf8');
      return JSON.parse(content);
    }
  });
}

test('modelo oficial Voyager.glb de NASA VTAD: recurso local válido, sin dependencias externas y normalización uniforme 1:1:1', async () => {
  const rutaGlb = path.join(REPO_ROOT, 'public', METADATOS_MODELO_VOYAGER.archivoRelativo);
  const buffer = await fs.readFile(rutaGlb);
  assert.ok(buffer.byteLength > 2_000_000, 'Voyager.glb debe estar almacenado localmente completo');

  // Cabecera binaria estándar glTF 2.0 ('glTF', versión 2)
  assert.equal(buffer.readUInt32LE(0), 0x46546C67);
  assert.equal(buffer.readUInt32LE(4), 2);
  assert.equal(buffer.readUInt32LE(8), buffer.byteLength);

  const jsonLen = buffer.readUInt32LE(12);
  assert.equal(buffer.readUInt32LE(16), 0x4E4F534A);
  const gltfJson = JSON.parse(buffer.subarray(20, 20 + jsonLen).toString('utf8'));

  // Sin URLs externas temporales: texturas y buffers embebidos localmente en el GLB
  for (const img of gltfJson.images ?? []) {
    assert.equal(img.uri, undefined, 'Las texturas de Voyager deben ser locales/embebidas en el GLB');
    assert.equal(typeof img.bufferView, 'number');
  }
  const nombresMateriales = (gltfJson.materials ?? []).map(m => m.name);
  assert.ok(nombresMateriales.includes('brass'), 'Debe conservar el material del Disco de Oro (brass)');

  // Verifica normalización geométrica sobre una jerarquía equivalente al GLB oficial (_root con cubo 'clear' + antena + bus + booms)
  const escenaSintetica = new THREE.Group();
  const rootHelper = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ name: 'clear', transparent: true, opacity: 0 })
  );
  rootHelper.name = '_root';

  const antena = new THREE.Mesh(
    new THREE.CylinderGeometry(1.85, 1.85, 0.45, 16),
    new THREE.MeshStandardMaterial({ name: 'tex_02_AO' })
  );
  antena.name = 'tex_02_AO';
  antena.position.set(0.03, 1.75, -0.02);

  const discoOro = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 0.02, 12),
    new THREE.MeshStandardMaterial({ name: 'brass', metalness: 1, roughness: 0.4 })
  );
  discoOro.name = 'tex_01';
  discoOro.position.set(0.55, 0.85, 0.1);

  const boomMagnetometro = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 8.5, 6),
    new THREE.MeshStandardMaterial({ name: 'tex_02_AO_dark' })
  );
  boomMagnetometro.name = 'tex_02_AO_dark';
  boomMagnetometro.position.set(-3.2, -1.2, 0.4);

  rootHelper.add(antena, discoOro, boomMagnetometro);
  escenaSintetica.add(rootHelper);

  const norm = normalizarEscenaVoyagerGltf(escenaSintetica, { diametroAntenaObjetivo: 0.78 });
  assert.equal(rootHelper.material.visible, false, 'El cubo auxiliar _root debe ocultarse sin ocultar sus hijos');
  assert.equal(norm.mallas.length, 3, 'Las tres mallas físicas deben conservarse y ser seleccionables');
  assert.equal(norm.grupo.scale.x, norm.grupo.scale.y);
  assert.equal(norm.grupo.scale.y, norm.grupo.scale.z);
  assert.ok(norm.radioEnvolvente > 0.3 && norm.radioEnvolvente < 5);

  // Verifica que cambiar apariencia o escala visual en crearSondaVisual no altera nunca la posición física
  const sonda = crearSondaVisual({ cargarModeloGlb: false });
  sonda.actualizarEstadoEscena({ x: -18.4, y: 0.12, z: 26.7 }, 0, { x: -19.1, y: 0.0, z: 25.8 });
  const posFisicaOriginal = sonda.posicion.position.clone();

  sonda.establecerModoEscala(MODOS_ESCALA_VISUAL.EXPLORATORIA, true);
  assert.ok(sonda.posicion.position.equals(posFisicaOriginal));
  sonda.establecerModoEscala(MODOS_ESCALA_VISUAL.CIENTIFICA, true);
  assert.ok(sonda.posicion.position.equals(posFisicaOriginal));

  sonda.establecerApariencia(MODELOS_VISUALES_SONDA.PROCEDURAL);
  assert.equal(sonda.obtenerEstadoModelo().modeloActivo, MODELOS_VISUALES_SONDA.PROCEDURAL);
  assert.ok(sonda.posicion.position.equals(posFisicaOriginal));
});

test('modos de escala visual: Escala Científica 1:1 y Escala Exploratoria conservan intactos los centros astronómicos', () => {
  // En Escala Científica: R_escena / UNIDADES_POR_AU === R_km / KM_PER_AU exactamente
  for (const [nombre, radioKm] of Object.entries(RADIOS_FISICOS_KM)) {
    const radioEscena = obtenerRadioFisicoEscena(nombre);
    const proporcionEscena = radioEscena / UNIDADES_POR_AU;
    const proporcionFisica = radioKm / KM_PER_AU;
    assert.ok(
      Math.abs(proporcionEscena - proporcionFisica) < 1e-15,
      `Proporción 1:1 exacta para ${nombre}`
    );
  }

  // El Sol a escala física (0.1488 u) queda muy por dentro del perihelio de Mercurio (~12.38 u)
  const radioSolCientifico = 5 * calcularEscalaObjetivoSol({
    modoEscala: MODOS_ESCALA_VISUAL.CIENTIFICA,
    distanciaCamaraSol: 800
  });
  assert.ok(radioSolCientifico < 0.16 && radioSolCientifico > 0.14);

  // Protección de tránsitos con modos de escala activos
  let modoEscala = MODOS_ESCALA_VISUAL.CIENTIFICA;
  let seleccionado = null;
  const camera = { position: new THREE.Vector3(900, 300, 600) };
  const objetos = new Map([
    ['Tierra', { planeta: { radio: 1.3 }, posicion: new THREE.Group() }],
    ['Jupiter', { planeta: { radio: 3.2 }, posicion: new THREE.Group() }]
  ]);
  objetos.get('Tierra').posicion.position.set(32, 0, 0);
  objetos.get('Jupiter').posicion.position.set(166.5, 0, 0);
  const posTierraOriginal = objetos.get('Tierra').posicion.position.clone();
  const posJupiterOriginal = objetos.get('Jupiter').posicion.position.clone();

  const politica = crearProteccionTransitosSolares({
    camera,
    objetos,
    nombreSeleccionado: () => seleccionado,
    obtenerModoEscala: () => modoEscala
  });

  for (let i = 0; i < 220; i++) politica.actualizar(1 / 60);
  const factorTierra1a1 = factorEscalaCientificaCuerpo('Tierra', 1.3);
  assert.ok(Math.abs(objetos.get('Tierra').posicion.scale.x - factorTierra1a1) < 1e-4);

  // Modo Exploratorio: desde lejos limita tamaño (< 0.57×, nunca infla a 2.5×); de cerca converge a 1.0
  modoEscala = MODOS_ESCALA_VISUAL.EXPLORATORIA;
  for (let i = 0; i < 240; i++) politica.actualizar(1 / 60);
  assert.ok(objetos.get('Tierra').posicion.scale.x <= 0.57, 'Tierra lejana no debe inflarse');
  assert.ok(objetos.get('Jupiter').posicion.scale.x <= 0.57, 'Júpiter lejano no debe verse gigante');

  seleccionado = 'Tierra';
  camera.position.set(35.5, 0.8, 0);
  for (let i = 0; i < 260; i++) politica.actualizar(1 / 60);
  assert.ok(Math.abs(objetos.get('Tierra').posicion.scale.x - 1.0) < 0.02);

  // Las coordenadas heliocéntricas de los centros jamás se alteran
  assert.ok(objetos.get('Tierra').posicion.position.equals(posTierraOriginal));
  assert.ok(objetos.get('Jupiter').posicion.position.equals(posJupiterOriginal));

  // Encuadre regional: Sistema interior acerca significativamente la cámara respecto al Sistema completo
  function crearNodo(radio, x, y, z) {
    const posicion = new THREE.Group();
    posicion.position.set(x, y, z);
    return { planeta: { radio }, posicion };
  }
  const camFraming = new THREE.PerspectiveCamera(48, 16 / 9, 0.05, 10000);
  const objetosSistema = new Map([
    ['Mercurio', crearNodo(0.7, 12, 0, 0)],
    ['Tierra', crearNodo(1.3, 32, 0, 0)],
    ['Marte', crearNodo(0.9, 48, 0, 0)],
    ['Neptuno', crearNodo(2.1, 960, 0, 0)]
  ]);
  const zona = { width: 1366, height: 768, left: 280, right: 1322, top: 100, bottom: 680 };
  const encuadreCompleto = calcularEncuadreVista(camFraming, objetosSistema, zona, {
    region: REGIONES_SISTEMA.COMPLETO,
    usarRadiosActuales: true
  });
  const encuadreInterior = calcularEncuadreVista(camFraming, objetosSistema, zona, {
    region: REGIONES_SISTEMA.INTERIOR,
    usarRadiosActuales: true
  });
  assert.ok(
    encuadreInterior.posicion.length() < encuadreCompleto.posicion.length() * 0.25,
    'El encuadre del Sistema interior debe resolver con claridad la región <= 2 AU'
  );
});

test('medición científica de distancias 3D: exactitud en km/AU, invariancia frente a escala visual y validación temporal/referencial', async () => {
  const provider = await crearProveedorLocal();
  const trayectoria = await propagateExperimentalProbe01({ ephemerisProvider: provider });

  // Estado en época inicial T0: 2026-10-10 00:00:00 TDB (JD 2461323.5)
  const jdT0 = trayectoria.epochJdTdb;
  const estadoTierraT0 = trayectoria.ephemerisField.getBodyStateAtElapsedSeconds('399', 0);
  const estadoMarteT0 = trayectoria.ephemerisField.getBodyStateAtElapsedSeconds('499', 0);
  const estadoSondaT0 = trayectoria.getStateAtElapsedSeconds(0);

  const solEp = createMeasurableBodyEndpoint({
    id: 'Sol',
    name: 'Sol',
    positionKm: { x: 0, y: 0, z: 0 },
    jdTdb: jdT0,
    epochLabelTdb: '2026-10-10 · 00:00:00 TDB',
    source: 'Origen heliocéntrico'
  });
  const tierraEp = createMeasurableBodyEndpoint({
    id: 'Tierra',
    name: 'Tierra',
    positionKm: estadoTierraT0.position,
    jdTdb: estadoTierraT0.jdTdb,
    epochLabelTdb: '2026-10-10 · 00:00:00 TDB',
    source: 'NASA/JPL Horizons'
  });
  const marteEp = createMeasurableBodyEndpoint({
    id: 'Marte',
    name: 'Marte',
    positionKm: estadoMarteT0.position,
    jdTdb: estadoMarteT0.jdTdb,
    epochLabelTdb: '2026-10-10 · 00:00:00 TDB',
    source: 'NASA/JPL Horizons'
  });
  const sondaEp = createMeasurableBodyEndpoint({
    id: 'sonda-experimental-01',
    name: 'Sonda Experimental 01',
    positionKm: estadoSondaT0.position,
    jdTdb: estadoSondaT0.time.jdTdb,
    epochLabelTdb: '2026-10-10 · 00:00:00 TDB',
    source: 'DOPRI54'
  });

  // 1. Distancia Sol <-> Tierra (~1 AU)
  const distSolTierra = computeScientificDistance(solEp, tierraEp);
  assert.equal(distSolTierra.status, 'valid');
  assert.ok(distSolTierra.distanceAu > 0.995 && distSolTierra.distanceAu < 1.005);
  assert.ok(Math.abs(distSolTierra.distanceKm - distSolTierra.distanceAu * KM_PER_AU) < 1e-6);
  assert.match(formatLightTime(distSolTierra.lightTimeSeconds), /8 min/);

  // 2. Distancia Sol <-> Sonda Experimental 01 y Tierra <-> Sonda Experimental 01 en T+0 (~9,04 × 10⁶ km)
  const distSolSondaT0 = computeScientificDistance(solEp, sondaEp);
  assert.equal(distSolSondaT0.status, 'valid');
  const distSolSondaEsperadaKm = Math.hypot(151500000, 45200000, 2400000);
  assert.ok(Math.abs(distSolSondaT0.distanceKm - distSolSondaEsperadaKm) < 1e-6);

  const distTierraSondaT0 = computeScientificDistance(tierraEp, sondaEp);
  assert.equal(distTierraSondaT0.status, 'valid');
  const dxTS = estadoSondaT0.position.x - estadoTierraT0.position.x;
  const dyTS = estadoSondaT0.position.y - estadoTierraT0.position.y;
  const dzTS = estadoSondaT0.position.z - estadoTierraT0.position.z;
  assert.ok(Math.abs(distTierraSondaT0.distanceKm - Math.hypot(dxTS, dyTS, dzTS)) < 1e-6);
  assert.ok(distTierraSondaT0.distanceKm > 8_500_000 && distTierraSondaT0.distanceKm < 9_600_000);
  assert.ok(Math.abs(distTierraSondaT0.distanceAu - distTierraSondaT0.distanceKm / KM_PER_AU) < 1e-12);

  // 3. Distancia Tierra <-> Marte e invariancia exacta (0.0 km) al cambiar modo de escala visual
  const escalaCientifica = calcularEscalaObjetivoPlaneta({
    nombre: 'Marte',
    radioBaseEscena: 0.9,
    modoEscala: MODOS_ESCALA_VISUAL.CIENTIFICA,
    distanciaCamaraCuerpo: 120
  });
  const escalaExploratoria = calcularEscalaObjetivoPlaneta({
    nombre: 'Marte',
    radioBaseEscena: 0.9,
    modoEscala: MODOS_ESCALA_VISUAL.EXPLORATORIA,
    distanciaCamaraCuerpo: 120
  });
  assert.notEqual(escalaCientifica, escalaExploratoria);

  const distTierraMarteModoA = computeScientificDistance(tierraEp, marteEp);
  const distTierraMarteModoB = computeScientificDistance(tierraEp, marteEp);
  assert.equal(distTierraMarteModoA.distanceKm, distTierraMarteModoB.distanceKm);
  assert.equal(distTierraMarteModoA.distanceAu, distTierraMarteModoB.distanceAu);

  // 4. Evolución temporal coherente en T + 10 días
  const seg10d = 10 * 86400;
  const tierra10d = trayectoria.ephemerisField.getBodyStateAtElapsedSeconds('399', seg10d);
  const sonda10d = trayectoria.getStateAtElapsedSeconds(seg10d);
  const distTierraSonda10d = computeScientificDistance(
    createMeasurableBodyEndpoint({
      id: 'Tierra',
      name: 'Tierra',
      positionKm: tierra10d.position,
      jdTdb: tierra10d.jdTdb,
      epochLabelTdb: '2026-10-20 · 00:00:00 TDB',
      source: 'NASA/JPL Horizons'
    }),
    createMeasurableBodyEndpoint({
      id: 'sonda-experimental-01',
      name: 'Sonda Experimental 01',
      positionKm: sonda10d.position,
      jdTdb: sonda10d.time.jdTdb,
      epochLabelTdb: '2026-10-20 · 00:00:00 TDB',
      source: 'DOPRI54'
    })
  );
  assert.equal(distTierraSonda10d.status, 'valid');
  assert.ok(distTierraSonda10d.distanceKm > 2_000_000, 'La sonda debe haberse alejado millones de km tras 10 días');

  // 5. Manejo explícito sin inventar valores ante estados inválidos o incompatibles
  assert.equal(computeScientificDistance(tierraEp, null).status, 'unavailable');
  assert.equal(computeScientificDistance(tierraEp, tierraEp).status, 'same_body');

  const marteOtraFecha = createMeasurableBodyEndpoint({
    id: 'Marte',
    name: 'Marte',
    positionKm: estadoMarteT0.position,
    jdTdb: jdT0 + 1,
    epochLabelTdb: '2026-10-11 · 00:00:00 TDB',
    source: 'NASA/JPL Horizons'
  });
  assert.equal(computeScientificDistance(tierraEp, marteOtraFecha).status, 'epoch_mismatch');

  const marteOtroOrigen = createMeasurableBodyEndpoint({
    id: 'Marte',
    name: 'Marte',
    positionKm: estadoMarteT0.position,
    jdTdb: jdT0,
    epochLabelTdb: '2026-10-10 · 00:00:00 TDB',
    origin: 'SOLAR_SYSTEM_BARYCENTER',
    source: 'NASA/JPL Horizons'
  });
  assert.equal(computeScientificDistance(tierraEp, marteOtroOrigen).status, 'incompatible_reference');
});
