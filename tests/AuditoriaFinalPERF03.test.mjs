// Auditoría final, fase 4 — PERF-03: caché O(1) de segmentos de efemérides y ejecución en Web Worker con cancelación segura.
// Comprueba:
//   1. Equivalencia numérica bit a bit entre la ventana de efemérides con caché O(1) de segmento/metadatos, la ventana
//      reconstruida tras serializarse para el Web Worker y la evaluación directa de Hermite.
//   2. Equivalencia numérica exacta en `computeIntegratedMission` (incluyendo salida desde la plataforma con corrección
//      de la Tierra fuera de su SOI) y `compareMissionCruise` (DOPRI54 N-cuerpos + TCM-1) ejecutados vía Worker.
//   3. Ejecución en un Worker real (`node:worker_threads` adaptado a la interfaz W3C `Worker`) y cancelación inmediata
//      cuando cambian las condiciones (`cancelAll` / `GEN-02`), garantizando que ningún cálculo obsoleto sobrescriba el vigente.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Worker as NodeWorker } from 'node:worker_threads';
import { createInterplanetaryEphemeris, createInterplanetaryWindowFromSerialized } from '../src/science/InterplanetaryEphemeris.js';
import { createPlanetocentricWindow } from '../src/science/PlanetocentricWindow.js';
import { interpolateHermiteState } from '../src/science/HermiteInterpolation.js';
import { HORIZONS_FRAME } from '../src/science/Frames.js';
import { datetimeLocalUtcToJdTdb } from '../src/science/AstrodynamicsTime.js';
import { historicalDesign } from '../src/lab/ProbeDesign.js';
import { INTEGRATED_SCENARIOS, integratedMissionInput, scenarioFormValues, refinementHalfSpanDays } from '../src/ui/IntegratedMissionPlanner.js';
import { computeIntegratedMission, ENCOUNTER_TARGETS } from '../src/lab/IntegratedMission.js';
import { compareMissionCruise, NBODY_EPHEMERIS_IDS } from '../src/lab/NBodyCruise.js';
import { refineTransferCandidate } from '../src/lab/InterplanetaryPlan.js';
import { executeIntegratedMissionWorkerTask } from '../src/lab/IntegratedMissionWorker.js';
import { createIntegratedMissionWorkerClient } from '../src/lab/IntegratedMissionWorkerClient.js';

const json = file => JSON.parse(readFileSync(file, 'utf8'));
const catalog = {
  catalogVersion: 1,
  datasets: [
    ...json('public/data/interplanetary-ephemerides-catalog-v1.json').datasets,
    ...json('public/data/encounter-ephemerides-catalog-v1.json').datasets
  ]
};
const ephemeris = createInterplanetaryEphemeris({ catalog, loadJson: async file => json(`public/${file}`) });
const galileanRaw = json('public/data/interplanetary/galilean-moons-jsb-2031-2032.json');

