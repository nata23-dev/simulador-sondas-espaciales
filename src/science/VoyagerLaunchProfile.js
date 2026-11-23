// Aquí modelo los lanzamientos de Voyager 1 y Voyager 2 desde el Complejo 41 de Cabo Cañaveral (1977).
// Mantengo este módulo en el dominio científico puro, sin DOM ni Three.js.
//
// Reúno tanto los datos DOCUMENTADOS (con su fuente oficial) como lo que CALCULO para la reconstrucción visual:
//   · secuencia de vuelo: tiempos reales del TC-6 (Voyager 1) y secuencia típica del 20-08-1977 del dossier de prensa (Voyager 2);
//   · vehículo Titan IIIE-Centaur D-1T: medidas, empujes, impulsos específicos y masas del resumen de sistemas de 1973;
//   · tiempo sidéreo y posición del Sol en el cielo de LC-41 (fórmulas de baja precisión del Astronomical Almanac, ≈ 0,01°,
//     contrastadas en pruebas contra NASA/JPL Horizons);
//   · un ascenso ILUSTRATIVO: masa puntual en 3D en un marco inercial geocéntrico alineado con ENU de LC-41 al despegue,
//     Tierra esférica rotante y sin atmósfera, usando empujes, Isp, masas y tiempos documentados más tres parámetros que calibro
//     para alcanzar la órbita de aparcamiento documentada (90 millas náuticas, circular) en el instante de MECO-1.
//     Aclaro que no es telemetría real: las fuentes consultadas no publican altitud ni velocidad durante el ascenso.
//
// Unidades y escalas: trabajo en unidades SI (m, m/s, kg, N, s) en todos los cálculos físicos y ángulos en grados/radianes
// según se indique; los instantes son UTC (asumo UT1 ≈ UTC, con |UT1−UTC| < 0,9 s en 1977) y los tiempos de vuelo se miden
// en segundos desde la ignición de los motores sólidos (T0 del informe TC-6).

const G0 = 9.80665;
const LB = 0.45359237;
const LBF = 4.4482216152605;
const FT = 0.3048;
const DEG = Math.PI / 180;

export const MU_TIERRA_M3_S2 = 3.986004418e14;
export const RADIO_TIERRA_M = 6378137; // Adopto el radio ecuatorial WGS84 para la esfera terrestre (latitud geodética coherente con las texturas).
export const OMEGA_TIERRA_RAD_S = 7.2921150e-5;
export const MILLA_NAUTICA_M = 1852;
export const ALTITUD_APARCAMIENTO_M = 90 * MILLA_NAUTICA_M; // Referencia TC-6: «90 n. mi. parking orbit».

export const FUENTES_LANZAMIENTO = Object.freeze({
  tc6: Object.freeze({ titulo: 'Titan/Centaur D-1T TC-6 Voyager Flight Data Report', autor: 'NASA Lewis Research Center, 1977', url: 'https://www1.grc.nasa.gov/wp-content/uploads/TC-6-Voyager-Flight-Data-Report-1976.pdf' }),
  resumen: Object.freeze({ titulo: 'Titan IIIE/Centaur D-1T Systems Summary (CASD-LVP73-007)', autor: 'General Dynamics Convair y Martin Marietta, septiembre de 1973', url: 'https://ntrs.nasa.gov/citations/19750004937' }),
  prensa: Object.freeze({ titulo: 'Voyager Press Kit (NASA Release 77-136)', autor: 'NASA, 4 de agosto de 1977', url: 'https://planetary.s3.amazonaws.com/assets/presskit/voyager-launch.pdf' }),
  horizons: Object.freeze({ titulo: 'JPL Horizons (Sol visto desde LC-41; referencia de las pruebas)', autor: 'NASA/JPL', url: 'https://ssd.jpl.nasa.gov/horizons/' }),
  fotos: Object.freeze({ titulo: 'Fotografías PIA21739, PIA21742, PIA21744–PIA21746 y PIA01480', autor: 'NASA Image and Video Library', url: 'https://images.nasa.gov/' })
});

// Defino las coordenadas del Complejo de Lanzamiento 41 (Titan III, «Integrate-Transfer-Launch») en Cabo Cañaveral.
export const LC41 = Object.freeze({ nombre: 'Complejo de Lanzamiento 41 (LC-41), Cabo Cañaveral, Florida', latDeg: 28.5833, lonDeg: -80.5828,
  // Tomo del dossier de prensa las distancias aproximadas desde LC-41 al edificio VIB (~5 900 m) y a la zona de prensa (~6 100 m).
  distanciaVibM: 5900, distanciaPrensaM: 6100 });

