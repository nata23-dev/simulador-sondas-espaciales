import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistoricalComparatorSession } from '../src/integration/HistoricalComparatorSession.js';

test('el comparador no restaura un snapshot anterior tras saltar a la foto de Ío', async () => {
  const engineState = { jdTdb: 2443941.0005808505, selectedProbeId: 'voyager-1' };
  const stale = { jdTdb: 2443376.103472, timeLabels: { labelUtc: '1977-08-20 · 14:29:00 UTC' } };
  const fresh = { jdTdb: engineState.jdTdb, timeLabels: { labelUtc: '1979-03-08 · 12:00:00 UTC' } };
  const calls = [];
  const session = createHistoricalComparatorSession({
    engineState, snapshot: stale,
    querySnapshot: async jdTdb => { calls.push(jdTdb); return fresh; }
  });
  assert.equal(session.snapshot, null);
  assert.deepEqual(calls, []);
  assert.equal(await session.snapshotPromise, fresh);
  assert.equal(session.snapshot, fresh);
  assert.deepEqual(calls, [engineState.jdTdb]);
  assert.equal(session.motor.selectedProbeId, 'voyager-1');
});

test('una fecha sincronizada conserva el snapshot sin consulta adicional', () => {
  const snapshot = { jdTdb: 2443941.0005808505 };
  const session = createHistoricalComparatorSession({
    engineState: { jdTdb: snapshot.jdTdb }, snapshot,
    querySnapshot: () => { throw new Error('No debe consultarse'); }
  });
  assert.equal(session.snapshot, snapshot);
  assert.equal(session.snapshotPromise, null);
});

test('una respuesta de consulta con otra época no se vuelve restaurable', async () => {
  const session = createHistoricalComparatorSession({
    engineState: { jdTdb: 2443941 }, snapshot: { jdTdb: 2443376 },
    querySnapshot: async () => ({ jdTdb: 2443942 })
  });
  await assert.rejects(session.snapshotPromise, /fecha distinta del motor/);
  assert.equal(session.snapshot, null);
});
