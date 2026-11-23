/**
 * En este módulo valido y adapto archivos diarios de efemérides planetarias
 * descargados de NASA/JPL Horizons (`horizons-daily-v1`) al formato interno de
 * estado científico del simulador.
 *
 * - Unidades: los archivos fuente traen posiciones en AU y velocidades en AU/día
 *   con paso de 1 día en JD TDB; al adaptar cada muestra las convierto a km y km/s
 *   sin mutar el JSON original.
 * - Marco de referencia: exijo `SUN_CENTER` (`Sol (500@10)`), `ICRF`, plano
 *   `Ecliptica J2000`, escala `TDB` y vectores geométricos (`VEC_CORR=NONE`).
 * - Límites: valido las ocho series planetarias y separo advertencias heurísticas
 *   de errores estructurales, sin rechazar datos legítimos por plausibilidad ni
 *   depender de Three.js.
 */
import { auToKm, auPerDayToKmPerSecond, requireFiniteNumber } from './Units.js';
import { requireVector3, HORIZONS_FRAME } from './Frames.js';
import { gregorianLabelToJulianMidnight } from './Time.js';
import { createScientificState } from './ScientificState.js';

// Mantengo el mapa de identificadores COMMAND de NASA/JPL Horizons empleados en la descarga local.
export const HORIZONS_PLANETS = Object.freeze({
  Mercurio: '199', Venus: '299', Tierra: '399', Marte: '499',
  Jupiter: '599', Saturno: '699', Urano: '799', Neptuno: '899'
});

const MONTHS = Object.freeze({ Jan: '01', Feb: '02', Mar: '03', Apr: '04',
  May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09',
  Oct: '10', Nov: '11', Dec: '12' });
// Tolero 1e-8 días (< 0,9 ms) para comparar fechas julianas del formato diario.
const JD_TOLERANCE_DAYS = 1e-8;
const STEP_TOLERANCE_DAYS = 1e-8;

/** Compruebo que el valor recibido sea un objeto plano no nulo. */
function object(value, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${path} debe ser un objeto.`);
  }
  return value;
}

/** Compruebo que el campo recibido sea una cadena de texto no vacía. */
function requiredString(value, path) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${path} debe ser una cadena no vacía.`);
  }
  return value;
}

/** Exijo coincidencia estricta entre el valor observado en metadatos y el esperado por el contrato. */
function expect(value, expected, path) {
  if (value !== expected) throw new RangeError(`${path}: se esperaba ${expected}; recibido ${value}.`);
}

/** Extraigo la fecha ISO `YYYY-MM-DD` desde una etiqueta diaria `A.D. YYYY-Mon-DD 00:00:00.0000` de Horizons. */
function dateFromTdbLabel(value, path) {
  const label = requiredString(value, path);
  const match = /^A\.D\. ([0-9]{4})-([A-Z][a-z]{2})-([0-9]{2}) 00:00:00\.0000$/.exec(label);
  if (!match || !MONTHS[match[2]]) {
    throw new RangeError(`${path}: se requiere una muestra diaria a las 00:00:00.0000 TDB.`);
  }
  return `${match[1]}-${MONTHS[match[2]]}-${match[3]}`;
}

/**
 * Aquí verifico el perfil exacto de metadatos exigido a un archivo diario de
 * NASA/JPL Horizons (origen, marco, escala TDB, unidades, corrección, marca
 * `consultaUTC` real y rango de fechas).
 */
