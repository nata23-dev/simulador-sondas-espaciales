/**
 * En este módulo construyo el mundo 3D del lanzamiento Voyager: Tierra por
 * capas multirresolución, atmósfera, cielo de Preetham, catálogo estelar
 * Hipparcos, Sol, iluminación, entorno PMREM y renderizador WebGL 2 dedicado.
 * Marco de coordenadas (metros): ENU local fijo a LC-41 convertido a escena
 * (`x = este`, `y = arriba`, `z = sur`), con la Tierra como esfera de radio
 * ecuatorial WGS84 centrada en `(0, -R, 0)`.
 * También gestiono aquí la degradación adaptativa de detalle, la partición
 * opaca/transparente de parches para Early-Z, la precarga asíncrona de texturas
 * y shaders, y la liberación completa de recursos WebGL al cerrar la vista.
 */
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { LC41, RADIO_TIERRA_M, solEnLC41, matrizEcuatorialAEnu } from '../science/VoyagerLaunchProfile.js';
import { cargarCatalogoHipparcos } from '../graphics/StarCatalog.js';
import { crearSolEspacio } from './LaunchEffects.js';
import { registerRenderer, opcionesRenderizador } from '../graphics/QualityProfile.js';
import { crearRenderizadorWebGL } from '../graphics/WebGLSupport.js';
import { texturaDfgCompartida } from './LaunchSharedResources.js';

const DEG = Math.PI / 180;
const R = RADIO_TIERRA_M;
export const CENTRO_TIERRA = Object.freeze(new THREE.Vector3(0, -R, 0));

// Recursos geográficos en proyección EPSG:4326 (procedencia y sumas SHA-256 documentadas en public/launch/README.md).
export const RECURSOS_LANZAMIENTO = Object.freeze({
  globo: { archivo: 'launch/earth-bmng-8192.jpg', ligero: 'launch/earth-bmng-4096.jpg', lat: [-90, 90], lon: [-180, 180] },
  florida: { archivo: 'launch/florida-bmng-2048.jpg', lat: [23, 34], lon: [-87, -76], desnivel: -12 },
  cabo: { archivo: 'launch/cape-usgs-2048.jpg', lat: [28.465, 28.705], lon: [-80.70, -80.46], desnivel: -1.5 },
  lc41: { archivo: 'launch/lc41-usgs-2048.jpg', lat: [28.571, 28.5956], lon: [-80.5951, -80.5705], desnivel: 0 },
  nubes: { archivo: 'textures/earth_clouds.jpg' }
});

// Elijo la textura del globo de 8192 px (≈ 358 MB en GPU con mipmaps) solo en escritorio/calidad alta con hardware suficiente; si no, uso la de 4096 px (≈ 90 MB).
export function archivoGlobo({ calidad = 'auto', escritorio = true, maxTextura = 16384, detalle = 'alto' } = {}) {
  const grande = maxTextura >= 8192 && detalle === 'alto' && (calidad === 'alto' || (calidad === 'auto' && escritorio));
  return grande ? RECURSOS_LANZAMIENTO.globo.archivo : RECURSOS_LANZAMIENTO.globo.ligero;
}

// Determino los parámetros puramente visuales para cada nivel de detalle (antialiasing, sombras, entorno, nubes, teselación y partículas) sin alterar nunca la trayectoria ni los datos científicos.
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

// Acoto el filtrado anisotrópico según el nivel de detalle y el máximo del hardware para evitar 16 muestras por fragmento en GPU modestas o rasterizadores por software.
export function anisotropiaLanzamiento(detalle = 'alto', maxHardware = 16) {
  const tope = { alto: 16, medio: 8, bajo: 2, minimo: 1 }[detalle] ?? 16;
  const hw = Number.isFinite(maxHardware) && maxHardware >= 1 ? maxHardware : 1;
  return Math.max(1, Math.min(hw, tope));
}

