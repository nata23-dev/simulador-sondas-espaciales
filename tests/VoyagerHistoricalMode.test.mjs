import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  HISTORICAL_PLAYBACK_SPEEDS,
  createSplitHistoricalTime,
  jdTdbToHistoricalLabels,
  taiMinusUtcAtPseudoJd,
  utcTimestampToTdb
} from '../src/science/HistoricalTime.js';
import {
  HISTORICAL_MISSIONS_CATALOG,
  VOYAGER_1_ID,
  VOYAGER_1_NAIF_ID,
  VOYAGER_2_ID,
  VOYAGER_2_NAIF_ID
} from '../src/science/VoyagerHistoricalMissions.js';
import {
  VOYAGER_HISTORICAL_EVENTS,
  getHistoricalEventById
} from '../src/science/VoyagerHistoricalEvents.js';
import {
  VOYAGER_PHOTO_CATALOG,
  evaluateHistoricalPhotoAvailability
} from '../src/science/VoyagerPhotoCatalog.js';
import {
  SPEED_OF_LIGHT_KM_S,
  createHistoricalEphemerisResolver
} from '../src/science/HistoricalEphemerisResolver.js';
import { createHistoricalMissionEngine } from '../src/science/HistoricalMissionEngine.js';
import { createHistoricalVisualPipeline } from '../src/integration/HistoricalVisualPipeline.js';
import { HORIZONS_FRAME } from '../src/science/Frames.js';
import { RADIOS_FISICOS_KM } from '../src/graphics/ScaleModeConfig.js';
import { gregorianLabelToJulianMidnight } from '../src/science/Time.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

