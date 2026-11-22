// Etapa 25 — Titan IIIE-Centaur D-1T con la Voyager plegada y su módulo de propulsión, a escala real (metros).
//
// Medidas DOCUMENTADAS (resumen de sistemas de 1973, ver VoyagerLaunchProfile.TITAN_IIIE_CENTAUR): altura total 160 ft, diámetro
// del núcleo y de los motores sólidos 10 ft, alturas de la etapa I (63 ft), etapa II (23 ft), adaptador (9,5 ft), cofia (58 ft =
// cilindro de 42 ft + nariz de 16 ft, diámetro 14 ft), motores sólidos (85 ft; segmentos de 129, 63 y 95 in) y antena de la
// Voyager (3,66 m). APROXIMADO a partir de las fotografías PIA21739, PIA21742, PIA21744 y PIA21746: reparto de los ≈ 2 m que faltan
// para los 160 ft (sección de motores de la etapa I), forma de las narices, separación entre núcleo y motores sólidos, toberas,
// colores y marcas («UNITED STATES», número de vehículo), Centaur bajo la cofia y forma del módulo de propulsión y de la nave plegada.
// Eje Y = eje del vehículo; origen en la base del núcleo; los motores sólidos están en ±X.
import * as THREE from 'three';
import { TITAN_IIIE_CENTAUR as V } from '../science/VoyagerLaunchProfile.js';

export const GEOMETRIA_VEHICULO = Object.freeze((() => {
  const seccionMotores = V.alturaTotalM - (V.etapa1.alturaM + V.etapa2.alturaM + V.adaptadorInteretapa.alturaM + V.cofia.alturaM);
  const y1 = seccionMotores, y2 = y1 + V.etapa1.alturaM, y3 = y2 + V.etapa2.alturaM, y4 = y3 + V.adaptadorInteretapa.alturaM;
  return {
    radioNucleo: V.etapa1.diametroM / 2, radioCofia: V.cofia.diametroM / 2, radioSrm: V.srm.diametroM / 2,
    seccionMotoresM: seccionMotores, baseEtapa1: 0, topeEtapa1: y2, baseEtapa2: y2, topeEtapa2: y3, baseAdaptador: y3, baseCofia: y4,
    topeCilindroCofia: y4 + V.cofia.cilindroAlturaM, tope: V.alturaTotalM,
    srmSeparacionEjes: V.etapa1.diametroM / 2 + V.srm.diametroM / 2 + 0.35, // aproximado (fotografía PIA21744)
    srmBase: 0.55, srmAltura: V.srm.alturaM,
    baseCentaur: y4 - 0.6, alturaCentaur: V.centaur.alturaM
  };
})());

function texturaCanvas(ancho, alto, dibujar, { repetir = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = ancho; canvas.height = alto;
  const g = canvas.getContext('2d');
  dibujar(g, ancho, alto);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repetir) tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

// Ruido sutil de pintura y paneles para que las superficies no se vean planas.
function grano(g, w, h, intensidad = 10, semilla = 3) {
  let s = semilla;
  const azar = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < w * h / 40; i++) {
    const v = Math.round((azar() - 0.5) * intensidad);
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v / 255})` : `rgba(0,0,0,${-v / 255})`;
    g.fillRect(azar() * w, azar() * h, 1 + azar() * 3, 1 + azar() * 3);
  }
}

function letrasApiladas(g, texto, x, yInicio, alto, color = '#141414') {
  g.fillStyle = color;
  g.font = `700 ${Math.round(alto * 0.9)}px Arial, Helvetica, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'top';
  let y = yInicio;
  for (const c of texto) { if (c === ' ') { y += alto * 0.7; continue; } g.fillText(c, x, y); y += alto * 1.08; }
}

