// En este módulo gestiono el cliente del Web Worker de cálculos astrodinámicos con cancelación inmediata y respaldo local transparente.
// Cuando el entorno soporta `Worker` (navegador), delego los cálculos pesados al hilo secundario y permito abortarlos al instante
// terminando el Worker si el usuario cambia parámetros. Si `Worker` no existe (por ejemplo en Node), ejecuto la misma tarea localmente.
import { executeIntegratedMissionWorkerTask } from './IntegratedMissionWorker.js';

// Creo un cliente reutilizable que mantiene un único Worker perezoso y asocia cada petición a su promesa mediante un id incremental.
export function createIntegratedMissionWorkerClient({
  createWorker = () => (typeof Worker === 'function'
    ? new Worker(new URL('./IntegratedMissionWorker.js', import.meta.url), { type: 'module' })
    : null)
} = {}) {
  let worker = null;
  let nextId = 1;
  const pending = new Map();

  // Instancio el Worker bajo demanda y conecto los manejadores de respuesta y de fallo irrecuperable.
  function ensureWorker() {
    if (worker) return worker;
    try {
      worker = createWorker();
    } catch {
      worker = null;
    }
    if (!worker) return null;
    worker.addEventListener('message', event => {
      const { id, ok, result, error } = event.data ?? {};
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      if (ok) entry.resolve(result);
      else entry.reject(new Error(error || 'Error en el cálculo del Worker.'));
    });
    worker.addEventListener('error', event => {
      const err = new Error(event?.message || 'Fallo en el Web Worker de cálculo.');
      for (const entry of pending.values()) entry.reject(err);
      pending.clear();
      try { worker.terminate(); } catch { /* ignoro errores al cerrar un Worker ya fallido */ }
      worker = null;
    });
    return worker;
  }

  // Envío una tarea al Worker o, si no hay hilo secundario disponible, la ejecuto en microtareas locales con idéntica interfaz de promesa.
  function runTask(payload) {
    const instance = ensureWorker();
    if (!instance) {
      return Promise.resolve().then(() => executeIntegratedMissionWorkerTask(payload));
    }
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try {
        instance.postMessage({ id, payload });
      } catch (error) {
        pending.delete(id);
        // Si falla la clonación estructurada o el envío al Worker, recurro al cálculo local para no perder la operación.
        Promise.resolve().then(() => executeIntegratedMissionWorkerTask(payload)).then(resolve, reject);
      }
    });
  }

  // Cancelo todas las tareas pendientes marcando el error con `cancelled = true` y termino el Worker activo para cortar cómputo obsoleto.
  function cancelAll(reason = 'Cálculo cancelado por nuevas condiciones.') {
    if (pending.size > 0) {
      const err = new Error(reason);
      err.cancelled = true;
      for (const entry of pending.values()) entry.reject(err);
      pending.clear();
    }
    if (worker) {
      try { worker.terminate(); } catch { /* ignoro fallos al terminar el Worker */ }
      worker = null;
    }
  }

  return {
    runTask,
    cancelAll,
    dispose: () => cancelAll('Planificador cerrado.')
  };
}
