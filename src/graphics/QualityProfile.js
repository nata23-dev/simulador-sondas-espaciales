// Etapa 15 — perfiles de calidad gráfica para equipos de escritorio y móviles. Solo presentación: limitan la resolución interna
// de render (relación de píxeles) y el nivel de detalle de las vistas WebGL; no modifican cálculos, escalas físicas ni datos.
//
// Etapa 27 — rendimiento adaptativo, con el objetivo de 50–60 FPS en cualquier equipo:
//   · Detección del procesador gráfico que usa el navegador (GPU dedicada, integrada, de móvil o dibujo por software en la CPU,
//     cuando la aceleración por hardware está desactivada o no disponible).
//   · «Automática» parte de un perfil según ese equipo y aplica resolución dinámica: baja la resolución interna en proporción a
//     la caída de FPS y la recupera poco a poco cuando sobra margen, con histéresis para no oscilar. Si con la resolución mínima
//     sigue sin llegar, baja el nivel de detalle (sombras, entorno, capas, partículas).
//   · Preferencia de GPU (alto rendimiento o ahorro de energía) para los equipos con dos procesadores gráficos.
// Los perfiles fijos (Alta, Media, Baja, Mínima) no cambian solos: son una elección explícita.

/** Niveles de detalle, de más a menos costoso. Cada vista decide qué significa cada uno (p. ej., `ajustesLanzamiento`). */
export const NIVELES_DETALLE = Object.freeze(['alto', 'medio', 'bajo', 'minimo']);

export const QUALITY_PROFILES = Object.freeze({
  auto: Object.freeze({ id: 'auto', label: 'Automática', pixelRatioCap: null, detalle: null }),
  alto: Object.freeze({ id: 'alto', label: 'Alta', pixelRatioCap: 2, detalle: 'alto' }),
  medio: Object.freeze({ id: 'medio', label: 'Media', pixelRatioCap: 1.5, detalle: 'medio' }),
  bajo: Object.freeze({ id: 'bajo', label: 'Baja', pixelRatioCap: 1, detalle: 'bajo' }),
  minimo: Object.freeze({ id: 'minimo', label: 'Mínima', pixelRatioCap: 0.6, detalle: 'minimo' })
});
const STORAGE_KEY = 'simulador:calidad-grafica';
const GPU_KEY = 'simulador:gpu-preferida';
export const PREFERENCIAS_GPU = Object.freeze({
  rendimiento: Object.freeze({ id: 'rendimiento', label: 'Alto rendimiento', powerPreference: 'high-performance' }),
  ahorro: Object.freeze({ id: 'ahorro', label: 'Ahorro de energía', powerPreference: 'low-power' })
});
const WINDOW_SECONDS = 2, SLOW_FPS = 30, SLOW_WINDOWS = 2;

/** Relación de píxeles efectiva: el menor entre la del dispositivo y el tope del perfil (función pura, probada). */
export function effectivePixelRatio(devicePixelRatio, cap) {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(dpr, Number.isFinite(cap) && cap > 0 ? cap : 2);
}

/** Tope inicial del modo automático según el equipo (pantalla táctil, memoria y núcleos declarados por el navegador). */
export function autoInitialCap({ coarsePointer = false, deviceMemoryGb = null, cores = null } = {}) {
  const constrained = coarsePointer || (Number.isFinite(deviceMemoryGb) && deviceMemoryGb <= 4) || (Number.isFinite(cores) && cores <= 4);
  return constrained ? 1.5 : 2;
}

/**
 * 27: clase de procesador gráfico a partir del nombre que da WebGL (WEBGL_debug_renderer_info). Función pura (probada).
 * 'software': el navegador dibuja con la CPU (SwiftShader, llvmpipe, «Microsoft Basic Render Driver»); 'movil': GPU de teléfono
 * o tableta; 'integrada': GPU del procesador (Intel, Radeon de los APU, Apple); 'dedicada': tarjeta gráfica; 'desconocida'.
 */
