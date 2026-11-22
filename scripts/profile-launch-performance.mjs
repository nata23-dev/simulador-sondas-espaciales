// Etapa 26 · Perfil de rendimiento del lanzamiento 3D de las Voyager sobre la compilación de producción (vite preview).
// Uso: npm run build && GPU=1 node scripts/profile-launch-performance.mjs [salida.json]
//   GPU=1 usa la GPU real (ANGLE/Direct3D 11); sin él, SwiftShader (solo útil para comparar, no para medir).
//   DPR=2 emula una pantalla de alta densidad; WIDTH/HEIGHT fijan la ventana (1600×900 por defecto); SPEED la velocidad (1).
//   UNCAPPED=1 quita el límite de 60 Hz (vsync) para ver el margen; sin él se mide lo que vería una pantalla de 60 Hz.
//   FULL=0 omite la reproducción completa (solo los instantes pausados y el desglose).
// Mide, sin modificar nada del proyecto:
//   1. la reproducción completa a la velocidad pedida: intervalo de cada fotograma, plano de cámara, fotogramas largos (> 50 ms)
//      y su causa (Long Animation Frames de Chrome);
//   2. instantes pausados clave: FPS, tiempo de GPU por fotograma (EXT_disjoint_timer_query_webgl2), tiempo de CPU del bucle,
//      llamadas de dibujo, triángulos y programas;
//   3. desglose en tres instantes: cuánto cuesta cada parte (sombras, humo, llamas, cielo, resolución) apagándola un momento.
// Una sola instancia de Chrome y de Vite a la vez.
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { LANZAMIENTOS_VOYAGER, eventoPorId } from '../src/science/VoyagerLaunchProfile.js';

const out = path.resolve(process.argv[2] ?? 'evidence/stage26/launch-profile.json');
await fs.mkdir(path.dirname(out), { recursive: true });
const { preview } = await import(pathToFileURL(path.resolve('node_modules/vite/dist/node/index.js')).href);
const { chromium } = await import(pathToFileURL(path.join(process.env.LOCALAPPDATA, 'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs')).href);
const PORT = 5200;
const server = await preview({ preview: { port: PORT, strictPort: true }, configFile: path.resolve('vite.config.js'), logLevel: 'error' });
const URL = `http://localhost:${PORT}/`;
const gpu = process.env.GPU === '1', uncapped = process.env.UNCAPPED === '1';
const DPR = Number(process.env.DPR ?? 1), ANCHO = Number(process.env.WIDTH ?? 1600), ALTO = Number(process.env.HEIGHT ?? 900);
const SPEED = Number(process.env.SPEED ?? 1), FULL = process.env.FULL !== '0', MISION = process.env.MISSION ?? 'voyager-2';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: [...(gpu ? ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
    ...(uncapped ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : []), '--no-sandbox'] });
const log = { gpu, uncapped, dpr: DPR, viewport: [ANCHO, ALTO], speed: SPEED, mision: MISION, startedAt: new Date().toISOString(), errors: [] };

