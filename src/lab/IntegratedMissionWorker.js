// PERF-03 — Web Worker de cálculo astrodinámico pesado (misiones integradas, refinamiento de oportunidad y crucero de n cuerpos).
// Ejecuta exactamente las mismas funciones científicas puras que el hilo principal, sin modificar constantes, tolerancias ni modelos.
import { createInterplanetaryWindowFromSerialized } from '../science/InterplanetaryEphemeris.js';
import { createPlanetocentricWindow } from '../science/PlanetocentricWindow.js';
import { refineTransferCandidate } from './InterplanetaryPlan.js';
import { computeIntegratedMission } from './IntegratedMission.js';
import { compareMissionCruise } from './NBodyCruise.js';
import { integratedMissionInput } from '../ui/IntegratedMissionPlanner.js';

export function executeIntegratedMissionWorkerTask(payload) {
  if (payload?.type === 'computeIntegratedMission') {
    const helio = createInterplanetaryWindowFromSerialized(payload.helioWindow);
    const moons = payload.moonsRaw ? createPlanetocentricWindow(payload.moonsRaw) : null;
    let departureJdTdb = payload.departureJdTdb;
    let tofDays = payload.tofDays;
    let refined = null;
    if (payload.refine) {
      refined = refineTransferCandidate(helio, {
        destinationId: payload.targetEphemerisId,
        departureJdTdb,
        tofDays,
        criterion: 'c3',
        halfSpanDepartureDays: payload.halfSpanDays,
        halfSpanTofDays: payload.halfSpanDays
      });
      if (Number.isFinite(refined.score)) {
        departureJdTdb = refined.departureJdTdb;
        tofDays = refined.tofDays;
      }
    }
    const input = integratedMissionInput({
      ...payload.formInput,
      departureJdTdb,
      tofDays
    }, payload.design);
    const mission = computeIntegratedMission(input, { helio, moons });
    return { refined, mission };
  }
  if (payload?.type === 'compareNBody') {
    const win = createInterplanetaryWindowFromSerialized(payload.helioWindow);
    const nbody = compareMissionCruise(payload.mission, (id, jd) => {
      const s = win.stateAt(id, jd);
      return s?.status === 'available' ? s : null;
    });
    return { nbody };
  }
  throw new TypeError(`Tarea de Worker desconocida: ${String(payload?.type)}`);
}

if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  self.addEventListener('message', event => {
    const { id, payload } = event.data ?? {};
    try {
      const result = executeIntegratedMissionWorkerTask(payload);
      self.postMessage({ id, ok: true, result });
    } catch (error) {
      self.postMessage({ id, ok: false, error: error?.message ?? String(error) });
    }
  });
}
