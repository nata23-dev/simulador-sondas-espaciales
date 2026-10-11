
import { mkdir, writeFile } from 'node:fs/promises';

const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';

const planetas = [
  { nombre: 'Mercurio', id: '199' },
  { nombre: 'Venus', id: '299' },
  { nombre: 'Tierra', id: '399' },
  { nombre: 'Marte', id: '499' },
  { nombre: 'Jupiter', id: '599' },
  { nombre: 'Saturno', id: '699' },
  { nombre: 'Urano', id: '799' },
  { nombre: 'Neptuno', id: '899' }
];

const parametrosBase = {
  format: 'json',
  OBJ_DATA: "'NO'",
  MAKE_EPHEM: "'YES'",
  EPHEM_TYPE: "'VECTORS'",
  CENTER: "'500@10'",
  START_TIME: "'2026-10-01'",
  STOP_TIME: "'2026-11-01'",
  STEP_SIZE: "'1 d'",
  TIME_TYPE: "'TDB'",
  REF_PLANE: "'ECLIPTIC'",
  REF_SYSTEM: "'ICRF'",
  OUT_UNITS: "'AU-D'",
  VEC_TABLE: "'2'",
  VEC_LABELS: "'NO'",
  VEC_CORR: "'NONE'",
  CSV_FORMAT: "'YES'"
};

function procesarRespuesta(texto) {
  const inicio = texto.indexOf('$$SOE');
  const fin = texto.indexOf('$$EOE');

  if (inicio === -1 || fin === -1 || fin <= inicio) {
    throw new Error('La respuesta no contiene una tabla de efemerides.');
  }

  const contenido = texto.slice(inicio + 5, fin);

  const registros = contenido
    .trim()
    .split(/\r?\n/)
    .filter(linea => linea.trim().length > 0);

  const resultados = registros.map(linea => {
    const columnas = linea.split(',').map(valor => valor.trim());

    if (columnas.length < 8) {
      throw new Error('Formato de datos inesperado: ' + linea);
    }

    const juliano = Number(columnas[0]);
    const valores = columnas.slice(2, 8).map(Number);

    if (
      !Number.isFinite(juliano) ||
      valores.some(valor => !Number.isFinite(valor))
    ) {
      throw new Error('Se encontraron valores numericos invalidos.');
    }

    return {
      jdTDB: juliano,
      fechaTDB: columnas[1],
      posicionAU: {
        x: valores[0],
        y: valores[1],
        z: valores[2]
      },
      velocidadAUporDia: {
        x: valores[3],
        y: valores[4],
        z: valores[5]
      }
    };
  });

  if (resultados.length === 0) {
    throw new Error('No se recibieron posiciones astronomicas.');
  }

  return resultados;
}

async function descargarPlaneta(planeta) {
  const parametros = new URLSearchParams({
    ...parametrosBase,
    COMMAND: `'${planeta.id}'`
  });

  const respuesta = await fetch(
    `${API}?${parametros.toString()}`,
    { signal: AbortSignal.timeout(60000) }
  );

  if (!respuesta.ok) {
    throw new Error(`Error HTTP ${respuesta.status}`);
  }

  const datos = await respuesta.json();

  if (datos.error) {
    throw new Error(datos.error);
  }

  if (typeof datos.result !== 'string') {
    throw new Error('Horizons no devolvio un resultado valido.');
  }

  return {
    versionAPI: datos.signature?.version ?? null,
    registros: procesarRespuesta(datos.result)
  };
}

async function main() {
  const resultado = {
    metadatos: {
      fuente: 'NASA/JPL Horizons',
      url: API,
      consultaUTC: new Date().toISOString(),
      inicio: '2026-10-01',
      fin: '2026-11-01',
      intervalo: '1 dia',
      centro: 'Sol (500@10)',
      plano: 'Ecliptica J2000',
      referencia: 'ICRF',
      tiempo: 'TDB',
      distancia: 'AU',
      velocidad: 'AU/dia',
      correccion: 'NONE',
      tipo: 'Vectores geometricos'
    },
    planetas: {}
  };

  for (const planeta of planetas) {
    console.log(`Consultando ${planeta.nombre}...`);

    const datos = await descargarPlaneta(planeta);

    resultado.planetas[planeta.nombre] = datos.registros;

    console.log(
      `${planeta.nombre}: ${datos.registros.length} registros obtenidos`
    );

    await new Promise(resolve => setTimeout(resolve, 400));
  }

  await mkdir('public/data', { recursive: true });

  await writeFile(
    'public/data/efemerides-2026.json',
    JSON.stringify(resultado, null, 2),
    'utf8'
  );

  console.log('');
  console.log('Descarga completada correctamente.');
  console.log('Archivo: public/data/efemerides-2026.json');
}

main().catch(error => {
  console.error('No fue posible completar la descarga:');
  console.error(error.message);
  process.exitCode = 1;
});
