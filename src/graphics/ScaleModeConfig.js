// En este módulo defino la configuración de escalas visuales (científica 1:1 y exploratoria),
// los radios físicos de referencia en km y su conversión a unidades lineales de la escena (32 unidades/AU).
import { KM_PER_AU } from '../science/Units.js';
import { UNIDADES_POR_AU } from './SceneScale.js';

export const MODOS_ESCALA_VISUAL = Object.freeze({
  CIENTIFICA: 'cientifica',
  EXPLORATORIA: 'exploratoria'
});

export const REGIONES_SISTEMA = Object.freeze({
  INTERIOR: 'interior',
  COMPLETO: 'completo'
});

export const UNIDADES_ESCENA_POR_KM = UNIDADES_POR_AU / KM_PER_AU;

/**
 * Reúno los radios volumétricos medios de referencia (NASA/JPL SSD y UAI 2015 Res. B3 para el Sol) en km.
 * Los empleo exclusivamente para calcular la proporción geométrica 1:1 en Escala Científica sin alterar
 * las posiciones heliocéntricas ni los parámetros del motor gravitacional.
 */
export const RADIOS_FISICOS_KM = Object.freeze({
  Sol: 695700,
  Mercurio: 2439.4,
  Venus: 6051.8,
  Tierra: 6371.0084,
  Marte: 3389.5,
  Jupiter: 69911,
  Saturno: 58232,
  Urano: 25362,
  Neptuno: 24622
});

export const RADIOS_ILUSTRATIVOS_BASE = Object.freeze({
  Sol: 5,
  Mercurio: 0.7,
  Venus: 1.1,
  Tierra: 1.3,
  Marte: 0.9,
  Jupiter: 3.2,
  Saturno: 2.8,
  Urano: 2.1,
  Neptuno: 2.1
});

/** Convierto el radio físico auténtico de un cuerpo a unidades lineales de la escena (32 unidades = 1 AU). */
export function obtenerRadioFisicoEscena(nombre) {
  const radioKm = RADIOS_FISICOS_KM[nombre];
  if (!Number.isFinite(radioKm)) {
    throw new RangeError(`Cuerpo sin radio físico registrado: ${nombre}`);
  }
  return radioKm * UNIDADES_ESCENA_POR_KM;
}

/**
 * Calculo el factor multiplicativo sobre la malla base (`radioBaseEscena`) para representar
 * el tamaño físico real 1:1 respecto a las distancias en AU.
 */
export function factorEscalaCientificaCuerpo(nombre, radioBaseEscena = RADIOS_ILUSTRATIVOS_BASE[nombre]) {
  return obtenerRadioFisicoEscena(nombre) / radioBaseEscena;
}

/**
 * Calculo la escala visual objetivo de un planeta según el modo activo, la distancia de la cámara
 * y si el cuerpo es el protagonista seleccionado.
 * - En `cientifica`: mantengo estrictamente la proporción física 1:1 (`R_km / AU`).
 * - En `exploratoria`: converjo a 1,0 en primer plano y acoto el diámetro angular aparente a distancia.
 */
export function calcularEscalaObjetivoPlaneta({
  nombre,
  radioBaseEscena,
  modoEscala,
  distanciaCamaraCuerpo,
  esSeleccionado = false,
  cercaniaSeleccionado = 0
}) {
  if (modoEscala === MODOS_ESCALA_VISUAL.CIENTIFICA) {
    return factorEscalaCientificaCuerpo(nombre, radioBaseEscena);
  }

  // En modo exploratorio preservo el encuadre cercano (escala 1,0) pero limito el tamaño angular
  // a distancias interplanetarias para evitar esferas desproporcionadas en el fondo.
  const maxRadioAngularRad = nombre === 'Saturno' || nombre === 'Jupiter' ? 0.0052 : 0.0042;
  const radioMaximoPorDistancia = Math.max(0.08, distanciaCamaraCuerpo * maxRadioAngularRad);
  const escalaAcotadaLejana = Math.min(0.56, Math.max(0.14, radioMaximoPorDistancia / radioBaseEscena));

  if (esSeleccionado) {
    return escalaAcotadaLejana + (1 - escalaAcotadaLejana) * cercaniaSeleccionado;
  }

  return Math.max(0.12, escalaAcotadaLejana * (1 - 0.65 * cercaniaSeleccionado));
}

/** Calculo el factor de escala visual de la fotosfera solar (malla base de radio 5 unidades). */
export function calcularEscalaObjetivoSol({ modoEscala, distanciaCamaraSol }) {
  if (modoEscala === MODOS_ESCALA_VISUAL.CIENTIFICA) {
    return factorEscalaCientificaCuerpo('Sol', RADIOS_ILUSTRATIVOS_BASE.Sol);
  }
  // En modo exploratorio interpolo el disco solar entre 1,60 u en el sistema interior y 0,95 u en vista completa
  // para mantenerlo bien proporcionado dentro de la órbita de Mercurio (12,4 u).
  const t = Math.min(1, Math.max(0, (distanciaCamaraSol - 35) / 240));
  const suave = t * t * (3 - 2 * t);
  return 0.32 - 0.13 * suave;
}