function materiales(numeroVehiculo) {
  const G = GEOMETRIA_VEHICULO;
  // Núcleo Titan: tono beige claro (PIA21744), aros de unión y «UNITED STATES» en negro entre los motores sólidos (caras ±Z).
  const etapa1 = texturaCanvas(512, 1024, (g, w, h) => {
    g.fillStyle = '#d9caa6'; g.fillRect(0, 0, w, h);
    grano(g, w, h, 14, 11);
    g.fillStyle = 'rgba(70,55,35,0.35)';
    for (const f of [0.02, 0.11, 0.5, 0.985]) g.fillRect(0, f * h, w, 3);
    for (const u of [0.015, 0.515]) { // caras +Z y −Z (θ = 0 y π en CylinderGeometry)
      letrasApiladas(g, 'UNITED STATES', u * w + 8, h * 0.06, 26);
      g.fillStyle = '#1b1b1b'; g.fillRect(u * w + 30, h * 0.62, 18, 26);
    }
  });
  const etapa2 = texturaCanvas(512, 380, (g, w, h) => {
    g.fillStyle = '#ddd0ae'; g.fillRect(0, 0, w, h);
    grano(g, w, h, 12, 5);
    g.fillStyle = '#ece8df'; g.fillRect(0, 0, w, h * 0.18);
    g.fillStyle = '#1a1a1a';
    for (const u of [0.02, 0.27, 0.52, 0.77]) { g.fillRect(u * w, h * 0.32, 22, 22); g.fillRect(u * w + 40, h * 0.32, 22, 22); }
    g.font = '700 30px Arial'; g.textAlign = 'center';
    g.fillText(String(numeroVehiculo), w * 0.12, h * 0.75); g.fillText(String(numeroVehiculo), w * 0.62, h * 0.75);
    g.fillStyle = 'rgba(70,55,35,0.4)'; g.fillRect(0, h * 0.18, w, 3); g.fillRect(0, h - 4, w, 4);
  });
  // Motores sólidos: blancos con juntas marrones en las uniones de segmentos y marca roja con el número en la falda (PIA21744).
  const srm = (numero) => texturaCanvas(256, 2048, (g, w, h) => {
    g.fillStyle = '#f1efe9'; g.fillRect(0, 0, w, h);
    grano(g, w, h, 9, 17 + numero);
    const alturaCuerpo = G.srmAltura, metro = h / alturaCuerpo;
    const juntas = [1.2, 1.2 + V.srm.segmentosAlturaM.popa];
    for (let i = 1; i <= 5; i++) juntas.push(juntas[1] + i * V.srm.segmentosAlturaM.central);
    juntas.push(juntas[juntas.length - 1] + V.srm.segmentosAlturaM.proa);
    g.fillStyle = '#6b4a2e';
    for (const j of juntas) g.fillRect(0, h - j * metro - 3, w, 5);
    g.fillStyle = '#d0452a'; g.fillRect(w * 0.18, h - 1.15 * metro, w * 0.14, 0.95 * metro);
    g.fillStyle = '#ffffff'; g.font = '700 26px Arial'; g.textAlign = 'center'; g.fillText(String(numero), w * 0.25, h - 0.55 * metro);
  });
  // Cofia estándar del Centaur: blanca, costuras grises, línea de separación de las dos mitades y parches dorados y oscuros.
  const cofia = texturaCanvas(1024, 1024, (g, w, h) => {
    g.fillStyle = '#efede8'; g.fillRect(0, 0, w, h);
    grano(g, w, h, 8, 23);
    g.fillStyle = 'rgba(120,120,120,0.55)';
    for (const f of [0.1, 0.32, 0.55, 0.78, 0.92]) g.fillRect(0, f * h, w, 2);
    for (const u of [0.25, 0.75]) g.fillRect(u * w - 1, 0, 3, h);
    g.fillStyle = '#b8954a';
    for (const [u, v] of [[0.05, 0.4], [0.11, 0.4], [0.55, 0.4], [0.61, 0.4], [0.08, 0.62], [0.58, 0.62]]) g.fillRect(u * w, v * h, 26, 26);
    g.fillStyle = '#2b2b2b';
    for (const [u, v] of [[0.03, 0.2], [0.53, 0.2], [0.14, 0.85]]) g.fillRect(u * w, v * h, 16, 16);
    g.fillStyle = '#222'; g.font = '700 34px Arial'; g.textAlign = 'center';
    g.fillText(String(numeroVehiculo), w * 0.07, h * 0.52); g.fillText(String(numeroVehiculo), w * 0.57, h * 0.52);
  });
  const std = (opciones) => new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.04, ...opciones });
  return {
    etapa1: std({ map: etapa1, roughness: 0.62 }), etapa2: std({ map: etapa2, roughness: 0.6 }),
    srm1: std({ map: srm(1), roughness: 0.5 }), srm2: std({ map: srm(2), roughness: 0.5 }),
    blanco: std({ color: 0xf0eee8, roughness: 0.5 }), beige: std({ color: 0xcdbd98, roughness: 0.65 }), cofia: std({ map: cofia, roughness: 0.45, side: THREE.DoubleSide }),
    adaptador: std({ color: 0xe8e6e0, roughness: 0.4, metalness: 0.2 }),
    tobera: std({ color: 0x2a2724, roughness: 0.45, metalness: 0.65 }),
    toberaInterior: std({ color: 0x15110e, roughness: 0.8, metalness: 0.3, side: THREE.BackSide }),
    centaur: std({ color: 0xc9ccd0, roughness: 0.28, metalness: 0.85 }),
    doradoMli: std({ color: 0xc99a3c, roughness: 0.35, metalness: 0.9 }),
    negroMli: std({ color: 0x1c1c1e, roughness: 0.6, metalness: 0.3 }),
    estructura: std({ color: 0x8f8f8a, roughness: 0.5, metalness: 0.6 }),
    antena: std({ color: 0xf2f2ee, roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide })
  };
}

