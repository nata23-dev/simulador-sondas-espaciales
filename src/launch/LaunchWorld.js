// Etapa 25 — mundo del lanzamiento: Tierra, cielo, estrellas, Sol y luces en el marco local de LC-41.
//
// Marco de la escena (metros): ENU de LC-41 fijo a la Tierra, con x = este, y = arriba, z = sur; la Tierra es una esfera de
// radio ecuatorial WGS84 con centro en (0, −R, 0). Las texturas son proyecciones geográficas (EPSG:4326) colocadas por latitud y
// longitud: globo Blue Marble Next Generation (NASA), Florida en mayor resolución, el Cabo y LC-41 con ortoimágenes del USGS de
// 2024 (no de 1977). El cielo es el modelo de Preetham (three.js) con el Sol calculado para el instante; las estrellas son el
// catálogo Hipparcos (V ≤ 6,5) orientado con el tiempo sidéreo del instante. Las nubes son ilustrativas (más nubosidad el
// 20-08-1977, según la fotografía PIA21744; cielo casi despejado el 05-09-1977, PIA21746).
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { LC41, RADIO_TIERRA_M, solEnLC41, matrizEcuatorialAEnu } from '../science/VoyagerLaunchProfile.js';
import { cargarCatalogoHipparcos } from '../graphics/StarCatalog.js';
import { crearSolEspacio } from './LaunchEffects.js';
import { registerRenderer, opcionesRenderizador } from '../graphics/QualityProfile.js';

const DEG = Math.PI / 180;
const R = RADIO_TIERRA_M;
export const CENTRO_TIERRA = Object.freeze(new THREE.Vector3(0, -R, 0));

// Recursos (ver public/launch/README.md: procedencia, licencia y SHA-256).
export const RECURSOS_LANZAMIENTO = Object.freeze({
  globo: { archivo: 'launch/earth-bmng-8192.jpg', ligero: 'launch/earth-bmng-4096.jpg', lat: [-90, 90], lon: [-180, 180] },
  florida: { archivo: 'launch/florida-bmng-2048.jpg', lat: [23, 34], lon: [-87, -76], desnivel: -12 },
  cabo: { archivo: 'launch/cape-usgs-2048.jpg', lat: [28.465, 28.705], lon: [-80.70, -80.46], desnivel: -1.5 },
  lc41: { archivo: 'launch/lc41-usgs-2048.jpg', lat: [28.571, 28.5956], lon: [-80.5951, -80.5705], desnivel: 0 },
  nubes: { archivo: 'textures/earth_clouds.jpg' }
});

/**
 * 26: textura del globo según el perfil de calidad. La de 8192 px ocupa ≈ 358 MB en la GPU con sus mipmaps; solo se usa con
 * calidad alta, o automática en un equipo de escritorio que la admita. En los demás casos, la de 4096 px (≈ 90 MB).
 * Función pura (probada).
 */
export function archivoGlobo({ calidad = 'auto', escritorio = true, maxTextura = 16384, detalle = 'alto' } = {}) {
  const grande = maxTextura >= 8192 && detalle === 'alto' && (calidad === 'alto' || (calidad === 'auto' && escritorio));
  return grande ? RECURSOS_LANZAMIENTO.globo.archivo : RECURSOS_LANZAMIENTO.globo.ligero;
}

/**
 * 27: qué se dibuja en cada nivel de detalle (función pura, probada). Solo presentación: la trayectoria, el Sol, las estrellas,
 * los acontecimientos y la telemetría son los mismos en todos los niveles.
 *   · alto/medio: como en la etapa 25 (medio con algo menos de humo).
 *   · bajo: sin sombras ni suavizado de bordes, mallas de la Tierra con la mitad de divisiones y menos humo.
 *   · minimo: además, sin reflejos del cielo (entorno) ni capa de nubes, y con un tercio del humo. Para GPU muy modestas o
 *     dibujo por software, donde cada píxel cuesta mucho.
 */
export function ajustesLanzamiento(detalle = 'alto') {
  const nivel = ['alto', 'medio', 'bajo', 'minimo'].includes(detalle) ? detalle : 'alto';
  const completo = nivel === 'alto' || nivel === 'medio';
  return Object.freeze({
    detalle: nivel, antialias: completo, sombras: completo, entorno: nivel !== 'minimo', nubes: nivel !== 'minimo',
    divisiones: completo ? 1 : 0.5,
    humo: { alto: 2200, medio: 1600, bajo: 900, minimo: 600 }[nivel],
    nubeSuelo: { alto: 340, medio: 260, bajo: 160, minimo: 110 }[nivel],
    nubeBase: { alto: 90, medio: 70, bajo: 40, minimo: 28 }[nivel]
  });
}