export function clasificarRenderizador(nombre) {
  const t = String(nombre ?? '');
  if (!t.trim()) return 'desconocida';
  if (/swiftshader|llvmpipe|softpipe|software ?(rasterizer|renderer)|basic render|microsoft basic|mesa offscreen/i.test(t)) return 'software';
  if (/adreno|mali|powervr|videocore|apple a\d|immortalis|xclipse/i.test(t)) return 'movil';
  // GPU de los procesadores AMD (APU): «Radeon(TM) Graphics», «Radeon 780M Graphics», «Radeon Vega 8 Graphics».
  if (/radeon(\(tm\))? (\d{3}m |vega \d+ |rx vega \d+ )?graphics|vega \d+ graphics/i.test(t)) return 'integrada';
  if (/nvidia|geforce|quadro|rtx|gtx|radeon(\(tm\))? (rx|pro|r9|r7|hd)|\barc\b|firepro/i.test(t)) return 'dedicada';
  if (/intel|uhd|iris|hd graphics|apple/i.test(t)) return 'integrada';
  return 'desconocida';
}

/**
 * 27: punto de partida del modo automático según el equipo. Función pura (probada). Devuelve el tope y el valor inicial de la
 * relación de píxeles, el mínimo al que puede bajar la resolución dinámica y el nivel de detalle inicial.
 */
export function perfilInicialAuto({ tipoGpu = 'desconocida', coarsePointer = false, deviceMemoryGb = null, cores = null, devicePixelRatio = 1 } = {}) {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const base = { dedicada: [2, 2, 'alto'], integrada: [1.5, 1.25, 'medio'], movil: [1.5, 1, 'bajo'], software: [1, 0.5, 'minimo'] }[tipoGpu];
  let tope, inicial, detalle;
  if (base) [tope, inicial, detalle] = base;
  else {
    tope = autoInitialCap({ coarsePointer, deviceMemoryGb, cores });
    inicial = tope; detalle = tope === 2 ? 'alto' : 'medio';
  }
  // En un móvil o un equipo modesto, la GPU dedicada o integrada no cambia que la pantalla sea pequeña y la memoria escasa.
  if (coarsePointer && detalle === 'alto') detalle = 'medio';
  const maximo = Math.min(dpr, tope);
  return Object.freeze({ tope: maximo, inicial: Math.min(maximo, inicial), minimo: Math.min(maximo, tipoGpu === 'software' ? 0.3 : 0.35), detalle });
}

/** Un nivel de detalle menos, o el mismo si ya es el mínimo (función pura, probada). */
export function detalleInferior(detalle) {
  const i = NIVELES_DETALLE.indexOf(detalle);
  return NIVELES_DETALLE[Math.min(NIVELES_DETALLE.length - 1, Math.max(0, i) + 1)];
}

/** Seguimiento de FPS por ventanas: devuelve true cuando conviene bajar un escalón (lógica pura, probada). */
export function createFrameMonitor({ windowSeconds = WINDOW_SECONDS, slowFps = SLOW_FPS, slowWindows = SLOW_WINDOWS } = {}) {
  let elapsed = 0, frames = 0, slowRun = 0;
  return {
    report(deltaSeconds) {
      // Pestañas ocultas o pausas largas no cuentan como lentitud.
      if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || deltaSeconds > 0.5) return false;
      elapsed += deltaSeconds; frames++;
      if (elapsed < windowSeconds) return false;
      const fps = frames / elapsed; elapsed = 0; frames = 0;
      slowRun = fps < slowFps ? slowRun + 1 : 0;
      if (slowRun >= slowWindows) { slowRun = 0; return true; }
      return false;
    },
    reset() { elapsed = 0; frames = 0; slowRun = 0; }
  };
}

const redondear = x => Math.round(x * 20) / 20; // pasos de 0,05: sin cambios diminutos que obliguen a redimensionar el lienzo

