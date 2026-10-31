import * as THREE from 'three';
import { UNIDADES_POR_AU } from './SceneScale.js';
import { KM_PER_AU } from '../science/Units.js';
import { MODOS_ESCALA_VISUAL } from './ScaleModeConfig.js';
import { HISTORICAL_ENCOUNTER_MOONS } from '../science/HistoricalEphemerisResolver.js';

/**
 * Dirección aproximada de proa del viento interestelar local en coordenadas eclípticas J2000:
 * longitud eclíptica ~255,4°, latitud eclíptica ~+5,2° (observaciones IBEX / Voyager).
 * Convertida a ejes de escena Three.js: (x_ecl, z_ecl, -y_ecl).
 */
function direccionProaInterestelarEscena() {
  const lon = THREE.MathUtils.degToRad(255.4);
  const lat = THREE.MathUtils.degToRad(5.2);
  const xEcl = Math.cos(lat) * Math.cos(lon);
  const yEcl = Math.cos(lat) * Math.sin(lon);
  const zEcl = Math.sin(lat);
  return new THREE.Vector3(xEcl, zEcl, -yEcl).normalize();
}

/**
 * Superficie paramétrica asimétrica conceptual (NO esférica) para representar
 * de forma ilustrativa el choque de terminación (~84–94 AU en proa) y la heliopausa
 * (~119–122 AU en proa, elongada hacia la cola heliosférica y ligeramente comprimida
 * en el flanco austral por el campo magnético interestelar local).
 */
function radioHeliosfericoAsimetricoAU(dirUnit, {
  radioProaAU,
  compresionAustralAU,
  elongacionColaFactor
}) {
  const proa = direccionProaInterestelarEscena();
  const cosenoProa = dirUnit.dot(proa); // +1 hacia proa interestelar, -1 hacia cola heliosférica
  const factorCola = cosenoProa >= 0
    ? 1 - 0.08 * cosenoProa
    : 1 + elongacionColaFactor * Math.pow(-cosenoProa, 1.35);
  const asimetriaSur = dirUnit.y < 0 ? compresionAustralAU * (-dirUnit.y) : 0;
  return Math.max(40, radioProaAU * factorCola - asimetriaSur);
}

function construirMallaContornosAsimetricos(opciones, colorHex, opacidad) {
  const grupo = new THREE.Group();
  const material = new THREE.LineBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: opacidad,
    depthWrite: false
  });

  const dir = new THREE.Vector3();
  const paralelos = [-0.62, -0.30, 0, 0.30, 0.62];
  const muestras = 128;

  for (const sinLat of paralelos) {
    const cosLat = Math.sqrt(Math.max(0, 1 - sinLat * sinLat));
    const puntos = [];
    for (let i = 0; i <= muestras; i++) {
      const az = (i / muestras) * Math.PI * 2;
      dir.set(cosLat * Math.cos(az), sinLat, cosLat * Math.sin(az)).normalize();
      const rEscena = radioHeliosfericoAsimetricoAU(dir, opciones) * UNIDADES_POR_AU;
      puntos.push(dir.clone().multiplyScalar(rEscena));
    }
    const linea = new THREE.Line(new THREE.BufferGeometry().setFromPoints(puntos), material);
    linea.frustumCulled = false;
    grupo.add(linea);
  }

  const meridianos = 6;
  for (let m = 0; m < meridianos; m++) {
    const az = (m / meridianos) * Math.PI;
    const puntos = [];
    for (let i = 0; i <= muestras; i++) {
      const theta = (i / muestras) * Math.PI * 2;
      dir.set(Math.cos(theta) * Math.cos(az), Math.sin(theta), Math.cos(theta) * Math.sin(az)).normalize();
      const rEscena = radioHeliosfericoAsimetricoAU(dir, opciones) * UNIDADES_POR_AU;
      puntos.push(dir.clone().multiplyScalar(rEscena));
    }
    const linea = new THREE.Line(new THREE.BufferGeometry().setFromPoints(puntos), material);
    linea.frustumCulled = false;
    grupo.add(linea);
  }

  return grupo;
}

/**
 * Capa visual conceptual de la heliosfera exterior (Onda de choque de terminación,
 * Heliovaina y Heliopausa asimétrica) + marcadores discretos en las coordenadas reales
 * donde Voyager 1 y Voyager 2 cruzaron dichas fronteras.
 */
