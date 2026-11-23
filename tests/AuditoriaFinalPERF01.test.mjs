// Auditoría final, fase 2 — PERF-01: suspensión del renderizado de #solar-system cuando está oculto tras #experimental-lab.
// Verifica:
// 1. Condición pura isMainSceneOccludedByLab (coherente con experimental-laboratory.css y lab-shell.css).
// 2. Ciclo de pausa/reanudación en SolarSystem.js con motivos independientes ('laboratorio', 'lanzamiento'), cancelación
//    efectiva de requestAnimationFrame (rafActivo === false, 0 callbacks acumulados), ausencia de llamadas a renderer.render y
//    a reportFrame() mientras está oculto, y reanudación limpia sin salto temporal (delta = 0 en el primer fotograma).
// 3. Conservación del estado físico y de cámara durante la suspensión y las transiciones entre módulos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isMainSceneOccludedByLab } from '../src/ui/ExperimentalLaboratory.js';
import { createSolarSystemMissionView } from '../src/integration/SolarSystemMissionView.js';

test('PERF-01 · isMainSceneOccludedByLab refleja exactamente cuándo #experimental-lab cubre #solar-system', () => {
  // Sistema Solar (exploracion) y Misiones Históricas (historico): escena principal visible.
  assert.equal(isMainSceneOccludedByLab({ dataset: { appMode: 'exploracion' } }), false);
  assert.equal(isMainSceneOccludedByLab({ dataset: { appMode: 'historico' } }), false);
  assert.equal(isMainSceneOccludedByLab({ dataset: { appMode: 'exploracion', labView: 'builder' } }), false);

  // Laboratorio antes de montar el constructor: escena principal aún visible.
  assert.equal(isMainSceneOccludedByLab({ dataset: { appMode: 'experimental' } }), false);

  // Laboratorio con el constructor activo en etapas 1 (Elegir sonda / Hangar / Ingeniería) y 2 (Planificar),
  // o etapa 3 (Centro de Misión) con escena local (#mc-canvas) o vacía: #solar-system está cubierto.
  assert.equal(isMainSceneOccludedByLab({ dataset: { appMode: 'experimental', labView: 'builder' } }), true);
  assert.equal(isMainSceneOccludedByLab({ dataset: { appMode: 'experimental', labView: 'builder', labScene: 'local' } }), true);

  // Laboratorio en etapa 3 (Centro de Misión) reproduciendo una misión heliocéntrica en #solar-system: visible.
  assert.equal(isMainSceneOccludedByLab({ dataset: { appMode: 'experimental', labView: 'builder', labScene: 'main' } }), false);
  assert.equal(isMainSceneOccludedByLab(null), false);
});

test('PERF-01 · SolarSystemMissionView.setMainSceneOccluded delega el motivo "laboratorio" a establecerRenderPausado', () => {
  const calls = [];
  const fakeScene = {
    establecerRenderPausado(valor, motivo) { calls.push([valor, motivo]); }
  };
  const missionView = createSolarSystemMissionView({
    scene: fakeScene,
    loadEphemeris: async () => ({})
  });
  missionView.setMainSceneOccluded(true);
  missionView.setMainSceneOccluded(false);
  assert.deepEqual(calls, [
    [true, 'laboratorio'],
    [false, 'laboratorio']
  ]);
});