/**
 * 27: resolución dinámica (lógica pura, probada). Se le informa del intervalo de cada fotograma, de su tiempo de CPU (opcional) y
 * de los límites; por ventanas de 1 s decide la nueva relación de píxeles:
 *   · bajar: dos ventanas seguidas por debajo de `fpsMinimo` (o una muy lenta, < 60 % de él). El coste de dibujar es casi
 *     proporcional al número de píxeles, es decir, al cuadrado de la relación, así que se multiplica por √(fps / objetivo)
 *     (entre 0,55 y 0,9). La relación que falló queda como techo durante un enfriamiento que se duplica si vuelve a fallar.
 *   · subir: `ventanasSubida` ventanas seguidas por encima de `fpsSubida`, un 15 % cada vez, sin pasar del techo vigente.
 *   · límite por CPU: si la mediana del tiempo de CPU del fotograma (JavaScript y envío de órdenes) ocupa al menos
 *     `fraccionCpu` del intervalo, lo que frena no es dibujar píxeles: bajar la resolución no ayudaría. No se baja y, tras tres
 *     ventanas lentas, se pide menos detalle (`sinMargen` con `limitadoPorCpu`). Es una medida directa, no un ensayo: no se
 *     confunde con un cambio de plano que encarece la escena justo después de bajar.
 *   · `sinMargen`: ya está en el mínimo y sigue lento (tres ventanas): conviene bajar el nivel de detalle.
 * Los FPS de cada ventana salen de la mediana de sus intervalos: un tirón aislado (una carga, una compilación) no se confunde
 * con lentitud sostenida, y a 1–2 FPS (dibujo por software) los fotogramas de 0,5–1 s sí cuentan. Ignora pausas (> 1 s, pestaña
 * oculta) y las dos primeras ventanas tras `reset`.
 */
export function createResolutionController({ objetivo = 55, fpsMinimo = 48, fpsSubida = 57, ventana = 1, ventanasSubida = 2,
  enfriamiento = 15, calentamiento = 2, fraccionCpu = 0.75 } = {}) {
  let acumulado = 0, lentas = 0, rapidas = 0, sinMargenSeguidas = 0, ignorar = calentamiento, reloj = 0;
  let techo = Infinity, techoHasta = 0, fallos = 0;
  const intervalos = [], cpus = [];
  const mediana = v => { v.sort((a, b) => a - b); const n = v.length; return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2; };
  return {
    report(deltaSeconds, { actual, minimo, maximo, cpu = null }) {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || deltaSeconds > 1) return null;
      acumulado += deltaSeconds; intervalos.push(deltaSeconds);
      if (Number.isFinite(cpu) && cpu >= 0) cpus.push(cpu);
      if (acumulado < ventana) return null;
      const intervalo = mediana(intervalos), fps = 1 / intervalo;
      const cpuMediana = cpus.length * 2 >= intervalos.length ? mediana(cpus) : null;
      reloj += acumulado; acumulado = 0; intervalos.length = 0; cpus.length = 0;
      if (ignorar > 0) { ignorar--; return null; }
      const limitadoPorCpu = cpuMediana != null && cpuMediana >= fraccionCpu * intervalo;
      if (fps < fpsMinimo) {
        lentas++; rapidas = 0;
        if (actual <= minimo + 1e-9 || limitadoPorCpu) {
          if (++sinMargenSeguidas >= 3) { sinMargenSeguidas = 0; lentas = 0; return { sinMargen: true, limitadoPorCpu, fps }; }
          return null;
        }
        if (lentas < 2 && fps >= 0.6 * fpsMinimo) return null;
        lentas = 0;
        const nuevo = Math.max(minimo, redondear(actual * Math.min(0.9, Math.max(0.55, Math.sqrt(fps / objetivo)))));
        if (nuevo >= actual - 1e-9) return null;
        fallos = actual <= techo + 1e-9 && reloj < techoHasta ? fallos + 1 : 1;
        techo = actual; techoHasta = reloj + enfriamiento * 2 ** Math.min(fallos - 1, 4);
        return { pixelRatio: nuevo, fps };
      }
      lentas = 0; sinMargenSeguidas = 0;
      if (fps < fpsSubida) { rapidas = 0; return null; }
      if (++rapidas < ventanasSubida || actual >= maximo - 1e-9) return null;
      rapidas = 0;
      const limite = reloj < techoHasta ? Math.min(maximo, redondear(techo * 0.9)) : maximo;
      const nuevo = Math.min(limite, redondear(actual * 1.15) > actual ? redondear(actual * 1.15) : actual + 0.05);
      return nuevo > actual + 1e-9 ? { pixelRatio: nuevo, fps } : null;
    },
    reset() { acumulado = 0; intervalos.length = 0; cpus.length = 0; lentas = 0; rapidas = 0; sinMargenSeguidas = 0; ignorar = calentamiento; },
    estado: () => ({ techo, techoHasta, reloj, fallos })
  };
}

