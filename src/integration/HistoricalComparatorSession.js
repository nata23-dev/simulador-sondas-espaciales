// El motor puede adelantar su JD antes de que finalice la consulta visual.
// La sesión restaurable siempre debe pertenecer al mismo instante que el motor.
export function createHistoricalComparatorSession({ engineState, snapshot, querySnapshot }) {
  const session = {
    motor: engineState,
    snapshot: Math.abs(snapshot.jdTdb - engineState.jdTdb) < 1e-9 ? snapshot : null,
    snapshotPromise: null
  };
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