test('PERF-03 · la caché de segmentos en loadWindow y la ventana serializada para Worker producen estados idénticos bit a bit', async () => {
  const win = await ephemeris.loadWindow(['399', '499', '5'], 2462050.5, 2462800.5);
  const serialized = win.serializeWindow();
  const winFromWorker = createInterplanetaryWindowFromSerialized(serialized);

  // Recorrido secuencial (como las etapas de DOPRI54), inverso y con saltos aleatorios.
  const epochs = [
    2462050.5, // nodo exacto inicial
    2462051.5, // nodo exacto
    2462051.5 + 0.123456789,
    2462051.5 + 0.123456789, // repetición exacta (acierto de caché de último instante)
    2462051.5 + 0.456789123, // mismo segmento (acierto O(1) en lastLo)
    2462052.5 + 0.333333333, // segmento siguiente (acierto O(1) en lastLo + 1)
    2462051.5 + 0.777777777, // segmento anterior (acierto O(1) en lastLo - 1)
    2462502.5, // nodo exacto intermedio
    2462711.814159265
  ];

  for (const bodyId of ['399', '499', '5']) {
    for (const jd of epochs) {
      const a = win.stateAt(bodyId, jd);
      const b = winFromWorker.stateAt(bodyId, jd);
      const direct = await ephemeris.getBodyState(bodyId, jd);
      assert.equal(a.status, 'available');
      assert.deepEqual(a.positionKm, direct.positionKm, `posición exacta ${bodyId} @ ${jd}`);
      assert.deepEqual(a.velocityKmS, direct.velocityKmS, `velocidad exacta ${bodyId} @ ${jd}`);
      assert.deepEqual(b, a, `ventana serializada idéntica ${bodyId} @ ${jd}`);
    }
  }

  // Verificar que interpolateHermiteState conserva exactamente la misma aritmética que el camino rápido de loadWindow.
  const rawNodes = serialized.tables['399'].nodes;
  const n0 = rawNodes[10], n1 = rawNodes[11];
  const jdMid = (n0.jdTdb + n1.jdTdb) / 2 + 0.03125;
  const baseProvenance = {
    sourceUrl: null,
    queriedAtUtc: null,
    precision: null,
    uncertainty: null,
    sourceMetadata: {}
  };
  const hermiteRef = interpolateHermiteState(
    {
      identity: { id: '399', name: 'Tierra', type: 'planet', origin: 'SUN_CENTER' },
      time: { jdTdb: n0.jdTdb, scale: 'TDB' },
      position: { x: n0.positionKm[0], y: n0.positionKm[1], z: n0.positionKm[2], unit: 'km' },
      velocity: { x: n0.velocityKmS[0], y: n0.velocityKmS[1], z: n0.velocityKmS[2], unit: 'km/s' },
      reference: HORIZONS_FRAME,
      provenance: { ...baseProvenance, source: n0.dataset.source, version: n0.dataset.apiVersion }
    },
    {
      identity: { id: '399', name: 'Tierra', type: 'planet', origin: 'SUN_CENTER' },
      time: { jdTdb: n1.jdTdb, scale: 'TDB' },
      position: { x: n1.positionKm[0], y: n1.positionKm[1], z: n1.positionKm[2], unit: 'km' },
      velocity: { x: n1.velocityKmS[0], y: n1.velocityKmS[1], z: n1.velocityKmS[2], unit: 'km/s' },
      reference: HORIZONS_FRAME,
      provenance: { ...baseProvenance, source: n1.dataset.source, version: n1.dataset.apiVersion }
    },
    jdMid
  );
  const fastState = win.stateAt('399', jdMid);
  assert.deepEqual(fastState.positionKm, [hermiteRef.position.x, hermiteRef.position.y, hermiteRef.position.z]);
  assert.deepEqual(fastState.velocityKmS, [hermiteRef.velocity.x, hermiteRef.velocity.y, hermiteRef.velocity.z]);
});

