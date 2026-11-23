// PERF-03 — Cliente del Web Worker de cálculos astrodinámicos con cancelación y respaldo síncrono transparente.
// Si `Worker` está disponible en el entorno (navegador), delega el cálculo pesado al hilo secundario y permite
// interrumpirlo al instante cuando cambian las condiciones (GEN-02). En entornos sin `Worker` (p. ej. pruebas en Node),
// ejecuta exactamente la misma tarea de forma local.
import { executeIntegratedMissionWorkerTask } from './IntegratedMissionWorker.js';

export function createIntegratedMissionWorkerClient({
  createWorker = () => (typeof Worker === 'function'
    ? new Worker(new URL('./IntegratedMissionWorker.js', import.meta.url), { type: 'module' })
    : null)
} = {}) {
  let worker = null;
  let nextId = 1;
  const pending = new Map();

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
      try { worker.terminate(); } catch { /* ignorar */ }
      worker = null;
    });
    return worker;
  }

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
        // Si falla la clonación o el envío al Worker, respalda con ejecución local sin perder el cálculo.
        Promise.resolve().then(() => executeIntegratedMissionWorkerTask(payload)).then(resolve, reject);
      }
    });
  }

  function cancelAll(reason = 'Cálculo cancelado por nuevas condiciones.') {
    if (pending.size > 0) {
      const err = new Error(reason);
      err.cancelled = true;
      for (const entry of pending.values()) entry.reject(err);
      pending.clear();
    }
    if (worker) {
      try { worker.terminate(); } catch { /* ignorar */ }
      worker = null;
    }
  }

  return {
    runTask,
    cancelAll,
    dispose: () => cancelAll('Planificador cerrado.')
  };
}