// Cargo cada textura decodificándola fuera del hilo principal mediante `createImageBitmap` (con `flipY` invertido y sin conversión ICC) para evitar congelar la escena al subir imágenes grandes; si no existe la API, recurro a `TextureLoader`.
function cargarTextura(url) {
  if (typeof createImageBitmap !== 'function' || typeof fetch !== 'function') {
    return new Promise((resolve, reject) => new THREE.TextureLoader().load(url, resolve, undefined, reject));
  }
  return fetch(url)
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob(); })
    .then(blob => createImageBitmap(blob, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' }))
    .then(bitmap => { const t = new THREE.Texture(bitmap); t.flipY = false; t.needsUpdate = true; return t; });
}

// Calculo el vector unitario de escena desde el centro de la Tierra hacia una coordenada geográfica (lat, lon) en el marco ENU de LC-41.
export function direccionGeografica(latDeg, lonDeg, destino = new THREE.Vector3()) {
  const f = latDeg * DEG, l = lonDeg * DEG, f0 = LC41.latDeg * DEG, l0 = LC41.lonDeg * DEG;
  const x = Math.cos(f) * Math.cos(l), y = Math.cos(f) * Math.sin(l), z = Math.sin(f);
  const e = -Math.sin(l0) * x + Math.cos(l0) * y;
  const n = -Math.sin(f0) * Math.cos(l0) * x - Math.sin(f0) * Math.sin(l0) * y + Math.cos(f0) * z;
  const u = Math.cos(f0) * Math.cos(l0) * x + Math.cos(f0) * Math.sin(l0) * y + Math.sin(f0) * z;
  return destino.set(e, u, -n);
}
export const enuAEscena = (enu, destino = new THREE.Vector3()) => destino.set(enu[0], enu[2], -enu[1]);

// Genero un parche esférico geográfico con vértices relativos a su centro para preservar precisión en Float32.
// Cuando `margenOpaco > 0`, divido los índices en borde semitransparente y núcleo opaco (compartiendo atributos con `setDrawRange`) para aprovechar el descarte Early-Z sobre capas inferiores y el cielo.
function parcheEsferico({ lat, lon, radio, segLat, segLon, margenOpaco = 0, ordenOpaco = 0 }, material) {
  const centro = direccionGeografica((lat[0] + lat[1]) / 2, (lon[0] + lon[1]) / 2).multiplyScalar(radio).add(CENTRO_TIERRA);
  const pos = [], nor = [], uv = [], idxBorde = [], idxNucleo = [], d = new THREE.Vector3();
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
  for (let i = 0; i < segLat; i++) {
    const v0 = i / segLat, v1 = (i + 1) / segLat;
    const filaOpaca = margenOpaco > 0 && v0 >= margenOpaco - 1e-6 && v1 <= 1 - margenOpaco + 1e-6;
    for (let j = 0; j < segLon; j++) {
      const u0 = j / segLon, u1 = (j + 1) / segLon;
      const esOpaco = filaOpaca && u0 >= margenOpaco - 1e-6 && u1 <= 1 - margenOpaco + 1e-6;
      const a = i * (segLon + 1) + j, b = a + 1, c = a + segLon + 1, e = c + 1;
      (esOpaco ? idxNucleo : idxBorde).push(a, b, e, a, e, c);
    }
  }
  const idx = idxNucleo.length ? [...idxBorde, ...idxNucleo] : idxBorde;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const malla = new THREE.Mesh(geo, material);
  malla.position.copy(centro);
  malla.receiveShadow = true;
  if (idxNucleo.length) {
    const nBorde = idxBorde.length, nNucleo = idxNucleo.length, nTotal = idx.length;
    geo.setDrawRange(0, nBorde);
    const geoNucleo = new THREE.BufferGeometry();
    geoNucleo.setAttribute('position', geo.getAttribute('position'));
    geoNucleo.setAttribute('normal', geo.getAttribute('normal'));
    geoNucleo.setAttribute('uv', geo.getAttribute('uv'));
    geoNucleo.setIndex(geo.getIndex());
    geoNucleo.boundingSphere = geo.boundingSphere;
    geoNucleo.setDrawRange(nBorde, nNucleo);
    const matNucleo = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const nucleo = new THREE.Mesh(geoNucleo, matNucleo);
    nucleo.receiveShadow = true;
    nucleo.renderOrder = ordenOpaco;
    malla.add(nucleo);
    malla.userData.nucleo = nucleo;
    malla.userData.matNucleo = matNucleo;
    malla.userData.alternarNucleoOpaco = (activo) => {
      if (nucleo.visible === activo) return;
      nucleo.visible = activo;
      geo.setDrawRange(0, activo ? nBorde : nTotal);
    };
  }
  return malla;
}

// Genero una máscara de bordes suaves para fundir cada parche geográfico con la capa inmediatamente inferior.
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

// Construyo el shader aditivo de la capa atmosférica por intersección de rayo con dos esferas (suelo y techo de 80 km).
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

// Aproximo el color estelar RGB a partir del índice de color B-V del catálogo Hipparcos.
function colorBV(bv) {
  const t = Number.isFinite(bv) ? Math.min(2, Math.max(-0.4, bv)) : 0.6;
  return new THREE.Color().setRGB(t < 0.4 ? 0.78 + 0.5 * t : 1, t < 0.4 ? 0.86 + 0.25 * t : 1 - 0.12 * (t - 0.4), t < 0.4 ? 1 : 1 - 0.38 * (t - 0.4));
}

// Inicializo el renderizador WebGL 2, la escena terrestre/atmosférica y el ciclo de actualización y limpieza del mundo de lanzamiento.
export function crearMundoLanzamiento({ canvas, mision, calidad = 'alto', detalle = 'alto', baseUrl = '/', escritorio = true }) {
  const ajustes = ajustesLanzamiento(detalle);
  // Creo un contexto WebGL 2 propio aplicando las opciones de GPU del perfil y el antialiasing del nivel de detalle.
  const renderer = crearRenderizadorWebGL(opcionesRenderizador({ canvas, antialias: ajustes.antialias, logarithmicDepthBuffer: true }, 'lanzamiento'), 'lanzamiento 3D');
  // Registro este renderizador bajo el contexto «lanzamiento» para que la resolución dinámica se adapte sin interferir con la escena principal.
  const bajaCalidad = registerRenderer(renderer, 'lanzamiento');
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.55;
  renderer.shadowMap.enabled = ajustes.sombras;
  // Uso PCFShadowMap porque en Three.js r186 PCFSoftShadowMap fue retirado y PCF ya aplica filtrado.
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(45, 1, 0.4, 2.0e8);
  escena.add(camara);
  const nuboso = mision.id === 'voyager-2';
  let destruido = false;
  const recursos = [];
  const url = rel => `${baseUrl}${rel}`;
  const texturas = {};
  // Consulto el máximo de anisotropía una sola vez durante la carga (evito el coste inicial en ANGLE) y lo limito al nivel de detalle.
  const anisotropia = anisotropiaLanzamiento(ajustes.detalle, renderer.capabilities.getMaxAnisotropy());
  const cargar = (clave, rel) => cargarTextura(url(rel)).then(t => {
    if (destruido) { t.dispose(); t.image?.close?.(); return null; }
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = anisotropia; texturas[clave] = t; recursos.push(t); return t;
  }).catch(() => { console.warn(`No se pudo cargar ${rel}; se usa el color de respaldo.`); return null; });

  // Construyo el globo terrestre base y los parches de detalle progresivo (Florida, Cabo Cañaveral y LC-41).
  const matGlobo = new THREE.MeshStandardMaterial({ color: 0x1b3d6b, roughness: 0.92, metalness: 0, envMapIntensity: 0 });
  const div = n => Math.max(8, Math.round(n * ajustes.divisiones));
  const globo = parcheEsferico({ lat: [-90, 90], lon: [-180, 180], radio: R - 150, segLat: div(128), segLon: div(256) }, matGlobo);
  globo.renderOrder = 0; escena.add(globo);
  const mascara = mascaraBordes(), mascaraAncha = mascaraBordes(0.3);
  const capas = {};
  for (const [clave, segs, orden, margenOpaco, ordenOpaco] of [
    ['florida', [div(48), div(48)], 1, 0.125, -1],
    ['cabo', [div(24), div(24)], 2, 1 / 3, -2],
    ['lc41', [16, 16], 3, 0.125, -3]
  ]) {
    const def = RECURSOS_LANZAMIENTO[clave];
    // Uso material Lambert difuso porque las ortoimágenes ya traen iluminación y un brillo especular haría parecer agua al terreno.
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, alphaMap: clave === 'cabo' ? mascaraAncha : mascara, opacity: 0, depthWrite: true });
    const m = parcheEsferico({ lat: def.lat, lon: def.lon, radio: R + def.desnivel, segLat: segs[0], segLon: segs[1], margenOpaco, ordenOpaco }, mat);
    m.renderOrder = orden; m.visible = false; escena.add(m); capas[clave] = m;
  }
  const matNubes = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, roughness: 1, envMapIntensity: 0 });
  const nubes = parcheEsferico({ lat: [-90, 90], lon: [-180, 180], radio: R + 9000, segLat: div(96), segLon: div(192) }, matNubes);
  nubes.renderOrder = 8; nubes.visible = false; escena.add(nubes);
  // Mantengo dos mallas atmosféricas (interior `BackSide` y exterior `FrontSide`) compartiendo uniformes para no mutar `material.side` a 80 km y evitar recompilar el shader en pleno vuelo.
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
      if (!t) return;
      const m = capas[clave];
      m.material.map = t; m.material.opacity = 1; m.material.needsUpdate = true;
      if (m.userData.matNucleo) { m.userData.matNucleo.map = t; m.userData.matNucleo.needsUpdate = true; }
      m.visible = true;
    })),
    // En detalle mínimo omito también la descarga de la textura de nubes.
    ajustes.nubes ? cargar('nubes', RECURSOS_LANZAMIENTO.nubes.archivo).then(t => {
      if (!t) return; t.colorSpace = THREE.NoColorSpace; matNubes.alphaMap = t; matNubes.needsUpdate = true; nubes.visible = permitirNubes;
    }) : null
  ]);

  // Configuro el cielo físico de Preetham con un factor `uBrilloCielo` que me permite oscurecerlo gradualmente al ganar altitud.
  const cielo = new Sky();
  cielo.scale.setScalar(1.0e4);
  cielo.material.depthWrite = false;
  // Dibujo el cielo tras los núcleos opacos de terreno y el vehículo para que el Z-buffer descarte sus fragmentos en zonas ya cubiertas.
  cielo.renderOrder = 1;
  const u = cielo.material.uniforms;
  u.turbidity.value = nuboso ? 5.5 : 3.5; u.rayleigh.value = nuboso ? 1.3 : 1.5; u.mieCoefficient.value = 0.0035; u.mieDirectionalG.value = 0.8;
  u.cloudCoverage.value = nuboso ? 0.42 : 0.1; u.cloudDensity.value = nuboso ? 0.55 : 0.35; u.cloudElevation.value = 0.55; u.cloudScale.value = 0.00025;
  u.uBrilloCielo = { value: 1 };
  cielo.material.onBeforeCompile = sh => {
    sh.uniforms.uBrilloCielo = u.uBrilloCielo;
    let frag = sh.fragmentShader
      .replace('float theta = acos( direction.y ); // elevation --> y-axis, [-pi/2, pi/2]', '')
      .replace('float phi = atan( direction.z, direction.x ); // azimuth --> x-axis [-pi/2, pi/2]', '')
      .replace('vec2 uv = vec2( phi, theta ) / vec2( 2.0 * pi, pi ) + vec2( 0.5, 0.0 );', '')
      .replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( texColor * uBrilloCielo, 1.0 );');
    if (ajustes.detalle === 'minimo') {
      frag = frag.replace('for ( int i = 0; i < 4; i ++ )', 'for ( int i = 0; i < 2; i ++ )');
    }
    sh.fragmentShader = 'uniform float uBrilloCielo;\n' + frag;
  };
  escena.add(cielo);

  // Construyo la bóveda estelar con el catálogo Hipparcos (V <= 6,5) orientada por tiempo sidéreo y el destello solar espacial.
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
    if (destruido) return;
    const n = reg.length / 4, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), tam = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const ra = reg[i * 4] * DEG, dec = reg[i * 4 + 1] * DEG, mag = reg[i * 4 + 2];
      // Almaceno cada estrella en coordenadas ecuatoriales; luego giro el grupo completo al marco ENU en cada fotograma.
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

  // Configuro la luz direccional solar, la luz hemisférica y la perspectiva aérea.
  const sol = new THREE.DirectionalLight(0xffffff, 2.8);
  // Mantengo `castShadow` fijo durante todo el lanzamiento para no recompilar materiales; atenúo la sombra mediante `shadow.intensity` y pauso `autoUpdate` cuando no aplica.
  sol.castShadow = renderer.shadowMap.enabled;
  sol.shadow.mapSize.set(calidad === 'alto' ? 4096 : 2048, calidad === 'alto' ? 4096 : 2048);
  sol.shadow.bias = -0.0003; sol.shadow.normalBias = 0.04;
  const sc = sol.shadow.camera; sc.left = -80; sc.right = 80; sc.top = 80; sc.bottom = -80; sc.near = 1; sc.far = 800;
  escena.add(sol, sol.target);
  const hemisferio = new THREE.HemisphereLight(0x9db4d8, 0x5a5444, 1.0); escena.add(hemisferio);
  escena.fog = new THREE.FogExp2(0xa9bad0, 2e-5);

  // Preparo el generador PMREM para reflejos metálicos a partir de una escena auxiliar del cielo.
  const pmrem = new THREE.PMREMGenerator(renderer);
  let entorno = null, entornoObjetivo = null;
  const escEntorno = new THREE.Scene(), cieloEntorno = new Sky();
  cieloEntorno.scale.setScalar(50);
  for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) cieloEntorno.material.uniforms[k].value = u[k].value;
  cieloEntorno.material.uniforms.cloudCoverage.value = 0;
  escEntorno.add(cieloEntorno);
  // Pre-filtro el mapa de entorno una sola vez con la dirección solar inicial (omitido en nivel mínimo).
  function generarEntorno(dirSol) {
    if (!ajustes.entorno) return;
    cieloEntorno.material.uniforms.sunPosition.value.copy(dirSol);
    entornoObjetivo?.dispose();
    entornoObjetivo = pmrem.fromScene(escEntorno, 0, 0.1, 100);
    entorno = entornoObjetivo.texture;
    escena.environment = entorno;
  }
  // Precompilo en paralelo los shaders del filtro PMREM y del cielo auxiliar mientras descargan las texturas para evitar un bloqueo síncrono al iniciar.
  async function precompilarEntorno() {
    if (!ajustes.entorno || destruido) return;
    try {
      pmrem._setSize(256);
      pmrem._allocateTargets().dispose();
      // Uso la misma geometría de filtro para que la clave del programa WebGL coincida exactamente.
      const filtro = new THREE.Mesh(pmrem._lodMeshes[1].geometry, pmrem._ggxMaterial);
      const lote = new THREE.Scene(); lote.add(filtro, cieloEntorno.clone());
      const anterior = renderer.getRenderTarget();
      renderer.setRenderTarget(pmrem._pingPongRenderTarget);
      const espera = renderer.compileAsync(lote, new THREE.PerspectiveCamera());
      renderer.setRenderTarget(anterior);
      await espera;
    } catch { /* se compilará de forma síncrona al generar el entorno */ }
  }
  const entornoPrecompilado = precompilarEntorno();
  // Agrupo en una sola promesa la descarga de texturas, el catálogo estelar y la precompilación del entorno.
  const cargas = Promise.all([cargasTexturas, estrellasListas, entornoPrecompilado]);

  const v = new THREE.Vector3(), arriba = new THREE.Vector3(), dirSol = new THREE.Vector3(), M4 = new THREE.Matrix4();
  // Permito apagar sombras y nubes sobre la marcha si la calidad adaptativa reduce el detalle sin recompilar shaders.
  let permitirSombras = ajustes.sombras, permitirNubes = ajustes.nubes;
  function reducirDetalle(nuevo) {
    const a = ajustesLanzamiento(nuevo);
    permitirSombras = permitirSombras && a.sombras; permitirNubes = permitirNubes && a.nubes;
  }
  const colorDia = new THREE.Color(), colorNiebla = new THREE.Color();
  let entornoListo = false;

  // Actualizo Sol, atmósfera, visibilidad de capas terrestres por horizonte, estrellas, sombras, luz difusa y niebla aérea para el instante UTC dado.
  function actualizar({ ms, foco, tiempoAnim }) {
    const s = solEnLC41(ms);
    enuAEscena(s.enu, dirSol).normalize();
    if (!entornoListo) { generarEntorno(dirSol); entornoListo = true; }
    const altitud = v.copy(camara.position).sub(CENTRO_TIERRA).length() - R;
    arriba.copy(camara.position).sub(CENTRO_TIERRA).normalize();
    // Atenúo el cielo exponencialmente según la altura de la cámara sobre la superficie.
    const brillo = Math.exp(-Math.max(0, altitud) / 9000);
    u.uBrilloCielo.value = brillo;
    cielo.visible = brillo > 0.003;
    cielo.position.copy(camara.position);
    u.sunPosition.value.copy(dirSol);
    u.time.value = tiempoAnim;
    // Activo el halo atmosférico al dejar atrás la troposfera y ajusto su escala óptica entre vista interna y limbo espacial.
    const fuera = THREE.MathUtils.smoothstep(altitud, 6000, 40000);
    uAtmosfera.uSol.value.copy(dirSol);
    uAtmosfera.uIntensidad.value = 1.15 * fuera;
    uAtmosfera.uEscala.value = THREE.MathUtils.lerp(140000, 600000, THREE.MathUtils.smoothstep(altitud, 50000, 150000));
    atmosferaFuera.visible = fuera > 0.001 && altitud > 80000;
    atmosferaDentro.visible = fuera > 0.001 && altitud <= 80000;
    matNubes.opacity = (nuboso ? 0.9 : 0.75) * THREE.MathUtils.smoothstep(altitud, 12000, 45000);
    nubes.visible = permitirNubes && Boolean(matNubes.alphaMap) && matNubes.opacity > 0.002;
    // Oculto las capas inferiores cuando el horizonte geométrico cae íntegramente dentro del núcleo opaco de una capa superior (bajo 3,5 km para el globo y bajo 10 m para Florida).
    capas.lc41.visible = Boolean(capas.lc41.material.map) && altitud < 400000;
    // Desvanezco el parche del Cabo por encima de 25-50 km para que su agua turquesa no recorte sobre Blue Marble.
    capas.cabo.material.opacity = 1 - THREE.MathUtils.smoothstep(altitud, 25000, 50000);
    capas.cabo.visible = Boolean(capas.cabo.material.map) && capas.cabo.material.opacity > 0.002;
    capas.cabo.userData.alternarNucleoOpaco?.(capas.cabo.material.opacity >= 0.999);
    const caboOpacoCubreHorizonte = capas.cabo.visible && capas.cabo.material.opacity >= 0.999 && altitud < 10;
    capas.florida.visible = Boolean(capas.florida.material.map) && !caboOpacoCubreHorizonte;
    const terrenoCubreGlobo = (capas.florida.visible || caboOpacoCubreHorizonte) && altitud < 3500;
    globo.visible = !terrenoCubreGlobo;
    // Revelo el campo estelar conforme oscurece el cielo y actualizo su rotación ecuatorial -> ENU.
    matEstrellas.uniforms.uVisibilidad.value = THREE.MathUtils.clamp(1 - brillo * 40, 0, 1) * 0.85;
    matEstrellas.uniforms.uPixel.value = renderer.getPixelRatio();
    const Me = matrizEcuatorialAEnu(ms);
    M4.set(Me[0][0], Me[0][1], Me[0][2], 0, Me[2][0], Me[2][1], Me[2][2], 0, -Me[1][0], -Me[1][1], -Me[1][2], 0, 0, 0, 0, 1);
    estrellas.quaternion.setFromRotationMatrix(M4);
    estrellas.position.copy(camara.position);
    // Muestro el destello solar espacial cuando el cielo de Preetham deja de dominar.
    solEspacio.visible = brillo < 0.6 && dirSol.dot(arriba) > -0.3;
    solEspacio.material.opacity = THREE.MathUtils.clamp(1 - brillo * 1.6, 0, 1);
    solEspacio.position.copy(camara.position).addScaledVector(dirSol, 4.0e7);
    solEspacio.scale.setScalar(4.0e7 * 0.22);
    // Calculo la atenuación cromática solar según la masa de aire y coloco la cámara de sombras centrada en el vehículo.
    const elev = Math.max(0.02, dirSol.dot(arriba)), masaAire = Math.min(12, 1 / (elev + 0.15 * Math.pow(elev * 57.3 + 3.885, -1.253))) * brillo;
    colorDia.setRGB(Math.exp(-0.012 * masaAire), Math.exp(-0.03 * masaAire), Math.exp(-0.07 * masaAire));
    sol.color.copy(colorDia); sol.intensity = 2.8;
    const objetivo = foco ?? camara.position;
    sol.position.copy(objetivo).addScaledVector(dirSol, 400); sol.target.position.copy(objetivo); sol.target.updateMatrixWorld();
    const sombras = renderer.shadowMap.enabled && permitirSombras && objetivo.distanceTo(camara.position) < 1500 && altitud < 3000 && objetivo.y < 300;
    sol.shadow.intensity = sombras ? 1 : 0;
    // Garantizo al menos una actualización del mapa de sombras para que exista su textura de profundidad y WebGL no rechace el muestreador.
    renderer.shadowMap.autoUpdate = sombras || !sol.shadow.map;
    // Ajusto la luz hemisférica entre cielo diurno en tierra y luz reflejada por la Tierra desde el espacio.
    hemisferio.color.setRGB(0.62 * brillo + 0.02, 0.72 * brillo + 0.03, 0.9 * brillo + 0.05);
    const dia = THREE.MathUtils.smoothstep(dirSol.dot(arriba), -0.2, 0.3);
    hemisferio.groundColor.setRGB(0.36 * brillo + 0.18 * dia * (1 - brillo), 0.33 * brillo + 0.24 * dia * (1 - brillo), 0.27 * brillo + 0.36 * dia * (1 - brillo));
    hemisferio.intensity = 0.9; hemisferio.position.copy(arriba);
    escena.environmentIntensity = 0.15 + 0.55 * brillo;
    // Simulo perspectiva aérea cualitativa desde el nivel del mar hasta la estratosfera; por encima de ~100 km la releva la esfera atmosférica.
    const h = Math.max(0, altitud);
    const alto = THREE.MathUtils.smoothstep(h, 3000, 30000), iluminado = THREE.MathUtils.smoothstep(dirSol.dot(arriba), -0.15, 0.25);
    const densidadSuelo = (nuboso ? 2.6e-5 : 1.8e-5) * 25000 / (h + 25000), densidadColumna = 0.6 / (h / 0.85 + 20000);
    escena.fog.density = THREE.MathUtils.lerp(densidadSuelo, densidadColumna, alto) * (1 - THREE.MathUtils.smoothstep(h, 60000, 120000));
    colorNiebla.setRGB(0.64, 0.72, 0.83).multiplyScalar(nuboso ? 0.88 : 1).lerp(new THREE.Color(0.20, 0.33, 0.62), alto).multiplyScalar(0.2 + 0.8 * iluminado);
    escena.fog.color.copy(colorNiebla);
    // Ajusto ligeramente la exposición entre el suelo soleado y el vacío espacial.
    renderer.toneMappingExposure = 0.5 + 0.08 * (1 - brillo);
    return { altitudCamara: altitud, brilloCielo: brillo, dirSol, solAltDeg: s.altDeg, solAzDeg: s.azDeg };
  }

  // Redimensiono el búfer de dibujo y actualizo la relación de aspecto de la cámara.
  function redimensionar(ancho, alto) {
    renderer.setSize(ancho, alto, false);
    camara.aspect = ancho / Math.max(1, alto); camara.updateProjectionMatrix();
  }

  // Subo a la GPU las texturas cargadas de una en una entre fotogramas para evitar pausas al entrar cada parche en el encuadre.
  async function subirTexturas() {
    for (const t of [...recursos, mascara, mascaraAncha]) {
      if (destruido) return;
      renderer.initTexture(t);
      await new Promise(r => requestAnimationFrame(() => r()));
    }
  }

  return {
    renderer, escena, camara, cargas, actualizar, redimensionar, capas, subirTexturas, ajustes, anisotropia, reducirDetalle,
    estadoTexturas: () => Object.fromEntries(Object.keys(RECURSOS_LANZAMIENTO).map(k => [k, Boolean(texturas[k])])),
    // Libero todos los recursos GPU, cierro los ImageBitmap decodificados, retiro el oyente de la DFG LUT compartida y fuerzo la pérdida del contexto WebGL.
    destruir() {
      if (destruido) return;
      destruido = true;
      // Obtengo la textura DFG interna antes de desechar los materiales para eliminar el oyente de este renderizador.
      const dfgCompartida = texturaDfgCompartida(renderer, escena);
      escena.traverse(o => { if (o.isMesh || o.isPoints) { o.geometry?.dispose(); if (o.material && o !== cielo) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); } });
      cielo.geometry.dispose(); cielo.material.dispose();
      solEspacio.geometry.dispose(); solEspacio.material.map?.dispose(); solEspacio.material.dispose();
      for (const t of recursos) { t.dispose(); t.image?.close?.(); }
      mascara.dispose(); mascaraAncha.dispose(); entornoObjetivo?.dispose(); entorno?.dispose(); pmrem.dispose();
      cieloEntorno.geometry.dispose(); cieloEntorno.material.dispose();
      dfgCompartida?.dispose();
      bajaCalidad();
      renderer.dispose();
      // Libero el contexto WebGL inmediatamente sin esperar al recolector de basura porque el navegador limita los contextos simultáneos.
      renderer.forceContextLoss();
    }
  };
}
