// Etapa 24 · Lo que hicieron las sondas reales de la flota, para no confundir una simulación del laboratorio con la historia.
// Solo hechos documentados con su fuente (consultadas el 21-11-2026). Fechas en UTC salvo que se indique otra cosa.
// No alimenta ningún cálculo: el laboratorio no reproduce estas trayectorias.

export const REAL_MISSION_SOURCES = Object.freeze({
  'nssdca-voyager1': Object.freeze({ title: 'NSSDCA Master Catalog — Voyager 1 (1977-084A)', publisher: 'NASA GSFC', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1977-084A' }),
  'nssdca-voyager2': Object.freeze({ title: 'NSSDCA Master Catalog — Voyager 2 (1977-076A)', publisher: 'NASA GSFC', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1977-076A' }),
  'nasa-cassini-facts': Object.freeze({ title: 'Cassini — Quick Facts', publisher: 'NASA Science', url: 'https://science.nasa.gov/mission/cassini/quick-facts/' }),
  'nssdca-dawn': Object.freeze({ title: 'NSSDCA Master Catalog — Dawn (2007-043A)', publisher: 'NASA GSFC', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2007-043A' }),
  'nssdca-juno': Object.freeze({ title: 'NSSDCA Master Catalog — Juno (2011-040A)', publisher: 'NASA GSFC', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2011-040A' })
});

// `cuerpo`: cuerpo visitado en ese hito (para comparar con el destino simulado); `destino`: objetivo final de la misión real.
const hito = (fecha, texto, cuerpo = null) => Object.freeze({ fecha, texto, cuerpo });
const mision = (nombre, lanzador, destino, hitos, fuente) => Object.freeze({ nombre, lanzador, destino, hitos: Object.freeze(hitos), fuente });

export const REAL_MISSIONS = Object.freeze({
  voyager: Object.freeze([
    mision('Voyager 2', 'Titan IIIE-Centaur, Cabo Cañaveral', 'Júpiter, Saturno, Urano y Neptuno', [
      hito('1977-08-20', 'Lanzamiento'), hito('1979-07-09', 'Máxima aproximación a Júpiter', 'Júpiter'), hito('1981-08-26', 'Sobrevuelo de Saturno', 'Saturno'),
      hito('1986-01-24', 'Sobrevuelo de Urano', 'Urano'), hito('1989-08-25', 'Sobrevuelo de Neptuno', 'Neptuno')
    ], 'nssdca-voyager2'),
    mision('Voyager 1', 'Titan IIIE-Centaur, Cabo Cañaveral', 'Júpiter y Saturno', [
      hito('1977-09-05', 'Lanzamiento'), hito('1979-03-05', 'Máxima aproximación a Júpiter', 'Júpiter'), hito('1980-11-12', 'Máxima aproximación a Saturno', 'Saturno')
    ], 'nssdca-voyager1')
  ]),
  cassini: Object.freeze([
    mision('Cassini-Huygens', 'Titan IVB/Centaur, Estación de Cabo Cañaveral', 'Saturno', [
      hito('1997-10-15', 'Lanzamiento'), hito('1998-04-26', 'Primer sobrevuelo de Venus (234 km)', 'Venus'), hito('1999-06-24', 'Segundo sobrevuelo de Venus (600 km)', 'Venus'),
      hito('1999-08-18', 'Sobrevuelo de la Tierra', 'Tierra'), hito('2000-12-30', 'Sobrevuelo de Júpiter', 'Júpiter'), hito('2004-07-01', 'Llegada a Saturno (30 de junio en hora del Pacífico)', 'Saturno')
    ], 'nasa-cassini-facts')
  ]),
  dawn: Object.freeze([
    mision('Dawn', 'Delta II 7925-H, Cabo Cañaveral', 'Vesta y Ceres', [
      hito('2007-09-27', 'Lanzamiento (11:34 UTC)'), hito('2009-02-18', 'Asistencia gravitatoria de Marte', 'Marte'), hito('2011-07-16', 'Llegada a Vesta y entrada en órbita', 'Vesta'),
      hito('2012-09-05', 'Salida de Vesta', 'Vesta'), hito('2015-03-06', 'Entrada en órbita de Ceres', 'Ceres'), hito('2018-10-31', 'Fin de las comunicaciones')
    ], 'nssdca-dawn')
  ]),
  juno: Object.freeze([
    mision('Juno', 'Atlas V 551 con etapa Centaur, Cabo Cañaveral', 'Júpiter', [
      hito('2011-08-05', 'Lanzamiento (16:25 UTC)'), hito('2013-10-09', 'Sobrevuelo de la Tierra (≈ 559 km)', 'Tierra'), hito('2016-07-05', 'Inserción en órbita polar de Júpiter (encendido de 35 min)', 'Júpiter')
    ], 'nssdca-juno')
  ])
});

/** Misiones reales de la sonda de la flota `probeId` (voyager, cassini, dawn o juno), o lista vacía. */
export const realMissionsFor = probeId => REAL_MISSIONS[probeId] ?? [];

const normalizar = texto => String(texto ?? '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();

/**
 * Compara el destino de una simulación con lo que hizo la sonda real. `destinos`: nombres del destino simulado (planeta y,
 * si lo hay, satélite). Devuelve null si la sonda no es de la flota; si no, las misiones reales, los hitos que coinciden con
 * algún destino y un resumen en una frase. No dice nada sobre la trayectoria: el laboratorio no reproduce la histórica.
 */
export function compararConMisionReal(probeId, destinos = []) {
  const misiones = realMissionsFor(probeId);
  if (!misiones.length) return null;
  const buscados = destinos.filter(Boolean), claves = new Set(buscados.map(normalizar));
  if (!buscados.length) return null; // sin destino (p. ej. un lanzamiento a órbita terrestre) no hay nada que comparar
  const coincidencias = misiones.flatMap(m => m.hitos.filter(h => h.cuerpo && claves.has(normalizar(h.cuerpo))).map(h => ({ mision: m.nombre, ...h })));
  const destinoTexto = buscados.map(n => /^(Luna|Tierra)$/.test(n) ? `la ${n}` : n).join(' / ');
  const resumen = coincidencias.length
    ? `La sonda real también pasó por ${destinoTexto}: ${coincidencias.map(c => `${c.texto.charAt(0).toLowerCase()}${c.texto.slice(1)} (${c.mision}, ${c.fecha})`).join('; ')}. La fecha, la ruta y el resultado simulados no son los históricos.`
    : `La sonda real no fue a ${destinoTexto}: ${misiones.map(m => `${m.nombre} tuvo como destino ${m.destino}`).join('; ')}. Esta misión es un ejercicio del laboratorio, no una reconstrucción histórica.`;
  return { misiones, coincidencias, resumen };
}