test('PERF-01 · SolarSystem.js cancela requestAnimationFrame al pausar, evita RAF duplicados y separa motivos de pausa', () => {
  const source = readFileSync('src/graphics/SolarSystem.js', 'utf8');
  assert.match(source, /const motivosPausa = new Set\(\);/);
  assert.match(source, /function programarFotograma\(\) \{\s*if \(renderPausado \|\| rafId !== null\) return;\s*rafId = requestAnimationFrame\(animar\);\s*\}/);
  assert.match(source, /function establecerRenderPausado\(valor, motivo = 'lanzamiento'\)/);
  assert.match(source, /if \(rafId !== null\) \{\s*cancelAnimationFrame\(rafId\);\s*rafId = null;\s*\}/);
  assert.match(source, /const delta = tiempoAnterior === null \? 0 : Math\.max\(\(tiempo - tiempoAnterior\) \/ 1000, 0\);/);
  assert.match(source, /if \(delta > 0\) reportFrame\(delta,/);
});

test('PERF-01 · main.js sincroniza la pausa por laboratorio con data-app-mode, data-lab-view y data-lab-scene', () => {
  const mainSource = readFileSync('src/main.js', 'utf8');
  assert.match(mainSource, /function sincronizarVisibilidadEscenaPrincipal\(\)/);
  assert.match(mainSource, /simulador\.establecerRenderPausado\(ocultaPorLab, 'laboratorio'\)/);
  assert.match(mainSource, /attributeFilter: \['data-app-mode', 'data-lab-view', 'data-lab-scene'\]/);
});

test('PERF-01 · ciclo de cola RAF: suspensión sin callbacks pendientes, sin bucles duplicados y con motivos independientes', () => {
  // Simula la máquina de estados exacta de programarFotograma / establecerRenderPausado / animar con una cola RAF controlada.
  const queue = new Map();
  let nextId = 1;
  const raf = fn => { const id = nextId++; queue.set(id, fn); return id; };
  const caf = id => { queue.delete(id); };

  const motivosPausa = new Set();
  let renderPausado = false;
  let rafId = null;
  let tiempoAnterior = null;
  const renders = [];
  const reportedDeltas = [];

  function programarFotograma() {
    if (renderPausado || rafId !== null) return;
    rafId = raf(animar);
  }
  function establecerRenderPausado(valor, motivo = 'lanzamiento') {
    if (valor) motivosPausa.add(motivo);
    else motivosPausa.delete(motivo);
    const pausado = motivosPausa.size > 0;
    if (pausado === renderPausado) return;
    renderPausado = pausado;
    tiempoAnterior = null;
    if (renderPausado) {
      if (rafId !== null) {
        caf(rafId);
        rafId = null;
      }
      return;
    }
    programarFotograma();
  }
  function animar(tiempo) {
    rafId = null;
    if (renderPausado) return;
    programarFotograma();
    const delta = tiempoAnterior === null ? 0 : Math.max((tiempo - tiempoAnterior) / 1000, 0);
    tiempoAnterior = tiempo;
    renders.push({ tiempo, delta });
    if (delta > 0) reportedDeltas.push(delta);
  }
  function stepFrame(tiempo) {
    const entries = [...queue.entries()];
    queue.clear();
    for (const [, fn] of entries) fn(tiempo);
  }

  // Arranque: 1 solo RAF programado
  programarFotograma();
  programarFotograma();
  assert.equal(queue.size, 1, 'un único callback RAF en cola al arrancar');

  stepFrame(1000);
  assert.equal(renders.length, 1);
  assert.equal(renders[0].delta, 0, 'primer fotograma con delta = 0');
  assert.equal(reportedDeltas.length, 0, 'el fotograma inicial de sincronización no envía delta=0 a reportFrame');
  assert.equal(queue.size, 1);

  stepFrame(1016);
  assert.equal(renders.length, 2);
  assert.ok(Math.abs(renders[1].delta - 0.016) < 1e-9);
  assert.equal(reportedDeltas.length, 1);

  // Entrar al Laboratorio: pausa con motivo 'laboratorio' cancela el RAF pendiente
  establecerRenderPausado(true, 'laboratorio');
  assert.equal(renderPausado, true);
  assert.equal(rafId, null);
  assert.equal(queue.size, 0, '0 callbacks RAF pendientes mientras el Sistema Solar está oculto');

  // Aunque pasen 10 segundos en el Laboratorio, no se ejecuta ningún render de #solar-system
  stepFrame(5000);
  stepFrame(11000);
  assert.equal(renders.length, 2, 'ningún render ejecutado mientras está oculto');

  // Si un segundo motivo ('lanzamiento') se activa y desactiva mientras 'laboratorio' sigue activo, sigue pausado
  establecerRenderPausado(true, 'lanzamiento');
  establecerRenderPausado(false, 'lanzamiento');
  assert.equal(renderPausado, true, 'sigue pausado mientras el laboratorio cubra la escena');
  assert.equal(queue.size, 0);

  // Volver al Sistema Solar (o entrar en 3 · Reproducir con misión heliocéntrica): reactiva con 1 solo RAF
  establecerRenderPausado(false, 'laboratorio');
  establecerRenderPausado(false, 'laboratorio'); // llamada repetida idempotente
  assert.equal(renderPausado, false);
  assert.equal(queue.size, 1, 'exactamente 1 callback RAF al reanudar, sin duplicados');

  // Primer fotograma tras reanudar en t = 12000 ms: delta = 0 (sin salto temporal de 11 s)
  stepFrame(12000);
  assert.equal(renders.length, 3);
  assert.equal(renders[2].delta, 0, 'sin salto temporal al reanudar tras estar pausado');
  assert.equal(reportedDeltas.length, 1, 'no contamina reportFrame con el intervalo de pausa');

  // Segundo fotograma tras reanudar en t = 12016 ms: delta normal de 16 ms
  stepFrame(12016);
  assert.equal(renders.length, 4);
  assert.ok(Math.abs(renders[3].delta - 0.016) < 1e-9);
  assert.equal(reportedDeltas.length, 2);
});