// Recopilo las dimensiones y prestaciones del resumen de sistemas (1973); las masas ausentes las deduzco y marco explícitamente.
export const TITAN_IIIE_CENTAUR = Object.freeze({
  alturaTotalM: 160 * FT, // Altura total aproximada de 48,8 m con la cofia instalada.
  masaDespegueKg: 1368000 * LB, // Masa documentada al despegue: «approximately 1,368,000 pounds when all stages are fully fueled».
  srm: Object.freeze({ nombre: 'Motores sólidos UA1205 (etapa 0)', unidades: 2, segmentos: 5, diametroM: 10 * FT, alturaM: 85 * FT,
    segmentosAlturaM: Object.freeze({ central: 129 * 0.0254, popa: 63 * 0.0254, proa: 95 * 0.0254 }),
    empujeNominalN: 1.2e6 * LBF, ispS: 266, combustionS: 117, masaMinimaCadaKg: 500000 * LB }),
  etapa1: Object.freeze({ nombre: 'Etapa I (LR87-AJ-11)', alturaM: 63 * FT, diametroM: 10 * FT, empujeN: 520000 * LBF, ispVacioS: 301.1,
    masaLlenaKg: 277000 * LB, masaVaciaKg: 15000 * LB }),
  etapa2: Object.freeze({ nombre: 'Etapa II (LR91-AJ-11)', alturaM: 23 * FT, diametroM: 10 * FT, empujeN: 101000 * LBF, ispVacioS: 318.7, combustionS: 210,
    masaVaciaKg: 6000 * LB,
    // Como la masa llena del escaneo (23 000 lb) contradice su empuje, Isp y duración, deduzco el propulsante con F·t/(Isp·g0).
    propulsanteDeducidoKg: 101000 * LBF * 210 / (318.7 * G0) }),
  centaur: Object.freeze({ nombre: 'Centaur D-1T (2 × RL10A-3-3)', alturaM: 31.5 * FT, diametroM: 10 * FT, empujeN: 30000 * LBF, ispVacioS: 444,
    propulsanteKg: (24840 + 4910) * LB, masaSecaKg: 4400 * LB }),
  adaptadorInteretapa: Object.freeze({ alturaM: 9.5 * FT, diametroM: 10 * FT }),
  cofia: Object.freeze({ nombre: 'Cofia estándar Centaur (CSS)', alturaM: 58 * FT, diametroM: 14 * FT, cilindroAlturaM: 42 * FT, narizAlturaM: 16 * FT }),
  // Tomo las masas de la carga útil del dossier de prensa: módulo de misión 825 kg, módulo de propulsión 1 220 kg (1 060 kg de propulsante) y adaptador 47,2 kg (total 2 100 kg).
  nave: Object.freeze({ moduloMisionKg: 825, moduloPropulsionKg: 1220, propulsantePmKg: 1060, adaptadorKg: 47.2, totalKg: 2100,
    empujePmN: 68000, combustionPmS: 43 })
});