const torno = (puntos, segmentos = 40) => new THREE.LatheGeometry(puntos.map(([r, y]) => new THREE.Vector2(r, y)), segmentos);
function malla(geometria, material, { sombra = true } = {}) {
  const m = new THREE.Mesh(geometria, material);
  m.castShadow = sombra; m.receiveShadow = sombra;
  return m;
}
function cilindro(r, altura, material, y0, segmentos = 48, rTope = r) {
  const m = malla(new THREE.CylinderGeometry(rTope, r, altura, segmentos, 1, true), material);
  m.position.y = y0 + altura / 2;
  return m;
}
function tobera(rGarganta, rSalida, largo, materialesTobera) {
  const g = new THREE.Group();
  const perfil = [];
  for (let i = 0; i <= 12; i++) { const u = i / 12; perfil.push([rGarganta + (rSalida - rGarganta) * Math.pow(u, 0.7), -u * largo]); }
  g.add(malla(torno(perfil, 32), materialesTobera.tobera));
  g.add(malla(torno(perfil.map(([r, y]) => [r * 0.97, y]), 32), materialesTobera.toberaInterior, { sombra: false }));
  return g;
}
function tapa(r, y, material, abajo = true) {
  const m = malla(new THREE.CircleGeometry(r, 48), material);
  m.rotation.x = abajo ? Math.PI / 2 : -Math.PI / 2; m.position.y = y;
  return m;
}

/** Motor sólido UA1205 (origen en la base de su falda). */
function crearSrm(material, M) {
  const G = GEOMETRIA_VEHICULO, r = G.radioSrm, grupo = new THREE.Group();
  const nariz = 4.3, cuerpo = G.srmAltura - nariz;
  grupo.add(cilindro(r * 1.06, 1.2, material, 0, 48, r)); // falda de popa ligeramente abierta
  const c = cilindro(r, cuerpo - 1.2, material, 1.2);
  // UV del cuerpo para que las juntas de la textura caigan en su sitio (la textura cubre toda la altura del motor).
  const uv = c.geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, (1.2 + uv.getY(i) * (cuerpo - 1.2)) / G.srmAltura);
  grupo.add(c);
  const falda = grupo.children[0].geometry.attributes.uv;
  for (let i = 0; i < falda.count; i++) falda.setY(i, falda.getY(i) * 1.2 / G.srmAltura);
  const perfilNariz = [];
  for (let i = 0; i <= 16; i++) { const u = i / 16; perfilNariz.push([r * Math.sqrt(Math.max(0, 1 - Math.pow(u, 1.6))) * (1 - 0.08 * u), cuerpo + u * nariz]); }
  perfilNariz[16][0] = 0.001;
  grupo.add(malla(torno(perfilNariz, 40), M.blanco));
  grupo.add(tapa(r * 1.06, 0, M.tobera));
  const t = tobera(0.42, 1.25, 2.2, M);
  t.position.y = 0.4;
  grupo.add(t);
  grupo.userData.tobera = new THREE.Vector3(0, -1.6, 0);
  return grupo;
}

/** Voyager plegada (bus decagonal, antena de 3,66 m arriba, mástiles recogidos) y módulo de propulsión debajo. */
function crearNavePlegada(M) {
  const nave = new THREE.Group(); nave.name = 'VoyagerPlegada';
  const bus = malla(new THREE.CylinderGeometry(0.89, 0.89, 0.47, 10), M.doradoMli);
  bus.position.y = 0.235; nave.add(bus);
  const plato = [];
  for (let i = 0; i <= 16; i++) { const r = 1.83 * i / 16; plato.push([r, 0.62 + 0.42 * (r / 1.83) ** 2]); }
  nave.add(malla(torno(plato, 48), M.antena));
  const subreflector = malla(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), M.estructura); subreflector.position.y = 1.05; nave.add(subreflector);
  // Mástiles plegados junto al bus (RTG y ciencia) y cilindro del magnetómetro.
  for (const [x, z, alto, r] of [[0.95, 0.2, 1.1, 0.22], [-0.95, -0.25, 0.9, 0.16], [0.2, -0.98, 0.7, 0.12]]) {
    const m = malla(new THREE.CylinderGeometry(r, r, alto, 12), x > 0 ? M.estructura : M.negroMli);
    m.position.set(x, -0.25 + alto / 2, z); nave.add(m);
  }
  const pm = new THREE.Group(); pm.name = 'ModuloPropulsion';
  const armazon = malla(new THREE.CylinderGeometry(0.88, 0.95, 1.05, 10, 1, true), M.estructura); armazon.position.y = -0.55; pm.add(armazon);
  const motor = malla(new THREE.SphereGeometry(0.47, 24, 16), M.negroMli); motor.position.y = -0.6; pm.add(motor);
  const tPm = tobera(0.09, 0.32, 0.6, M); tPm.position.y = -1.0; pm.add(tPm);
  pm.userData.tobera = new THREE.Vector3(0, -1.5, 0);
  return { nave, pm };
}