const ctx = await browser.newContext({ viewport: { width: ANCHO, height: ALTO }, deviceScaleFactor: DPR });
const page = await ctx.newPage();
page.on('pageerror', e => log.errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') log.errors.push(m.text()); });
// Instrumentación: duración de cada callback de requestAnimationFrame (CPU del bucle) y fotogramas largos.
await page.addInitScript(() => {
  const reg = { frames: [], loaf: [], grabando: false };
  window.__PERF__ = reg;
  const original = window.requestAnimationFrame.bind(window);
  let cpuFotograma = 0, ultimo = null;
  window.requestAnimationFrame = cb => original(ts => {
    const t0 = performance.now();
    try { cb(ts); } finally { cpuFotograma += performance.now() - t0; }
  });
  const medir = ts => {
    if (reg.grabando && ultimo !== null) {
      const e = window.__SIMULADOR_DIAGNOSTICO__?.obtenerEstadoLanzamiento?.() ?? {};
      reg.frames.push([Math.round((ts - ultimo) * 100) / 100, Math.round(cpuFotograma * 100) / 100, e.plano ?? null, e.tMision != null ? Math.round(e.tMision * 10) / 10 : null,
        document.querySelector('.launch3d-canvas.is-visible') ? 1 : 0]);
    }
    ultimo = ts; cpuFotograma = 0;
    original(medir);
  };
  original(medir);
  try {
    new PerformanceObserver(list => {
      if (!reg.grabando) return;
      for (const e of list.getEntries()) reg.loaf.push({ inicio: Math.round(e.startTime), ms: Math.round(e.duration), bloqueo: Math.round(e.blockingDuration ?? 0),
        render: Math.round((e.renderStart ?? 0) ? e.startTime + e.duration - e.renderStart : 0),
        scripts: (e.scripts ?? []).slice(0, 4).map(s => ({ ms: Math.round(s.duration), fuente: `${(s.sourceURL ?? '').split('/').pop()}:${s.sourceFunctionName ?? ''}`, invocador: s.invoker ?? '' })) });
    }).observe({ type: 'long-animation-frame', buffered: false });
  } catch { reg.loafNoDisponible = true; }
});

let nudge = 0;
const esperar = async ms => { const fin = Date.now() + ms; while (Date.now() < fin) { await page.mouse.move(4 + (nudge ^= 1), 4); await page.waitForTimeout(Math.min(150, Math.max(0, fin - Date.now()))); } };
const hasta = async (expr, ms = 30000) => { const fin = Date.now() + ms; while (Date.now() < fin) { if (await page.evaluate(expr).catch(() => false)) return true; await esperar(200); } return false; };
const diag = 'window.__SIMULADOR_DIAGNOSTICO__';

// Medición en la página: FPS, CPU y GPU durante `ms` milisegundos en el estado actual.
const medirAqui = ms => page.evaluate(async duracion => {
  const { renderer } = window.__SIMULADOR_DIAGNOSTICO__.interiorLanzamiento();
  const gl = renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const original = renderer.render, gpuMs = [], pendientes = [];
  let calls = 0, triangles = 0, n = 0;
  renderer.render = function (...a) {
    let q = null;
    if (ext) { q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); }
    original.apply(this, a);
    if (q) { gl.endQuery(ext.TIME_ELAPSED_EXT); pendientes.push(q); }
    calls += renderer.info.render.calls; triangles += renderer.info.render.triangles; n++;
    for (let i = pendientes.length - 1; i >= 0; i--) {
      const p = pendientes[i];
      if (gl.getQueryParameter(p, gl.QUERY_RESULT_AVAILABLE)) {
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) gpuMs.push(gl.getQueryParameter(p, gl.QUERY_RESULT) / 1e6);
        gl.deleteQuery(p); pendientes.splice(i, 1);
      }
    }
  };
  const reg = window.__PERF__; reg.frames.length = 0; reg.grabando = true;
  await new Promise(r => setTimeout(r, duracion));
  reg.grabando = false; renderer.render = original;
  const f = reg.frames.slice(1), d = f.map(x => x[0]).sort((a, b) => a - b), c = f.map(x => x[1]).sort((a, b) => a - b), g = gpuMs.sort((a, b) => a - b);
  const pct = (arr, p) => (arr.length ? Math.round(arr[Math.min(arr.length - 1, Math.floor(p * arr.length))] * 100) / 100 : null);
  const media = arr => (arr.length ? Math.round(arr.reduce((s, x) => s + x, 0) / arr.length * 100) / 100 : null);
  return { fps: d.length ? Math.round(1000 / media(d) * 10) / 10 : null, fotogramaP95Ms: pct(d, 0.95), cpuMediaMs: media(c), cpuP95Ms: pct(c, 0.95),
    gpuMediaMs: media(g), gpuP95Ms: pct(g, 0.95), gpuMuestras: g.length, llamadas: n ? Math.round(calls / n) : null, triangulos: n ? Math.round(triangles / n) : null,
    programas: renderer.info.programs?.length ?? null, texturas: renderer.info.memory.textures, geometrias: renderer.info.memory.geometries,
    pixelRatio: renderer.getPixelRatio(), lienzo: [renderer.domElement.width, renderer.domElement.height] };
}, ms);