// Defino las secuencias de vuelo con t en segundos desde la ignición SRM y etiqueto su origen:
// 'tc6' (medido en vuelo), 'prensa' (secuencia típica del 20-08-1977) o 'reconstruido' (deducido de duraciones documentadas).
const ev = (id, t, nombre, fuente, nota = null) => Object.freeze({ id, t, nombre, fuente, nota });
const EVENTOS_V1 = Object.freeze([
  ev('srm-ignicion', 0, 'Ignición de los motores sólidos', 'tc6'),
  ev('despegue', 0.26, 'Despegue', 'tc6'),
  ev('giro', 6.6, 'Giro al acimut de vuelo (100,2° → 92°)', 'tc6'),
  ev('etapa1-ignicion', 112.1, 'Ignición de la etapa I', 'tc6'),
  ev('srm-separacion', 123.2, 'Separación de los motores sólidos', 'tc6'),
  ev('etapa1-apagado', 262.2, 'Apagado de la etapa I e ignición de la etapa II', 'tc6'),
  ev('cofia', 272.2, 'Separación de la cofia', 'tc6'),
  ev('etapa2-apagado', 469.9, 'Apagado de la etapa II', 'tc6'),
  ev('etapa2-separacion', 474.1, 'Separación Titan–Centaur', 'tc6'),
  ev('mes1', 484.6, 'Primer encendido del Centaur (MES-1)', 'tc6'),
  ev('meco1', 594.0, 'Fin del primer encendido (MECO-1): órbita de aparcamiento', 'tc6', 'El Centaur se encendió 17,7 s más de lo previsto para compensar el déficit de la etapa II.'),
  ev('mes2', 3199.8, 'Segundo encendido del Centaur (MES-2)', 'tc6'),
  ev('meco2', 3535.3, 'Fin del segundo encendido (MECO-2)', 'tc6'),
  ev('separacion-nave', 3705.2, 'Separación de la Voyager', 'tc6'),
  ev('pm-ignicion', 3722.2, 'Ignición del motor del módulo de propulsión', 'tc6'),
  ev('pm-apagado', 3767.3, 'Fin del encendido: inyección hacia Júpiter', 'tc6'),
  ev('mastiles', 3767.3 + 62, 'Suelta de los mástiles (RTG y ciencia)', 'reconstruido', 'Tiempo relativo a la inyección según la secuencia típica del dossier de prensa (I + 1 min 02 s).'),
  ev('pm-separacion', 4445.0, 'Separación del módulo de propulsión', 'tc6')
]);
// Para Voyager 2 no localicé el informe de vuelo del TC-7; como los tiempos del dossier de prensa están referidos
// al despegue y los SRM encienden 0,2 s antes, sumo 0,2 s a cada marca.
const P = s => s + 0.2;
const V2_PM_APAGADO = P(3739); // Marco T + 1 h 02 min 19 s desde el despegue.
const V2_SEPARACION = V2_PM_APAGADO - 45 - 15; // Resto 45 s de encendido del PM y 15 s previos desde la separación.
const V2_MECO2 = V2_SEPARACION - 185; // Resto el crucero post-MECO-2 documentado: «Post MECO 2 coast time is 185 seconds up through Sept. 12 launches».
const EVENTOS_V2 = Object.freeze([
  ev('srm-ignicion', 0, 'Ignición de los motores sólidos', 'prensa'),
  ev('despegue', 0.2, 'Despegue', 'prensa'),
  ev('giro', 6.6, 'Giro al acimut de vuelo', 'reconstruido', 'Instante del TC-6; el acimut del TC-7 no está en las fuentes consultadas.'),
  ev('etapa1-ignicion', P(111), 'Ignición de la etapa I', 'prensa'),
  ev('srm-separacion', P(122), 'Separación de los motores sólidos', 'prensa'),
  ev('etapa1-apagado', P(260), 'Apagado de la etapa I e ignición de la etapa II', 'prensa'),
  ev('cofia', P(271), 'Separación de la cofia', 'prensa'),
  ev('etapa2-apagado', P(471), 'Apagado de la etapa II', 'prensa'),
  ev('etapa2-separacion', P(477), 'Separación Titan–Centaur', 'prensa'),
  ev('mes1', P(488), 'Primer encendido del Centaur (MES-1)', 'prensa'),
  ev('meco1', P(590), 'Fin del primer encendido (MECO-1): órbita de aparcamiento', 'prensa'),
  ev('mes2', V2_MECO2 - 335.5, 'Segundo encendido del Centaur (MES-2)', 'reconstruido', 'MECO-2 menos la duración del segundo encendido del TC-6 (335,5 s).'),
  ev('meco2', V2_MECO2, 'Fin del segundo encendido (MECO-2)', 'reconstruido', 'Separación menos los 185 s de crucero del dossier de prensa.'),
  ev('separacion-nave', V2_SEPARACION, 'Separación de la Voyager', 'prensa'),
  ev('pm-ignicion', V2_SEPARACION + 15, 'Ignición del motor del módulo de propulsión', 'prensa'),
  ev('pm-apagado', V2_PM_APAGADO, 'Fin del encendido: inyección hacia Júpiter', 'prensa'),
  ev('mastiles', V2_PM_APAGADO + 62, 'Suelta de los mástiles (RTG y ciencia)', 'prensa'),
  ev('pm-separacion', V2_PM_APAGADO + (4445.0 - 3767.3), 'Separación del módulo de propulsión', 'reconstruido', 'Mismo intervalo tras la inyección que en el TC-6.')
]);

export const LANZAMIENTOS_VOYAGER = Object.freeze({
  'voyager-1': Object.freeze({ id: 'voyager-1', nombre: 'Voyager 1', vehiculo: 'Titan IIIE-Centaur TC-6',
    srmIgnicionUtc: '1977-09-05T12:56:00.958Z', fuenteHora: 'tc6',
    acimutPlataformaDeg: 100.2, acimutVueloDeg: 92, fuenteAcimut: 'tc6',
    inclinacionAparcamientoDeg: 28.52, eventos: EVENTOS_V1,
    nota: 'Tiempos de vuelo medidos (informe TC-6). El catálogo histórico del simulador usa 12:56:00 UTC.' }),
  'voyager-2': Object.freeze({ id: 'voyager-2', nombre: 'Voyager 2', vehiculo: 'Titan IIIE-Centaur TC-7',
    // Según NASA History el despegue ocurrió a las 14:29:44 UTC, así que sitúo la ignición de los SRM 0,2 s antes.
    srmIgnicionUtc: '1977-08-20T14:29:43.800Z', fuenteHora: 'prensa',
    acimutPlataformaDeg: 100.2, acimutVueloDeg: 108, fuenteAcimut: 'tc6',
    inclinacionAparcamientoDeg: null, eventos: EVENTOS_V2,
    nota: 'Secuencia típica del 20-08-1977 (dossier de prensa) y tramos reconstruidos donde se indica; no se localizó el informe de vuelo del TC-7. '
      + 'El acimut de 108° es el límite del sector de lanzamiento (92°–108°); en los primeros días de la ventana se guiñaba hacia el sur desde 108°. '
      + 'Hora de despegue: 14:29:44 UTC (NASA History); el catálogo histórico usa 14:29:00 UTC.' })
});

