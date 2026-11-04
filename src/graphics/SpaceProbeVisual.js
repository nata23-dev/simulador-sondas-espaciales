import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MODOS_ESCALA_VISUAL } from './ScaleModeConfig.js';

export const MODELOS_VISUALES_SONDA = Object.freeze({
  VOYAGER: 'voyager',
  PROCEDURAL: 'procedural'
});

export const METADATOS_MODELO_VOYAGER = Object.freeze({
  id: 'nasa-vtad-voyager-gltf',
  nombre: 'Voyager (modelo 3D oficial NASA)',
  archivoRelativo: 'models/voyager/Voyager.glb',
  fuenteOficial: 'https://science.nasa.gov/resource/voyager-3d-model/',
  credito: 'NASA / JPL-Caltech / Visualization Technology Applications and Development (VTAD)',
  licencia: 'Dominio público / NASA Media Usage Guidelines (uso educativo y científico sin implicar respaldo oficial)',
  advertenciaCientifica: 'Representación visual tridimensional oficial NASA VTAD; en modo experimental representa Sonda Experimental 01 (trayectoria simulada ficticia) y en modo histórico representa Voyager 1 (-31) y Voyager 2 (-32).'
});

// Caché compartida en memoria para evitar descargar o subir texturas de Voyager.glb más de una vez
const cachePlantillaVoyagerGlb = new Map();

function cargarPlantillaVoyagerCompartida(urlGlb) {
  if (cachePlantillaVoyagerGlb.has(urlGlb)) {
    return cachePlantillaVoyagerGlb.get(urlGlb);
  }
  const loader = new GLTFLoader();
  const promesa = new Promise((resolve, reject) => {
    loader.load(urlGlb, gltf => resolve(gltf.scene), undefined, err => reject(err));
  });
  cachePlantillaVoyagerGlb.set(urlGlb, promesa);
  return promesa;
}

let texturaBalizaCompartida = null;
function crearTexturaBaliza() {
  if (texturaBalizaCompartida) return texturaBalizaCompartida;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255, 244, 214, 0.95)');
  grad.addColorStop(0.22, 'rgba(227, 196, 130, 0.60)');
  grad.addColorStop(0.55, 'rgba(116, 206, 232, 0.16)');
  grad.addColorStop(1, 'rgba(116, 206, 232, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texturaBalizaCompartida = texture;
  return texture;
}

/**
 * Normaliza la escena glTF oficial de Voyager (NASA VTAD):
 * - Oculta el cubo auxiliar transparente de raíz exportado desde Blender (`material.name === 'clear'`).
 * - Centra el pivote de rotación sobre el eje de simetría del bus decagonal y la antena parabólica de 3,7 m.
 * - Orienta el eje de la antena de alta ganancia (+Y en el glTF original) hacia +Z local para `lookAt`.
 * - Escala de forma estrictamente uniforme (1:1:1) sin deformar ningún componente.
 */