function readStored() {
  try { const value = globalThis.localStorage?.getItem(STORAGE_KEY); return QUALITY_PROFILES[value] ? value : 'auto'; } catch { return 'auto'; }
}
function store(id) { try { globalThis.localStorage?.setItem(STORAGE_KEY, id); } catch { /* sin persistencia */ } }
function readGpu() {
  try { const value = globalThis.localStorage?.getItem(GPU_KEY); return PREFERENCIAS_GPU[value] ? value : 'rendimiento'; } catch { return 'rendimiento'; }
}

let equipo = null;
/**
 * 27: procesador gráfico que usa el navegador. Crea un contexto WebGL pequeño una sola vez: con `failIfMajorPerformanceCaveat`
 * el navegador se niega a dárselo si dibujaría por software; el nombre sale de WEBGL_debug_renderer_info cuando está disponible.
 */
export function detectarEquipo() {
  if (equipo) return equipo;
  const doc = globalThis.document;
  let nombre = '', software = false, disponible = false;
  if (doc?.createElement) {
    try {
      const contexto = opciones => doc.createElement('canvas').getContext('webgl2', opciones) ?? doc.createElement('canvas').getContext('webgl', opciones);
      const rapido = contexto({ failIfMajorPerformanceCaveat: true, powerPreference: PREFERENCIAS_GPU[readGpu()].powerPreference });
      const gl = rapido ?? contexto({ powerPreference: PREFERENCIAS_GPU[readGpu()].powerPreference });
      disponible = Boolean(gl);
      software = disponible && !rapido;
      if (gl) {
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        nombre = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
    } catch { /* sin WebGL: lo informa la propia escena */ }
  }
  const tipo = software ? 'software' : clasificarRenderizador(nombre);
  equipo = Object.freeze({ nombre: nombreLegible(nombre), nombreCompleto: nombre, tipo, software: tipo === 'software', webgl: disponible });
  return equipo;
}
/** «ANGLE (AMD, AMD Radeon RX 6650 XT (0x000073EF) Direct3D11 vs_5_0 ps_5_0, D3D11)» → «AMD Radeon RX 6650 XT». */
export function nombreLegible(nombre) {
  const t = String(nombre ?? '').trim();
  const angle = /^ANGLE \(([^,]+),\s*(.+?)(?:\s*\(0x[0-9a-f]+\))?(?:\s+Direct3D.*|\s+OpenGL.*|\s+Vulkan.*|,\s*[^,]*)?\)$/i.exec(t);
  const base = angle ? angle[2] : t;
  if (/swiftshader/i.test(t)) return 'SwiftShader (dibujo por software)';
  return base.replace(/\s*\(0x[0-9a-f]+\)/ig, '').replace(/\s+/g, ' ').trim() || 'No identificado';
}

let profileId = readStored();
let gpuId = readGpu();
let auto = null; // { tope, inicial, minimo, detalle } del equipo
// 27: cada escena (contexto) aprende su propia resolución y su propio detalle en modo automático: la escena principal es barata
// y el lanzamiento 3D caro; con un único estado, al volver de uno a otro se partía de una resolución que no le corresponde.
export const CONTEXTO_PRINCIPAL = 'principal';
const contextos = new Map();
let contextoActivo = CONTEXTO_PRINCIPAL;
const renderers = new Map(), listeners = new Set();
function contexto(id = contextoActivo) {
  let c = contextos.get(id);
  if (!c) { c = { id, controlador: createResolutionController(), ratio: null, detalle: null }; contextos.set(id, c); }
  return c;
}

function deviceInfo() {
  const nav = globalThis.navigator ?? {};
  return { coarsePointer: Boolean(globalThis.matchMedia?.('(pointer: coarse)').matches), deviceMemoryGb: nav.deviceMemory ?? null, cores: nav.hardwareConcurrency ?? null };
}
function perfilAuto() {
  auto ??= perfilInicialAuto({ ...deviceInfo(), tipoGpu: detectarEquipo().tipo, devicePixelRatio: globalThis.devicePixelRatio });
  return auto;
}

/** 26: ¿equipo de escritorio? (mismo criterio que el tope inicial del modo automático). Decide, por ejemplo, la textura del globo
 * del lanzamiento 3D en calidad automática. 27: además, que su GPU no sea de móvil ni dibuje por software. */
export function equipoEscritorio() {
  return autoInitialCap(deviceInfo()) === 2 && !['software', 'movil'].includes(detectarEquipo().tipo);
}

function currentCap(id) {
  if (profileId !== 'auto') return QUALITY_PROFILES[profileId].pixelRatioCap;
  const c = contexto(id);
  c.ratio ??= perfilAuto().inicial;
  return c.ratio;
}
function currentDetalle(id) {
  if (profileId !== 'auto') return QUALITY_PROFILES[profileId].detalle;
  const c = contexto(id);
  c.detalle ??= perfilAuto().detalle;
  return c.detalle;
}
/** Aplica la relación de cada contexto a sus renderizadores y avisa con el estado de `ids` (todos si se omite). */
function applyAll(ids = null) {
  for (const [renderer, id] of renderers) {
    const ratio = effectivePixelRatio(globalThis.devicePixelRatio, currentCap(id));
    if (Math.abs((renderer.getPixelRatio?.() ?? -1) - ratio) > 1e-9) renderer.setPixelRatio(ratio); // vuelve a dimensionar con el tamaño vigente
  }
  const avisar = ids ?? [...new Set([contextoActivo, ...contextos.keys()])];
  for (const id of avisar) { const state = getQualityState(id); for (const listener of listeners) listener(state); }
}

/** Estado de la calidad de un contexto (por defecto, el que está dibujando ahora). */
export function getQualityState(id = contextoActivo) {
  const a = profileId === 'auto' ? perfilAuto() : null;
  const gpu = detectarEquipo();
  return Object.freeze({
    profile: profileId, label: QUALITY_PROFILES[profileId].label, contexto: id, activo: id === contextoActivo, pixelRatioCap: currentCap(id),
    pixelRatio: effectivePixelRatio(globalThis.devicePixelRatio, currentCap(id)), detalle: currentDetalle(id),
    adapted: Boolean(a) && (currentCap(id) < a.inicial - 1e-9 || currentDetalle(id) !== a.detalle),
    dinamica: profileId === 'auto', gpu: Object.freeze({ nombre: gpu.nombre, tipo: gpu.tipo, software: gpu.software }),
    preferenciaGpu: gpuId
  });
}
export function setQualityProfile(id) {
  if (!QUALITY_PROFILES[id]) return getQualityState();
  profileId = id; store(id);
  for (const c of contextos.values()) { if (id === 'auto') { c.ratio = null; c.detalle = null; } c.controlador.reset(); }
  applyAll();
  return getQualityState();
}
/** 27: preferencia de GPU para los contextos WebGL que se creen a partir de ahora (la escena principal la toma al recargar). */
export function setGpuPreference(id) {
  if (!PREFERENCIAS_GPU[id]) return getQualityState();
  gpuId = id;
  try { globalThis.localStorage?.setItem(GPU_KEY, id); } catch { /* sin persistencia */ }
  const state = getQualityState();
  for (const listener of listeners) listener(state);
  return state;
}
/**
 * 27: opciones de creación de un WebGLRenderer según la preferencia de GPU y el nivel de detalle: sin suavizado de bordes (MSAA)
 * con detalle bajo o mínimo, donde multiplica el trabajo por píxel. `extra` se respeta (p. ej. `canvas`, `logarithmicDepthBuffer`).
 */
export function opcionesRenderizador(extra = {}, contextoId = CONTEXTO_PRINCIPAL) {
  const detalle = currentDetalle(contextoId);
  return { ...extra, antialias: (extra.antialias ?? true) && (detalle === 'alto' || detalle === 'medio'), powerPreference: PREFERENCIAS_GPU[gpuId].powerPreference };
}
/**
 * Registra un renderizador WebGL: recibe la relación de píxeles del perfil ahora y en cada cambio. Devuelve la baja.
 * 27: `contexto` es la escena a la que pertenece (las vistas del laboratorio dibujan dentro de la cadencia de la principal).
 */
export function registerRenderer(renderer, contextoId = CONTEXTO_PRINCIPAL) {
  if (!renderer?.setPixelRatio) return () => {};
  renderers.set(renderer, contextoId);
  renderer.setPixelRatio(effectivePixelRatio(globalThis.devicePixelRatio, currentCap(contextoId)));
  return () => renderers.delete(renderer);
}
export function onQualityChange(listener) { listeners.add(listener); return () => listeners.delete(listener); }
let suspensiones = 0;
/**
 * 27: no adapta nada mientras `promesa` está pendiente (cargas, compilaciones, preparación del lanzamiento): sus fotogramas
 * largos no reflejan lo que cuesta dibujar. Al terminar se vuelve a medir desde cero.
 */
export function suspenderAdaptacion(promesa) {
  suspensiones++;
  Promise.resolve(promesa).catch(() => {}).finally(() => { suspensiones = Math.max(0, suspensiones - 1); if (!suspensiones) for (const c of contextos.values()) c.controlador.reset(); });
}
/**
 * Llamado por el bucle de la escena que está dibujando, en cada fotograma que dibuja, con el intervalo entre fotogramas (s) y, si
 * lo mide, su tiempo de CPU (s). Solo actúa en modo automático: resolución dinámica y, sin margen, menos detalle.
 * 27: `contexto` identifica la escena (`principal` o, p. ej., `lanzamiento`); al cambiar de escena se vuelve a medir desde cero
 * con lo que esa escena aprendió la última vez.
 */
export function reportFrame(deltaSeconds, { contexto: contextoId = CONTEXTO_PRINCIPAL, cpu = null } = {}) {
  if (profileId !== 'auto') return;
  const c = contexto(contextoId);
  if (contextoId !== contextoActivo) { contextoActivo = contextoId; c.controlador.reset(); applyAll([contextoId]); }
  if (suspensiones) return;
  const a = perfilAuto();
  const decision = c.controlador.report(deltaSeconds, { actual: currentCap(contextoId), minimo: a.minimo, maximo: a.tope, cpu });
  if (!decision) return;
  if (decision.pixelRatio != null) c.ratio = decision.pixelRatio;
  if (decision.sinMargen) {
    const siguiente = detalleInferior(currentDetalle(contextoId));
    if (siguiente === c.detalle && decision.pixelRatio == null) return;
    c.detalle = siguiente;
  }
  applyAll([contextoId]);
}

const coma = x => String(Math.round(x * 100) / 100).replace('.', ',');
/** Texto de estado de la calidad (función pura sobre el estado; probada). */
export function textoEstadoCalidad(state) {
  const partes = [`Resolución ×${coma(state.pixelRatio)}`];
  if (state.dinamica) partes.push(state.adapted ? 'ajustada para mantener la fluidez' : 'dinámica');
  return partes.join(' · ');
}
/** Texto del procesador gráfico (función pura sobre el estado; probada). */
export function textoEstadoGpu(state) {
  if (state.gpu.software) return 'Dibujando con la CPU: el navegador no usa la aceleración por hardware. Actívala en su configuración (Sistema → «Usar aceleración de gráficos cuando esté disponible») y reinícialo para ganar fluidez.';
  const clase = { dedicada: 'GPU dedicada', integrada: 'GPU integrada', movil: 'GPU de móvil' }[state.gpu.tipo];
  return `Dibujando con ${state.gpu.nombre}${clase ? ` (${clase})` : ''}.`;
}

/** Conecta los botones `[data-quality]`, `[data-gpu]` y los textos de estado del menú. */
export function bindQualityControls(root) {
  const buttons = [...(root?.querySelectorAll('[data-quality]') ?? [])];
  const gpuButtons = [...(root?.querySelectorAll('[data-gpu]') ?? [])];
  const status = root?.querySelector('[data-quality-status]');
  const gpuStatus = root?.querySelector('[data-gpu-status]');
  const gpuNote = root?.querySelector('[data-gpu-note]');
  const gpuInicial = gpuId;
  const sync = state => {
    if (state.activo === false) return; // 27: el menú describe la escena que se está dibujando
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.quality === state.profile));
    for (const button of gpuButtons) button.setAttribute('aria-pressed', String(button.dataset.gpu === state.preferenciaGpu));
    if (status) status.textContent = textoEstadoCalidad(state);
    if (gpuStatus) { gpuStatus.textContent = textoEstadoGpu(state); gpuStatus.dataset.software = String(state.gpu.software); }
    if (gpuNote) gpuNote.hidden = state.preferenciaGpu === gpuInicial;
  };
  for (const button of buttons) button.addEventListener('click', () => setQualityProfile(button.dataset.quality));
  for (const button of gpuButtons) button.addEventListener('click', () => setGpuPreference(button.dataset.gpu));
  sync(getQualityState());
  return onQualityChange(sync);
}