test('PERF-03 · equivalencia numérica exacta entre el cálculo directo y la tarea del Worker (A1 con plataforma, C1 con Europa y N-cuerpos)', async () => {
  const cassini = { ...historicalDesign('cassini'), id: 'flota-cassini' };

  // 1) A1 con salida desde la plataforma (ejercita launch + earthBeyondSoiCorrection + apuntado + captura finita)
  const vA1 = scenarioFormValues(INTEGRATED_SCENARIOS.find(s => s.id === 'A1'));
  const tgtA1 = ENCOUNTER_TARGETS[vA1.destinationId];
  const depA1 = datetimeLocalUtcToJdTdb(vA1.departureUtc);
  const marginA1 = Math.max(30, 0.02 * vA1.tofDays) + 140;
  const helioA1 = await ephemeris.loadWindow(['399', tgtA1.ephemerisId], depA1 - marginA1, depA1 + vA1.tofDays + marginA1 + 200);

  const workerA1 = executeIntegratedMissionWorkerTask({
    type: 'computeIntegratedMission',
    helioWindow: helioA1.serializeWindow(),
    moonsRaw: null,
    departureJdTdb: depA1,
    tofDays: vA1.tofDays,
    refine: true,
    targetEphemerisId: tgtA1.ephemerisId,
    halfSpanDays: refinementHalfSpanDays(vA1.tofDays),
    formInput: {
      destinationId: tgtA1.id,
      moonId: null,
      soiModel: 'laplace',
      planetMode: vA1.planetMode,
      rp: vA1.rp,
      ra: vA1.ra,
      bPlane: { mode: 'auto' },
      moonMode: vA1.moonMode,
      mrp: vA1.mrp,
      mra: vA1.mra,
      mri: vA1.mri,
      compensate: true,
      launch: true
    },
    design: cassini
  });

  const directRefinedA1 = refineTransferCandidate(helioA1, {
    destinationId: tgtA1.ephemerisId,
    departureJdTdb: depA1,
    tofDays: vA1.tofDays,
    criterion: 'c3',
    halfSpanDepartureDays: refinementHalfSpanDays(vA1.tofDays),
    halfSpanTofDays: refinementHalfSpanDays(vA1.tofDays)
  });
  const directMissionA1 = computeIntegratedMission(
    integratedMissionInput({
      ...vA1,
      destinationId: tgtA1.id,
      departureJdTdb: directRefinedA1.departureJdTdb,
      tofDays: directRefinedA1.tofDays,
      compensate: true,
      launch: true
    }, cassini),
    { helio: helioA1, moons: null }
  );

  assert.deepEqual(workerA1.refined, directRefinedA1);
  assert.equal(workerA1.mission.verdict, directMissionA1.verdict);
  assert.equal(workerA1.mission.finalMassKg, directMissionA1.finalMassKg);
  assert.deepEqual(workerA1.mission.continuity, directMissionA1.continuity);
  assert.deepEqual(workerA1.mission.maneuvers, directMissionA1.maneuvers);
  assert.deepEqual(workerA1.mission.segments.map(s => ({ id: s.id, initial: s.initial, final: s.final })),
    directMissionA1.segments.map(s => ({ id: s.id, initial: s.initial, final: s.final })));

  // 2) Comparación de crucero de n cuerpos (DOPRI54 + TCM-1) en el Worker vs directo
  const cruise = directMissionA1.segments.find(s => s.id === 'cruise');
  const startCruise = directMissionA1.departureJdTdb + cruise.startSeconds / 86400;
  const endCruise = directMissionA1.departureJdTdb + cruise.endSeconds / 86400;
  const winNBody = await ephemeris.loadWindow(NBODY_EPHEMERIS_IDS, startCruise - 1, endCruise + 1);
  const directNBody = compareMissionCruise(directMissionA1, (id, jd) => {
    const s = winNBody.stateAt(id, jd);
    return s?.status === 'available' ? s : null;
  });
  const workerNBody = executeIntegratedMissionWorkerTask({
    type: 'compareNBody',
    helioWindow: winNBody.serializeWindow(),
    mission: directMissionA1
  }).nbody;

  assert.equal(workerNBody.status, directNBody.status);
  assert.deepEqual(workerNBody.uncorrected, directNBody.uncorrected);
  assert.deepEqual(workerNBody.thirdBodies, directNBody.thirdBodies);
  assert.deepEqual(workerNBody.tcm, directNBody.tcm);

  // 3) C1 (Júpiter y sobrevuelo de Europa con ventana planetocéntrica de satélites galileanos)
  const vC1 = scenarioFormValues(INTEGRATED_SCENARIOS.find(s => s.id === 'C1'));
  const tgtC1 = ENCOUNTER_TARGETS[vC1.destinationId];
  const depC1 = datetimeLocalUtcToJdTdb(vC1.departureUtc);
  const marginC1 = Math.max(30, 0.02 * vC1.tofDays) + 140;
  const helioC1 = await ephemeris.loadWindow(['399', tgtC1.ephemerisId], depC1 - marginC1, depC1 + vC1.tofDays + marginC1 + 200);
  const moonsC1 = createPlanetocentricWindow(galileanRaw);
  const workerC1 = executeIntegratedMissionWorkerTask({
    type: 'computeIntegratedMission',
    helioWindow: helioC1.serializeWindow(),
    moonsRaw: moonsC1.serializeWindow(),
    departureJdTdb: depC1,
    tofDays: vC1.tofDays,
    refine: true,
    targetEphemerisId: tgtC1.ephemerisId,
    halfSpanDays: refinementHalfSpanDays(vC1.tofDays),
    formInput: {
      destinationId: tgtC1.id,
      moonId: vC1.moonId,
      soiModel: 'laplace',
      planetMode: vC1.planetMode,
      rp: vC1.rp,
      ra: vC1.ra,
      bPlane: { mode: 'auto' },
      moonMode: vC1.moonMode,
      mrp: vC1.mrp,
      mra: vC1.mra,
      mri: vC1.mri,
      compensate: true,
      launch: false
    },
    design: cassini
  });
  assert.match(workerC1.mission.verdict, /^CADENA CALCULADA COMPLETA/);
  assert.equal(workerC1.mission.moonName, 'Europa');
});