export function normalizarEscenaVoyagerGltf(escenaGltf, {
  diametroAntenaObjetivo = 0.78,
  idSonda = '__SONDA__'
} = {}) {
  escenaGltf.updateMatrixWorld(true);

  const cajaCompleta = new THREE.Box3();
  const cajaBusYAntena = new THREE.Box3();
  const mallasValidas = [];

  escenaGltf.traverse(nodo => {
    if (!nodo.isMesh) return;
    const materiales = Array.isArray(nodo.material) ? nodo.material : [nodo.material];
    const esCuboAuxiliar = materiales.every(mat => mat?.name === 'clear')
      && (nodo.name === '_root' || nodo.geometry?.attributes?.position?.count <= 36);

    if (esCuboAuxiliar) {
      for (const mat of materiales) {
        if (mat) {
          mat.visible = false;
          mat.depthWrite = false;
        }
      }
      return;
    }

    for (const mat of materiales) {
      if (!mat) continue;
      if (mat.map) {
        mat.map.colorSpace = THREE.SRGBColorSpace;
        mat.map.anisotropy = 4;
      }
      if (mat.name === 'brass') {
        mat.metalness = 0.74;
        mat.roughness = 0.32;
        if (mat.emissive) {
          mat.emissive.setHex(0x221805);
          mat.emissiveIntensity = 0.22;
        }
      } else if (mat.isMeshStandardMaterial) {
        mat.roughness = Math.min(Math.max(mat.roughness ?? 0.55, 0.35), 0.78);
        if (mat.emissive) {
          mat.emissive.setHex(0x0b0e14);
          mat.emissiveIntensity = 0.14;
        }
      }
    }

    nodo.userData.esSonda = true;
    nodo.userData.idSonda = idSonda;
    mallasValidas.push(nodo);

    const cajaNodo = new THREE.Box3().setFromObject(nodo);
    cajaCompleta.union(cajaNodo);
    if (nodo.name === 'tex_02_AO' || nodo.name === 'tex_02_AO_dark') {
      cajaBusYAntena.union(cajaNodo);
    }
  });

  if (cajaCompleta.isEmpty()) {
    throw new Error('El modelo glTF de Voyager no contiene mallas geométricas válidas.');
  }

  const cajaPivote = cajaBusYAntena.isEmpty() ? cajaCompleta : cajaBusYAntena;
  const centroPivote = cajaPivote.getCenter(new THREE.Vector3());
  const dimensionesPivote = cajaPivote.getSize(new THREE.Vector3());
  const diametroAntenaOriginal = Math.max(dimensionesPivote.x, dimensionesPivote.z, 1e-3);
  const factorUniforme = diametroAntenaObjetivo / diametroAntenaOriginal;

  const contenedorNormalizado = new THREE.Group();
  contenedorNormalizado.name = 'Voyager_Normalizado';

  const contenedorOrientacion = new THREE.Group();
  contenedorOrientacion.rotation.x = Math.PI * 0.5;
  escenaGltf.position.copy(centroPivote).negate();
  contenedorOrientacion.add(escenaGltf);

  contenedorNormalizado.add(contenedorOrientacion);
  contenedorNormalizado.scale.setScalar(factorUniforme);
  contenedorNormalizado.updateMatrixWorld(true);

  const cajaNormalizada = new THREE.Box3().setFromObject(contenedorNormalizado);
  const dimensionesNormalizadas = cajaNormalizada.getSize(new THREE.Vector3());
  const esferaEnvolvente = cajaNormalizada.getBoundingSphere(new THREE.Sphere());

  return {
    grupo: contenedorNormalizado,
    mallas: mallasValidas,
    factorUniforme,
    centroPivoteOriginal: centroPivote,
    cajaNormalizada,
    dimensionesNormalizadas,
    radioEnvolvente: esferaEnvolvente.radius
  };
}

