/**
 * En este módulo construyo el lector asíncrono de archivos JSON estáticos de
 * efemérides servidos bajo la ruta base local de Vite o GitHub Pages.
 *
 * - Unidades y marco de referencia: no interpreto ni transformo unidades físicas
 *   (km, km/s, s, JD TDB) ni marcos; únicamente entrego el objeto JSON decodificado
 *   a las capas de validación científica.
 * - Límites y seguridad: nunca incluyo URLs externas de NASA/JPL Horizons ni ejecuto
 *   peticiones al construirse; rechazo rutas absolutas, secuencias `..` o barras dobles
 *   para impedir accesos fuera del directorio estático local.
 */

/**
 * Aquí devuelvo una función `readJson(file)` que valida la ruta relativa,
 * solicita el recurso mediante `fetchImpl` y comprueba estado HTTP y sintaxis JSON.
 */
export function createStaticJsonReader({ baseUrl, fetchImpl = globalThis.fetch }) {
  if (typeof baseUrl !== 'string' || !baseUrl.startsWith('/') || !baseUrl.endsWith('/')) {
    throw new TypeError('baseUrl debe ser una ruta local que empiece y termine con /.');
  }
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl debe ser una función.');
  return async function readJson(file) {
    // Valido que el archivo sea una ruta JSON relativa estricta sin ascensos ni barras duplicadas.
    if (typeof file !== 'string' || !/^[A-Za-z0-9_./-]+\.json$/.test(file)
      || file.startsWith('/') || file.includes('..') || file.includes('//')) {
      throw new RangeError('file debe ser una ruta JSON local relativa.');
    }
    const url = `${baseUrl}${file}`;
    let response;
    try {
      response = await fetchImpl(url);
    } catch (cause) {
      throw new Error(`No se pudo leer ${url}.`, { cause });
    }
    if (!response || !response.ok) {
      throw new Error(`No se pudo leer ${url}: HTTP ${response?.status ?? 'desconocido'}.`);
    }
    try {
      return await response.json();
    } catch (cause) {
      throw new Error(`JSON malformado en ${url}.`, { cause });
    }
  };
}