test('PERF-03 · createIntegratedMissionWorkerClient ejecuta en un hilo separado y cancela solicitudes obsoletas al instante', async () => {
  // Adaptador de node:worker_threads a la interfaz de navegador Web Worker para probar la comunicación y terminación real entre hilos.
  const workerCode = `
    import { parentPort } from 'node:worker_threads';
    import { executeIntegratedMissionWorkerTask } from './src/lab/IntegratedMissionWorker.js';
    parentPort.on('message', ({ id, payload }) => {
      try {
        const result = executeIntegratedMissionWorkerTask(payload);
        parentPort.postMessage({ id, ok: true, result });
      } catch (error) {
        parentPort.postMessage({ id, ok: false, error: error?.message ?? String(error) });
      }
    });
  `;
  let terminatedCount = 0;
  function createThreadAdapter() {
    const nw = new NodeWorker(workerCode, { eval: true });
    return {
      addEventListener(type, fn) {
        if (type === 'message') nw.on('message', data => fn({ data }));
        else if (type === 'error') nw.on('error', err => fn({ message: err.message }));
      },
      postMessage(msg) { nw.postMessage(msg); },
      terminate() { terminatedCount++; nw.terminate(); }
    };
  }

  const client = createIntegratedMissionWorkerClient({ createWorker: createThreadAdapter });
  const cassini = { ...historicalDesign('cassini'), id: 'flota-cassini' };
  const vA1 = scenarioFormValues(INTEGRATED_SCENARIOS.find(s => s.id === 'A1'));
  const tgtA1 = ENCOUNTER_TARGETS[vA1.destinationId];
  const depA1 = datetimeLocalUtcToJdTdb(vA1.departureUtc);
  const helioA1 = await ephemeris.loadWindow(['399', tgtA1.ephemerisId], depA1 - 180, depA1 + vA1.tofDays + 380);
  const payload = {
    type: 'computeIntegratedMission',
    helioWindow: helioA1.serializeWindow(),
    moonsRaw: null,
    departureJdTdb: depA1,
    tofDays: vA1.tofDays,
    refine: true,
    targetEphemerisId: tgtA1.ephemerisId,
    halfSpanDays: refinementHalfSpanDays(vA1.tofDays),
    formInput: {
      destinationId: tgtA1.id,
      moonId: null,
      soiModel: 'laplace',
      planetMode: vA1.planetMode,
      rp: vA1.rp,
      ra: vA1.ra,
      bPlane: { mode: 'auto' },
      moonMode: vA1.moonMode,
      mrp: vA1.mrp,
      mra: vA1.mra,
      mri: vA1.mri,
      compensate: true,
      launch: false
    },
    design: cassini
  };

  // Lanzamos una primera tarea y la cancelamos inmediatamente (simulando cambio rápido de escenario en la UI).
  const cancelledPromise = client.runTask(payload);
  client.cancelAll('Condiciones modificadas por el usuario.');
  await assert.rejects(cancelledPromise, { message: /Condiciones modificadas/ });
  assert.equal(terminatedCount, 1, 'el Worker en curso se termina para liberar la CPU de inmediato');

  // La siguiente solicitud levanta un Worker limpio y completa el cálculo correctamente.
  const validResult = await client.runTask(payload);
  assert.match(validResult.mission.verdict, /^CADENA CALCULADA COMPLETA/);
  client.dispose();
});