function construirGeometriaProcedural(mallasSeleccionables, idSonda) {
  const grupo = new THREE.Group();
  grupo.name = 'SondaProcedural_Respaldo';

  const materialBus = new THREE.MeshStandardMaterial({
    color: 0xd8b46a,
    metalness: 0.72,
    roughness: 0.34,
    emissive: 0x261c08,
    emissiveIntensity: 0.42
  });
  const bus = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.28, 10), materialBus);
  bus.rotation.x = Math.PI * 0.5;
  bus.userData.esSonda = true;
  bus.userData.idSonda = idSonda;
  grupo.add(bus);
  mallasSeleccionables.push(bus);

  const materialAntena = new THREE.MeshStandardMaterial({
    color: 0xe9eef6,
    metalness: 0.32,
    roughness: 0.44,
    emissive: 0x141922,
    emissiveIntensity: 0.28,
    side: THREE.DoubleSide
  });
  const plato = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.36),
    materialAntena
  );
  plato.rotation.x = -Math.PI * 0.5;
  plato.position.z = 0.30;
  plato.userData.esSonda = true;
  plato.userData.idSonda = idSonda;
  grupo.add(plato);
  mallasSeleccionables.push(plato);

  const mastilReceptor = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.02, 0.16, 8),
    materialAntena
  );
  mastilReceptor.rotation.x = Math.PI * 0.5;
  mastilReceptor.position.z = 0.26;
  grupo.add(mastilReceptor);

  const materialPanel = new THREE.MeshStandardMaterial({
    color: 0x215b96,
    metalness: 0.55,
    roughness: 0.26,
    emissive: 0x0b223d,
    emissiveIntensity: 0.55
  });
  const geometriaPanel = new THREE.BoxGeometry(0.76, 0.018, 0.22);
  const panelIzquierdo = new THREE.Mesh(geometriaPanel, materialPanel);
  panelIzquierdo.position.x = -0.58;
  panelIzquierdo.userData.esSonda = true;
  panelIzquierdo.userData.idSonda = idSonda;
  grupo.add(panelIzquierdo);
  mallasSeleccionables.push(panelIzquierdo);

  const panelDerecho = new THREE.Mesh(geometriaPanel, materialPanel);
  panelDerecho.position.x = 0.58;
  panelDerecho.userData.esSonda = true;
  panelDerecho.userData.idSonda = idSonda;
  grupo.add(panelDerecho);
  mallasSeleccionables.push(panelDerecho);

  const materialEstructura = new THREE.MeshStandardMaterial({
    color: 0x9aa4b2,
    metalness: 0.78,
    roughness: 0.32
  });
  const largueroPaneles = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.015, 1.92, 6),
    materialEstructura
  );
  largueroPaneles.rotation.z = Math.PI * 0.5;
  grupo.add(largueroPaneles);

  const boom = new THREE.Mesh(
    new THREE.CylinderGeometry(0.01, 0.014, 0.58, 6),
    materialEstructura
  );
  boom.rotation.x = Math.PI * 0.5;
  boom.position.z = -0.42;
  grupo.add(boom);

  return grupo;
}

/**
 * Representación gráfica de una sonda espacial con soporte compartido para el modelo oficial
 * Voyager glTF 2.0 de NASA VTAD, respaldo procedural automático y línea de trayectoria.
 */