export function validateHorizonsMetadata(metadata) {
  object(metadata, 'metadatos');
  requiredString(metadata.fuente, 'metadatos.fuente');
  requiredString(metadata.url, 'metadatos.url');
  expect(metadata.fuente, 'NASA/JPL Horizons', 'metadatos.fuente');
  expect(metadata.centro, 'Sol (500@10)', 'metadatos.centro');
  expect(metadata.plano, 'Ecliptica J2000', 'metadatos.plano');
  expect(metadata.referencia, HORIZONS_FRAME.referenceSystem, 'metadatos.referencia');
  expect(metadata.tiempo, 'TDB', 'metadatos.tiempo');
  expect(metadata.distancia, 'AU', 'metadatos.distancia');
  expect(metadata.velocidad, 'AU/dia', 'metadatos.velocidad');
  expect(metadata.correccion, 'NONE', 'metadatos.correccion');
  expect(metadata.tipo, 'Vectores geometricos', 'metadatos.tipo');
  expect(metadata.intervalo, '1 dia', 'metadatos.intervalo');
  requiredString(metadata.consultaUTC, 'metadatos.consultaUTC');
  const utc = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/.exec(metadata.consultaUTC);
  if (!utc) {
    throw new RangeError('metadatos.consultaUTC debe ser una fecha ISO UTC válida.');
  }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = utc;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]
    || hour > 23 || minute > 59 || second > 59) {
    throw new RangeError('metadatos.consultaUTC debe ser una fecha ISO UTC válida.');
  }
  const firstJdTdb = gregorianLabelToJulianMidnight(metadata.inicio);
  const lastJdTdb = gregorianLabelToJulianMidnight(metadata.fin);
  if (lastJdTdb < firstJdTdb) throw new RangeError('metadatos.fin debe ser posterior o igual a inicio.');
  if (metadata.versionAPI !== undefined && metadata.versionAPI !== null) {
    requiredString(metadata.versionAPI, 'metadatos.versionAPI');
  }
  return { firstJdTdb, lastJdTdb };
}

/**
 * Aquí valido una muestra diaria individual comprobando la correspondencia
 * entre `jdTDB` y `fechaTDB` y la finitud de sus vectores en AU y AU/día,
 * sin convertir ni alterar sus valores originales.
 */
export function validateHorizonsSample(record, path = 'registro') {
  object(record, path);
  requireFiniteNumber(record.jdTDB, `${path}.jdTDB`);
  const date = dateFromTdbLabel(record.fechaTDB, `${path}.fechaTDB`);
  const labelJd = gregorianLabelToJulianMidnight(date);
  if (Math.abs(record.jdTDB - labelJd) > JD_TOLERANCE_DAYS) {
    throw new RangeError(`${path}.jdTDB no corresponde a ${path}.fechaTDB en la escala TDB.`);
  }
  requireVector3(record.posicionAU, `${path}.posicionAU`);
  requireVector3(record.velocidadAUporDia, `${path}.velocidadAUporDia`);
  return { date, jdTdb: record.jdTDB };
}

/**
 * Aquí valido las ocho series planetarias diarias, compruebo el paso exacto de
 * 1 día sin huecos ni desorden y recopilo advertencias separadas de los errores.
 * Aplico umbrales conservadores (distancia > 1000 AU, rapidez > 1 AU/día o
 * posición nula) solo como aviso; no certifico exactitud astrométrica ni rechazo
 * registros por plausibilidad.
 */
