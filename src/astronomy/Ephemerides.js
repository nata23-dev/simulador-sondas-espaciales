/**
 * En este módulo cargo y consulto las efemérides planetarias diarias de 2026
 * provenientes de NASA/JPL Horizons para el modo de exploración.
 * Las posiciones vienen en unidades astronómicas (AU) y las velocidades en AU/día,
 * expresadas en el marco heliocéntrico eclíptico J2000 con fechas etiquetadas en TDB.
 */

export const PLANETAS = [
  'Mercurio',
  'Venus',
  'Tierra',
  'Marte',
  'Jupiter',
  'Saturno',
  'Urano',
  'Neptuno'
];

// Cargo el JSON local de efemérides diarias y valido que incluya metadatos y series no vacías para los ocho planetas.
export async function cargarEfemerides() {
  const respuesta = await fetch(`${import.meta.env.BASE_URL}data/efemerides-2026.json`);

  if (!respuesta.ok) {
    throw new Error('No se pudo cargar el archivo de efemerides.');
  }

  const datos = await respuesta.json();

  if (!datos.metadatos || !datos.planetas) {
    throw new Error('El archivo astronomico no tiene la estructura esperada.');
  }

  for (const nombre of PLANETAS) {
    const registros = datos.planetas[nombre];

    if (!Array.isArray(registros) || registros.length === 0) {
      throw new Error(`No existen datos validos para ${nombre}.`);
    }
  }

  return datos;
}

// Recupero el estado diario de todos los planetas para una fecha ISO dada, verificando la finitud de cada componente.
export function obtenerEstados(datos, fechaISO) {
  // Como las muestras están ordenadas día a día, uso la diferencia en días UTC únicamente para calcular el índice TDB.
  const inicio = Date.parse(`${datos.metadatos.inicio}T00:00:00Z`);
  const fecha = Date.parse(`${fechaISO}T00:00:00Z`);

  if (!Number.isFinite(fecha)) {
    throw new Error('La fecha seleccionada no es valida.');
  }

  const indice = Math.round((fecha - inicio) / 86400000);
  const estados = {};

  for (const nombre of PLANETAS) {
    const registro = datos.planetas[nombre][indice];

    if (!registro) {
      throw new Error(`No hay efemerides de ${nombre} para esa fecha.`);
    }

    const p = registro.posicionAU;
    const v = registro.velocidadAUporDia;

    if (
      !p || !v ||
      [p.x, p.y, p.z, v.x, v.y, v.z].some(
        valor => !Number.isFinite(valor)
      )
    ) {
      throw new Error(`Datos numericos invalidos para ${nombre}.`);
    }

    estados[nombre] = {
      ...registro,
      // Calculo la distancia heliocéntrica a partir del vector original sin alterar la muestra de efemérides.
      distanciaAU: Math.hypot(p.x, p.y, p.z)
    };
  }

  return estados;
}
