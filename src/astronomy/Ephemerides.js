
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

export function obtenerEstados(datos, fechaISO) {
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
      distanciaAU: Math.hypot(p.x, p.y, p.z)
    };
  }

  return estados;
}