/**
 * 26: carga de una imagen como textura. Con createImageBitmap la imagen se decodifica fuera del hilo principal (un JPEG de
 * 8192 px tardaba ≈ 0,4 s en decodificarse al subirlo a la GPU, congelando la escena); la orientación se invierte al
 * decodificar, así que la textura lleva flipY = false y queda igual que con una imagen HTML. Sin conversión de color, como
 * hace three r186 al subir una imagen sRGB o de datos (UNPACK_COLORSPACE_CONVERSION = NONE): una imagen con perfil ICC (la
 * ortoimagen del Cabo lo lleva) da los mismos valores que antes. Sin createImageBitmap se usa TextureLoader, como antes.
 */
function cargarTextura(url) {
  if (typeof createImageBitmap !== 'function' || typeof fetch !== 'function') {
    return new Promise((resolve, reject) => new THREE.TextureLoader().load(url, resolve, undefined, reject));
  }
  return fetch(url)
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob(); })
    .then(blob => createImageBitmap(blob, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' }))
    .then(bitmap => { const t = new THREE.Texture(bitmap); t.flipY = false; t.needsUpdate = true; return t; });
}

/** Dirección (vector unitario de la escena) desde el centro de la Tierra hacia (lat, lon). */
export function direccionGeografica(latDeg, lonDeg, destino = new THREE.Vector3()) {
  const f = latDeg * DEG, l = lonDeg * DEG, f0 = LC41.latDeg * DEG, l0 = LC41.lonDeg * DEG;
  const x = Math.cos(f) * Math.cos(l), y = Math.cos(f) * Math.sin(l), z = Math.sin(f);
  const e = -Math.sin(l0) * x + Math.cos(l0) * y;
  const n = -Math.sin(f0) * Math.cos(l0) * x - Math.sin(f0) * Math.sin(l0) * y + Math.cos(f0) * z;
  const u = Math.cos(f0) * Math.cos(l0) * x + Math.cos(f0) * Math.sin(l0) * y + Math.sin(f0) * z;
  return destino.set(e, u, -n);
}
export const enuAEscena = (enu, destino = new THREE.Vector3()) => destino.set(enu[0], enu[2], -enu[1]);

/** Parche esférico (lat/lon) con vértices relativos a su centro para conservar precisión; devuelve la malla ya colocada. */
function parcheEsferico({ lat, lon, radio, segLat, segLon }, material) {
  const centro = direccionGeografica((lat[0] + lat[1]) / 2, (lon[0] + lon[1]) / 2).multiplyScalar(radio).add(CENTRO_TIERRA);
  const pos = [], nor = [], uv = [], idx = [], d = new THREE.Vector3();
  for (let i = 0; i <= segLat; i++) {
    const la = lat[0] + (lat[1] - lat[0]) * i / segLat;
    for (let j = 0; j <= segLon; j++) {
      const lo = lon[0] + (lon[1] - lon[0]) * j / segLon;
      direccionGeografica(la, lo, d);
      nor.push(d.x, d.y, d.z);
      pos.push(d.x * radio + CENTRO_TIERRA.x - centro.x, d.y * radio + CENTRO_TIERRA.y - centro.y, d.z * radio + CENTRO_TIERRA.z - centro.z);
      uv.push(j / segLon, i / segLat);
    }
  }
  for (let i = 0; i < segLat; i++) for (let j = 0; j < segLon; j++) {
    const a = i * (segLon + 1) + j, b = a + 1, c = a + segLon + 1, e = c + 1;
    idx.push(a, b, e, a, e, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const malla = new THREE.Mesh(geo, material);
  malla.position.copy(centro);
  malla.receiveShadow = true;
  return malla;
}

// Máscara de bordes para fundir cada parche con la capa de debajo.
function mascaraBordes(margen = 0.12) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), img = g.createImageData(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const u = x / 127, v = y / 127, d = Math.min(u, 1 - u, v, 1 - v) / margen, a = Math.round(255 * Math.min(1, d * d * (3 - 2 * Math.min(1, d))));
    const k = (y * 128 + x) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = a; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace;
  return t;
}

function materialAtmosfera() {
  return new THREE.ShaderMaterial({
    uniforms: { uCentro: { value: CENTRO_TIERRA.clone() }, uSol: { value: new THREE.Vector3(0, 1, 0) }, uIntensidad: { value: 1 },
      uRadio: { value: R }, uEspesor: { value: 80000 }, uEscala: { value: 320000 } },
    vertexShader: `#include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vMundo;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vMundo = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `#include <logdepthbuf_pars_fragment>
      uniform vec3 uCentro; uniform vec3 uSol; uniform float uIntensidad; uniform float uRadio; uniform float uEspesor; uniform float uEscala;
      varying vec3 vMundo;
      vec2 esfera(vec3 o, vec3 d, float r) { vec3 oc = o - uCentro; float b = dot(oc, d), c = dot(oc, oc) - r * r, h = b * b - c;
        if (h < 0.0) return vec2(1e20, -1e20); h = sqrt(h); return vec2(-b - h, -b + h); }
      void main() {
        #include <logdepthbuf_fragment>
        vec3 d = normalize(vMundo - cameraPosition);
        vec2 a = esfera(cameraPosition, d, uRadio + uEspesor), p = esfera(cameraPosition, d, uRadio);
        float t0 = max(a.x, 0.0), t1 = a.y;
        if (p.x > 0.0 && p.x < t1) t1 = p.x;              // el rayo choca con el suelo
        float largo = max(0.0, t1 - t0);
        vec3 medio = cameraPosition + d * (t0 + t1) * 0.5;
        float dia = smoothstep(-0.18, 0.35, dot(normalize(medio - uCentro), uSol));
        float neblina = 1.0 - exp(-largo / uEscala);
        float frontera = smoothstep(-0.25, 0.05, dot(d, uSol));                 // dispersión hacia delante, cerca del Sol
        vec3 color = mix(vec3(0.28, 0.50, 1.0), vec3(0.80, 0.88, 1.0), frontera * 0.35);
        gl_FragColor = vec4(color * neblina * dia * uIntensidad, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
}

function colorBV(bv) {
  const t = Number.isFinite(bv) ? Math.min(2, Math.max(-0.4, bv)) : 0.6;
  // Aproximación de temperatura de color: azuladas (B−V < 0) a anaranjadas (B−V > 1,5).
  return new THREE.Color().setRGB(t < 0.4 ? 0.78 + 0.5 * t : 1, t < 0.4 ? 0.86 + 0.25 * t : 1 - 0.12 * (t - 0.4), t < 0.4 ? 1 : 1 - 0.38 * (t - 0.4));
}

/**
 * Crea el renderizador y el mundo sobre `canvas`. `mision`: LANZAMIENTOS_VOYAGER[...]; `calidad`: 'bajo' | 'medio' | 'alto'.
 * Devuelve el renderizador, la escena, la cámara y `actualizar({ tMision, ms, camara, foco })`.
 */
export function crearMundoLanzamiento({ canvas, mision, calidad = 'alto', detalle = 'alto', baseUrl = '/', escritorio = true }) {
  const ajustes = ajustesLanzamiento(detalle);
  // 27: preferencia de GPU del menú y suavizado de bordes según el nivel de detalle.
  const renderer = new THREE.WebGLRenderer(opcionesRenderizador({ canvas, antialias: ajustes.antialias, logarithmicDepthBuffer: true }, 'lanzamiento'));
  // 26: la resolución interna sigue el perfil de calidad del menú (Alta ×2, Media ×1,5, Baja ×1) y, en «Automática», baja sola si
  // el lanzamiento no sostiene 30 FPS, igual que la escena principal. Antes el lanzamiento usaba siempre ×2 salvo en «Baja».
  const bajaCalidad = registerRenderer(renderer, 'lanzamiento'); // 27: resolución dinámica propia del lanzamiento
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.55;
  renderer.shadowMap.enabled = ajustes.sombras;
  renderer.shadowMap.type = THREE.PCFShadowMap; // r186: PCFSoftShadowMap se retiró (PCF ya filtra)

  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(45, 1, 0.4, 2.0e8);
  escena.add(camara);
  const nuboso = mision.id === 'voyager-2';
  const recursos = [];
  const url = rel => `${baseUrl}${rel}`;
  const texturas = {};
  // 26: la primera consulta de la anisotropía cuesta ≈ 0,2 s en ANGLE; se hace una vez aquí, durante la carga.
  const anisotropia = renderer.capabilities.getMaxAnisotropy();
  const cargar = (clave, rel) => cargarTextura(url(rel)).then(t => {
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = anisotropia; texturas[clave] = t; recursos.push(t); return t;
  }).catch(() => { console.warn(`No se pudo cargar ${rel}; se usa el color de respaldo.`); return null; });

  // ---- Tierra ----
  const matGlobo = new THREE.MeshStandardMaterial({ color: 0x1b3d6b, roughness: 0.92, metalness: 0, envMapIntensity: 0 });
  const div = n => Math.max(8, Math.round(n * ajustes.divisiones));
  const globo = parcheEsferico({ lat: [-90, 90], lon: [-180, 180], radio: R - 150, segLat: div(128), segLon: div(256) }, matGlobo);
  globo.renderOrder = 0; escena.add(globo);
  const mascara = mascaraBordes(), mascaraAncha = mascaraBordes(0.3);
  const capas = {};
  for (const [clave, segs, orden] of [['florida', [48, 48], 1], ['cabo', [24, 24], 2], ['lc41', [16, 16], 3]]) {
    const def = RECURSOS_LANZAMIENTO[clave];
    // Difuso puro: la ortoimagen ya trae su sombreado y un reflejo especular rasante la haría parecer agua. El Cabo (USGS, mar
    // turquesa) se funde con un borde más ancho sobre Florida (Blue Marble, océano oscuro).
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, alphaMap: clave === 'cabo' ? mascaraAncha : mascara, opacity: 0, depthWrite: true });
    const m = parcheEsferico({ lat: def.lat, lon: def.lon, radio: R + def.desnivel, segLat: segs[0], segLon: segs[1] }, mat);
    m.renderOrder = orden; m.visible = false; escena.add(m); capas[clave] = m;
  }
  const matNubes = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, roughness: 1, envMapIntensity: 0 });
  const nubes = parcheEsferico({ lat: [-90, 90], lon: [-180, 180], radio: R + 9000, segLat: div(96), segLon: div(192) }, matNubes);
  nubes.renderOrder = 8; nubes.visible = false; escena.add(nubes);
  // 26: dos mallas (vista desde dentro y desde fuera) con los mismos uniformes. Antes se cambiaba material.side a 80 km, y en
  // three.js la cara forma parte del programa: el cambio obligaba a compilar un sombreador en pleno vuelo.
  const matAtmosferaDentro = materialAtmosfera();
  const matAtmosferaFuera = new THREE.ShaderMaterial({ uniforms: matAtmosferaDentro.uniforms, vertexShader: matAtmosferaDentro.vertexShader,
    fragmentShader: matAtmosferaDentro.fragmentShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide });
  matAtmosferaDentro.side = THREE.BackSide;
  const geoAtmosfera = new THREE.SphereGeometry(R + 80000, div(128), div(64));
  const atmosferaDentro = new THREE.Mesh(geoAtmosfera, matAtmosferaDentro), atmosferaFuera = new THREE.Mesh(geoAtmosfera, matAtmosferaFuera);
  for (const a of [atmosferaDentro, atmosferaFuera]) { a.position.copy(CENTRO_TIERRA); a.renderOrder = 9; escena.add(a); }
  const uAtmosfera = matAtmosferaDentro.uniforms;

  const cargasTexturas = Promise.all([
    cargar('globo', archivoGlobo({ calidad, escritorio, detalle: ajustes.detalle, maxTextura: renderer.capabilities.maxTextureSize })).then(t => { if (t) { matGlobo.map = t; matGlobo.color.set(0xffffff); matGlobo.needsUpdate = true; } }),
    ...['florida', 'cabo', 'lc41'].map(clave => cargar(clave, RECURSOS_LANZAMIENTO[clave].archivo).then(t => {
      if (!t) return; const m = capas[clave]; m.material.map = t; m.material.opacity = 1; m.material.needsUpdate = true; m.visible = true;
    })),
    // 27: sin capa de nubes en el nivel mínimo (ni se descarga su textura).
    ajustes.nubes ? cargar('nubes', RECURSOS_LANZAMIENTO.nubes.archivo).then(t => {
      if (!t) return; t.colorSpace = THREE.NoColorSpace; matNubes.alphaMap = t; matNubes.needsUpdate = true; nubes.visible = permitirNubes;
    }) : null
  ]);

  // ---- Cielo (Preetham) con brillo regulable para desvanecerlo al subir ----
  const cielo = new Sky();
  cielo.scale.setScalar(1.0e4);
  cielo.material.depthWrite = false;
  cielo.renderOrder = -10;
  const u = cielo.material.uniforms;
  u.turbidity.value = nuboso ? 5.5 : 3.5; u.rayleigh.value = nuboso ? 1.3 : 1.5; u.mieCoefficient.value = 0.0035; u.mieDirectionalG.value = 0.8;
  u.cloudCoverage.value = nuboso ? 0.42 : 0.1; u.cloudDensity.value = nuboso ? 0.55 : 0.35; u.cloudElevation.value = 0.55; u.cloudScale.value = 0.00025;
  u.uBrilloCielo = { value: 1 };
  cielo.material.onBeforeCompile = sh => {
    sh.uniforms.uBrilloCielo = u.uBrilloCielo;
    sh.fragmentShader = 'uniform float uBrilloCielo;\n' + sh.fragmentShader.replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( texColor * uBrilloCielo, 1.0 );');
  };
  escena.add(cielo);

  // ---- Estrellas (Hipparcos) y Sol en el espacio ----
  const estrellas = new THREE.Group(); estrellas.renderOrder = -9; escena.add(estrellas);
  const matEstrellas = new THREE.ShaderMaterial({
    uniforms: { uVisibilidad: { value: 0 }, uPixel: { value: renderer.getPixelRatio() } },
    vertexShader: `attribute vec3 aColor; attribute float aTam; uniform float uPixel; varying vec3 vColor;
      void main() { vColor = aColor; gl_PointSize = aTam * uPixel; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); p.z = p.w * 0.999999; gl_Position = p; }`,
    fragmentShader: `uniform float uVisibilidad; varying vec3 vColor;
      void main() { float r = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vColor * uVisibilidad, (1.0 - smoothstep(0.2, 0.5, r))); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  const estrellasListas = cargarCatalogoHipparcos().then(reg => {
    const n = reg.length / 4, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), tam = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const ra = reg[i * 4] * DEG, dec = reg[i * 4 + 1] * DEG, mag = reg[i * 4 + 2];
      // Ecuatorial (x hacia el equinoccio, z al polo norte); el grupo lo gira al marco de la escena en cada instante.
      pos[i * 3] = Math.cos(dec) * Math.cos(ra) * 1e7; pos[i * 3 + 1] = Math.cos(dec) * Math.sin(ra) * 1e7; pos[i * 3 + 2] = Math.sin(dec) * 1e7;
      const c = colorBV(reg[i * 4 + 3]), brillo = Math.min(1, Math.pow(10, -0.4 * (mag - 1.5)) * 0.9 + 0.12);
      col[i * 3] = c.r * brillo; col[i * 3 + 1] = c.g * brillo; col[i * 3 + 2] = c.b * brillo;
      tam[i] = Math.max(1.1, 3.6 - 0.42 * mag);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3)); geo.setAttribute('aTam', new THREE.BufferAttribute(tam, 1));
    const puntos = new THREE.Points(geo, matEstrellas); puntos.frustumCulled = false; estrellas.add(puntos);
  }).catch(err => console.warn('Sin catálogo de estrellas en el lanzamiento:', err));
  const solEspacio = crearSolEspacio(); escena.add(solEspacio);

  // ---- Luces ----
  const sol = new THREE.DirectionalLight(0xffffff, 2.8);
  // 26: castShadow no cambia durante el lanzamiento. En three.js, encender o apagar la sombra de una luz cambia el programa de
  // todos los materiales iluminados: al acercarse a la plataforma se recompilaban y la escena se congelaba ≈ 1,4 s. Ahora la
  // sombra se atenúa con shadow.intensity y el mapa de sombras solo se recalcula cuando hace falta.
  sol.castShadow = renderer.shadowMap.enabled;
  sol.shadow.mapSize.set(calidad === 'alto' ? 4096 : 2048, calidad === 'alto' ? 4096 : 2048);
  sol.shadow.bias = -0.0003; sol.shadow.normalBias = 0.04;
  const sc = sol.shadow.camera; sc.left = -80; sc.right = 80; sc.top = 80; sc.bottom = -80; sc.near = 1; sc.far = 800;
  escena.add(sol, sol.target);
  const hemisferio = new THREE.HemisphereLight(0x9db4d8, 0x5a5444, 1.0); escena.add(hemisferio);
  escena.fog = new THREE.FogExp2(0xa9bad0, 2e-5);

  // Entorno para reflejos (cielo pre-filtrado una vez).
  const pmrem = new THREE.PMREMGenerator(renderer);
  let entorno = null;
  const escEntorno = new THREE.Scene(), cieloEntorno = new Sky();
  cieloEntorno.scale.setScalar(50);
  for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) cieloEntorno.material.uniforms[k].value = u[k].value;
  cieloEntorno.material.uniforms.cloudCoverage.value = 0;
  escEntorno.add(cieloEntorno);
  function generarEntorno(dirSol) {
    if (!ajustes.entorno) return; // 27: nivel mínimo, sin reflejos del cielo
    cieloEntorno.material.uniforms.sunPosition.value.copy(dirSol);
    entorno?.dispose();
    entorno = pmrem.fromScene(escEntorno, 0, 0.1, 100).texture;
    escena.environment = entorno;
  }
  /**
   * 26: compila en paralelo (KHR_parallel_shader_compile) los sombreadores del filtro del entorno y del cielo que lo alimenta,
   * mientras se descargan las texturas. Sin esto, PMREMGenerator los compilaba de forma síncrona y la página quedaba bloqueada
   * ≈ 0,7 s. Usa la parte interna de PMREMGenerator de three r186 (crear sus objetivos de dibujo); si cambia, se vuelve al
   * camino síncrono de siempre, con el mismo resultado.
   */
  async function precompilarEntorno() {
    if (!ajustes.entorno) return;
    try {
      pmrem._setSize(256);
      pmrem._allocateTargets().dispose();
      // Misma geometría que usa el filtro: la presencia del atributo de posición forma parte de la clave del programa.
      const filtro = new THREE.Mesh(pmrem._lodMeshes[1].geometry, pmrem._ggxMaterial);
      const lote = new THREE.Scene(); lote.add(filtro, cieloEntorno.clone());
      const anterior = renderer.getRenderTarget();
      renderer.setRenderTarget(pmrem._pingPongRenderTarget); // mismo programa que al filtrar: sin tono ni conversión de color
      const espera = renderer.compileAsync(lote, new THREE.PerspectiveCamera());
      renderer.setRenderTarget(anterior);
      await espera;
    } catch { /* se compilará de forma síncrona al generar el entorno */ }
  }
  const entornoPrecompilado = precompilarEntorno();
  // Listo para reproducir: texturas, catálogo de estrellas (sus puntos se compilan con el resto) y entorno precompilado.
  const cargas = Promise.all([cargasTexturas, estrellasListas, entornoPrecompilado]);

  const v = new THREE.Vector3(), arriba = new THREE.Vector3(), dirSol = new THREE.Vector3(), M4 = new THREE.Matrix4();
  // 27: si la calidad automática baja el detalle durante el lanzamiento, se apagan las sombras y las nubes sin recompilar nada.
  let permitirSombras = ajustes.sombras, permitirNubes = ajustes.nubes;
  function reducirDetalle(nuevo) {
    const a = ajustesLanzamiento(nuevo);
    permitirSombras = permitirSombras && a.sombras; permitirNubes = permitirNubes && a.nubes;
  }
  const colorDia = new THREE.Color(), colorNiebla = new THREE.Color();
  let entornoListo = false;

  /**
   * Actualiza el mundo para el instante (ms UTC) y la cámara. `foco`: punto de interés (para la sombra).
   * Devuelve { altitudCamara, brilloCielo, dirSol } para el resto de la escena (humo, llamas).
   */
  function actualizar({ ms, foco, tiempoAnim }) {
    const s = solEnLC41(ms);
    enuAEscena(s.enu, dirSol).normalize();
    if (!entornoListo) { generarEntorno(dirSol); entornoListo = true; }
    const altitud = v.copy(camara.position).sub(CENTRO_TIERRA).length() - R;
    arriba.copy(camara.position).sub(CENTRO_TIERRA).normalize();
    // Brillo del cielo: proporcional a la columna de aire sobre la cámara (escala ≈ 8 km), con una caída algo más suave.
    const brillo = Math.exp(-Math.max(0, altitud) / 9000);
    u.uBrilloCielo.value = brillo;
    cielo.visible = brillo > 0.003;
    cielo.position.copy(camara.position);
    u.sunPosition.value.copy(dirSol);
    u.time.value = tiempoAnim;
    // Atmósfera vista desde fuera: aparece al dejar atrás la parte densa.
    const fuera = THREE.MathUtils.smoothstep(altitud, 6000, 40000);
    uAtmosfera.uSol.value.copy(dirSol);
    uAtmosfera.uIntensidad.value = 1.15 * fuera;
    // Desde dentro (mirando hacia arriba) el velo es más denso; visto desde el espacio, el disco conserva sus colores (profundidad
    // óptica de Rayleigh en el nadir ≈ 0,1–0,36) y solo el limbo, con trayectos de cientos de kilómetros, se ve azul.
    uAtmosfera.uEscala.value = THREE.MathUtils.lerp(140000, 600000, THREE.MathUtils.smoothstep(altitud, 50000, 150000));
    atmosferaFuera.visible = fuera > 0.001 && altitud > 80000;
    atmosferaDentro.visible = fuera > 0.001 && altitud <= 80000;
    matNubes.opacity = (nuboso ? 0.9 : 0.75) * THREE.MathUtils.smoothstep(altitud, 12000, 45000);
    nubes.visible = permitirNubes && Boolean(matNubes.alphaMap) && matNubes.opacity > 0.002;
    // Capas de detalle: se ocultan cuando están muy lejos (ahorro) o son innecesarias.
    capas.lc41.visible = Boolean(capas.lc41.material.map) && altitud < 400000;
    // El Cabo se desvanece al subir: desde más de ≈ 50 km su mar turquesa destacaría como un recuadro sobre Blue Marble.
    capas.cabo.material.opacity = 1 - THREE.MathUtils.smoothstep(altitud, 25000, 50000);
    capas.cabo.visible = Boolean(capas.cabo.material.map) && capas.cabo.material.opacity > 0.002;
    // Estrellas: se ven cuando el cielo se oscurece.
    matEstrellas.uniforms.uVisibilidad.value = THREE.MathUtils.clamp(1 - brillo * 40, 0, 1) * 0.85;
    matEstrellas.uniforms.uPixel.value = renderer.getPixelRatio(); // la calidad automática puede cambiarla durante el lanzamiento
    const Me = matrizEcuatorialAEnu(ms);
    M4.set(Me[0][0], Me[0][1], Me[0][2], 0, Me[2][0], Me[2][1], Me[2][2], 0, -Me[1][0], -Me[1][1], -Me[1][2], 0, 0, 0, 0, 1);
    estrellas.quaternion.setFromRotationMatrix(M4);
    estrellas.position.copy(camara.position);
    // Sol fuera de la atmósfera.
    solEspacio.visible = brillo < 0.6 && dirSol.dot(arriba) > -0.3;
    solEspacio.material.opacity = THREE.MathUtils.clamp(1 - brillo * 1.6, 0, 1);
    solEspacio.position.copy(camara.position).addScaledVector(dirSol, 4.0e7);
    solEspacio.scale.setScalar(4.0e7 * 0.22);
    // Luz solar: más cálida cuanto más bajo está el Sol y más aire queda por encima de la cámara.
    const elev = Math.max(0.02, dirSol.dot(arriba)), masaAire = Math.min(12, 1 / (elev + 0.15 * Math.pow(elev * 57.3 + 3.885, -1.253))) * brillo;
    colorDia.setRGB(Math.exp(-0.012 * masaAire), Math.exp(-0.03 * masaAire), Math.exp(-0.07 * masaAire));
    sol.color.copy(colorDia); sol.intensity = 2.8;
    const objetivo = foco ?? camara.position;
    sol.position.copy(objetivo).addScaledVector(dirSol, 400); sol.target.position.copy(objetivo); sol.target.updateMatrixWorld();
    const sombras = renderer.shadowMap.enabled && permitirSombras && objetivo.distanceTo(camara.position) < 1500 && altitud < 3000 && objetivo.y < 300;
    sol.shadow.intensity = sombras ? 1 : 0;
    // Sin sombras visibles no se dibuja el mapa de sombras; pero se dibuja al menos una vez, para que su textura de profundidad
    // exista: sin ella, three enlaza al muestreador de sombra una textura vacía que WebGL rechaza («Mismatch between texture
    // format and sampler type»).
    renderer.shadowMap.autoUpdate = sombras || !sol.shadow.map;
    // Luz difusa: cielo azul en tierra; en el espacio, solo el reflejo azulado de la Tierra iluminada.
    hemisferio.color.setRGB(0.62 * brillo + 0.02, 0.72 * brillo + 0.03, 0.9 * brillo + 0.05);
    const dia = THREE.MathUtils.smoothstep(dirSol.dot(arriba), -0.2, 0.3);
    hemisferio.groundColor.setRGB(0.36 * brillo + 0.18 * dia * (1 - brillo), 0.33 * brillo + 0.24 * dia * (1 - brillo), 0.27 * brillo + 0.36 * dia * (1 - brillo));
    hemisferio.intensity = 0.9; hemisferio.position.copy(arriba); // «arriba» local: en órbita la vertical cambia con la posición
    escena.environmentIntensity = 0.15 + 0.55 * brillo;
    // Perspectiva aérea: luz dispersada por el aire entre la cámara y el suelo. En tierra, visibilidad de unas decenas de
    // kilómetros y tono blanquecino; al subir, la columna de aire hasta el suelo se mantiene y el tono pasa al azul que se ve
    // desde la estratosfera (sin ella el océano de Blue Marble, muy oscuro, se vería negro). Por encima de ≈ 100 km la sustituye
    // la capa atmosférica vista desde fuera. Ilustrativo, no un modelo de transferencia radiativa.
    const h = Math.max(0, altitud);
    // En tierra la densidad sale de la visibilidad; en altura, de la longitud típica del trayecto hasta el suelo (≈ h / 0,85
    // mirando hacia abajo), de modo que el velo azul de la columna de aire se mantiene (≈ 0,15 en el nadir y ≈ 0,3 a 45°).
    const alto = THREE.MathUtils.smoothstep(h, 3000, 30000), iluminado = THREE.MathUtils.smoothstep(dirSol.dot(arriba), -0.15, 0.25);
    const densidadSuelo = (nuboso ? 2.6e-5 : 1.8e-5) * 25000 / (h + 25000), densidadColumna = 0.6 / (h / 0.85 + 20000);
    escena.fog.density = THREE.MathUtils.lerp(densidadSuelo, densidadColumna, alto) * (1 - THREE.MathUtils.smoothstep(h, 60000, 120000));
    colorNiebla.setRGB(0.64, 0.72, 0.83).multiplyScalar(nuboso ? 0.88 : 1).lerp(new THREE.Color(0.20, 0.33, 0.62), alto).multiplyScalar(0.2 + 0.8 * iluminado);
    escena.fog.color.copy(colorNiebla);
    // Exposición: algo menor en tierra (hormigón y nubes a pleno sol) que en el espacio.
    renderer.toneMappingExposure = 0.5 + 0.08 * (1 - brillo);
    return { altitudCamara: altitud, brilloCielo: brillo, dirSol, solAltDeg: s.altDeg, solAzDeg: s.azDeg };
  }

  function redimensionar(ancho, alto) {
    renderer.setSize(ancho, alto, false);
    camara.aspect = ancho / Math.max(1, alto); camara.updateProjectionMatrix();
  }

  /**
   * 26: sube a la GPU las texturas ya cargadas, una por fotograma, antes de empezar a reproducir. Sin esto, cada textura se subía
   * la primera vez que entraba en el encuadre (el globo de 8192 px, ≈ 0,4–0,7 s; cada ortoimagen, 50–70 ms) en plena aproximación.
   */
  async function subirTexturas() {
    for (const t of [...recursos, mascara, mascaraAncha]) {
      renderer.initTexture(t);
      await new Promise(r => requestAnimationFrame(() => r()));
    }
  }

  return {
    renderer, escena, camara, cargas, actualizar, redimensionar, capas, subirTexturas, ajustes, reducirDetalle,
    estadoTexturas: () => Object.fromEntries(Object.keys(RECURSOS_LANZAMIENTO).map(k => [k, Boolean(texturas[k])])),
    destruir() {
      escena.traverse(o => { if (o.isMesh || o.isPoints) { o.geometry?.dispose(); if (o.material && o !== cielo) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); } });
      cielo.geometry.dispose(); cielo.material.dispose();
      solEspacio.material.map?.dispose(); solEspacio.material.dispose();
      for (const t of recursos) { t.dispose(); t.image?.close?.(); } // ImageBitmap: libera la imagen decodificada
      mascara.dispose(); mascaraAncha.dispose(); entorno?.dispose(); pmrem.dispose();
      cieloEntorno.geometry.dispose(); cieloEntorno.material.dispose();
      bajaCalidad();
      renderer.dispose();
      renderer.forceContextLoss(); // libera el contexto WebGL ya, sin esperar al recolector (Chrome limita los contextos activos)
    }
  };
}