/** Aquí busco un evento de lanzamiento por su identificador dentro de la misión dada. */
export const eventoPorId = (mision, id) => mision.eventos.find(e => e.id === id) ?? null;
/** Aquí convierto el tiempo de vuelo `t` (s desde T0) a milisegundos UTC. */
export const instanteUtcMs = (mision, t) => Date.parse(mision.srmIgnicionUtc) + t * 1000;

// ---- Aquí agrupo los cálculos de tiempo sidéreo y posición aparente del Sol ------------------------------------------------
/** Aquí convierto milisegundos Unix (UTC) a fecha juliana. */
export const fechaJulianaDesdeMs = ms => ms / 86400000 + 2440587.5;

/** Aquí calculo el tiempo sidéreo medio de Greenwich en grados [0, 360) para JD UT1 (IAU 1982, fórmula 12.4 de Meeus). */
export function tiempoSidereoMedioGrados(jdUt1) {
  const d = jdUt1 - 2451545.0, T = d / 36525;
  const g = 280.46061837 + 360.98564736629 * d + 0.000387933 * T * T - T * T * T / 38710000;
  return ((g % 360) + 360) % 360;
}

/** Aquí calculo la ascensión recta y declinación aparentes del Sol (grados) con la aproximación del Astronomical Almanac (≈ 0,01° entre 1950 y 2050). */
export function posicionSolar(jd) {
  const n = jd - 2451545.0;
  const L = 280.460 + 0.9856474 * n, g = (357.528 + 0.9856003 * n) * DEG;
  const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * DEG;
  const eps = (23.439 - 0.0000004 * n) * DEG;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  return { raDeg: ((ra / DEG) % 360 + 360) % 360, decDeg: dec / DEG, distanciaAu: 1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g) };
}

/** Aquí transformo coordenadas ecuatoriales (RA, Dec) a acimut (desde el norte hacia el este) y altura para un observador en (latDeg, lonDeg). */
export function alturaAcimut({ raDeg, decDeg }, jdUt1, latDeg, lonDeg) {
  const H = (tiempoSidereoMedioGrados(jdUt1) + lonDeg - raDeg) * DEG, phi = latDeg * DEG, dec = decDeg * DEG;
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(-Math.sin(H) * Math.cos(dec), Math.cos(phi) * Math.sin(dec) - Math.sin(phi) * Math.cos(dec) * Math.cos(H));
  return { azDeg: ((az / DEG) % 360 + 360) % 360, altDeg: alt / DEG };
}

/** Aquí convierto acimut y altura en un vector unitario local ENU (este, norte, arriba). */
export const enuDesdeAltAz = ({ azDeg, altDeg }) => {
  const a = azDeg * DEG, h = altDeg * DEG;
  return [Math.sin(a) * Math.cos(h), Math.cos(a) * Math.cos(h), Math.sin(h)];
};

/** Aquí calculo el punto subsolar (latitud y longitud geográficas en grados, longitud en [−180, 180)) en un instante UTC (ms). */
export function puntoSubsolar(ms) {
  const jd = fechaJulianaDesdeMs(ms), sol = posicionSolar(jd);
  const lon = ((sol.raDeg - tiempoSidereoMedioGrados(jd)) % 360 + 540) % 360 - 180;
  return { latDeg: sol.decDeg, lonDeg: lon };
}

/** Aquí evalúo las coordenadas aparentes y la dirección ENU del Sol visto desde LC-41 en el instante UTC dado (ms). */
export function solEnLC41(ms) {
  const jd = fechaJulianaDesdeMs(ms);
  const sol = posicionSolar(jd);
  const altaz = alturaAcimut(sol, jd, LC41.latDeg, LC41.lonDeg);
  return { ...sol, ...altaz, enu: enuDesdeAltAz(altaz) };
}

/** Aquí construyo la matriz 3×3 (por filas) que proyecta vectores ecuatoriales (x hacia γ, z hacia el polo norte) al marco ENU de LC-41. */
export function matrizEcuatorialAEnu(ms) {
  const theta = (tiempoSidereoMedioGrados(fechaJulianaDesdeMs(ms)) + LC41.lonDeg) * DEG, phi = LC41.latDeg * DEG;
  return [[-Math.sin(theta), Math.cos(theta), 0],
    [-Math.sin(phi) * Math.cos(theta), -Math.sin(phi) * Math.sin(theta), Math.cos(phi)],
    [Math.cos(phi) * Math.cos(theta), Math.cos(phi) * Math.sin(theta), Math.sin(phi)]];
}