/**
 * Crea el vehículo completo. `numeroVehiculo`: 6 (TC-6, Voyager 1) o 7 (TC-7, Voyager 2), como en las fotografías.
 * Devuelve el grupo y las piezas separables, cada una con su punto de tobera (para las llamas) en coordenadas locales.
 */
export function crearTitanIIIECentaur({ numeroVehiculo = 7 } = {}) {
  const G = GEOMETRIA_VEHICULO, M = materiales(numeroVehiculo), raiz = new THREE.Group();
  raiz.name = `TitanIIIE_Centaur_TC${numeroVehiculo}`;
  const pieza = (nombre) => { const g = new THREE.Group(); g.name = nombre; raiz.add(g); return g; };

  // Etapa I con su sección de motores (dos LR87).
  const etapa1 = pieza('etapa1');
  const c1 = cilindro(G.radioNucleo, G.topeEtapa1 - G.seccionMotoresM, M.etapa1, G.seccionMotoresM); etapa1.add(c1);
  etapa1.add(cilindro(G.radioNucleo, G.seccionMotoresM, M.beige, 0));
  etapa1.add(tapa(G.radioNucleo, 0.02, M.tobera));
  for (const z of [-0.72, 0.72]) { const t = tobera(0.3, 0.75, 1.4, M); t.position.set(0, 0.2, z); etapa1.add(t); }
  etapa1.userData.toberas = [new THREE.Vector3(0, -1.0, -0.72), new THREE.Vector3(0, -1.0, 0.72)];

  // Etapa II (un LR91, oculto en el interetapa hasta la separación).
  const etapa2 = pieza('etapa2');
  etapa2.add(cilindro(G.radioNucleo, G.topeEtapa2 - G.baseEtapa2, M.etapa2, G.baseEtapa2));
  const t2 = tobera(0.25, 0.75, 1.6, M); t2.position.y = G.baseEtapa2 + 0.4; etapa2.add(t2);
  etapa2.add(tapa(G.radioNucleo * 0.98, G.baseEtapa2 + 0.01, M.tobera));
  etapa2.userData.toberas = [new THREE.Vector3(0, G.baseEtapa2 - 1.25, 0)];
  // Adaptador entre la etapa II y el Centaur: se va con la etapa II.
  etapa2.add(cilindro(G.radioNucleo, G.baseCofia - G.baseAdaptador, M.adaptador, G.baseAdaptador));

  // Centaur D-1T (acero inoxidable, aislamiento dorado delante) con dos RL10.
  const centaur = pieza('centaur');
  centaur.add(cilindro(G.radioNucleo * 0.99, G.alturaCentaur * 0.72, M.centaur, G.baseCentaur + 0.6));
  centaur.add(cilindro(G.radioNucleo * 0.99, G.alturaCentaur * 0.2, M.doradoMli, G.baseCentaur + 0.6 + G.alturaCentaur * 0.72));
  centaur.add(tapa(G.radioNucleo * 0.99, G.baseCentaur + 0.6, M.estructura));
  centaur.add(tapa(G.radioNucleo * 0.99, G.baseCentaur + 0.6 + G.alturaCentaur * 0.92, M.estructura, false));
  for (const x of [-0.6, 0.6]) { const t = tobera(0.12, 0.5, 1.5, M); t.position.set(x, G.baseCentaur + 0.6, 0); centaur.add(t); }
  centaur.userData.toberas = [new THREE.Vector3(-0.6, G.baseCentaur - 0.9, 0), new THREE.Vector3(0.6, G.baseCentaur - 0.9, 0)];

  // Nave y módulo de propulsión, sobre el Centaur.
  const { nave, pm } = crearNavePlegada(M);
  const yNave = G.baseCentaur + 0.6 + G.alturaCentaur * 0.92 + 1.5; // la base del módulo de propulsión apoya en el Centaur
  const naveRaiz = pieza('nave'); naveRaiz.position.y = yNave; naveRaiz.add(nave);
  const pmRaiz = pieza('moduloPropulsion'); pmRaiz.position.y = yNave; pmRaiz.add(pm);
  pmRaiz.userData.toberas = [pm.userData.tobera.clone()];

  // Cofia en dos mitades (eje de giro en su base, lado ±X). Falda cónica de 14 ft a 10 ft (aproximada).
  const r = G.radioCofia, rN = G.radioNucleo, falda = 1.2, nariz = V.cofia.narizAlturaM;
  for (const lado of [1, -1]) {
    const mitad = pieza(lado > 0 ? 'cofiaA' : 'cofiaB');
    const arco = { thetaStart: lado > 0 ? 0 : Math.PI, thetaLength: Math.PI };
    const conoFalda = malla(new THREE.CylinderGeometry(r, rN, falda, 32, 1, true, arco.thetaStart, arco.thetaLength), M.cofia);
    conoFalda.position.y = G.baseCofia + falda / 2;
    const cuerpo = malla(new THREE.CylinderGeometry(r, r, V.cofia.cilindroAlturaM - falda, 48, 1, true, arco.thetaStart, arco.thetaLength), M.cofia);
    cuerpo.position.y = G.baseCofia + falda + (V.cofia.cilindroAlturaM - falda) / 2;
    const perfil = [];
    for (let i = 0; i <= 18; i++) { const u = i / 18; perfil.push(new THREE.Vector2(Math.max(0.001, r * (1 - Math.pow(u, 1.35)) * (1 - 0.1 * u)), G.topeCilindroCofia + u * nariz)); }
    perfil[18].x = 0.001;
    const punta = malla(new THREE.LatheGeometry(perfil, 40, arco.thetaStart, arco.thetaLength), M.cofia);
    // Bisagra en la base del lado exterior de la mitad (x = ±radio): al girar (rotation.z = −lado·φ) la punta se abre hacia fuera.
    const bisagra = new THREE.Group(); bisagra.position.set(lado * r, G.baseCofia, 0);
    for (const m of [conoFalda, cuerpo, punta]) { m.position.y -= G.baseCofia; m.position.x -= lado * r; bisagra.add(m); }
    mitad.add(bisagra);
    mitad.userData.bisagra = bisagra; mitad.userData.lado = lado;
  }

  // Motores sólidos en ±X.
  for (const [lado, nombre, mat] of [[1, 'srm1', M.srm1], [-1, 'srm2', M.srm2]]) {
    const s = pieza(nombre), motor = crearSrm(mat, M);
    motor.position.set(lado * G.srmSeparacionEjes, G.srmBase, 0); s.add(motor);
    s.userData.toberas = [new THREE.Vector3(lado * G.srmSeparacionEjes, G.srmBase - 1.6, 0)];
    s.userData.lado = lado;
  }

  const piezas = Object.fromEntries(raiz.children.map(h => [h.name, h]));
  const materialesLista = Object.values(M);
  return {
    grupo: raiz, piezas, materiales: M, geometria: G,
    destruir() {
      raiz.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
      for (const m of materialesLista) { m.map?.dispose(); m.dispose(); }
    }
  };
}

/** Prepara el modelo oficial de NASA (ya normalizado) para un fundido por tramado (alphaHash), sin ordenar transparencias. */
export function prepararFundido(objeto) {
  const mats = [];
  objeto.traverse(o => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m.visible === false) continue;
      m.alphaHash = true; m.transparent = false; m.opacity = 1; mats.push(m);
    }
    o.castShadow = true; o.receiveShadow = true;
  });
  return opacidad => { for (const m of mats) m.opacity = opacidad; objeto.visible = opacidad > 0.002; };
}

export const MEDIDAS_APROXIMADAS = Object.freeze([
  'Reparto de los ≈ 2 m de la sección de motores de la etapa I (diferencia entre los 160 ft totales y la suma de etapas documentadas).',
  'Forma de narices, faldas y toberas; separación de 0,35 m entre el núcleo y los motores sólidos.',
  'Centaur bajo la cofia, nave plegada y módulo de propulsión (solo la antena de 3,66 m y el bus decagonal tienen medida documentada).',
  'Colores y marcas tomados de las fotografías PIA21739, PIA21742, PIA21744 y PIA21746 (NASA/JPL-Caltech).'
]);