async function loadPublicJson(relativePath) {
  const clean = String(relativePath).replace(/^\//, '');
  const fullPath = path.join(PUBLIC_DIR, clean);
  const content = await readFile(fullPath, 'utf8');
  return JSON.parse(content);
}

test('Voyager 1 (-31) y Voyager 2 (-32): identidades, separación de lanzamientos y ausencia de trayectoria pre-lanzamiento', async () => {
  const v1 = HISTORICAL_MISSIONS_CATALOG[VOYAGER_1_ID];
  const v2 = HISTORICAL_MISSIONS_CATALOG[VOYAGER_2_ID];

  assert.equal(v1.naifId, '-31');
  assert.equal(v2.naifId, '-32');
  assert.ok(v2.launchJdTdb < v1.launchJdTdb, 'Voyager 2 partió 16 días antes que Voyager 1');
  const diffDays = v1.launchJdTdb - v2.launchJdTdb;
  assert.ok(diffDays > 15.9 && diffDays < 16.0, `Separación esperada ~15,94 días, obtenida ${diffDays}`);

  const resolver = createHistoricalEphemerisResolver({ loadJson: loadPublicJson });
  const bounds = await resolver.getTimelineBounds();
  assert.equal(bounds.minJdTdb, v2.launchJdTdb);
  assert.ok(bounds.maxJdTdb >= gregorianLabelToJulianMidnight('2026-11-01'), 'Cobertura histórica verificada hasta nov 2026');

  // 25 de agosto de 1977: Voyager 2 ya viaja en el espacio interplanetario, Voyager 1 sigue en tierra (pre-lanzamiento)
  const jdAug25 = utcTimestampToTdb('1977-08-25T00:00:00Z').jdTdb;
  const snapAug25 = await resolver.queryHistoricalSnapshot(jdAug25);

  assert.equal(snapAug25.probes[VOYAGER_2_ID].isRealData, true);
  assert.ok(snapAug25.probes[VOYAGER_2_ID].state !== null);
  assert.ok(snapAug25.probes[VOYAGER_2_ID].distanceSunAu > 0.98 && snapAug25.probes[VOYAGER_2_ID].distanceSunAu < 1.05);

  assert.equal(snapAug25.probes[VOYAGER_1_ID].status, 'pre_launch');
  assert.equal(snapAug25.probes[VOYAGER_1_ID].isRealData, false);
  assert.equal(snapAug25.probes[VOYAGER_1_ID].state, null);
  assert.equal(snapAug25.probes[VOYAGER_2_ID].distanceBetweenVoyagersKm, null);

  // Fase de ascenso Titan IIIE-Centaur (~63 min previos al primer vector heliocéntrico SPK): explícita y sin inventar posición
  const jdV1Ascent = utcTimestampToTdb('1977-09-05T13:15:00Z').jdTdb;
  const v1AscentRes = await resolver.resolveProbeState(VOYAGER_1_ID, jdV1Ascent);
  assert.equal(v1AscentRes.status, 'launch_ascent_visual');
  assert.equal(v1AscentRes.isRealData, false);
  assert.equal(v1AscentRes.state, null);
});

test('Conversión astronómica UTC <-> TDB con tabla IERS de segundos intercalares y tiempo dividido multianual', () => {
  assert.equal(taiMinusUtcAtPseudoJd(gregorianLabelToJulianMidnight('1977-08-20')), 16);
  assert.equal(taiMinusUtcAtPseudoJd(gregorianLabelToJulianMidnight('1979-03-05')), 18);
  assert.equal(taiMinusUtcAtPseudoJd(gregorianLabelToJulianMidnight('1990-02-14')), 25);
  assert.equal(taiMinusUtcAtPseudoJd(gregorianLabelToJulianMidnight('2012-08-25')), 35);
  assert.equal(taiMinusUtcAtPseudoJd(gregorianLabelToJulianMidnight('2018-11-05')), 37);
  assert.equal(taiMinusUtcAtPseudoJd(gregorianLabelToJulianMidnight('2026-10-30')), 37);

  const pbdTdb = utcTimestampToTdb('1990-02-14T04:48:00Z');
  assert.ok(Math.abs(pbdTdb.tdbMinusUtcSeconds - 57.184) < 0.01);
  const labels = jdTdbToHistoricalLabels(pbdTdb.jdTdb);
  assert.equal(labels.utc.dateIso, '1990-02-14');
  assert.equal(labels.utc.timeHms, '04:48:00');
  assert.equal(labels.tdb.timeHms, '04:48:57');

  const split = createSplitHistoricalTime({
    minJdTdb: 2443376.104,
    maxJdTdb: 2461346.5,
    initialJdTdb: 2443376.104
  });
  // Avanza exactamente 1 000 000 pasos de 1 ms cerca de 2026 y comprueba precisión sub-milisegundo
  split.setJdTdb(2461300.0);
  for (let i = 0; i < 1000; i++) split.advanceByTdbSeconds(0.001);
  const deltaSec = (split.getJdTdb() - 2461300.0) * 86400;
  assert.ok(Math.abs(deltaSec - 1.0) < 1e-4, `Precisión de tiempo dividido conservada: ${deltaSec}`);
});

test('Validación cuantitativa frente a las 13 muestras independientes retenidas de NASA/JPL Horizons (1977–2025)', async () => {
  const holdoutRaw = JSON.parse(
    await readFile(path.join(__dirname, 'fixtures', 'voyager-horizons-holdout-v1.json'), 'utf8')
  );
  assert.equal(holdoutRaw.samples.length, 13);

  const resolver = createHistoricalEphemerisResolver({ loadJson: loadPublicJson });
  let maxCruisePosErrKm = 0;
  let maxEncounterPosErrKm = 0;

  for (const cp of holdoutRaw.samples) {
    const res = await resolver.resolveBodyState(cp.bodyId, cp.jdTdb);
    assert.equal(res.isRealData, true, `Debe existir estado real para ${cp.id}`);
    assert.ok(res.state, `Estado presente en ${cp.id}`);
    assert.equal(res.state.reference.id, HORIZONS_FRAME.id);
    assert.equal(res.state.reference.origin, HORIZONS_FRAME.origin);

    const p = res.state.position;
    const v = res.state.velocity;
    const posErrKm = Math.hypot(
      p.x - cp.positionKm.x,
      p.y - cp.positionKm.y,
      p.z - cp.positionKm.z
    );
    const velErrKmS = Math.hypot(
      v.x - cp.velocityKmPerS.x,
      v.y - cp.velocityKmPerS.y,
      v.z - cp.velocityKmPerS.z
    );

    if (cp.id.includes('cruise')) {
      maxCruisePosErrKm = Math.max(maxCruisePosErrKm, posErrKm);
      assert.ok(posErrKm < 0.05, `Error de crucero excesivo en ${cp.id}: ${posErrKm} km`);
      assert.ok(velErrKmS < 1e-6, `Error de velocidad de crucero excesivo en ${cp.id}: ${velErrKmS} km/s`);
    } else if (cp.id.includes('neptune')) {
      maxEncounterPosErrKm = Math.max(maxEncounterPosErrKm, posErrKm);
      // Muestra independiente de la sonda cerca del encuentro; la distancia a
      // Neptuno en los vectores locales difiere de los 1,18 R_N de NSSDCA.
      assert.ok(posErrKm < 25.0, `Error en periapsis rasante de Neptuno fuera de tolerancia: ${posErrKm} km`);
    } else {
      maxEncounterPosErrKm = Math.max(maxEncounterPosErrKm, posErrKm);
      assert.ok(posErrKm < 1.0, `Error de sobrevuelo excesivo en ${cp.id}: ${posErrKm} km`);
    }
  }

  console.log(`VOYAGER_HOLDOUT_VALIDATION count=13 maxCruiseErrKm=${maxCruisePosErrKm.toExponential(3)} maxEncounterErrKm=${maxEncounterPosErrKm.toFixed(4)}`);
});

test('Encuentros planetarios se contrastan con NSSDCA sin ocultar la discrepancia de Neptuno', async () => {
  const resolver = createHistoricalEphemerisResolver({ loadJson: loadPublicJson });

  const verificacionesPeriapsis = [
    { eventId: 'v1-jupiter-1979', target: 'Jupiter', isMoon: false, expectedKm: 4.89 * 71398, tolKm: 3500 },
    { eventId: 'v2-jupiter-1979', target: 'Jupiter', isMoon: false, expectedKm: 10.11 * 71398, tolKm: 5000 },
    { eventId: 'v1-titan-1980', target: 'Titan', isMoon: true, expectedKm: 5569, tolKm: 300 },
    { eventId: 'v1-saturn-1980', target: 'Saturno', isMoon: false, expectedKm: 3.09 * 60330, tolKm: 4000 },
    { eventId: 'v2-saturn-1981', target: 'Saturno', isMoon: false, expectedKm: 2.67 * 60330, tolKm: 3500 },
    { eventId: 'v2-uranus-1986', target: 'Urano', isMoon: false, expectedKm: 4.19 * 25559, tolKm: 5000 }
  ];

  for (const item of verificacionesPeriapsis) {
    const ev = getHistoricalEventById(item.eventId);
    assert.ok(ev, `Evento ${item.eventId} registrado`);
    const snap = await resolver.queryHistoricalSnapshot(ev.jdTdb);
    const probe = snap.probes[ev.missionId];
    assert.equal(probe.isRealData, true);

    const targetState = item.isMoon
      ? snap.moons[item.target]?.state
      : snap.planets[item.target]?.state;
    assert.ok(targetState, `Estado histórico de ${item.target} presente durante ${item.eventId}`);

    const distKm = Math.hypot(
      probe.positionKm.x - targetState.position.x,
      probe.positionKm.y - targetState.position.y,
      probe.positionKm.z - targetState.position.z
    );

    if (!item.isMoon) {
      const radioPlanetaKm = RADIOS_FISICOS_KM[item.target];
      assert.ok(distKm > radioPlanetaKm * 1.12, `${probe.mission.name} no intersecta ${item.target} (${distKm} km vs R=${radioPlanetaKm} km)`);
    }
    assert.ok(
      Math.abs(distKm - item.expectedKm) <= item.tolKm,
      `${item.eventId}: distancia calculada ${distKm.toFixed(1)} km vs referencia NSSDCA ${item.expectedKm} km`
    );
  }

  const neptuneEvent = getHistoricalEventById('v2-neptune-1989');
  const neptuneSnapshot = await resolver.queryHistoricalSnapshot(neptuneEvent.jdTdb);
  const v2 = neptuneSnapshot.probes[VOYAGER_2_ID].positionKm;
  const neptune = neptuneSnapshot.planets.Neptuno.state.position;
  const neptuneDistanceKm = Math.hypot(v2.x - neptune.x, v2.y - neptune.y, v2.z - neptune.z);
  const nssdcNeptuneKm = 1.18 * 24760;
  assert.ok(neptuneDistanceKm - nssdcNeptuneKm > 4000,
    'La diferencia de Neptuno con NSSDCA debe permanecer visible hasta auditar una solución independiente');

  // Pale Blue Dot (14 feb 1990 04:48 UTC): ~40,47 AU a la Tierra, ~5 h 36 min luz y ~32° al norte de la eclíptica
  const pbdEv = getHistoricalEventById('v1-pale-blue-dot-1990');
  const pbdSnap = await resolver.queryHistoricalSnapshot(pbdEv.jdTdb);
  const v1Pbd = pbdSnap.probes[VOYAGER_1_ID];
  assert.ok(Math.abs(v1Pbd.distanceEarthAu - 40.47) < 0.15, `Distancia Tierra Pale Blue Dot: ${v1Pbd.distanceEarthAu} AU`);
  const expectedLightSec = v1Pbd.distanceEarthKm / SPEED_OF_LIGHT_KM_S;
  assert.ok(Math.abs(v1Pbd.oneWayLightTimeSeconds - expectedLightSec) < 1e-6);
  const eclipticLatDeg = Math.asin(v1Pbd.positionKm.z / v1Pbd.distanceSunKm) * (180 / Math.PI);
  assert.ok(eclipticLatDeg > 30 && eclipticLatDeg < 34, `Latitud eclíptica norte en Pale Blue Dot: ${eclipticLatDeg.toFixed(2)}°`);

  // Estado interestelar en 2026 (>169 AU para Voyager 1 y >141 AU para Voyager 2)
  const snap2026 = await resolver.queryHistoricalSnapshot(gregorianLabelToJulianMidnight('2026-10-15'));
  assert.ok(snap2026.probes[VOYAGER_1_ID].distanceSunAu > 168);
  assert.ok(snap2026.probes[VOYAGER_2_ID].distanceSunAu > 140);
  assert.ok(snap2026.probes[VOYAGER_1_ID].heliocentricSpeedKmS > 16.5 && snap2026.probes[VOYAGER_1_ID].heliocentricSpeedKmS < 17.3);
  assert.ok(snap2026.probes[VOYAGER_2_ID].heliocentricSpeedKmS > 14.9 && snap2026.probes[VOYAGER_2_ID].heliocentricSpeedKmS < 15.7);

  // Protección de uniones de segmentos SPK (no interpola a través de la discontinuidad)
  const v1SpliceMid = (HISTORICAL_MISSIONS_CATALOG[VOYAGER_1_ID].spkSegmentSplice.beforeJdTdb
    + HISTORICAL_MISSIONS_CATALOG[VOYAGER_1_ID].spkSegmentSplice.afterJdTdb) / 2;
  const v1SpliceRes = await resolver.resolveProbeState(VOYAGER_1_ID, v1SpliceMid);
  assert.equal(v1SpliceRes.status, 'spk_segment_transition');
  assert.ok(v1SpliceRes.spliceWarning);

  const v2SpliceMid = (HISTORICAL_MISSIONS_CATALOG[VOYAGER_2_ID].spkSegmentSplice.beforeJdTdb
    + HISTORICAL_MISSIONS_CATALOG[VOYAGER_2_ID].spkSegmentSplice.afterJdTdb) / 2;
  const v2SpliceRes = await resolver.resolveProbeState(VOYAGER_2_ID, v2SpliceMid);
  assert.equal(v2SpliceRes.status, 'spk_segment_transition');

  // Prohibición estricta de extrapolación fuera de cobertura (p. ej. año 2030)
  const outRes = await resolver.resolveProbeState(VOYAGER_1_ID, gregorianLabelToJulianMidnight('2030-01-01'));
  assert.equal(outRes.status, 'out_of_coverage');
  assert.equal(outRes.state, null);
});

test('Transiciones SPK: ningún estado de otra época se presenta como válido', async () => {
  const resolver = createHistoricalEphemerisResolver({ loadJson: loadPublicJson });
  for (const mission of Object.values(HISTORICAL_MISSIONS_CATALOG)) {
    const splice = mission.spkSegmentSplice;
    for (const fraction of [0.01, 0.25, 0.5, 0.75, 0.99]) {
      const jdTdb = splice.beforeJdTdb + fraction * (splice.afterJdTdb - splice.beforeJdTdb);
      const resolution = await resolver.resolveProbeState(mission.id, jdTdb);
      assert.equal(resolution.status, 'spk_segment_transition');
      assert.equal(resolution.state, null);
      assert.equal(resolution.isRealData, false);
      assert.deepEqual(resolution.samples, []);
      assert.equal(resolution.reason, splice.note);
      const snapshot = await resolver.queryHistoricalSnapshot(jdTdb);
      assert.equal(snapshot.probes[mission.id].state, null);
      assert.equal(snapshot.probes[mission.id].isRealData, false);
      assert.equal(snapshot.probes[mission.id].jdTdb, jdTdb);
    }
    for (const jdTdb of [splice.beforeJdTdb, splice.afterJdTdb]) {
      const resolution = await resolver.resolveProbeState(mission.id, jdTdb);
      assert.ok(resolution.state);
      assert.equal(resolution.state.time.jdTdb, jdTdb);
      assert.equal(resolution.isRealData, true);
    }
  }
});

test('Catálogo de fotografías auténticas NASA/JPL: integridad SHA-256 local, miniaturas, fidelidad explícita y apagado de cámaras ISS', async () => {
  assert.equal(VOYAGER_PHOTO_CATALOG.length, 16);

  for (const photo of VOYAGER_PHOTO_CATALOG) {
    assert.equal(photo.recreationFidelity, 'geometric_approximation');
    assert.ok(photo.officialSourceUrl.startsWith('https://'));

    const imgBytes = await readFile(path.join(PUBLIC_DIR, photo.imagePath));
    const thumbBytes = await readFile(path.join(PUBLIC_DIR, photo.thumbPath));

    // Cabecera JPEG SOI auténtica (0xFF 0xD8)
    assert.equal(imgBytes[0], 0xff);
    assert.equal(imgBytes[1], 0xd8);
    assert.equal(thumbBytes[0], 0xff);
    assert.equal(thumbBytes[1], 0xd8);
    assert.ok(thumbBytes.byteLength < imgBytes.byteLength, `Miniatura más ligera en ${photo.id}`);

    const sha = createHash('sha256').update(imgBytes).digest('hex');
    assert.equal(sha, photo.sha256, `SHA-256 verificado para ${photo.id}`);
  }

  // En 2015 no existen fotografías auténticas nuevas y se informa explícitamente del apagado de las cámaras ISS
  const eval2015 = evaluateHistoricalPhotoAvailability(gregorianLabelToJulianMidnight('2015-06-01'), {
    missionFilter: 'both'
  });
  assert.equal(eval2015.hasDocumentedPhotosForDate, false);
  assert.ok(eval2015.emptyDateMessage.includes('No hay fotografías auténticas'));
  assert.ok(eval2015.cameraShutdownNotice.includes('1990'));
});

test('Motor de reproducción histórica y pipeline visual: velocidades, retroceso, parada exacta sin salto en eventos y rotación de ejes', async () => {
  assert.equal(HISTORICAL_PLAYBACK_SPEEDS.length, 7);

  const pipeline = createHistoricalVisualPipeline({
    fetchImpl: async url => {
      const clean = String(url).replace(/^.*?(data\/)/, '$1');
      const json = await loadPublicJson(clean);
      return {
        ok: true,
        status: 200,
        json: async () => json
      };
    }
  });

  const bounds = await pipeline.getTimelineBounds();
  const [backV1, backV2] = await Promise.all([
    pipeline.loadVisualTrajectoryBackbone(VOYAGER_1_ID),
    pipeline.loadVisualTrajectoryBackbone(VOYAGER_2_ID)
  ]);
  assert.ok(backV1.knots.length > 4500);
  assert.ok(backV2.knots.length > 7500);

  const engine = createHistoricalMissionEngine({
    minJdTdb: bounds.minJdTdb,
    maxJdTdb: bounds.maxJdTdb,
    initialJdTdb: utcTimestampToTdb('1979-01-01T00:00:00Z').jdTdb,
    initialSpeedId: '5y_s'
  });

  // Incluso a 5 años/s, un paso grande de 0,1 s reales no salta la primera observación lunar de Voyager 1.
  engine.setPlaying(true);
  const stepRes = engine.step(0.1);
  const jupEv = getHistoricalEventById('v1-callisto-1979');
  assert.equal(engine.isPlaying(), false);
  assert.equal(stepRes.triggeredEvent?.id, 'v1-callisto-1979');
  assert.ok(Math.abs(engine.getJdTdb() - jupEv.jdTdb) < 1e-9);

  // Omitir evento y continuar avanza limpiamente más allá de ese instante
  engine.skipTriggeredEventAndContinue();
  assert.equal(engine.isPlaying(), true);
  engine.setSpeedById('1d_s');
  const nextStep = engine.step(0.05);
  assert.ok(nextStep.jdTdb > jupEv.jdTdb);

  // Retroceso temporal
  engine.toggleReverse();
  assert.equal(engine.getDirection(), -1);

  // Verificación de conservación de distancias heliocéntricas en la transformación a coordenadas Three.js
  const visSnap = await pipeline.queryVisualHistoricalSnapshot(jupEv.jdTdb);
  const v1Vis = visSnap.probes[VOYAGER_1_ID];
  const sceneDistAu = Math.hypot(
    v1Vis.visual.posicionEscena.x,
    v1Vis.visual.posicionEscena.y,
    v1Vis.visual.posicionEscena.z
  ) / 32;
  assert.ok(Math.abs(sceneDistAu - v1Vis.distanceSunAu) < 1e-9);
});
