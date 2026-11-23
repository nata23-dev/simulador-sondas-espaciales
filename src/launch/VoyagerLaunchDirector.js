/**
 * En este módulo dirijo bajo demanda la experiencia 3D completa del lanzamiento
 * de Voyager 1 y Voyager 2 desde el Complejo 41 de Cabo Cañaveral.
 * Integro la trayectoria calibrada de ascenso, la iluminación solar/estelar,
 * la línea de tiempo con aceleraciones suaves, la realización de cámara, las
 * separaciones balísticas de etapas, los efectos de humo/penachos y la
 * transición al modelo 3D oficial de NASA.
 * Todo el estado visual se calcula de forma determinista a partir del instante
 * de misión `t` (segundos desde la ignición, en metros ENU local), de modo que
 * pausar, saltar entre hitos o retroceder no acumula deriva.
 */
import * as THREE from 'three';
import {
  LANZAMIENTOS_VOYAGER, RADIO_TIERRA_M, trayectoriaLanzamiento, estadoEnu, estadoInercial, inercialAEnu, propagarBalistico, eventoPorId, instanteUtcMs
} from '../science/VoyagerLaunchProfile.js';
import { crearLineaTiempo, formatearRelojMision } from './LaunchTimeline.js';
import { crearMundoLanzamiento, CENTRO_TIERRA, enuAEscena } from './LaunchWorld.js';
import { onQualityChange, reportFrame } from '../graphics/QualityProfile.js';
import { crearTitanIIIECentaur, prepararFundido } from './TitanIIIECentaur3D.js';
import { crearPlataformaLC41_1977, PLATAFORMA_1977 } from './LC41Pad1977.js';
import { crearPenacho, crearHumo, crearEstela } from './LaunchEffects.js';
import { cargarPlantillaVoyagerCompartida, normalizarEscenaVoyagerGltf, METADATOS_MODELO_VOYAGER } from '../graphics/SpaceProbeVisual.js';
import { separarRecursosCompartidos } from './LaunchSharedResources.js';

const H = PLATAFORMA_1977.alturaMesaM;
const DEG = Math.PI / 180;
const suave = x => { const u = Math.min(1, Math.max(0, x)); return u * u * (3 - 2 * u); };
const azar = (i, k = 0) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
const V3 = THREE.Vector3;
// Recorro de atrás hacia delante la lista ordenada para hallar el último hito ocurrido hasta `t` sin copiar arreglos en cada fotograma.
function ultimoEventoHasta(eventos, t) {
  for (let i = eventos.length - 1; i >= 0; i--) if (eventos[i].t <= t) return eventos[i];
  return null;
}