const tEv = (id, mas = 0) => eventoPorId(LANZAMIENTOS_VOYAGER[MISION], id).t + mas;
const INSTANTES = [
  ['aproximacion', -20], ['plataforma-general', -8], ['base-cuenta-atras', -2], ['despegue-suelo', 5], ['seguimiento', 30], ['persecucion', 80],
  ['separacion-srm', tEv('srm-separacion', 1.5)], ['cofia', tEv('cofia', 1.2)], ['centaur-mes1', tEv('mes1', 20)], ['aparcamiento', tEv('meco1', 600)],
  ['separacion-nave', tEv('separacion-nave', 6)], ['mastiles-nasa', tEv('mastiles', 4)]
];

try {
  await page.goto(URL);
  await hasta(`Boolean(${diag})`, 60000);
  await hasta(`!document.querySelector('#planet-select')?.disabled`, 60000);
  await page.click('[data-mode-btn="historico"]');
  await esperar(1500);
  if (await page.evaluate(`Boolean(document.querySelector('#welcome-close-btn')?.offsetParent)`)) await page.click('#welcome-close-btn');
  await hasta(`${diag}.obtenerModoOperacion() === 'historico'`, 20000);
  await esperar(1500);
  // Fotogramas de la escena principal en modo histórico, como referencia.
  await page.evaluate(() => { window.__PERF__.frames.length = 0; window.__PERF__.grabando = true; });
  await esperar(4000);
  log.escenaPrincipalHistorico = await page.evaluate(() => { const r = window.__PERF__; r.grabando = false; const d = r.frames.slice(1).map(x => x[0]); const m = d.reduce((s, x) => s + x, 0) / d.length; return { fps: Math.round(1000 / m * 10) / 10, fotogramas: d.length }; });

  // Reproducción completa desde el botón (acercamiento incluido).
  await page.evaluate(() => { const r = window.__PERF__; r.frames.length = 0; r.loaf.length = 0; r.grabando = true; });
  const t0 = Date.now();
  await page.evaluate(`${diag}.iniciarLanzamiento('${MISION}')`);
  log.cargaMs = (await hasta(`${diag}.obtenerEstadoLanzamiento().cargado && document.querySelector('.launch3d-canvas.is-visible') !== null`, 90000)) ? Date.now() - t0 : null;
  if (SPEED !== 1) await page.evaluate(`document.querySelector('[data-speed="${SPEED}"]')?.click()`);
  if (FULL) {
    await hasta(`!${diag}.obtenerEstadoLanzamiento().activo`, 420000);
    log.duracionReproduccionS = (Date.now() - t0) / 1000;
  } else await esperar(8000);
  const crudo = await page.evaluate(() => { const r = window.__PERF__; r.grabando = false; return { frames: r.frames, loaf: r.loaf, loafNoDisponible: r.loafNoDisponible ?? false }; });
  // Resumen por plano y fotogramas largos.
  const porPlano = {};
  for (const [d, cpu, plano, , visible] of crudo.frames) {
    const k = !visible ? '(lienzo oculto: acercamiento o carga)' : plano ?? '(sin plano)';
    (porPlano[k] ??= []).push([d, cpu]);
  }
  const resumen = arr => {
    const d = arr.map(x => x[0]).sort((a, b) => a - b), c = arr.map(x => x[1]);
    const m = d.reduce((s, x) => s + x, 0) / d.length;
    return { fotogramas: d.length, fps: Math.round(1000 / m * 10) / 10, p95Ms: d[Math.floor(0.95 * (d.length - 1))], maxMs: d[d.length - 1],
      largos50: d.filter(x => x > 50).length, cpuMediaMs: Math.round(c.reduce((s, x) => s + x, 0) / c.length * 100) / 100 };
  };
  log.reproduccion = { total: resumen(crudo.frames), porPlano: Object.fromEntries(Object.entries(porPlano).map(([k, v]) => [k, resumen(v)])),
    // «visible»: el lienzo del lanzamiento ya se muestra; con 0, el fotograma largo ocurre tras el rótulo «Preparando…».
    largos: crudo.frames.map((f, i) => ({ i, ms: f[0], cpuMs: f[1], plano: f[2], t: f[3], visible: f[4] === 1 })).filter(f => f.ms > 50),
    loaf: crudo.loaf.filter(e => e.ms > 50).slice(0, 60), loafNoDisponible: crudo.loafNoDisponible };

  // Instantes pausados: se reabre el lanzamiento y se mide cada instante con la reproducción en pausa.
  await page.evaluate(`${diag}.iniciarLanzamiento('${MISION}')`);
  await hasta(`${diag}.obtenerEstadoLanzamiento().cargado && document.querySelector('.launch3d-canvas.is-visible') !== null`, 90000);
  await page.evaluate(`${diag}.pausarLanzamiento()`);
  log.instantes = {};
  for (const [nombre, t] of INSTANTES) {
    await page.evaluate(`${diag}.irALanzamiento(${t})`);
    await esperar(900);
    log.instantes[nombre] = { t, plano: (await page.evaluate(`${diag}.obtenerEstadoLanzamiento()`)).plano, ...(await medirAqui(1600)) };
  }

  // Desglose: se apaga cada parte un momento (solo en esta página) y se mide la diferencia.
  log.desglose = {};
  for (const [nombre, t] of [['despegue-suelo', 5], ['seguimiento', 30], ['aparcamiento', tEv('meco1', 600)]]) {
    await page.evaluate(`${diag}.irALanzamiento(${t})`);
    await esperar(900);
    const filas = { base: await medirAqui(1500) };
    const variantes = {
      sinSombras: `r.shadowMap.enabled = false; e.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m.needsUpdate = true); });`,
      sinHumo: `e.traverse(o => { if (o.renderOrder === 4 && o.isMesh && o.geometry.isInstancedBufferGeometry) o.visible = false; });`,
      sinLlamas: `e.traverse(o => { if (/^penacho_/.test(o.name)) o.userData.__v = o.visible, o.visible = false; });`,
      sinCielo: `e.traverse(o => { if (o.material?.uniforms?.turbidity) o.visible = false; });`,
      pixelRatio1: `r.setPixelRatio(1);`
    };
    const restaurar = `r.shadowMap.enabled = true; e.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m.needsUpdate = true); o.visible = true; }); r.setPixelRatio(window.__DPR0__);`;
    await page.evaluate(`window.__DPR0__ = ${diag}.interiorLanzamiento().renderer.getPixelRatio()`);
    for (const [k, js] of Object.entries(variantes)) {
      await page.evaluate(`(() => { const { renderer: r, escena: e } = ${diag}.interiorLanzamiento(); ${js} })()`);
      await esperar(700);
      filas[k] = await medirAqui(1500);
      await page.evaluate(`(() => { const { renderer: r, escena: e } = ${diag}.interiorLanzamiento(); ${restaurar} })()`);
      await esperar(500);
    }
    log.desglose[nombre] = Object.fromEntries(Object.entries(filas).map(([k, v]) => [k, { fps: v.fps, gpuMediaMs: v.gpuMediaMs, cpuMediaMs: v.cpuMediaMs, llamadas: v.llamadas }]));
  }
  await page.evaluate(`document.querySelector('#launch-skip-btn')?.click()`);
  await esperar(1500);
} catch (error) {
  log.errors.push(`fallo del guion: ${error.stack ?? error.message}`);
} finally {
  log.finishedAt = new Date().toISOString();
  await fs.writeFile(out, JSON.stringify(log, null, 2));
  await browser.close();
  await server.close();
  console.log(JSON.stringify({ errors: log.errors, cargaMs: log.cargaMs, total: log.reproduccion?.total, largos: log.reproduccion?.largos?.length }, null, 1));
}