// ---- Aquí implemento el modelo ilustrativo de ascenso 3D -------------------------------------------------------------------
// Integro la trayectoria en 3D inercial (RK4) en un marco geocéntrico con ejes ENU de LC-41 en el despegue (este, norte, arriba).
// Doto a la plataforma de la velocidad inicial de rotación terrestre (ω × r) para que el cohete parta en reposo respecto al suelo.
// Aplico un guiado con ángulo θ sobre la horizontal local en el plano vertical del acimut de vuelo: ascenso vertical hasta +10 s
// (resumen de sistemas: inicio de cabeceo a +10 s), rampa lineal hasta θ₁ en la separación de los SRM y, después, ley de tangente
// lineal tan θ = tan θ₁ − c·(t − t_sep). Tras MECO-1 alineo los encendidos con la velocidad inercial.
// Modelo la caída lineal del empuje SRM como (1 − β·t/117 s) desde el nominal documentado y calibro θ₁, c y β para llegar a
// 90 millas náuticas con trayectoria horizontal y velocidad circular en el MECO-1 documentado, declaradamente sin atmósfera.

const EJE_POLAR_ENU = phi => [0, Math.cos(phi), Math.sin(phi)];
const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const punto = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norma3 = a => Math.hypot(a[0], a[1], a[2]);

/** Agrupo las masas del núcleo central y de los propulsores sólidos para la misión dada. */
function etapasDeVuelo(mision) {
  const V = TITAN_IIIE_CENTAUR, t = id => eventoPorId(mision, id).t;
  const mNucleo = V.etapa1.masaLlenaKg + V.etapa2.propulsanteDeducidoKg + V.etapa2.masaVaciaKg + V.centaur.propulsanteKg + V.centaur.masaSecaKg + V.nave.totalKg;
  return { t, mNucleo, mSrmTotal: V.masaDespegueKg - mNucleo };
}

/** Aquí construyo el modelo dinámico por etapas (masa, empuje, guiado y derivada 6D en SI) para los parámetros calibrados. */
export function crearModelo(mision, { anguloSrmDeg, tasaTangente, beta }) {
  const V = TITAN_IIIE_CENTAUR, { t, mNucleo, mSrmTotal } = etapasDeVuelo(mision);
  const tLift = t('despegue'), tI = t('etapa1-ignicion'), tSrmSep = t('srm-separacion'), tIoff = t('etapa1-apagado'), tIIoff = t('etapa2-apagado');
  const tMes1 = t('mes1'), tMeco1 = t('meco1'), tMes2 = t('mes2'), tMeco2 = t('meco2'), tSep = t('separacion-nave'), tPm = t('pm-ignicion'), tPmOff = t('pm-apagado');
  const tSrmFin = tI; // Tomo el agotamiento de los SRM en el instante en que dispara el encendido de la etapa I (TC-6).
  const fSrm = tt => tt < tSrmFin ? 2 * V.srm.empujeNominalN * Math.max(0, 1 - beta * tt / V.srm.combustionS) : 0;
  const mdotSrmInt = tt => 2 * V.srm.empujeNominalN / (V.srm.ispS * G0) * (tt - beta * tt * tt / (2 * V.srm.combustionS)); // Integro analíticamente ∫ F/(Isp·g0) dt.
  const propSrm = mdotSrmInt(Math.min(tSrmFin, V.srm.combustionS / Math.max(beta, 1e-9)));
  const inerteSrm = mSrmTotal - propSrm;
  const mdot1 = V.etapa1.empujeN / (V.etapa1.ispVacioS * G0), mdot2 = V.etapa2.empujeN / (V.etapa2.ispVacioS * G0);
  const mdotC = V.centaur.empujeN / (V.centaur.ispVacioS * G0), mdotPm = V.nave.propulsantePmKg / (tPmOff - tPm);
  const empujePm = V.nave.empujePmN * V.nave.combustionPmS / (tPmOff - tPm); // Conservo el impulso total documentado (68 kN × 43 s) sobre la duración real.

  // Evalúo la masa instantánea y el empuje neto por tramos integrando analíticamente los consumos de cada etapa.
  function masaYEmpuje(tt) {
    let m = mNucleo + inerteSrm + (propSrm - mdotSrmInt(Math.min(tt, tSrmFin)));
    if (tt >= tSrmSep) m -= inerteSrm + (propSrm - mdotSrmInt(tSrmFin));
    const quemado1 = Math.min(Math.max(tt - tI, 0), tIoff - tI) * mdot1;
    m -= quemado1;
    if (tt >= tIoff) m -= V.etapa1.masaLlenaKg - quemado1; // Desprendo la etapa I vacía junto con su residuo al apagado.
    const quemado2 = Math.min(Math.max(tt - tIoff, 0), tIIoff - tIoff) * mdot2;
    m -= quemado2;
    if (tt >= t('etapa2-separacion')) m -= V.etapa2.propulsanteDeducidoKg + V.etapa2.masaVaciaKg - quemado2;
    const quemadoC = Math.min(V.centaur.propulsanteKg, (Math.min(Math.max(tt - tMes1, 0), tMeco1 - tMes1) + Math.min(Math.max(tt - tMes2, 0), tMeco2 - tMes2)) * mdotC);
    m -= quemadoC;
    const quemadoPm = Math.min(Math.max(tt - tPm, 0), tPmOff - tPm) * mdotPm;
    if (tt >= tSep) m = V.nave.totalKg - V.nave.adaptadorKg - quemadoPm; // A partir de la separación propago únicamente la nave y su módulo de propulsión.
    let F = fSrm(tt);
    if (tt >= tI && tt < tIoff) F += V.etapa1.empujeN;
    if (tt >= tIoff && tt < tIIoff) F += V.etapa2.empujeN;
    if (((tt >= tMes1 && tt < tMeco1) || (tt >= tMes2 && tt < tMeco2)) && quemadoC < V.centaur.propulsanteKg) F += V.centaur.empujeN;
    if (tt >= tPm && tt < tPmOff) F += empujePm;
    return { m, F };
  }

  const phi = LC41.latDeg * DEG, az = mision.acimutVueloDeg * DEG, d0 = [Math.sin(az), Math.cos(az), 0], tan1 = Math.tan(anguloSrmDeg * DEG);
  function direccionEmpuje(tt, r, v) {
    const rn = norma3(r), up = r.map(x => x / rn);
    if (tt >= tMeco1 + 1) { const vn = norma3(v); return v.map(x => x / vn); } // En los encendidos posteriores a MECO-1 empujo a lo largo de la velocidad inercial.
    const th = tt < 10 ? 90 * DEG : tt < tSrmSep ? (90 - (90 - anguloSrmDeg) * (tt - 10) / (tSrmSep - 10)) * DEG : Math.atan(tan1 - tasaTangente * (tt - tSrmSep));
    const k = punto(d0, up), h0 = d0.map((x, i) => x - k * up[i]), hn = norma3(h0), h = h0.map(x => x / hn);
    return h.map((x, i) => Math.cos(th) * x + Math.sin(th) * up[i]);
  }
  function derivada(tt, s) {
    const r = [s[0], s[1], s[2]], v = [s[3], s[4], s[5]], rn = norma3(r), { m, F } = masaYEmpuje(tt), a = F / m;
    const d = a > 0 ? direccionEmpuje(tt, r, v) : [0, 0, 0], g = -MU_TIERRA_M3_S2 / (rn * rn * rn);
    return [v[0], v[1], v[2], g * r[0] + a * d[0], g * r[1] + a * d[1], g * r[2] + a * d[2]];
  }
  const r0 = [0, 0, RADIO_TIERRA_M], v0 = cruz(EJE_POLAR_ENU(phi).map(x => x * OMEGA_TIERRA_RAD_S), r0);
  return { derivada, masaYEmpuje, estadoInicial: [...r0, ...v0], tLift, tMeco1, inerteSrm, propSrm, mSrmTotal };
}

