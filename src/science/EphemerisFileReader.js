/**
 * Crea un lector asíncrono de JSON estático bajo la ruta base de Vite/Pages.
 * No contiene ninguna URL de NASA ni inicia una petición hasta que se invoca.
 */
export function createStaticJsonReader({ baseUrl, fetchImpl = globalThis.fetch }) {
  if (typeof baseUrl !== 'string' || !baseUrl.startsWith('/') || !baseUrl.endsWith('/')) {
    throw new TypeError('baseUrl debe ser una ruta local que empiece y termine con /.');
  }
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl debe ser una función.');
  return async function readJson(file) {
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