export function validateHorizonsDataset(dataset) {
  object(dataset, 'dataset');
  const { firstJdTdb, lastJdTdb } = validateHorizonsMetadata(dataset.metadatos);
  object(dataset.planetas, 'dataset.planetas');
  const expectedCount = lastJdTdb - firstJdTdb + 1;
  const names = Object.keys(HORIZONS_PLANETS);
  const receivedNames = Object.keys(dataset.planetas);
  if (receivedNames.length !== names.length || names.some(name => !receivedNames.includes(name))) {
    throw new RangeError('dataset.planetas debe contener exactamente los ocho planetas conocidos.');
  }
  const warnings = [];
  for (const name of names) {
    const series = dataset.planetas[name];
    if (!Array.isArray(series) || series.length !== expectedCount) {
      throw new RangeError(`dataset.planetas.${name} debe tener ${expectedCount} muestras diarias.`);
    }
    let previousJd = null;
    for (let index = 0; index < series.length; index++) {
      const path = `dataset.planetas.${name}[${index}]`;
      const { jdTdb } = validateHorizonsSample(series[index], path);
      const expectedJd = firstJdTdb + index;
      if (Math.abs(jdTdb - expectedJd) > JD_TOLERANCE_DAYS) {
        throw new RangeError(`${path}.jdTDB no coincide con el intervalo declarado en metadatos.`);
      }
      if (previousJd !== null && Math.abs(jdTdb - previousJd - 1) > STEP_TOLERANCE_DAYS) {
        throw new RangeError(`${path}.jdTDB está duplicado, desordenado o fuera del paso diario.`);
      }
      previousJd = jdTdb;
      const p = series[index].posicionAU;
      const v = series[index].velocidadAUporDia;
      const distance = Math.hypot(p.x, p.y, p.z);
      const speed = Math.hypot(v.x, v.y, v.z);
      if (distance === 0 || distance > 1000) warnings.push(`${path}.posicionAU: distancia heliocéntrica sospechosa (${distance} AU).`);
      if (speed > 1) warnings.push(`${path}.velocidadAUporDia: rapidez sospechosa (${speed} AU/día).`);
    }
  }
  return { sampleCountPerPlanet: expectedCount, firstJdTdb, lastJdTdb, warnings };
}

/**
 * Aquí adapto una muestra diaria de NASA/JPL Horizons a `ScientificState`
 * convirtiendo AU → km y AU/día → km/s, sin modificar el JSON de entrada ni
 * depender de Three.js.
 */
export function adaptHorizonsSample(dataset, name, index) {
  object(dataset, 'dataset');
  const { firstJdTdb, lastJdTdb } = validateHorizonsMetadata(dataset.metadatos);
  object(dataset.planetas, 'dataset.planetas');
  if (!Object.hasOwn(HORIZONS_PLANETS, name)) throw new RangeError(`Planeta desconocido: ${name}.`);
  if (!Number.isInteger(index) || index < 0) throw new RangeError('index debe ser un entero no negativo.');
  const series = dataset.planetas[name];
  if (!Array.isArray(series) || index >= series.length) {
    throw new RangeError(`dataset.planetas.${name}[${index}] no existe.`);
  }
  const record = series[index];
  const { jdTdb } = validateHorizonsSample(record, `dataset.planetas.${name}[${index}]`);
  if (jdTdb < firstJdTdb || jdTdb > lastJdTdb
    || Math.abs(jdTdb - (firstJdTdb + index)) > JD_TOLERANCE_DAYS) {
    throw new RangeError(`dataset.planetas.${name}[${index}].jdTDB no coincide con su índice o metadatos.`);
  }
  const p = record.posicionAU;
  const v = record.velocidadAUporDia;
  const metadata = dataset.metadatos;
  return createScientificState({
    identity: { id: HORIZONS_PLANETS[name], type: 'planet', origin: HORIZONS_FRAME.origin },
    time: { jdTdb, scale: 'TDB' },
    position: { x: auToKm(p.x), y: auToKm(p.y), z: auToKm(p.z), unit: 'km' },
    velocity: { x: auPerDayToKmPerSecond(v.x), y: auPerDayToKmPerSecond(v.y),
      z: auPerDayToKmPerSecond(v.z), unit: 'km/s' },
    reference: HORIZONS_FRAME,
    provenance: {
      source: metadata.fuente,
      sourceUrl: metadata.url,
      version: metadata.versionAPI ?? null,
      queriedAtUtc: metadata.consultaUTC,
      precision: null,
      uncertainty: null,
      sourceMetadata: { ...metadata, sourcePlanetName: name, sourceRecordDateTdb: record.fechaTDB,
        sourceDistanceUnit: metadata.distancia, sourceVelocityUnit: metadata.velocidad }
    }
  });
}