/** Ejecuto un paso clásico Runge-Kutta de cuarto orden sobre el vector de estado `s`. */
function rk4(f, tt, s, h) {
  const k1 = f(tt, s), s2 = s.map((v, i) => v + h / 2 * k1[i]), k2 = f(tt + h / 2, s2), s3 = s.map((v, i) => v + h / 2 * k2[i]);
  const k3 = f(tt + h / 2, s3), s4 = s.map((v, i) => v + h * k3[i]), k4 = f(tt + h, s4);
  return s.map((v, i) => v + h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

/** Aquí integro el modelo hasta `tFin` alineando los cortes con cada evento para no promediar discontinuidades de empuje o masa. */
export function integrar(modelo, mision, tFin, { paso = 0.25, muestrear = null } = {}) {
  const cortes = [...new Set(mision.eventos.map(e => e.t).filter(t => t > modelo.tLift && t < tFin).concat([10, tFin]))].sort((a, b) => a - b);
  let tt = modelo.tLift, s = modelo.estadoInicial.slice();
  muestrear?.(tt, s, true);
  for (const corte of cortes) {
    while (tt < corte - 1e-9) {
      const h = Math.min(tt >= modelo.tMeco1 && corte - tt > 20 ? 2 : paso, corte - tt);
      s = rk4(modelo.derivada, tt, s, h); tt += h;
      muestrear?.(tt, s, Math.abs(tt - corte) < 1e-9);
    }
  }
  return s;
}

/** Aquí evalúo el vector de error en MECO-1 respecto a la órbita circular de aparcamiento (altitud, velocidad radial y velocidad circular). */
export function errorObjetivo(mision, p) {
  const modelo = crearModelo(mision, p), s = integrar(modelo, mision, modelo.tMeco1);
  const r = [s[0], s[1], s[2]], v = [s[3], s[4], s[5]], rn = norma3(r);
  return [(rn - RADIO_TIERRA_M - ALTITUD_APARCAMIENTO_M) / 1000, punto(r, v) / rn / 100, (norma3(v) - Math.sqrt(MU_TIERRA_M3_S2 / rn)) / 100];
}

/** Aquí calibro (θ₁, c, β) mediante Newton amortiguado con jacobiano numérico por diferencias y devuelvo los parámetros y el residuo final. */
export function calibrarAscenso(mision) {
  let p = [30, 0.0015, 0.25]; // Inicializo [anguloSrmDeg, tasaTangente (1/s), beta].
  const obj = q => errorObjetivo(mision, { anguloSrmDeg: q[0], tasaTangente: q[1], beta: q[2] });
  const norma = e => Math.hypot(...e);
  let e = obj(p), iter = 0;
  const pasos = [0.02, 0.00001, 0.002];
  for (; iter < 40 && norma(e) > 1e-3; iter++) {
    const J = pasos.map((h, j) => { const q = p.slice(); q[j] += h; return obj(q).map((v, i) => (v - e[i]) / h); });
    const A = [0, 1, 2].map(i => [J[0][i], J[1][i], J[2][i], -e[i]]); // Resuelvo el sistema lineal J·Δ = −e por eliminación de Gauss-Jordan con pivoteo parcial.
    for (let c = 0; c < 3; c++) {
      let piv = c; for (let r = c + 1; r < 3; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      [A[c], A[piv]] = [A[piv], A[c]];
      for (let r = 0; r < 3; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 4; k++) A[r][k] -= f * A[c][k]; }
    }
    const delta = A.map((row, i) => row[3] / row[i]);
    let lambda = 1, mejor = null;
    for (let intento = 0; intento < 8; intento++, lambda /= 2) {
      const q = p.map((v, i) => v + lambda * delta[i]);
      q[0] = Math.min(80, Math.max(5, q[0])); q[2] = Math.min(0.9, Math.max(0, q[2]));
      const eq = obj(q);
      if (eq.every(Number.isFinite) && norma(eq) < norma(e)) { mejor = { q, eq }; break; }
    }
    if (!mejor) break;
    p = mejor.q; e = mejor.eq;
  }
  return Object.freeze({ anguloSrmDeg: p[0], tasaTangente: p[1], beta: p[2], error: e, iteraciones: iter, convergio: norma(e) <= 1e-3 });
}

const cacheAscenso = new Map();
/**
 * Aquí genero y cacheo la trayectoria ilustrativa completa (desde el despegue hasta 120 s después de la separación
 * del módulo de propulsión), muestreada cada 0,5 s hasta 700 s, cada 2 s después y exactamente en cada evento.
 * Cada muestra guarda `{ t, p: [x, y, z], v: [vx, vy, vz], masa }` en el marco inercial geocéntrico (SI: m, m/s, kg).
 */
export function trayectoriaLanzamiento(misionId) {
  if (cacheAscenso.has(misionId)) return cacheAscenso.get(misionId);
  const mision = LANZAMIENTOS_VOYAGER[misionId];
  if (!mision) throw new RangeError(`Misión de lanzamiento desconocida: ${misionId}`);
  const calibracion = calibrarAscenso(mision);
  const modelo = crearModelo(mision, calibracion);
  const tFin = eventoPorId(mision, 'pm-separacion').t + 120;
  const muestras = [];
  let siguiente = modelo.tLift;
  integrar(modelo, mision, tFin, { muestrear: (tt, s, esCorte) => {
    if (!esCorte && tt + 1e-9 < siguiente) return;
    muestras.push(Object.freeze({ t: tt, p: [s[0], s[1], s[2]], v: [s[3], s[4], s[5]], masa: modelo.masaYEmpuje(tt).m }));
    if (!esCorte) siguiente = tt + (tt < 700 ? 0.5 : 2);
  } });
  const enEvento = id => muestras.find(m => Math.abs(m.t - eventoPorId(mision, id).t) < 1e-6);
  const c3 = m => (punto(m.v, m.v) - 2 * MU_TIERRA_M3_S2 / norma3(m.p)) / 1e6;
  const meco1 = enEvento('meco1'), hAng = cruz(meco1.p, meco1.v);
  const inclinacion = Math.acos(punto(hAng, EJE_POLAR_ENU(LC41.latDeg * DEG)) / norma3(hAng)) / DEG;
  const resultado = Object.freeze({ mision, calibracion, muestras: Object.freeze(muestras),
    comprobaciones: Object.freeze({ inerteSrmKg: modelo.inerteSrm, propulsanteSrmKg: modelo.propSrm, masaSrmTotalKg: modelo.mSrmTotal,
      empujePesoDespegue: modelo.masaYEmpuje(modelo.tLift).F / (modelo.masaYEmpuje(modelo.tLift).m * G0),
      inclinacionAparcamientoDeg: inclinacion, c3TrasMeco2Km2S2: c3(enEvento('separacion-nave')), c3TrasPmKm2S2: c3(enEvento('pm-separacion')) }) });
  cacheAscenso.set(misionId, resultado);
  return resultado;
}

/** Aquí interpolo el estado inercial en `t` (Hermite cúbico en posición, lineal en velocidad y masa) y marco si queda fuera del tramo. */
export function estadoInercial(trayectoria, t) {
  const m = trayectoria.muestras;
  if (t <= m[0].t) return { ...m[0], t, enPlataforma: true };
  if (t >= m[m.length - 1].t) return { ...m[m.length - 1], t, extrapolado: t > m[m.length - 1].t };
  let lo = 0, hi = m.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (m[mid].t <= t) lo = mid; else hi = mid; }
  const a = m[lo], b = m[hi], h = b.t - a.t, u = (t - a.t) / h, u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  return { t, p: a.p.map((x, i) => h00 * x + h10 * h * a.v[i] + h01 * b.p[i] + h11 * h * b.v[i]),
    v: a.v.map((x, i) => x + (b.v[i] - x) * u), masa: a.masa + (b.masa - a.masa) * u };
}

/**
 * Aquí proyecto posición y velocidades al marco ENU de LC-41 (m y m/s; este, norte, arriba; origen en la plataforma)
 * rotando con la Tierra, y calculo el eje de orientación del vehículo (velocidad respecto al suelo en ascenso,
 * pasando suavemente a velocidad inercial antes de MECO-1).
 */
export function estadoEnu(trayectoria, t) {
  const s = estadoInercial(trayectoria, t), tLift = trayectoria.muestras[0].t, phi = LC41.latDeg * DEG, eje = EJE_POLAR_ENU(phi);
  // Como el marco ENU ligado a la Tierra gira ω(t − t_despegue) alrededor del eje polar, aplico la rotación inversa de Rodrigues.
  const ang = -OMEGA_TIERRA_RAD_S * Math.max(0, t - tLift), c = Math.cos(ang), sn = Math.sin(ang);
  const rot = v => { const kv = punto(eje, v), cx = cruz(eje, v); return v.map((x, i) => x * c + cx[i] * sn + eje[i] * kv * (1 - c)); };
  const pRel = rot(s.p), v = rot(s.v); // Expreso el radio geocéntrico y la velocidad inercial en los ejes ENU actuales.
  const w = cruz(eje.map(x => x * OMEGA_TIERRA_RAD_S), pRel), vSuelo = v.map((x, i) => x - w[i]);
  const altitudM = norma3(pRel) - RADIO_TIERRA_M;
  const tMeco1 = eventoPorId(trayectoria.mision, 'meco1').t;
  const mezcla = Math.min(1, Math.max(0, (t - (tMeco1 - 120)) / 120));
  const vsN = norma3(vSuelo) || 1, viN = norma3(v) || 1;
  let dir = vSuelo.map((x, i) => x * (1 - mezcla) / vsN + v[i] * mezcla / viN);
  const n = norma3(dir);
  dir = n > 1e-6 && t > tLift + 0.5 && vsN > 1 ? dir.map(x => x / n) : [0, 0, 1];
  const r0 = [0, 0, 1], cosAng = Math.min(1, Math.max(-1, punto(pRel, r0) / norma3(pRel)));
  return { t, posicionM: [pRel[0], pRel[1], pRel[2] - RADIO_TIERRA_M], velocidadInercialMS: v, velocidadSueloMS: vSuelo, direccion: dir,
    rapidezInercialMS: norma3(s.v), rapidezSueloMS: norma3(vSuelo), altitudM, masaKg: s.masa, distanciaSueloM: Math.acos(cosAng) * RADIO_TIERRA_M,
    enPlataforma: Boolean(s.enPlataforma), extrapolado: Boolean(s.extrapolado) };
}

/** Aquí transformo un vector inercial (posición geocéntrica o velocidad) a los ejes ENU de LC-41 en el instante `t`. */
export function inercialAEnu(trayectoria, t, v, { esPosicion = true } = {}) {
  const tLift = trayectoria.muestras[0].t, eje = EJE_POLAR_ENU(LC41.latDeg * DEG);
  const ang = -OMEGA_TIERRA_RAD_S * Math.max(0, t - tLift), c = Math.cos(ang), sn = Math.sin(ang);
  const kv = punto(eje, v), cx = cruz(eje, v), r = v.map((x, i) => x * c + cx[i] * sn + eje[i] * kv * (1 - c));
  return esPosicion ? [r[0], r[1], r[2] - RADIO_TIERRA_M] : r;
}

/**
 * Aquí propago el vuelo libre balístico (dos cuerpos, sin atmósfera) de una pieza separada mediante RK4 inercial
 * desde `{ t, p, v }` hasta `t + dt`; lo utilizo para las etapas, motores sólidos, cofia, Centaur y módulo de propulsión.
 */
export function propagarBalistico(estado, dt, { paso = 1 } = {}) {
  const f = (_, s) => { const rn = Math.hypot(s[0], s[1], s[2]), g = -MU_TIERRA_M3_S2 / (rn * rn * rn); return [s[3], s[4], s[5], g * s[0], g * s[1], g * s[2]]; };
  let s = [...estado.p, ...estado.v], t = 0;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / paso)), h = dt / n;
  for (let i = 0; i < n; i++) { s = rk4(f, t, s, h); t += h; }
  return { t: estado.t + dt, p: [s[0], s[1], s[2]], v: [s[3], s[4], s[5]] };
}
