// Etapa 27 · Rendimiento adaptativo: detección del procesador gráfico, perfil inicial del modo automático, resolución dinámica
// con límite por CPU medido, nivel de detalle del lanzamiento 3D, opciones del renderizador y estado separado por escena.
// Lógica pura (sin WebGL): los equipos se simulan con un modelo de coste por fotograma.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.devicePixelRatio = 2; // antes del primer uso: el perfil automático del equipo se calcula una vez
const Q = await import('../src/graphics/QualityProfile.js');
const { clasificarRenderizador, nombreLegible, perfilInicialAuto, detalleInferior, createResolutionController, opcionesRenderizador, setQualityProfile,
  setGpuPreference, registerRenderer, reportFrame, getQualityState, onQualityChange, suspenderAdaptacion, textoEstadoCalidad, textoEstadoGpu, QUALITY_PROFILES } = Q;
const { ajustesLanzamiento, archivoGlobo, RECURSOS_LANZAMIENTO } = await import('../src/launch/LaunchWorld.js');

test('27 · clase del procesador gráfico a partir del nombre de WebGL', () => {
  const casos = [
    ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', 'software'],
    ['llvmpipe (LLVM 15.0.7, 256 bits)', 'software'],
    ['ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)', 'software'],
    ['Adreno (TM) 740', 'movil'], ['Mali-G78 MP14', 'movil'], ['Apple A15 GPU', 'movil'],
    ['ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 'integrada'],
    ['ANGLE (AMD, AMD Radeon 780M Graphics (0x000015BF) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'integrada'],
    ['ANGLE (AMD, AMD Radeon RX 6650 XT (0x000073EF) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'dedicada'],
    ['ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002503) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'dedicada'],
    ['ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'integrada'],
    ['Apple M2', 'integrada'], ['', 'desconocida'], [null, 'desconocida']
  ];
  for (const [nombre, clase] of casos) assert.equal(clasificarRenderizador(nombre), clase, String(nombre));
  assert.equal(nombreLegible('ANGLE (AMD, AMD Radeon RX 6650 XT (0x000073EF) Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'AMD Radeon RX 6650 XT');
  assert.equal(nombreLegible('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)'), 'SwiftShader (dibujo por software)');
  assert.equal(nombreLegible(''), 'No identificado');
});

test('27 · perfil inicial del modo automático según el equipo', () => {
  assert.deepEqual({ ...perfilInicialAuto({ tipoGpu: 'dedicada', devicePixelRatio: 2 }) }, { tope: 2, inicial: 2, minimo: 0.35, detalle: 'alto' });
  assert.deepEqual({ ...perfilInicialAuto({ tipoGpu: 'software', devicePixelRatio: 1.25 }) }, { tope: 1, inicial: 0.5, minimo: 0.3, detalle: 'minimo' });
  assert.deepEqual({ ...perfilInicialAuto({ tipoGpu: 'movil', devicePixelRatio: 3, coarsePointer: true }) }, { tope: 1.5, inicial: 1, minimo: 0.35, detalle: 'bajo' });
  assert.deepEqual({ ...perfilInicialAuto({ tipoGpu: 'integrada', devicePixelRatio: 1 }) }, { tope: 1, inicial: 1, minimo: 0.35, detalle: 'medio' }, 'nunca por encima de la pantalla');
  assert.equal(perfilInicialAuto({ tipoGpu: 'dedicada', devicePixelRatio: 2, coarsePointer: true }).detalle, 'medio', 'pantalla táctil: menos detalle');
  assert.equal(perfilInicialAuto({ tipoGpu: 'desconocida', devicePixelRatio: 2, cores: 2 }).tope, 1.5);
  assert.deepEqual(['alto', 'medio', 'bajo', 'minimo', 'otro'].map(detalleInferior), ['medio', 'bajo', 'minimo', 'minimo', 'medio']);
});

// Equipo simulado: intervalo = máx(1/60 s, CPU + K(t)·p²); el controlador recibe el intervalo y el tiempo de CPU.
function simular({ K, cpuMs = 2, segundos = 120, r0 = 2, max = 2, min = 0.35, tirones = [] }) {
  const ctl = createResolutionController(), k = t => (typeof K === 'function' ? K(t) : K);
  let r = r0, t = 0, n = 0, suma = 0, cambios = 0, sinMargen = 0, porCpu = 0;
  const fotograma = () => Math.max(1000 / 60, cpuMs + k(t) * r * r);
  while (t < segundos) {
    let ms = fotograma();
    if (tirones.some(x => Math.abs(t - x) < 0.01)) ms = 800;
    const d = ctl.report(ms / 1000, { actual: r, minimo: min, maximo: max, cpu: cpuMs / 1000 });
    if (d?.pixelRatio) { r = d.pixelRatio; cambios++; }
    if (d?.sinMargen) { sinMargen++; if (d.limitadoPorCpu) porCpu++; }
    t += ms / 1000; n++; suma += ms;
  }
  return { r, fpsFinal: 1000 / fotograma(), fpsMedio: 1000 * n / suma, cambios, sinMargen, porCpu };
}

test('27 · resolución dinámica: cada equipo acaba en la zona de 50–60 FPS si los píxeles son el límite', () => {
  const potente = simular({ K: 2 });
  assert.equal(potente.r, 2); assert.equal(potente.cambios, 0, 'una GPU potente no se toca');
  for (const K of [8, 20, 40]) {
    const s = simular({ K });
    assert.ok(s.fpsFinal >= 48 && s.fpsFinal <= 61, `K=${K}: ${s.fpsFinal.toFixed(1)} FPS a ×${s.r}`);
    assert.ok(s.cambios <= 4, `K=${K}: sin oscilar (${s.cambios} cambios)`);
  }
  // Partiendo bajo con margen de sobra, sube hasta el tope.
  assert.equal(simular({ K: 2, r0: 0.5 }).r, 2);
  // Dibujo por software: baja al mínimo y, como no basta, pide menos detalle.
  const sw = simular({ K: 300, r0: 0.5, max: 1, min: 0.3 });
  assert.equal(sw.r, 0.3); assert.ok(sw.sinMargen > 10 && sw.porCpu === 0);
});

test('27 · límite por CPU medido: no baja la resolución (no ayudaría) y pide menos detalle', () => {
  const s = simular({ K: 2, cpuMs: 40 });
  assert.equal(s.r, 2); assert.equal(s.cambios, 0);
  assert.ok(s.sinMargen > 10 && s.porCpu === s.sinMargen, JSON.stringify(s));
  // Con la GPU como límite y algo de CPU (10 ms) sí baja.
  const g = simular({ K: 20, cpuMs: 10 });
  assert.ok(g.r < 1 && g.fpsFinal >= 48, JSON.stringify(g));
});

test('27 · tirones aislados (cargas) y cambios de plano no bloquean la adaptación', () => {
  const t = simular({ K: 2, tirones: [5, 5.9, 30, 31, 32] });
  assert.equal(t.r, 2); assert.equal(t.cambios, 0, 'cinco fotogramas de 0,8 s no bajan nada');
  // Planos alternos baratos y caros cada 6 s (como el lanzamiento por software): media por encima de 45 FPS.
  const p = simular({ K: tt => (Math.floor(tt / 6) % 2 ? 300 : 30), r0: 0.5, max: 1, min: 0.3 });
  assert.ok(p.fpsMedio > 45, `${p.fpsMedio.toFixed(1)} FPS de media`);
});

test('27 · nivel de detalle del lanzamiento 3D (solo presentación)', () => {
  assert.deepEqual({ ...ajustesLanzamiento('alto') }, { detalle: 'alto', antialias: true, sombras: true, entorno: true, nubes: true, divisiones: 1, humo: 2200, nubeSuelo: 340, nubeBase: 90 });
  assert.deepEqual({ ...ajustesLanzamiento('minimo') }, { detalle: 'minimo', antialias: false, sombras: false, entorno: false, nubes: false, divisiones: 0.5, humo: 600, nubeSuelo: 110, nubeBase: 28 });
  const b = ajustesLanzamiento('bajo'), m = ajustesLanzamiento('medio');
  assert.ok(!b.sombras && !b.antialias && b.entorno && b.nubes && b.divisiones === 0.5);
  assert.ok(m.sombras && m.antialias && m.humo < 2200 && m.humo > b.humo);
  assert.equal(ajustesLanzamiento('otro').detalle, 'alto');
  assert.ok(Object.isFrozen(b));
  // La textura de 8k del globo solo con detalle alto.
  const grande = RECURSOS_LANZAMIENTO.globo.archivo;
  assert.equal(archivoGlobo({ calidad: 'alto' }), grande);
  assert.notEqual(archivoGlobo({ calidad: 'alto', detalle: 'bajo' }), grande);
  assert.notEqual(archivoGlobo({ calidad: 'auto', escritorio: true, detalle: 'minimo' }), grande);
});

test('27 · opciones del renderizador: suavizado según el detalle y preferencia de GPU', () => {
  setQualityProfile('minimo');
  let o = opcionesRenderizador({ antialias: true, canvas: 'lienzo', logarithmicDepthBuffer: true });
  assert.equal(o.antialias, false); assert.equal(o.canvas, 'lienzo'); assert.equal(o.logarithmicDepthBuffer, true);
  assert.equal(o.powerPreference, 'high-performance');
  setQualityProfile('alto');
  assert.equal(opcionesRenderizador({ antialias: true }).antialias, true);
  assert.equal(opcionesRenderizador({ antialias: false }).antialias, false, 'respeta a quien no lo quiere');
  setGpuPreference('ahorro'); assert.equal(opcionesRenderizador().powerPreference, 'low-power');
  setGpuPreference('rendimiento'); assert.equal(opcionesRenderizador().powerPreference, 'high-performance');
  assert.equal(QUALITY_PROFILES.minimo.pixelRatioCap, 0.6);
});

test('27 · cada escena aprende su propia resolución; la principal no hereda la del lanzamiento', () => {
  setQualityProfile('auto');
  const ratio = { principal: [], lanzamiento: [] };
  const falso = id => ({ getPixelRatio: () => ratio[id].at(-1) ?? -1, setPixelRatio: v => ratio[id].push(v) });
  const bajaP = registerRenderer(falso('principal')), bajaL = registerRenderer(falso('lanzamiento'), 'lanzamiento');
  const avisos = []; const baja = onQualityChange(s => avisos.push(s));
  const inicio = getQualityState('principal').pixelRatio;
  assert.equal(getQualityState('lanzamiento').pixelRatio, inicio, 'las dos parten del perfil del equipo');
  // Lanzamiento caro: a la relación de partida va a 20 FPS (limitado por los píxeles).
  const dtL = () => Math.max(1 / 60, (1 / 20) * (getQualityState('lanzamiento').pixelRatio / inicio) ** 2);
  for (let t = 0; t < 10;) { const d = dtL(); reportFrame(d, { contexto: 'lanzamiento', cpu: 0.002 }); t += d; }
  const aprendido = getQualityState('lanzamiento').pixelRatio;
  assert.ok(aprendido < inicio && 1 / dtL() >= 48, `lanzamiento ×${aprendido} a ${(1 / dtL()).toFixed(1)} FPS`);
  assert.equal(getQualityState('principal').pixelRatio, inicio, 'la escena principal no cambia');
  assert.equal(ratio.lanzamiento.at(-1), aprendido); assert.ok(ratio.principal.every(v => v === inicio));
  assert.ok(avisos.some(s => s.contexto === 'lanzamiento' && s.activo === true));
  // De vuelta en la principal (barata): sigue a su relación; el lanzamiento conserva lo aprendido para la próxima vez.
  for (let t = 0; t < 6; t += 1 / 60) reportFrame(1 / 60, { cpu: 0.002 });
  assert.equal(getQualityState().contexto, 'principal');
  assert.equal(getQualityState('principal').pixelRatio, inicio);
  assert.equal(getQualityState('lanzamiento').pixelRatio, aprendido);
  baja(); bajaP(); bajaL();
});

test('27 · durante una carga (suspenderAdaptacion) los fotogramas lentos no cuentan', async () => {
  setQualityProfile('auto');
  const inicio = getQualityState('principal').pixelRatio;
  let fin; const carga = new Promise(r => { fin = r; });
  suspenderAdaptacion(carga);
  for (let i = 0; i < 40; i++) reportFrame(0.25, { cpu: 0.01 }); // 10 s a 4 FPS
  assert.equal(getQualityState('principal').pixelRatio, inicio);
  fin(); await carga; await new Promise(r => setTimeout(r, 0));
  for (let i = 0; i < 40; i++) reportFrame(0.25, { cpu: 0.01 });
  assert.ok(getQualityState('principal').pixelRatio < inicio, 'tras la carga, sí se adapta');
});

test('27 · textos de estado del menú', () => {
  assert.equal(textoEstadoCalidad({ pixelRatio: 0.5, dinamica: true, adapted: true }), 'Resolución ×0,5 · ajustada para mantener la fluidez');
  assert.equal(textoEstadoCalidad({ pixelRatio: 2, dinamica: false }), 'Resolución ×2');
  assert.match(textoEstadoGpu({ gpu: { software: true, tipo: 'software', nombre: 'SwiftShader' } }), /aceleración/);
  assert.equal(textoEstadoGpu({ gpu: { software: false, tipo: 'dedicada', nombre: 'AMD Radeon RX 6650 XT' } }), 'Dibujando con AMD Radeon RX 6650 XT (GPU dedicada).');
});

test('27 · el contador de FPS indica la resolución de render y el dibujo por software', async () => {
  const { resumirFotogramas, textoFps } = await import('../src/ui/FpsMeter.js');
  const r = resumirFotogramas([16.7, 16.6, 16.8]);
  assert.deepEqual(textoFps(r), { principal: '60 FPS', detalle: '16,7 ms · peor 17' }, 'sin estado de calidad, como en la etapa 26');
  assert.equal(textoFps(r, { pixelRatio: 2, gpu: { software: false } }).detalle, '16,7 ms · peor 17 · ×2');
  assert.equal(textoFps(r, { pixelRatio: 0.75, gpu: { software: false } }).detalle, '16,7 ms · peor 17 · ×0,75');
  assert.equal(textoFps(r, { pixelRatio: 0.5, gpu: { software: true } }).detalle, '16,7 ms · peor 17 · ×0,5 · CPU');
  assert.equal(textoFps(null, { pixelRatio: 1, gpu: {} }).detalle, 'midiendo… · ×1');
});
