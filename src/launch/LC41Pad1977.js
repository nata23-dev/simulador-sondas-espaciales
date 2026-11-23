/**
 * En este módulo reconstruyo de forma aproximada el Complejo de Lanzamiento 41
 * de Cabo Cañaveral en 1977 (sistema Integrate-Transfer-Launch del Titan III),
 * estimando sus proporciones a partir de las fotografías NASA/JPL-Caltech
 * PIA21739, PIA21742 y PIA21744 con el vehículo de 48,8 m como referencia.
 * Coordenadas en metros: `x = este`, `y = arriba`, `z = sur`, con el origen en
 * el eje del lanzador a ras de suelo. Agrupo las mallas estáticas por material,
 * sombra y zona para reducir llamadas de dibujo sin afectar al frustum culling.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const PLATAFORMA_1977 = Object.freeze({
  alturaMesaM: 5, // Altura aproximada de la cubierta de la plataforma móvil.
  salidasFosoLlamasM: Object.freeze([[-34, 0], [34, 0]]), // Salidas este y oeste de los fosos de llamas (x, z).
  torreServicioRetiradaZ: 165,
  fuentes: 'Proporciones aproximadas a partir de las fotografías PIA21739, PIA21742 y PIA21744 (NASA/JPL-Caltech).'
});

const ARRIBA = new THREE.Vector3(0, 1, 0);
// Construyo un prisma estructural orientado entre dos puntos 3D para ensamblar celosías metálicas.
function barra(a, b, grosor) {
  const dir = new THREE.Vector3().subVectors(b, a), largo = dir.length();
  const g = new THREE.BoxGeometry(grosor, largo, grosor);
  const q = new THREE.Quaternion().setFromUnitVectors(ARRIBA, dir.normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}

// Ensamblo y fusiono una torre prismática de celosía con montantes, anillos horizontales, diagonales y rellanos opcionales.
function celosia({ x, z, ancho, fondo, y0, alto, paso = 4, grosor = 0.35, caras = [0, 1, 2, 3], rellanos = 0 }) {
  const partes = [], esquinas = [[-ancho / 2, -fondo / 2], [ancho / 2, -fondo / 2], [ancho / 2, fondo / 2], [-ancho / 2, fondo / 2]];
  const P = (i, y) => new THREE.Vector3(x + esquinas[i % 4][0], y, z + esquinas[i % 4][1]);
  for (let i = 0; i < 4; i++) partes.push(barra(P(i, y0), P(i, y0 + alto), grosor * 1.4));
  const niveles = Math.round(alto / paso);
  for (let k = 0; k <= niveles; k++) {
    const y = y0 + k * alto / niveles;
    for (let i = 0; i < 4; i++) partes.push(barra(P(i, y), P(i + 1, y), grosor));
    if (rellanos && k % rellanos === 0 && k > 0) {
      const losa = new THREE.BoxGeometry(ancho * 1.25, 0.25, fondo * 1.25); losa.translate(x, y, z); partes.push(losa);
    }
    if (k < niveles) {
      const y1 = y0 + (k + 1) * alto / niveles;
      for (const i of caras) { partes.push(barra(P(i, y), P(i + 1, y1), grosor * 0.8)); partes.push(barra(P(i + 1, y), P(i, y1), grosor * 0.8)); }
    }
  }
  return mergeGeometries(partes, false);
}

// Pinto proceduralmente una textura de chapas metálicas acanaladas repetible para mesas y torres.
function texturaPaneles(color, rayas = 64, alto = 256, anisotropia = 8) {
  const c = document.createElement('canvas'); c.width = 256; c.height = alto;
  const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 256, alto);
  for (let i = 0; i < rayas; i++) { g.fillStyle = i % 2 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.08)'; g.fillRect(i * 256 / rayas, 0, 256 / rayas / 2, alto); }
  for (let j = 1; j < 8; j++) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, j * alto / 8, 256, 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = anisotropia;
  return t;
}
// Genero una máscara radial suave para fundir la explanada de hormigón sobre la ortoimagen sin un borde duro.
function texturaBordeRadial(interior = 0.72) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 64 * interior, 64, 64, 64);
  gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#000');
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 64 * interior, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace;
  return t;
}
// Genero una textura procedural de hormigón con juntas y manchas deterministas.
function texturaHormigon(base = '#b9b4a8', manchas = 'rgba(70,60,45,0.12)', anisotropia = 8) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  let s = 9; const azar = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 900; i++) { g.fillStyle = azar() > 0.5 ? manchas : 'rgba(255,255,255,0.06)'; const r = 1 + azar() * 7; g.beginPath(); g.arc(azar() * 256, azar() * 256, r, 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(40,40,40,0.25)'; g.lineWidth = 1.5;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = anisotropia;
  return t;
}

// Construyo el conjunto completo del LC-41 (plataforma móvil, torre umbilical con brazos retráctiles, torre de servicio al sur, vías y focos) y su función de limpieza WebGL.
export function crearPlataformaLC41_1977({ anisotropia = 8 } = {}) {
  const grupo = new THREE.Group(); grupo.name = 'LC41_1977';
  const aniso = Math.max(1, Math.min(8, anisotropia));
  const hormigon = texturaHormigon('#b9b4a8', 'rgba(70,60,45,0.12)', aniso); hormigon.repeat.set(12, 12);
  const mat = {
    explanada: new THREE.MeshStandardMaterial({ map: hormigon, roughness: 0.95, color: 0xaaa69c, envMapIntensity: 0.4,
      alphaMap: texturaBordeRadial(), transparent: true, depthWrite: false }),
    mesa: new THREE.MeshStandardMaterial({ map: texturaPaneles('#6f716f', 16, 256, aniso), roughness: 0.75, metalness: 0.35 }),
    celosia: new THREE.MeshStandardMaterial({ color: 0x3b3d3e, roughness: 0.7, metalness: 0.5 }),
    paneles: new THREE.MeshStandardMaterial({ map: texturaPaneles('#7d7f7c', 96, 256, aniso), roughness: 0.6, metalness: 0.45 }),
    mastil: new THREE.MeshStandardMaterial({ map: (() => { const t = texturaHormigon('#cdb89a', 'rgba(150,90,40,0.18)', aniso); t.repeat.set(1, 6); return t; })(), roughness: 0.9 }),
    amarillo: new THREE.MeshStandardMaterial({ color: 0xd9a531, roughness: 0.6, metalness: 0.3 }),
    blancoTorre: new THREE.MeshStandardMaterial({ map: texturaPaneles('#d8d8d2', 40, 256, aniso), roughness: 0.6, metalness: 0.2 }),
    oscuro: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 1 }),
    via: new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.6, metalness: 0.7 }),
    cable: new THREE.MeshStandardMaterial({ color: 0x1d1d1d, roughness: 0.6 }),
    lampara: new THREE.MeshStandardMaterial({ color: 0xe8e8e0, emissive: 0x333028, roughness: 0.4 })
  };
  const add = (geo, m, sombra = true) => { const o = new THREE.Mesh(geo, m); o.castShadow = sombra; o.receiveShadow = true; grupo.add(o); return o; };
  // Acumulo las geometrías estáticas por material, sombra y zona (`pad`, `vias`, `torreSur`) para fusionarlas al final y minimizar llamadas de dibujo.
  const lotes = new Map();
  const addEst = (geo, m, sombra = true, zona = 'pad') => {
    let lote = lotes.get(m);
    if (!lote) { lote = new Map(); lotes.set(m, lote); }
    const clave = `${zona}:${sombra ? 1 : 0}`;
    let lista = lote.get(clave);
    if (!lista) { lista = { geos: [], sombra }; lote.set(clave, lista); }
    lista.geos.push(geo);
  };
  const caja = (sx, sy, sz, x, y, z, m, sombra = true, zona = 'pad') => {
    const g = new THREE.BoxGeometry(sx, sy, sz); g.translate(x, y, z); addEst(g, m, sombra, zona);
  };
  const H = PLATAFORMA_1977.alturaMesaM;

  // Coloco la explanada de hormigón por encima de los parches de terreno (orden 4) y los dos fosos de llamas este-oeste.
  const explanada = new THREE.CircleGeometry(70, 64); explanada.rotateX(-Math.PI / 2); explanada.translate(0, 0.06, 0);
  add(explanada, mat.explanada, false).renderOrder = 4;
  for (const lado of [-1, 1]) caja(26, 0.1, 9, lado * 21, 0.08, 0, mat.oscuro, false, 'pad');

  // Tiendo las vías ferroviarias hacia el sur por las que se desplazaban la plataforma móvil y la torre de servicio.
  for (const x of [-7.5, -6.0, 6.0, 7.5]) caja(0.18, 0.2, 420, x, 0.1, 200, mat.via, false, 'vias');

  // Construyo la mesa móvil dejando un hueco central de 12 x 11 m para las toberas del núcleo y los motores sólidos.
  caja(24, H, 5, 0, H / 2, -8, mat.mesa); caja(24, H, 5, 0, H / 2, 8, mat.mesa);
  caja(6, H, 11, -9, H / 2, 0, mat.mesa); caja(6, H, 11, 9, H / 2, 0, mat.mesa);
  for (const x of [-10, 10]) for (const z of [-8, 8]) caja(2.5, 1.6, 2.5, x, 0.8, z, mat.oscuro);

  // Levanto la torre umbilical al oeste del lanzador (escalera de celosía, torre cerrada, mástil de hormigón y brazos retráctiles).
  addEst(celosia({ x: -16.5, z: 0, ancho: 5, fondo: 5, y0: H, alto: 49, paso: 3.5, grosor: 0.3, rellanos: 2 }), mat.celosia);
  caja(6, 51, 6.5, -10.5, H + 25.5, 0, mat.paneles);
  const mastil = new THREE.CylinderGeometry(1.5, 2.4, 33, 4, 1); mastil.rotateY(Math.PI / 4); mastil.translate(-5.6, H + 16.5, 0);
  addEst(mastil, mat.mastil);
  addEst(celosia({ x: -5.4, z: 0, ancho: 3.2, fondo: 3.6, y0: H + 33, alto: 10, paso: 2.5, grosor: 0.22 }), mat.amarillo);
  // Dejo los tres brazos umbilicales fuera de la fusión estática para poder rotarlos durante la cuenta atrás.
  const brazos = [];
  for (const [y, largo] of [[H + 23, 2.8], [H + 30.5, 2.8], [H + 38, 2.1]]) {
    const pivote = new THREE.Group(); pivote.position.set(-4.4, y, 0);
    const b = new THREE.Mesh(celosia({ x: largo / 2, z: 0, ancho: largo, fondo: 1.1, y0: -0.55, alto: 1.1, paso: 1.1, grosor: 0.12, caras: [0, 2] }), mat.amarillo);
    b.castShadow = true; pivote.add(b); grupo.add(pivote); brazos.push(pivote);
  }
  // Añado las mangueras umbilicales curvas desde el mástil hacia la base del vehículo.
  for (const [y0, y1, z] of [[H + 12, H + 4, 0.8], [H + 18, H + 9, -0.7]]) {
    const curva = new THREE.CatmullRomCurve3([new THREE.Vector3(-4.3, y0, z), new THREE.Vector3(-3.0, (y0 + y1) / 2 - 1.5, z), new THREE.Vector3(-1.6, y1, z * 0.6)]);
    addEst(new THREE.TubeGeometry(curva, 12, 0.09, 6), mat.cable);
  }

  // Sitúo la torre de servicio móvil retirada al sur sobre las vías.
  const zT = PLATAFORMA_1977.torreServicioRetiradaZ;
  addEst(celosia({ x: 0, z: zT, ancho: 22, fondo: 20, y0: 0, alto: 66, paso: 5.5, grosor: 0.55, caras: [0, 1, 3], rellanos: 3 }), mat.celosia, true, 'torreSur');
  caja(10, 26, 9, 3, 46, zT - 4, mat.blancoTorre, true, 'torreSur'); caja(7, 18, 6, -5, 52, zT + 3, mat.blancoTorre, true, 'torreSur');
  caja(24, 1.4, 22, 0, 66.5, zT, mat.celosia, true, 'torreSur');

  // Coloco los cuatro báculos perimetrales de iluminación.
  for (const [x, z] of [[-28, -30], [30, -28], [28, 30], [-30, 28]]) {
    addEst(new THREE.CylinderGeometry(0.15, 0.25, 16, 8).translate(x, 8, z), mat.via);
    for (const dx of [-0.6, 0.6]) addEst(new THREE.SphereGeometry(0.42, 12, 8).translate(x + dx, 16.3, z), mat.lampara);
  }

  // Fusiono cada lote estático y libero las geometrías intermedias ya combinadas.
  for (const [m, porZona] of lotes) {
    for (const { geos, sombra } of porZona.values()) {
      const fusionada = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (geos.length > 1) for (const g of geos) g.dispose();
      add(fusionada, m, sombra);
    }
  }

  const materialesLista = Object.values(mat);
  return {
    grupo, alturaMesa: H, brazos,
    // Retraigo progresivamente los brazos umbilicales hacia el mástil (0 conectados, 1 retraídos).
    retraerBrazos(u) { brazos.forEach((b, i) => { b.rotation.y = THREE.MathUtils.degToRad(-(Math.min(1, Math.max(0, u * 1.4 - i * 0.2))) * 70); }); },
    // Libero todas las geometrías, texturas y materiales de la plataforma.
    destruir() {
      grupo.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
      for (const m of materialesLista) { m.map?.dispose(); m.alphaMap?.dispose(); m.dispose(); }
    }
  };
}