export function crearHeliosferaConceptual() {
  const grupo = new THREE.Group();
  grupo.name = 'HeliosferaConceptualIlustrativa';
  grupo.visible = false;

  const choqueTerminacion = construirMallaContornosAsimetricos(
    { radioProaAU: 96, compresionAustralAU: 11, elongacionColaFactor: 0.72 },
    0xc7a86c,
    0.13
  );
  choqueTerminacion.name = 'OndaChoqueTerminacion_Ilustrativa';
  grupo.add(choqueTerminacion);

  const heliopausa = construirMallaContornosAsimetricos(
    { radioProaAU: 126, compresionAustralAU: 8, elongacionColaFactor: 1.05 },
    0x6e9ab0,
    0.16
  );
  heliopausa.name = 'Heliopausa_Ilustrativa';
  grupo.add(heliopausa);

  const marcadoresCruceGrupo = new THREE.Group();
  marcadoresCruceGrupo.name = 'CrucesFronteraDocumentados';
  grupo.add(marcadoresCruceGrupo);

  function fijarMarcadoresCrucesReales(listaCrucesEscena = []) {
    marcadoresCruceGrupo.clear();
    if (!listaCrucesEscena.length) return;
    for (const item of listaCrucesEscena) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(item.posicionEscena.x, item.posicionEscena.y, item.posicionEscena.z)
      ]);
      const punto = new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          color: item.colorHex ?? 0xe6c88a,
          size: 5.5,
          sizeAttenuation: false,
          transparent: true,
          opacity: 0.86,
          depthWrite: false
        })
      );
      punto.frustumCulled = false;
      marcadoresCruceGrupo.add(punto);
    }
  }

  return {
    grupo,
    mostrar(valor) {
      grupo.visible = Boolean(valor);
    },
    esVisible: () => grupo.visible,
    fijarMarcadoresCrucesReales,
    advertenciaCientifica: 'Representación conceptual ilustrativa y asimétrica de la onda de choque de terminación y la heliopausa; no constituye una frontera esférica fija ni una medición magnetohidrodinámica instantánea.'
  };
}

/**
 * Representación 3D de los satélites naturales prioritarios (Ío, Titán, Tritón)
 * posicionados estrictamente cuando el instante histórico dispone de vectores
 * verificados de JPL Horizons en ventanas de sobrevuelo.
 */
export function crearSatelitesEncuentroVisual() {
  const grupo = new THREE.Group();
  grupo.name = 'SatelitesEncuentroHistorico';

  const APARIENCIA = {
    Io: { color: 0xe3c261, roughness: 0.76, emissive: 0x1c1504 },
    Titan: { color: 0xd99b4e, roughness: 0.62, emissive: 0x1f1204 },
    Triton: { color: 0xd8cfd2, roughness: 0.68, emissive: 0x141216 }
  };

  const geometriaEsfera = new THREE.SphereGeometry(1, 32, 24);
  const mapaSatelites = new Map();

  for (const meta of Object.values(HISTORICAL_ENCOUNTER_MOONS)) {
    const estilo = APARIENCIA[meta.key] ?? { color: 0xcccccc, roughness: 0.7, emissive: 0x111111 };
    const radioFisicoEscena = (meta.radiusKm / KM_PER_AU) * UNIDADES_POR_AU;
    const radioExploratorioEscena = Math.max(radioFisicoEscena * 900, 0.22);

    const nodoPosicion = new THREE.Group();
    nodoPosicion.name = `Satelite_${meta.key}`;
    nodoPosicion.visible = false;

    const malla = new THREE.Mesh(
      geometriaEsfera,
      new THREE.MeshStandardMaterial({
        color: estilo.color,
        roughness: estilo.roughness,
        metalness: 0.05,
        emissive: estilo.emissive,
        emissiveIntensity: 0.22
      })
    );
    malla.userData.nombreSatelite = meta.key;
    nodoPosicion.add(malla);
    nodoPosicion.scale.setScalar(radioFisicoEscena);
    grupo.add(nodoPosicion);

    mapaSatelites.set(meta.key, {
      meta,
      posicion: nodoPosicion,
      malla,
      radioFisicoEscena,
      radioExploratorioEscena
    });
  }

  let modoEscala = MODOS_ESCALA_VISUAL.CIENTIFICA;
  let forzarEscalaUnoAUno = false;

  function aplicarEscalas() {
    const usarFisica = forzarEscalaUnoAUno || modoEscala === MODOS_ESCALA_VISUAL.CIENTIFICA;
    for (const item of mapaSatelites.values()) {
      item.posicion.scale.setScalar(usarFisica ? item.radioFisicoEscena : item.radioExploratorioEscena);
    }
  }

  function actualizarEstados(moonsVisualMap = {}) {
    for (const [key, item] of mapaSatelites) {
      const dato = moonsVisualMap?.[key];
      if (dato?.visual?.posicionEscena) {
        const p = dato.visual.posicionEscena;
        item.posicion.position.set(p.x, p.y, p.z);
        item.posicion.visible = true;
      } else {
        item.posicion.visible = false;
      }
    }
    aplicarEscalas();
  }

  function ocultarTodos() {
    for (const item of mapaSatelites.values()) {
      item.posicion.visible = false;
    }
  }

  function establecerModoEscala(nuevoModo) {
    modoEscala = nuevoModo;
    aplicarEscalas();
  }

  function establecerForzarUnoAUno(forzar) {
    forzarEscalaUnoAUno = Boolean(forzar);
    aplicarEscalas();
  }

  return {
    grupo,
    satelites: mapaSatelites,
    actualizarEstados,
    ocultarTodos,
    establecerModoEscala,
    establecerForzarUnoAUno
  };
}