export function crearSondaVisual({
  idSonda = '__SONDA__',
  nombreGrupo = 'SondaExperimental01',
  colorRecorrido = 0xf0cf8e,
  colorPendiente = 0x5ab8cf,
  colorBaliza = 0xf4dca8,
  maxMuestrasTrayectoria = 4096,
  cargarModeloGlb = true,
  baseUrl = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) ? import.meta.env.BASE_URL : '/'
} = {}) {
  const posicion = new THREE.Group();
  posicion.name = `${nombreGrupo}_PosicionCientifica`;

  const visual = new THREE.Group();
  visual.name = `${nombreGrupo}_GeometriaVisual`;
  posicion.add(visual);

  const mallasSeleccionables = [];
  const grupoProcedural = construirGeometriaProcedural(mallasSeleccionables, idSonda);
  visual.add(grupoProcedural);

  const grupoVoyagerContenedor = new THREE.Group();
  grupoVoyagerContenedor.name = `${nombreGrupo}_Voyager_NASA_VTAD`;
  grupoVoyagerContenedor.visible = false;
  visual.add(grupoVoyagerContenedor);

  const materialProxy = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false
  });
  materialProxy.visible = false;
  const proxySeleccion = new THREE.Mesh(
    new THREE.SphereGeometry(0.95, 12, 12),
    materialProxy
  );
  proxySeleccion.userData.esSonda = true;
  proxySeleccion.userData.idSonda = idSonda;
  visual.add(proxySeleccion);
  mallasSeleccionables.push(proxySeleccion);

  const texturaBaliza = crearTexturaBaliza();
  const materialBaliza = new THREE.SpriteMaterial({
    map: texturaBaliza,
    color: colorBaliza,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const baliza = new THREE.Sprite(materialBaliza);
  baliza.scale.setScalar(1.4);
  posicion.add(baliza);

  // Iluminación de relleno local suave y neutra (decay = 0 para invariancia frente a escala visual y >150 AU)
  const luzRellenoPrincipal = new THREE.PointLight(0xeef2fb, 0.56, 1.5, 0);
  luzRellenoPrincipal.position.set(1.3, 1.1, 1.5);
  const luzContraluzSuave = new THREE.PointLight(0xc9d8f0, 0.30, 1.5, 0);
  luzContraluzSuave.position.set(-1.4, -0.8, -1.6);
  visual.add(luzRellenoPrincipal, luzContraluzSuave);

  const trayectoriaGrupo = new THREE.Group();
  trayectoriaGrupo.name = `${nombreGrupo}_Trayectoria`;

  // One independent line segment per adjacent pair. A degenerate pair marks
  // an uncertified SPK handoff without drawing a fictional connecting chord.
  const bufferPredicho = new Float32Array(Math.max(0, maxMuestrasTrayectoria - 1) * 6);
  const attrPredicho = new THREE.BufferAttribute(bufferPredicho, 3);
  const geoPredicha = new THREE.BufferGeometry();
  geoPredicha.setAttribute('position', attrPredicho);
  geoPredicha.setDrawRange(0, 0);

  const lineaPredicha = new THREE.LineSegments(
    geoPredicha,
    new THREE.LineBasicMaterial({
      color: colorPendiente,
      transparent: true,
      opacity: 0.28,
      depthWrite: false
    })
  );
  lineaPredicha.frustumCulled = false;
  trayectoriaGrupo.add(lineaPredicha);

  const bufferRecorrido = new Float32Array(Math.max(0, maxMuestrasTrayectoria - 1) * 6);
  const attrRecorrido = new THREE.BufferAttribute(bufferRecorrido, 3);
  attrRecorrido.setUsage(THREE.DynamicDrawUsage);
  const geoRecorrida = new THREE.BufferGeometry();
  geoRecorrida.setAttribute('position', attrRecorrido);
  geoRecorrida.setDrawRange(0, 0);

  const lineaRecorrida = new THREE.LineSegments(
    geoRecorrida,
    new THREE.LineBasicMaterial({
      color: colorRecorrido,
      transparent: true,
      opacity: 0.90,
      depthWrite: false
    })
  );
  lineaRecorrida.frustumCulled = false;
  trayectoriaGrupo.add(lineaRecorrida);

  const geoMarcadorInicio = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3()]);
  const marcadorInicio = new THREE.Points(
    geoMarcadorInicio,
    new THREE.PointsMaterial({
      color: colorRecorrido,
      size: 3.5,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.65,
      depthWrite: false
    })
  );
  const geoMarcadorFin = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3()]);
  const marcadorFin = new THREE.Points(
    geoMarcadorFin,
    new THREE.PointsMaterial({
      color: colorPendiente,
      size: 3.5,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.58,
      depthWrite: false
    })
  );
  marcadorInicio.visible = false;
  marcadorFin.visible = false;
  trayectoriaGrupo.add(marcadorInicio, marcadorFin);

  let tiemposMuestras = null;
  let verticesBase = null;
  let cortesMuestras = null;
  let cantidadMuestras = 0;
  let trayectoriaVisible = true;
  let ultimoIndiceRecorrido = -1;
  let modoEscala = MODOS_ESCALA_VISUAL.CIENTIFICA;
  let aparienciaPreferida = MODELOS_VISUALES_SONDA.VOYAGER;
  let voyagerCargado = false;
  let errorCargaVoyager = null;
  let diagnosticoGeometriaVoyager = null;
  let radioBaseObservacion = 0.88;
  let ocultaPorPrimeraPersona = false;
  const observadoresModelo = new Set();
  const direccionApuntado = new THREE.Vector3();
  const puntoMira = new THREE.Vector3();

  function sincronizarVisibilidadModelo() {
    const usarVoyager = aparienciaPreferida === MODELOS_VISUALES_SONDA.VOYAGER && voyagerCargado;
    grupoVoyagerContenedor.visible = usarVoyager;
    grupoProcedural.visible = !usarVoyager;
    radioBaseObservacion = usarVoyager ? 1.05 : 0.76;
    visual.visible = !ocultaPorPrimeraPersona;
  }

  function notificarEstadoModelo() {
    const info = obtenerEstadoModelo();
    for (const fn of observadoresModelo) fn(info);
  }

  function obtenerEstadoModelo() {
    const usandoVoyager = aparienciaPreferida === MODELOS_VISUALES_SONDA.VOYAGER && voyagerCargado;
    return Object.freeze({
      idSonda,
      aparienciaPreferida,
      modeloActivo: usandoVoyager ? MODELOS_VISUALES_SONDA.VOYAGER : MODELOS_VISUALES_SONDA.PROCEDURAL,
      voyagerCargado,
      errorCargaVoyager,
      metadatosVoyager: METADATOS_MODELO_VOYAGER,
      diagnosticoGeometriaVoyager
    });
  }

  if (cargarModeloGlb && typeof fetch === 'function') {
    const prefijo = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const urlGlb = `${prefijo}${METADATOS_MODELO_VOYAGER.archivoRelativo}`;
    cargarPlantillaVoyagerCompartida(urlGlb)
      .then(escenaPlantilla => {
        try {
          const clonEscena = escenaPlantilla.clone(true);
          const normalizado = normalizarEscenaVoyagerGltf(clonEscena, {
            diametroAntenaObjetivo: 0.78,
            idSonda
          });
          grupoVoyagerContenedor.clear();
          grupoVoyagerContenedor.add(normalizado.grupo);
          for (const malla of normalizado.mallas) {
            mallasSeleccionables.push(malla);
          }
          voyagerCargado = true;
          errorCargaVoyager = null;
          diagnosticoGeometriaVoyager = Object.freeze({
            url: urlGlb,
            cantidadMallas: normalizado.mallas.length,
            factorEscalaUniforme: normalizado.factorUniforme,
            dimensionesEscena: {
              x: normalizado.dimensionesNormalizadas.x,
              y: normalizado.dimensionesNormalizadas.y,
              z: normalizado.dimensionesNormalizadas.z
            },
            radioEnvolvente: normalizado.radioEnvolvente
          });
          sincronizarVisibilidadModelo();
          notificarEstadoModelo();
        } catch (err) {
          voyagerCargado = false;
          errorCargaVoyager = err.message;
          console.warn('Error al normalizar Voyager.glb; se mantiene el modelo procedural de respaldo:', err);
          sincronizarVisibilidadModelo();
          notificarEstadoModelo();
        }
      })
      .catch(err => {
        voyagerCargado = false;
        errorCargaVoyager = err?.message ?? 'No se pudo descargar Voyager.glb';
        console.warn(`No se pudo cargar ${urlGlb}; se conserva el modelo procedural de respaldo.`, err);
        sincronizarVisibilidadModelo();
        notificarEstadoModelo();
      });
  }

  function establecerApariencia(modo) {
    if (modo !== MODELOS_VISUALES_SONDA.VOYAGER && modo !== MODELOS_VISUALES_SONDA.PROCEDURAL) {
      return false;
    }
    aparienciaPreferida = modo;
    sincronizarVisibilidadModelo();
    notificarEstadoModelo();
    return true;
  }

  function establecerOcultaPorPrimeraPersona(oculta) {
    ocultaPorPrimeraPersona = Boolean(oculta);
    visual.visible = !ocultaPorPrimeraPersona;
    if (ocultaPorPrimeraPersona) {
      baliza.visible = false;
    }
  }

  function establecerModoEscala(nuevoModo, inmediato = false) {
    if (nuevoModo === MODOS_ESCALA_VISUAL.CIENTIFICA || nuevoModo === MODOS_ESCALA_VISUAL.EXPLORATORIA) {
      modoEscala = nuevoModo;
      const alcanceLuz = modoEscala === MODOS_ESCALA_VISUAL.CIENTIFICA ? 0.04 : 0.45;
      luzRellenoPrincipal.distance = alcanceLuz;
      luzContraluzSuave.distance = alcanceLuz;
      if (inmediato) {
        visual.scale.setScalar(escalaInspeccionCercana());
      }
    }
  }

  function escalaInspeccionCercana() {
    return modoEscala === MODOS_ESCALA_VISUAL.CIENTIFICA ? 0.0025 : 0.075;
  }

  function escalaNoEnfocada() {
    return modoEscala === MODOS_ESCALA_VISUAL.CIENTIFICA ? 0.0006 : 0.012;
  }

  function obtenerRadioObservacionActual() {
    return radioBaseObservacion * escalaInspeccionCercana();
  }

  function establecerTrayectoria(verticesEscenaFloat32, tiemposFloat64, cortes = null) {
    const total = Math.min(tiemposFloat64.length, maxMuestrasTrayectoria);
    cantidadMuestras = total;
    tiemposMuestras = tiemposFloat64;
    verticesBase = verticesEscenaFloat32;
    cortesMuestras = cortes;
    ultimoIndiceRecorrido = -1;

    for (let i = 0; i < total - 1; i++) {
      const from = i * 3;
      const to = (i + 1) * 3;
      const edge = i * 6;
      const end = cortes?.[i + 1] ? from : to;
      for (const buffer of [bufferPredicho, bufferRecorrido]) {
        buffer.set(verticesEscenaFloat32.subarray(from, from + 3), edge);
        buffer.set(verticesEscenaFloat32.subarray(end, end + 3), edge + 3);
      }
    }
    attrPredicho.needsUpdate = true;
    attrRecorrido.needsUpdate = true;
    geoPredicha.setDrawRange(0, Math.max(0, total - 1) * 2);
    if (total > 1) geoPredicha.computeBoundingSphere();
    geoRecorrida.setDrawRange(0, 0);

    if (total > 0) {
      marcadorInicio.position.set(
        verticesEscenaFloat32[0],
        verticesEscenaFloat32[1],
        verticesEscenaFloat32[2]
      );
      const last = (total - 1) * 3;
      marcadorFin.position.set(
        verticesEscenaFloat32[last],
        verticesEscenaFloat32[last + 1],
        verticesEscenaFloat32[last + 2]
      );
      marcadorInicio.visible = true;
      marcadorFin.visible = total > 1;
    } else {
      marcadorInicio.visible = false;
      marcadorFin.visible = false;
    }
  }

  function actualizarEstadoEscena(posicionEscena, tiempoActual, objetivoTierraEscena = null) {
    posicion.position.set(posicionEscena.x, posicionEscena.y, posicionEscena.z);
    posicion.visible = true;

    if (objetivoTierraEscena) {
      direccionApuntado.set(
        objetivoTierraEscena.x - posicion.position.x,
        objetivoTierraEscena.y - posicion.position.y,
        objetivoTierraEscena.z - posicion.position.z
      );
    } else {
      direccionApuntado.copy(posicion.position).negate();
    }
    if (direccionApuntado.lengthSq() > 1e-10) {
      puntoMira.copy(posicion.position).add(direccionApuntado);
      visual.lookAt(puntoMira);
    }

    if (!tiemposMuestras || cantidadMuestras < 2) return;

    let low = 0;
    let high = cantidadMuestras - 1;
    if (tiempoActual <= tiemposMuestras[0]) {
      geoRecorrida.setDrawRange(0, 0);
      ultimoIndiceRecorrido = 0;
      return;
    }
    while (high - low > 1) {
      const mid = (low + high) >> 1;
      if (tiemposMuestras[mid] <= tiempoActual) low = mid;
      else high = mid;
    }

    if (ultimoIndiceRecorrido >= 0 && ultimoIndiceRecorrido < cantidadMuestras - 1) {
      const previousEdge = ultimoIndiceRecorrido * 6 + 3;
      const previousEnd = (cortesMuestras?.[ultimoIndiceRecorrido + 1]
        ? ultimoIndiceRecorrido : ultimoIndiceRecorrido + 1) * 3;
      bufferRecorrido.set(verticesBase.subarray(previousEnd, previousEnd + 3), previousEdge);
    }

    const tipEdge = Math.min(low, cantidadMuestras - 2);
    const tipOffset = tipEdge * 6 + 3;
    if (!cortesMuestras?.[tipEdge + 1]) {
      bufferRecorrido[tipOffset] = posicionEscena.x;
      bufferRecorrido[tipOffset + 1] = posicionEscena.y;
      bufferRecorrido[tipOffset + 2] = posicionEscena.z;
    }
    ultimoIndiceRecorrido = tipEdge;

    attrRecorrido.needsUpdate = true;
    geoRecorrida.setDrawRange(0, (tipEdge + 1) * 2);
  }

  function mostrarTrayectoria(valor) {
    trayectoriaVisible = Boolean(valor);
    trayectoriaGrupo.visible = trayectoriaVisible;
  }

  function mostrarSonda(valor) {
    posicion.visible = Boolean(valor);
    if (!valor) {
      trayectoriaGrupo.visible = false;
    } else {
      trayectoriaGrupo.visible = trayectoriaVisible;
    }
  }

  function actualizarEscalaVisual(segundos, camera, enfocada) {
    if (!posicion.visible) return;
    if (ocultaPorPrimeraPersona) {
      visual.visible = false;
      baliza.visible = false;
      marcadorInicio.visible = false;
      marcadorFin.visible = false;
      return;
    }
    visual.visible = true;
    const distancia = camera.position.distanceTo(posicion.position);
    const escalaObjetivo = enfocada ? escalaInspeccionCercana() : escalaNoEnfocada();

    const mezcla = 1 - Math.exp(-10 * Math.max(segundos, 0.001));
    const escalaActual = visual.scale.x + (escalaObjetivo - visual.scale.x) * mezcla;
    visual.scale.setScalar(escalaActual);

    if (cantidadMuestras > 0) {
      marcadorInicio.visible = !enfocada && posicion.position.distanceToSquared(marcadorInicio.position) > 1e-4;
      marcadorFin.visible = cantidadMuestras > 1 && !enfocada;
    }

    const umbralCercano = obtenerRadioObservacionActual() * 4.5;
    const visibilidadBaliza = enfocada
      ? THREE.MathUtils.clamp((distancia - umbralCercano) / (umbralCercano * 4), 0, 1)
      : 1;
    materialBaliza.opacity = (modoEscala === MODOS_ESCALA_VISUAL.CIENTIFICA ? 0.45 : 0.62) * visibilidadBaliza;
    baliza.visible = materialBaliza.opacity > 0.01;
    if (baliza.visible) {
      const tamanoBaliza = THREE.MathUtils.clamp(distancia * 0.011, 0.004, 24);
      baliza.scale.setScalar(tamanoBaliza);
    }
  }

  visual.scale.setScalar(escalaInspeccionCercana());
  sincronizarVisibilidadModelo();

  return {
    idSonda,
    posicion,
    visual,
    trayectoriaGrupo,
    mallasSeleccionables,
    establecerTrayectoria,
    actualizarEstadoEscena,
    mostrarTrayectoria,
    trayectoriaEsVisible: () => trayectoriaVisible,
    mostrarSonda,
    establecerModoEscala,
    establecerApariencia,
    establecerOcultaPorPrimeraPersona,
    obtenerEstadoModelo,
    obtenerRadioObservacionActual,
    alCambiarModelo(fn) {
      observadoresModelo.add(fn);
      fn(obtenerEstadoModelo());
      return () => observadoresModelo.delete(fn);
    },
    actualizarEscalaVisual
  };
}
