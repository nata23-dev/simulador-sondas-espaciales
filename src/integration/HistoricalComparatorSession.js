/**
 * En este módulo encapsulo la captura de sesión previa al abrir el comparador
 * fotográfico del Modo Histórico. Como el motor temporal puede haber avanzado
 * su fecha juliana (JD TDB) antes de que termine la última consulta visual,
 * garantizo aquí que la instantánea restaurable pertenezca exactamente al mismo
 * instante que el estado guardado del motor.
 */

// Construyo una sesión restaurable y, si la instantánea actual no coincide con el JD TDB del motor, solicito una fresca.
export function createHistoricalComparatorSession({ engineState, snapshot, querySnapshot }) {
  const session = {
    motor: engineState,
    snapshot: Math.abs(snapshot.jdTdb - engineState.jdTdb) < 1e-9 ? snapshot : null,
    snapshotPromise: null
  };
  // Si detecto desfase temporal entre el motor y la instantánea recibida, consulto de forma asíncrona la fecha exacta.
  if (!session.snapshot) {
    session.snapshotPromise = Promise.resolve()
      .then(() => querySnapshot(engineState.jdTdb))
      .then(fresh => {
        if (Math.abs(fresh.jdTdb - engineState.jdTdb) >= 1e-9) {
          throw new Error('La consulta del recorrido devolvió una fecha distinta del motor');
        }
        session.snapshot = fresh;
        return fresh;
      });
  }
  return session;
}