// Monto el lienzo WebGL 2 del lanzamiento dentro de `contenedor`, precaliento texturas y shaders y devuelvo los controles de reproducción y limpieza.
export function crearLanzamientoVoyager3D({ contenedor, misionId = 'voyager-2', calidad = 'alto', detalle = 'alto', baseUrl = '/', fovInicial = 48,
  alCambiar = () => {}, alTerminar = () => {}, reducirMovimiento = false, escritorio = true } = {}) {
  const mision = LANZAMIENTOS_VOYAGER[misionId];
  if (!mision) throw new RangeError(`Lanzamiento desconocido: ${misionId}`);
  const tray = trayectoriaLanzamiento(misionId);
  const linea = crearLineaTiempo(mision);
  const T = id => eventoPorId(mision, id).t;
  const tLift = T('despegue'), tGiro = T('giro'), tE1 = T('etapa1-ignicion'), tSrmSep = T('srm-separacion'), tE1off = T('etapa1-apagado');
  const tCofia = T('cofia'), tE2off = T('etapa2-apagado'), tE2sep = T('etapa2-separacion'), tMes1 = T('mes1'), tMeco1 = T('meco1');
  const tMes2 = T('mes2'), tMeco2 = T('meco2'), tSep = T('separacion-nave'), tPmI = T('pm-ignicion'), tPmO = T('pm-apagado');
  const tMast = T('mastiles'), tPmS = T('pm-separacion');

  const canvas = document.createElement('canvas');
  canvas.className = 'launch3d-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `Reconstrucción 3D del lanzamiento de la ${mision.nombre} desde el Complejo 41 de Cabo Cañaveral`);
  contenedor.append(canvas);
  let mundo;
  // Si falla la creación del contexto WebGL 2, retiro inmediatamente el lienzo huérfano antes de relanzar el error al coordinador.
  try { mundo = crearMundoLanzamiento({ canvas, mision, calidad, detalle, baseUrl, escritorio }); }
  catch (error) { canvas.remove(); throw error; }
  const { escena, camara, renderer, ajustes } = mundo;
  // Escucho descensos automáticos de calidad durante el vuelo para apagar sombras o nubes sin recompilar shaders.
  let detalleVigente = ajustes.detalle;
  const bajaDetalle = onQualityChange(estado => {
    if (estado.contexto !== 'lanzamiento' || !estado.detalle || estado.detalle === detalleVigente) return;
    detalleVigente = estado.detalle; mundo.reducirDetalle(estado.detalle);
  });

  const plataforma = crearPlataformaLC41_1977({ anisotropia: mundo.anisotropia });
  escena.add(plataforma.grupo);
  const vehiculo = crearTitanIIIECentaur({ numeroVehiculo: misionId === 'voyager-1' ? 6 : 7, anisotropia: mundo.anisotropia });
  const raiz = vehiculo.grupo, P = vehiculo.piezas, G = vehiculo.geometria;
  escena.add(raiz);
  raiz.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
  const yNave = P.nave.position.y;

  // Vinculo un penacho a cada tobera según el perfil de encendido de su etapa.
  const penachos = [];
  const unirPenacho = (pieza, tipo, encendido) => {
    for (const punto of pieza.userData.toberas ?? []) {
      const pen = crearPenacho(tipo);
      pen.grupo.position.copy(punto);
      pieza.add(pen.grupo);
      penachos.push({ pen, encendido });
    }
  };
  const tramo = (t, a, b, rampa = 0.8) => (t >= a && t < b ? suave((t - a) / rampa) : 0);
  const beta = tray.calibracion.beta;
  const encendidoSrm = t => (t < 0 || t >= tE1 + 2.5 ? 0 : suave(t / 0.35) * Math.max(0.15, 1 - beta * t / 117) * suave((tE1 + 2.5 - t) / 4));
  unirPenacho(P.srm1, 'srm', encendidoSrm);
  unirPenacho(P.srm2, 'srm', encendidoSrm);
  unirPenacho(P.etapa1, 'hipergolico', t => tramo(t, tE1, tE1off, 1.2));
  unirPenacho(P.etapa2, 'hipergolico', t => tramo(t, tE1off - 0.3, tE2off, 0.5) * (t < tE1off + 1.5 ? 1.8 : 1));
  unirPenacho(P.centaur, 'rl10', t => Math.max(tramo(t, tMes1, tMeco1, 1.5), tramo(t, tMes2, tMeco2, 1.5)));
  unirPenacho(P.moduloPropulsion, 'pm', t => tramo(t, tPmI, tPmO, 0.6) * (t > tPmO - 3 ? suave((tPmO - t) / 3) * 0.7 + 0.3 : 1));

  const humo = crearHumo(ajustes.humo);
  escena.add(humo.malla);
  const estela = crearEstela(420);
  escena.add(estela.malla);

  // Calculo la posición, el triedro ortonormal y el cuaternión del lanzador en el instante de misión `t`.
  const tmpA = new V3(), tmpB = new V3(), basis = new THREE.Matrix4();
  function azimutRodadura(t) { return (mision.acimutPlataformaDeg + (mision.acimutVueloDeg - mision.acimutPlataformaDeg) * suave((t - tGiro) / 5)) * DEG; }
  function calcularEstado(t, e = { pos: new V3(), eje: new V3(), lado: new V3(), normal: new V3(), arriba: new V3(), q: new THREE.Quaternion() }) {
    const s = estadoEnu(tray, Math.max(t, tLift));
    enuAEscena(s.posicionM, e.pos); e.pos.y += H;
    enuAEscena(s.direccion, e.eje).normalize();
    e.arriba.copy(e.pos).sub(CENTRO_TIERRA).normalize();
    const A = azimutRodadura(t);
    tmpA.set(Math.cos(A), 0, Math.sin(A)); // Oriento el eje de los motores sólidos perpendicular al acimut de plataforma/vuelo.
    tmpB.crossVectors(e.eje, e.arriba);
    const w = suave((tmpB.length() - 0.03) / 0.12);
    if (w > 0) tmpB.normalize();
    e.lado.copy(tmpA).multiplyScalar(1 - w).addScaledVector(tmpB, w);
    e.lado.addScaledVector(e.eje, -e.lado.dot(e.eje)).normalize();
    e.normal.crossVectors(e.lado, e.eje).normalize();
    e.q.setFromRotationMatrix(basis.makeBasis(e.lado, e.eje, e.normal));
    e.altitud = s.altitudM; e.rapidez = s.rapidezInercialMS; e.rapidezSuelo = s.rapidezSueloMS; e.masa = s.masaKg; e.t = t;
    return e;
  }
  const est = calcularEstado(linea.tInicio);
  let p = 0, velocidad = 1, pausado = false, terminado = false, destruido = false, ultimoInforme = 0, mundoInfo = null, esperaFinal = 0;
  let ultimoEvento = null, instanteAnterior = null, tiempoAnim = 0;

  // Defino las ocho piezas separables con su instante de suelta, impulso relativo y propagación balística de dos cuerpos tras soltarse.
  const cofiaApertura = 1.4;
  const separables = [
    { clave: 'srm1', t: tSrmSep, pivote: new V3(G.srmSeparacionEjes, 13, 0), vel: new V3(5, -0.6, 0), giro: new V3(0, 0, -0.2), nariz: new V3(G.srmSeparacionEjes, 26, 0), cola: new V3(G.srmSeparacionEjes, 1.5, 0) },
    { clave: 'srm2', t: tSrmSep, pivote: new V3(-G.srmSeparacionEjes, 13, 0), vel: new V3(-5, -0.6, 0), giro: new V3(0, 0, 0.2), nariz: new V3(-G.srmSeparacionEjes, 26, 0), cola: new V3(-G.srmSeparacionEjes, 1.5, 0) },
    { clave: 'etapa1', t: tE1off + 0.6, pivote: new V3(0, 10, 0), vel: new V3(0, -1.5, 0), giro: new V3(0.02, 0, 0.015) },
    { clave: 'cofiaA', t: tCofia + cofiaApertura, pivote: new V3(G.radioCofia, G.baseCofia, 0), vel: new V3(4, 0.4, 0), giro: new V3(0, 0, 0) },
    { clave: 'cofiaB', t: tCofia + cofiaApertura, pivote: new V3(-G.radioCofia, G.baseCofia, 0), vel: new V3(-4, 0.4, 0), giro: new V3(0, 0, 0) },
    { clave: 'etapa2', t: tE2sep, pivote: new V3(0, (G.baseEtapa2 + G.baseCofia) / 2, 0), vel: new V3(0, -0.9, 0), giro: new V3(0.01, 0, 0.02) },
    { clave: 'centaur', t: tSep, pivote: new V3(0, G.baseCentaur + 5, 0), vel: new V3(0, -0.45, 0), giro: new V3(0, 0.03, 0.012) },
    { clave: 'moduloPropulsion', t: tPmS, pivote: new V3(0, yNave - 0.6, 0), vel: new V3(0, -0.35, 0), giro: new V3(0.012, 0.02, 0) }
  ].map(s => ({ ...s, pieza: P[s.clave], origen: P[s.clave].position.clone(), cache: null, q: null, impacto: false }));
  const qGiro = new THREE.Quaternion(), eGiro = new THREE.Euler(), pivoteMundo = new V3(), desplaz = new V3();
  // Coloco cada etapa unida al cohete o en vuelo libre balístico según `t`, reiniciando su caché al retroceder en el tiempo.
  function colocarPiezas(t) {
    for (const s of separables) {
      const { pieza } = s;
      const lado = pieza.userData.lado;
      if (s.clave.startsWith('cofia')) {
        // Giro cada mitad en abanico alrededor de su bisagra inferior antes y después de desprenderse.
        const phi = t < tCofia ? 0 : t < s.t ? 0.5 * suave((t - tCofia) / cofiaApertura) : 0.5 + 0.32 * (t - s.t);
        pieza.userData.bisagra.rotation.z = -lado * phi;
      }
      if (t < s.t) {
        if (pieza.parent !== raiz) raiz.add(pieza);
        pieza.position.copy(s.origen); pieza.quaternion.identity();
        pieza.visible = true;
        continue;
      }
      if (pieza.parent !== escena) escena.add(pieza);
      if (!s.q) s.q = calcularEstado(s.t).q.clone();
      if (!s.cache || t < s.cache.t) { const b = estadoInercial(tray, s.t); s.cache = { t: s.t, p: b.p, v: b.v }; s.impacto = false; }
      // Propago el vuelo libre en bloques de hasta 20 s y oculto la pieza cuando cae por debajo del radio terrestre.
      while (!s.impacto && t > s.cache.t + 1e-6) {
        const siguiente = propagarBalistico(s.cache, Math.min(20, t - s.cache.t), { paso: 1 });
        if (Math.hypot(...siguiente.p) < RADIO_TIERRA_M) { s.impacto = true; break; }
        s.cache = siguiente;
      }
      if (s.impacto) { pieza.visible = false; continue; }
      const dt = t - s.t;
      enuAEscena(inercialAEnu(tray, t, s.cache.p), pivoteMundo); pivoteMundo.y += H;
      desplaz.copy(s.pivote).addScaledVector(s.vel, dt).applyQuaternion(s.q);
      pivoteMundo.add(desplaz);
      qGiro.setFromEuler(eGiro.set(s.giro.x * dt, s.giro.y * dt, s.giro.z * dt));
      pieza.quaternion.copy(s.q).multiply(qGiro);
      pieza.position.copy(s.pivote).sub(s.origen).applyQuaternion(pieza.quaternion).negate().add(pivoteMundo);
      pieza.visible = pivoteMundo.distanceTo(camara.position) < 60000;
    }
  }

  // Cargo de forma asíncrona la plantilla oficial de NASA para fundirla sobre la nave plegada al desplegar los mástiles.
  const plegada = P.nave.children[0];
  const fundirPlegada = prepararFundido(plegada);
  let fundirNasa = null, estadoModeloNasa = 'cargando', envolturaNasa = null, liberarRecursosNasa = null;
  const urlGlb = `${baseUrl}${METADATOS_MODELO_VOYAGER.archivoRelativo}`;
  cargarPlantillaVoyagerCompartida(urlGlb).then(plantilla => {
    if (destruido) return;
    const normalizado = normalizarEscenaVoyagerGltf(plantilla.clone(true), { diametroAntenaObjetivo: 3.66, idSonda: misionId });
    const envoltura = new THREE.Group(); envoltura.name = 'VoyagerNASA';
    // Giro el modelo normalizado para que su antena (+Z) apunte hacia la proa del vehículo (+Y).
    envoltura.rotation.x = -Math.PI / 2;
    envoltura.position.y = 0.95;
    envoltura.add(normalizado.grupo);
    P.nave.add(envoltura); envolturaNasa = envoltura;
    // Clono materiales para el fundido y luego separo geometrías y texturas respecto a la plantilla compartida con la escena principal.
    fundirNasa = prepararFundido(envoltura);
    liberarRecursosNasa = separarRecursosCompartidos(envoltura);
    fundirNasa(0);
    estadoModeloNasa = 'cargado';
    // Precompilo sus shaders en segundo plano para evitar pausas en el instante del despliegue de mástiles.
    renderer.compileAsync(envoltura, camara, escena).catch(() => { /* se compilará al mostrarse */ });
  }).catch(err => { estadoModeloNasa = 'no disponible'; console.warn('Lanzamiento: no se pudo cargar Voyager.glb; se mantiene la nave plegada.', err); });

  // Preparo los emisores deterministas de humo y estela ajustando densidad y tamaño al nivel de detalle activo.
  const salidas = PLATAFORMA_1977.salidasFosoLlamasM;
  const nSuelo = ajustes.nubeSuelo, nBase = ajustes.nubeBase, escalaSuelo = Math.pow(340 / nSuelo, 0.25);
  const nubeSuelo = Array.from({ length: nSuelo }, (_, k) => ({
    te: 0.05 + 14 * Math.pow(k / nSuelo, 1.25), salida: salidas[k % 2], ang: (azar(k, 1) - 0.5) * 0.9, vel: 0.6 + 0.8 * azar(k, 2),
    sube: 0.6 + 0.9 * azar(k, 3), tam: (0.7 + 0.6 * azar(k, 4)) * escalaSuelo, semilla: azar(k, 5)
  }));
  const nubeBase = Array.from({ length: nBase }, (_, k) => ({
    te: 0.1 + 9 * (k / nBase), ang: azar(k, 7) * Math.PI * 2, rad: 6 + 14 * azar(k, 8), sube: 0.5 + azar(k, 9), semilla: azar(k, 10)
  }));
  // Precalculo los puntos de origen de la estela a lo largo del tramo atmosférico (< 45 km) de los motores sólidos.
  const estelaPuntos = [];
  for (let te = tLift + 1.2; te < tE1 + 2; te += te < 30 ? 0.5 : te < 70 ? 1 : 2) {
    const e = calcularEstado(te);
    if (e.altitud > 45000) break;
    estelaPuntos.push({ te, x: e.pos.x - e.eje.x * 30, y: e.pos.y - e.eje.y * 30, z: e.pos.z - e.eje.z * 30, h: e.altitud });
  }
  const viento = h => [-3 - 14 * suave((h - 2000) / 10000), 2 + 3 * suave((h - 4000) / 8000)]; // Viento ilustrativo en m/s (x, z).
  // Reutilizo pools de objetos de partículas y estela entre fotogramas para eliminar la presión sobre el recolector de basura.
  const particulas = [], puntosEstela = [];
  let nParticulas = 0, nEstela = 0;
  const puntoLocal = new V3();
  function emitirParticula(x, y, z, r, a, calor, semilla) {
    const q = particulas[nParticulas] ?? (particulas[nParticulas] = { x: 0, y: 0, z: 0, r: 0, a: 0, calor: 0, semilla: 0 });
    q.x = x; q.y = y; q.z = z; q.r = r; q.a = a; q.calor = calor; q.semilla = semilla;
    nParticulas++;
  }
  function emitirEstela(x, y, z, ancho, a) {
    const q = puntosEstela[nEstela] ?? (puntosEstela[nEstela] = { x: 0, y: 0, z: 0, ancho: 0, a: 0 });
    q.x = x; q.y = y; q.z = z; q.ancho = ancho; q.a = a;
    nEstela++;
  }
  const [vientoSueloX, vientoSueloZ] = viento(0);
  // Calculo el estado determinista de las nubes de foso, base, estela y bocanadas de separación en el instante `t`.
  function generarHumo(t) {
    nParticulas = 0; nEstela = 0;
    if (t > 0) {
      for (const q of nubeSuelo) {
        const edad = t - q.te; if (edad <= 0) continue;
        const d = (70 * (1 - Math.exp(-edad / 5)) + 0.8 * edad) * q.vel, dirx = Math.sign(q.salida[0]);
        emitirParticula(q.salida[0] + dirx * d * Math.cos(q.ang) + vientoSueloX * edad * 0.4, 3 + 1.7 * Math.pow(edad, 0.85) * q.sube,
          q.salida[1] + d * Math.sin(q.ang) + vientoSueloZ * edad * 0.4, Math.min(70, (5 + 8 * Math.sqrt(edad)) * q.tam),
          0.9 * (1 - suave((edad - 120) / 300)), t < 14 ? Math.exp(-edad / 0.9) * Math.exp(-d / 25) * 0.45 : 0, q.semilla);
      }
      for (const q of nubeBase) {
        const edad = t - q.te; if (edad <= 0) continue;
        const r = q.rad + 3 * Math.sqrt(edad);
        emitirParticula(Math.cos(q.ang) * r - 0.6 * edad, 4 + 3.2 * Math.pow(edad, 0.75) * q.sube, Math.sin(q.ang) * r + 0.3 * edad,
          Math.min(45, 6 + 5 * Math.sqrt(edad)), 0.75 * (1 - suave((edad - 60) / 200)), Math.exp(-edad / 1.2) * 0.35, q.semilla);
      }
      for (const q of estelaPuntos) {
        if (q.te > t) break;
        const edad = t - q.te, [wx, wz] = viento(q.h), fade = 1 - suave((q.h - 30000) / 15000);
        emitirEstela(q.x + wx * edad, q.y - 0.4 * edad, q.z + wz * edad, Math.min(700, (6 + 3.5 * Math.sqrt(edad)) * (1 + q.h / 6000)), 0.85 * Math.exp(-edad / 420) * fade);
      }
      if (nEstela && t < tE1 + 2 && est.altitud < 45000) {
        emitirEstela(est.pos.x - est.eje.x * 24, est.pos.y - est.eje.y * 24, est.pos.z - est.eje.z * 24, 6 * (1 + est.altitud / 6000), 0.85);
      }
    }
    // Emito bocanadas breves para los cohetes de separación de los sólidos y la ignición en caliente entre etapas.
    const bocanadas = (pieza, puntos, t0, dur, crece, n = 3) => {
      const edad = t - t0; if (edad < 0 || edad > dur) return;
      pieza.updateMatrixWorld();
      for (let i = 0; i < puntos.length; i++) for (let k = 0; k < n; k++) {
        const p = puntos[i];
        puntoLocal.set(p.x + (azar(i, k) - 0.5) * 2, p.y + (azar(i, k + 9) - 0.5) * 2, p.z + (azar(i, k + 3) - 0.5) * 2).applyMatrix4(pieza.matrixWorld);
        emitirParticula(puntoLocal.x, puntoLocal.y, puntoLocal.z, 1.2 + crece * edad * (0.7 + 0.6 * azar(i, k + 5)), 0.4 * (1 - edad / dur), 0, azar(i, k + 7));
      }
    };
    for (const s of separablesSrm) bocanadas(s.pieza, s.puntosBocanada, tSrmSep, 4, 2.5);
    bocanadas(P.etapa1, bocanadaEtapa1, tE1off, 3, 3);
  }
  const separablesSrm = separables.slice(0, 2).map(s => ({ pieza: s.pieza, puntosBocanada: [s.nariz, s.cola] }));
  const bocanadaEtapa1 = [new V3(0, G.topeEtapa1, 1.6), new V3(0, G.topeEtapa1, -1.6), new V3(1.6, G.topeEtapa1, 0), new V3(-1.6, G.topeEtapa1, 0)];

  // Configuro los planos de cámara desde el descenso orbital inicial hasta el despliegue final de la Voyager.
  const camPos = new V3(), camMira = new V3(), camArriba = new V3(0, 1, 0), anterior = { pos: new V3(), mira: new V3(), arriba: new V3(), fov: 45, valido: false };
  const D0 = 6378137 / Math.sin(0.3 * fovInicial * DEG);
  const dir0 = new V3(0, 1, 0), dir1 = new V3(0.895, 0.156, 0.417).normalize(), mira1 = new V3(0, 30, 0);
  const dir1Horizontal = new V3(dir1.x, 0, dir1.z).normalize(), arribaMundo = new V3(0, 1, 0), norte = new V3(0, 0, -1);
  const anclaPadSuelo = (dist, azDeg, alto, destino) => destino.set(Math.sin(azDeg * DEG) * dist, alto, -Math.cos(azDeg * DEG) * dist);
  const centroVisible = t => (t < tSrmSep ? 24 : t < tE2sep ? 32 : t < tSep ? 38 : yNave + 0.4);
  // Interpolo con curva suave de grado 5 la aproximación logarítmica desde el espacio para empalmar con el acercamiento de la escena principal.
  function poseAproximacion(u, salida) {
    const e = u * u * u * (u * (6 * u - 15) + 10);
    const D = Math.exp(Math.log(D0) + (Math.log(520) - Math.log(D0)) * e);
    const w = suave((u - 0.45) / 0.55);
    const dir = tmpA.copy(dir0).lerp(dir1, w).normalize();
    const k = Math.pow(D / D0, 1.5);
    salida.mira.copy(mira1).lerp(CENTRO_TIERRA, k);
    salida.pos.copy(salida.mira).addScaledVector(dir, D);
    salida.arriba.copy(norte).lerp(arribaMundo, w).normalize();
    salida.fov = fovInicial + (32 - fovInicial) * suave(u / 0.6);
    return salida;
  }
  const pose = { pos: new V3(), mira: new V3(), arriba: new V3(), fov: 45 };
  const solProy = new V3();
  // Calculo la posición, punto de mira, vector arriba y FOV de cada plano narrativo en el instante `(t, p)`.
  function calcularPlano(plano, t, p, e) {
    const p0 = linea.presentacionDesdeMision(plano.desde), dp = p - p0;
    pose.arriba.copy(e.arriba);
    const enVehiculo = (atras, normal, lado, mirarEje) => {
      pose.pos.copy(e.pos).addScaledVector(e.eje, atras).addScaledVector(e.normal, normal).addScaledVector(e.lado, lado);
      pose.mira.copy(e.pos).addScaledVector(e.eje, mirarEje);
    };
    switch (plano.id) {
      case 'aproximacion': return poseAproximacion(THREE.MathUtils.clamp((t - linea.tInicio) / (-10 - linea.tInicio), 0, 1), pose);
      case 'plataforma-general': {
        const u = suave(dp / 6.5);
        const dist = 520 - 140 * u, elev = (9 - 6 * u) * DEG;
        pose.mira.set(0, 30 - 6 * u, 0);
        pose.pos.copy(pose.mira).addScaledVector(dir1Horizontal, dist * Math.cos(elev)); pose.pos.y += dist * Math.sin(elev);
        pose.arriba.set(0, 1, 0); pose.fov = 32 - 3 * u; return pose;
      }
      case 'plataforma-base':
        anclaPadSuelo(78, 140, 2.2, pose.pos); pose.mira.set(0, 11 + 1.6 * dp, 0); pose.arriba.set(0, 1, 0); pose.fov = 54; return pose;
      case 'despegue-suelo':
        anclaPadSuelo(340, 118, 10, pose.pos); pose.mira.copy(e.pos).addScaledVector(e.eje, 22); pose.arriba.set(0, 1, 0); pose.fov = 30 + 0.9 * Math.max(0, t); return pose;
      case 'seguimiento-largo': {
        anclaPadSuelo(2900, 205, 3, pose.pos);
        pose.mira.copy(e.pos).addScaledVector(e.eje, 16);
        const d = pose.pos.distanceTo(pose.mira);
        pose.fov = THREE.MathUtils.clamp(2 * Math.atan(2.4 * 70 / d) / DEG, 0.7, 30); pose.arriba.set(0, 1, 0); return pose;
      }
      case 'persecucion': enVehiculo(-70, 24, 32, 18); pose.fov = 46; return pose;
      case 'lateral-separacion': enVehiculo(2, 88, 0, -6); pose.fov = 50; return pose;
      case 'persecucion-alta': enVehiculo(-46, 15, 11, 42); pose.fov = 55; return pose;
      case 'lateral-etapas': enVehiculo(24, 58, 9, 26); pose.fov = 48; return pose;
      case 'persecucion-orbital': enVehiculo(centroVisible(t) - 34, 10, 7, centroVisible(t)); pose.fov = 52; return pose;
      case 'orbita-aparcamiento': {
        const phi = 0.4 + 0.085 * dp, r = 27;
        pose.pos.copy(e.pos).addScaledVector(e.lado, Math.cos(phi) * r).addScaledVector(e.normal, Math.sin(phi) * r).addScaledVector(e.eje, centroVisible(t) - 6);
        pose.mira.copy(e.pos).addScaledVector(e.eje, centroVisible(t)); pose.fov = 50; return pose;
      }
      case 'lateral-separacion-nave': enVehiculo(yNave - 3, 5, 17, yNave - 3.5); pose.fov = 50; return pose;
      case 'persecucion-pm': enVehiculo(yNave - 15, 5, 4.5, yNave + 1.5); pose.fov = 44; return pose;
      case 'nave-despliegue':
      case 'nave-final': {
        // Orbito lentamente por el lado iluminado por el Sol; en el plano final me alejo dejando la Tierra al fondo.
        solProy.copy(mundoInfo?.dirSol ?? e.normal);
        const phi0 = Math.atan2(solProy.dot(e.normal), solProy.dot(e.lado)) + 0.55;
        const tPlano = plano.id === 'nave-final' ? linea.presentacionDesdeMision(tMast - 2) : p0, phi = phi0 + 0.07 * (p - tPlano);
        const r = plano.id === 'nave-final' ? 11 + 1.1 * dp : 11, centro = yNave + 0.7;
        pose.pos.copy(e.pos).addScaledVector(e.lado, Math.cos(phi) * r).addScaledVector(e.normal, Math.sin(phi) * r).addScaledVector(e.eje, centro + 1.2);
        pose.pos.addScaledVector(e.arriba, (plano.id === 'nave-final' ? 0.45 : 0.6) * r);
        pose.mira.copy(e.pos).addScaledVector(e.eje, centro); pose.fov = 46; return pose;
      }
      default: enVehiculo(-40, 12, 10, 20); pose.fov = 50; return pose;
    }
  }
  const temblor = new V3();
  // En pantallas verticales amplio el FOV vertical para conservar el encuadre horizontal de referencia, salvo en la aproximación inicial.
  const fovSegunFormato = (pl, f) => {
    const aspecto = camara.aspect, ref = 0.9;
    if (pl.id === 'aproximacion' || !(aspecto < ref)) return f;
    return Math.min(80, 2 * Math.atan(Math.tan(f * DEG / 2) * ref / aspecto) / DEG);
  };
  // Aplico el plano activo a la cámara gestionando transiciones suaves, vibración acústica del despegue y protección contra singularidad en `lookAt`.
  function colocarCamara(t, p, e) {
    const plano = linea.planoEn(t);
    const nueva = calcularPlano(plano, t, p, e);
    camPos.copy(nueva.pos); camMira.copy(nueva.mira); camArriba.copy(nueva.arriba);
    let fov = fovSegunFormato(plano, nueva.fov);
    // Interpolo con el plano anterior durante 2,5 s cuando el plano está marcado como transición suave.
    if (plano.suave && anterior.valido) {
      const k = suave((p - linea.presentacionDesdeMision(plano.desde)) / 2.5);
      if (k < 1) {
        const previo = linea.planos[linea.planos.indexOf(plano) - 1];
        const viejo = calcularPlano(previo, t, p, e);
        camPos.lerpVectors(viejo.pos.clone(), camPos, k); camMira.lerpVectors(viejo.mira.clone(), camMira, k);
        camArriba.lerpVectors(viejo.arriba.clone(), camArriba, k).normalize();
        const fovViejo = fovSegunFormato(previo, viejo.fov); fov = fovViejo + (fov - fovViejo) * k;
      }
    }
    // Aplico vibración atenuada en las cámaras cercanas al suelo durante el despegue, respetando `prefers-reduced-motion`.
    if (!reducirMovimiento && t > 0 && t < 14 && ['despegue-suelo', 'plataforma-base', 'seguimiento-largo'].includes(plano.id)) {
      const a = 0.05 * Math.exp(-Math.max(0, t - 3) / 4) * (plano.id === 'seguimiento-largo' ? 0.3 : 1);
      temblor.set(Math.sin(p * 61) + Math.sin(p * 37), Math.sin(p * 53), Math.sin(p * 47)).multiplyScalar(a);
      camMira.add(temblor.multiplyScalar(camPos.distanceTo(camMira) * 0.01));
    }
    // Sustituyo el vector arriba por la normal del vehículo si queda casi colineal con la dirección de mirada.
    tmpA.subVectors(camMira, camPos).normalize();
    if (Math.abs(tmpA.dot(camArriba)) > 0.97) camArriba.copy(e.normal);
    camara.position.copy(camPos); camara.up.copy(camArriba); camara.lookAt(camMira);
    if (Math.abs(camara.fov - fov) > 1e-3) { camara.fov = fov; camara.updateProjectionMatrix(); }
    anterior.valido = true;
    return plano;
  }

  // Actualizo pose del vehículo, brazos umbilicales, etapas separables, visibilidad de interiores sellados, penachos y fundido del modelo NASA.
  const luzSombra = new THREE.Color(), luzSol = new THREE.Color();
  function aplicarInstante(t, tiempoAnim, { forzarInternos = false } = {}) {
    calcularEstado(t, est);
    raiz.position.copy(est.pos); raiz.quaternion.copy(est.q);
    plataforma.retraerBrazos(suave((t + 9) / 6));
    colocarPiezas(t);
    // Oculto las piezas selladas dentro de la cofia cerrada y la tobera LR91 dentro del interetapa para ahorrar llamadas de dibujo y triángulos mientras no pueden verse.
    const mostrarInteriorCofia = forzarInternos || t >= tCofia - 0.1;
    if (!mostrarInteriorCofia) {
      P.centaur.visible = false;
      P.moduloPropulsion.visible = false;
      P.nave.visible = false;
    } else {
      P.nave.visible = true;
    }
    const mostrarToberaEtapa2 = forzarInternos || t >= tE1off - 0.5;
    for (const o of P.etapa2.userData.ocultaEnInteretapa ?? []) o.visible = mostrarToberaEtapa2;
    for (const { pen, encendido } of penachos) pen.actualizar(encendido(t), Math.exp(-Math.max(0, est.altitud) / 7200), tiempoAnim);
    const k = suave((t - tMast) / 2.5);
    fundirPlegada(fundirNasa ? 1 - k : 1);
    fundirNasa?.(k);
  }
  // Bucle principal de renderizado del lanzamiento: avanzo el reloj de presentación, actualizo mundo/efectos, dibujo, informo tiempos al perfil de calidad y notifico a la interfaz.
  function fotograma() {
    if (destruido) return;
    const ahoraMs = performance.now(), intervalo = instanteAnterior === null ? 0 : (ahoraMs - instanteAnterior) / 1000, dt = Math.min(0.1, intervalo);
    instanteAnterior = ahoraMs; tiempoAnim += dt;
    if (!pausado && !terminado) {
      p = Math.min(linea.duracion, p + dt * velocidad);
      if (p >= linea.duracion) { esperaFinal += dt; if (esperaFinal > 1.4) { finalizar(); return; } }
    }
    const t = linea.misionDesdePresentacion(p), ms = instanteUtcMs(mision, t);
    aplicarInstante(t, tiempoAnim);
    const plano = colocarCamara(t, p, est);
    camara.updateMatrixWorld();
    // Oculto la plataforma cuando la cámara se aleja más de 25 km porque ya subtiende menos de una fracción de píxel.
    plataforma.grupo.visible = camara.position.lengthSq() < 25000 * 25000;
    mundoInfo = mundo.actualizar({ ms, foco: tmpB.copy(est.pos).addScaledVector(est.eje, 20), tiempoAnim });
    luzSol.setRGB(1, 0.97, 0.92).multiplyScalar(0.7 + 0.3 * mundoInfo.brilloCielo);
    luzSombra.setRGB(0.36, 0.41, 0.5).multiplyScalar(0.35 + 0.65 * mundoInfo.brilloCielo);
    humo.tonos(luzSol, luzSombra); estela.tonos(luzSol, luzSombra);
    generarHumo(t);
    humo.actualizar(particulas, camara, mundoInfo.dirSol, nParticulas);
    estela.actualizar(puntosEstela, camara, mundoInfo.dirSol, nEstela);
    renderer.render(escena, camara);
    const ahora = performance.now();
    // Reporto el intervalo real y el tiempo de CPU para que el gestor de calidad ajuste resolución y detalle del lanzamiento.
    if (intervalo > 0) reportFrame(intervalo, { contexto: 'lanzamiento', cpu: (ahora - ahoraMs) / 1000 });
    const evento = ultimoEventoHasta(linea.eventos, t);
    if (evento !== ultimoEvento || ahora - ultimoInforme > 120) {
      ultimoInforme = ahora;
      const nuevoEvento = evento !== ultimoEvento;
      ultimoEvento = evento;
      alCambiar(estadoPublico(t, plano, nuevoEvento ? evento : null));
    }
  }
  // Construyo la instantánea de telemetría y fase que consume la superposición de interfaz del lanzamiento.
  function estadoPublico(t, plano, eventoNuevo = null) {
    const fase = linea.faseEn(t);
    return {
      misionId, tMision: t, reloj: formatearRelojMision(t), utcMs: instanteUtcMs(mision, t), factor: linea.factorEn(p), velocidad, pausado, terminado,
      progreso: p / linea.duracion, fase, plano: plano?.id ?? null, eventoNuevo,
      evento: ultimoEventoHasta(linea.eventos, t), siguiente: linea.siguienteEvento(t),
      altitudKm: t >= tLift ? est.altitud / 1000 : 0, velocidadKmS: est.rapidez / 1000, velocidadSueloKmS: t >= tLift ? est.rapidezSuelo / 1000 : 0,
      modeloNasa: estadoModeloNasa, texturas: mundo.estadoTexturas(), solAltDeg: mundoInfo?.solAltDeg ?? null, solAzDeg: mundoInfo?.solAzDeg ?? null,
      camara: { altitudKm: (mundoInfo?.altitudCamara ?? 0) / 1000, fov: camara.fov }
    };
  }

  const observador = new ResizeObserver(() => mundo.redimensionar(contenedor.clientWidth, contenedor.clientHeight));
  observador.observe(contenedor);
  mundo.redimensionar(contenedor.clientWidth || 800, contenedor.clientHeight || 600);

  // Preparo el arranque sin tirones: espero cargas (con tope de 8 s), subo texturas una por fotograma, precaliento shaders a nivel de plataforma y hago un primer dibujo oculto antes de mostrar el lienzo.
  const listo = Promise.race([mundo.cargas, new Promise(r => setTimeout(r, 8000))]).then(async () => {
    if (destruido) return;
    // Subo las texturas ya decodificadas a la GPU de forma escalonada antes de iniciar la animación.
    await mundo.subirTexturas();
    if (destruido) return;
    // Precaliento un fotograma oculto a nivel de plataforma con cielo, terreno, piezas internas y penachos activos para evitar compilaciones a mitad de la aproximación.
    aplicarInstante(0.5, 0, { forzarInternos: true });
    colocarCamara(-8, linea.presentacionDesdeMision(-8), est);
    camara.updateMatrixWorld();
    mundo.actualizar({ ms: instanteUtcMs(mision, -8), foco: est.pos, tiempoAnim: 0 });
    try { await renderer.compileAsync(escena, camara); } catch { /* compilación perezosa como respaldo */ }
    if (destruido) return;
    renderer.render(escena, camara);

    aplicarInstante(linea.tInicio, 0);
    poseAproximacion(0, pose); camara.position.copy(pose.pos); camara.up.copy(pose.arriba); camara.lookAt(pose.mira); camara.updateMatrixWorld();
    plataforma.grupo.visible = true;
    mundoInfo = mundo.actualizar({ ms: instanteUtcMs(mision, linea.tInicio), foco: null, tiempoAnim: 0 });
    // Realizo el primer dibujo del plano inicial con el lienzo aún oculto para absorber el coste de arranque de programas y búferes.
    renderer.render(escena, camara);
    await new Promise(r => requestAnimationFrame(() => r()));
    if (destruido) return;
    instanteAnterior = null;
    renderer.setAnimationLoop(fotograma);
    canvas.classList.add('is-visible');
  });

  // Salto a un segundo de presentación concreto invalidando la caché balística de las etapas separables.
  function irAPresentacion(nuevaP) {
    if (Number.isNaN(nuevaP)) return;
    p = THREE.MathUtils.clamp(nuevaP, 0, linea.duracion); esperaFinal = 0; terminado = false; for (const s of separables) s.cache = null; }
  function finalizar() {
    if (terminado) return;
    terminado = true;
    alTerminar({ misionId });
  }
  return {
    canvas, mision, linea, listo,
    // Expongo referencias internas únicamente para guiones de diagnóstico y revisión visual.
    interno: { escena, camara, renderer },
    pausar() { pausado = true; },
    reanudar() { pausado = false; },
    alternarPausa() { pausado = !pausado; return pausado; },
    establecerVelocidad(k) { velocidad = [1, 2, 4].includes(k) ? k : 1; },
    siguienteEvento() { const t = linea.misionDesdePresentacion(p), ev = linea.siguienteEvento(t); if (ev) irAPresentacion(ev.p - 1.2); return ev; },
    eventoAnterior() { const t = linea.misionDesdePresentacion(p), ev = linea.eventoAnterior(t - 1.5); irAPresentacion(ev ? ev.p - 1.2 : 0); return ev; },
    irAMision(t) { irAPresentacion(linea.presentacionDesdeMision(t)); },
    irAEvento(id) { const ev = linea.eventos.find(e => e.id === id); if (ev) irAPresentacion(ev.p - 1.2); return ev ?? null; },
    reiniciar() { irAPresentacion(0); pausado = false; },
    saltar() { finalizar(); },
    estado() { return estadoPublico(linea.misionDesdePresentacion(p), linea.planoEn(linea.misionDesdePresentacion(p))); },
    // Detengo el bucle, desconecto observadores y libero todos los recursos propios de WebGL sin tocar la plantilla Voyager de la escena principal.
    destruir() {
      if (destruido) return;
      destruido = true;
      bajaDetalle();
      renderer.setAnimationLoop(null);
      observador.disconnect();
      for (const { pen } of penachos) pen.destruir();
      // Separo y libero solo los materiales clonados y los envoltorios propios del modelo NASA para dejar intacta la plantilla compartida.
      if (envolturaNasa) {
        envolturaNasa.traverse(o => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); });
        liberarRecursosNasa?.(); liberarRecursosNasa = null;
        envolturaNasa.removeFromParent(); envolturaNasa = null;
      }
      humo.destruir(); estela.destruir(); plataforma.destruir(); vehiculo.destruir();
      mundo.destruir();
      canvas.remove();
    }
  };
}
