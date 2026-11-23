// En este módulo gestiono los perfiles de calidad gráfica y el rendimiento adaptativo de las vistas WebGL
// (escritorio, móvil y renderizado por software), con el objetivo de sostener 50–60 FPS sin alterar
// nunca cálculos físicos, escalas ni datos científicos:
// - Detecto y clasifico el procesador gráfico activo (GPU dedicada, integrada, móvil o dibujo por software).
// - En modo «Automática» ajusto dinámicamente la relación de píxeles por escena (con histéresis y detección
//   de cuello de botella de CPU) y reduzco el nivel de detalle cuando ya no queda margen de resolución.
// - Persisto el perfil elegido y la preferencia de GPU (alto rendimiento o ahorro de energía).

/** Defino los niveles de detalle ordenados de mayor a menor coste gráfico para que cada vista los interprete. */
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

/** Calculo la relación de píxeles efectiva tomando el mínimo entre el dispositivo y el tope del perfil. */
export function effectivePixelRatio(devicePixelRatio, cap) {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(dpr, Number.isFinite(cap) && cap > 0 ? cap : 2);
}

/** Calculo el tope inicial de relación de píxeles en modo automático según pantalla táctil, memoria y núcleos. */
export function autoInitialCap({ coarsePointer = false, deviceMemoryGb = null, cores = null } = {}) {
  const constrained = coarsePointer || (Number.isFinite(deviceMemoryGb) && deviceMemoryGb <= 4) || (Number.isFinite(cores) && cores <= 4);
  return constrained ? 1.5 : 2;
}

/**
 * Clasifico el procesador gráfico reportado por WebGL (`WEBGL_debug_renderer_info`) en:
 * 'software' (dibujo por CPU como SwiftShader o llvmpipe), 'movil', 'integrada', 'dedicada' o 'desconocida'.
 */
export function clasificarRenderizador(nombre) {
  const t = String(nombre ?? '');
  if (!t.trim()) return 'desconocida';
  if (/swiftshader|llvmpipe|softpipe|software ?(rasterizer|renderer)|basic render|microsoft basic|mesa offscreen/i.test(t)) return 'software';
  if (/adreno|mali|powervr|videocore|apple a\d|immortalis|xclipse/i.test(t)) return 'movil';
  // Identifico las GPU integradas en procesadores AMD (APU), como «Radeon(TM) Graphics» o «Radeon 780M Graphics».
  if (/radeon(\(tm\))? (\d{3}m |vega \d+ |rx vega \d+ )?graphics|vega \d+ graphics/i.test(t)) return 'integrada';
  if (/nvidia|geforce|quadro|rtx|gtx|radeon(\(tm\))? (rx|pro|r9|r7|hd)|\barc\b|firepro/i.test(t)) return 'dedicada';
  if (/intel|uhd|iris|hd graphics|apple/i.test(t)) return 'integrada';
  return 'desconocida';
}

/**
 * Calculo el punto de partida del modo automático para el equipo detectado: tope y valor inicial de
 * relación de píxeles, suelo mínimo para la resolución dinámica y nivel de detalle inicial.
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
  // En dispositivos táctiles o modestos evito partir de detalle alto incluso con GPU dedicada o integrada.
  if (coarsePointer && detalle === 'alto') detalle = 'medio';
  const maximo = Math.min(dpr, tope);
  return Object.freeze({ tope: maximo, inicial: Math.min(maximo, inicial), minimo: Math.min(maximo, tipoGpu === 'software' ? 0.3 : 0.35), detalle });
}

/** Devuelvo el siguiente nivel de detalle más económico, o el mismo si ya estoy en el mínimo. */
export function detalleInferior(detalle) {
  const i = NIVELES_DETALLE.indexOf(detalle);
  return NIVELES_DETALLE[Math.min(NIVELES_DETALLE.length - 1, Math.max(0, i) + 1)];
}

/** Monitorizo FPS por ventanas temporales para señalar cuándo conviene bajar un escalón de calidad. */
export function createFrameMonitor({ windowSeconds = WINDOW_SECONDS, slowFps = SLOW_FPS, slowWindows = SLOW_WINDOWS } = {}) {
  let elapsed = 0, frames = 0, slowRun = 0;
  return {
    report(deltaSeconds) {
      // Descarto pausas largas o pestañas en segundo plano para no confundirlas con lentitud sostenida.
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

// Cuantizo la relación de píxeles en pasos de 0,05 para evitar redimensionamientos diminutos del lienzo.
const redondear = x => Math.round(x * 20) / 20;

/**
 * Construyo el controlador de resolución dinámica por ventanas de 1 s a partir de la mediana de intervalos:
 * - Reduzco la relación en proporción a √(fps / objetivo) con enfriamiento exponencial del techo al caer FPS.
 * - Subo gradualmente (+15 %) cuando se sostienen ventanas rápidas por debajo del techo vigente.
 * - Si el cuello de botella está en CPU (`cpuMediana >= fraccionCpu * intervalo`) o ya alcancé el mínimo de
 *   resolución durante tres ventanas lentas, solicito bajar el nivel de detalle geométrico/visual (`sinMargen`).
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
 * Detecto una única vez el procesador gráfico que expone el navegador creando un contexto WebGL auxiliar;
 * uso `failIfMajorPerformanceCaveat` para identificar dibujo por software y libero enseguida ese contexto.
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

/** Limpio la cadena ANGLE/OpenGL/Direct3D del renderizador para mostrar un nombre legible en la interfaz. */
export function nombreLegible(nombre) {
  const t = String(nombre ?? '').trim();
  const angle = /^ANGLE \(([^,]+),\s*(.+?)(?:\s*\(0x[0-9a-f]+\))?(?:\s+Direct3D.*|\s+OpenGL.*|\s+Vulkan.*|,\s*[^,]*)?\)$/i.exec(t);
  const base = angle ? angle[2] : t;
  if (/swiftshader/i.test(t)) return 'SwiftShader (dibujo por software)';
  return base.replace(/\s*\(0x[0-9a-f]+\)/ig, '').replace(/\s+/g, ' ').trim() || 'No identificado';
}

let profileId = readStored();
let gpuId = readGpu();
// Guardo en caché el perfil inicial automático `{ tope, inicial, minimo, detalle }` calculado para este equipo.
let auto = null;
// Mantengo una resolución y un nivel de detalle aprendidos de forma independiente por cada escena (contexto)
// para que al alternar entre la escena principal y el lanzamiento 3D cada una conserve su propio ajuste.
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

/** Determino si el dispositivo corresponde a un equipo de escritorio con aceleración GPU dedicada o integrada. */
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

/** Aplico la relación de píxeles vigente a cada renderizador registrado y notifico a los suscriptores. */
function applyAll(ids = null) {
  for (const [renderer, id] of renderers) {
    const ratio = effectivePixelRatio(globalThis.devicePixelRatio, currentCap(id));
    // Solo actualizo `setPixelRatio` cuando hay un cambio real para no redimensionar el lienzo innecesariamente.
    if (Math.abs((renderer.getPixelRatio?.() ?? -1) - ratio) > 1e-9) renderer.setPixelRatio(ratio);
  }
  const avisar = ids ?? [...new Set([contextoActivo, ...contextos.keys()])];
  for (const id of avisar) { const state = getQualityState(id); for (const listener of listeners) listener(state); }
}

/** Devuelvo una instantánea inmutable del estado de calidad del contexto indicado (por defecto, el activo). */
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

/** Cambio y persisto el perfil de calidad gráfica, reiniciando la adaptación dinámica de los contextos. */
export function setQualityProfile(id) {
  if (!QUALITY_PROFILES[id]) return getQualityState();
  profileId = id; store(id);
  for (const c of contextos.values()) { if (id === 'auto') { c.ratio = null; c.detalle = null; } c.controlador.reset(); }
  applyAll();
  return getQualityState();
}

/** Guardo la preferencia de GPU (`powerPreference`) para los contextos WebGL que se creen a partir de ahora. */
export function setGpuPreference(id) {
  if (!PREFERENCIAS_GPU[id]) return getQualityState();
  gpuId = id;
  try { globalThis.localStorage?.setItem(GPU_KEY, id); } catch { /* sin persistencia */ }
  const state = getQualityState();
  for (const listener of listeners) listener(state);
  return state;
}

/**
 * Construyo las opciones de inicialización de `WebGLRenderer` combinando la preferencia de GPU con el nivel
 * de detalle vigente: desactivo MSAA en detalle bajo o mínimo respetando las opciones adicionales de `extra`.
 */
export function opcionesRenderizador(extra = {}, contextoId = CONTEXTO_PRINCIPAL) {
  const detalle = currentDetalle(contextoId);
  return { ...extra, antialias: (extra.antialias ?? true) && (detalle === 'alto' || detalle === 'medio'), powerPreference: PREFERENCIAS_GPU[gpuId].powerPreference };
}

/** Registro un renderizador WebGL asociado a un contexto de escena y devuelvo su función de baja. */
export function registerRenderer(renderer, contextoId = CONTEXTO_PRINCIPAL) {
  if (!renderer?.setPixelRatio) return () => {};
  renderers.set(renderer, contextoId);
  renderer.setPixelRatio(effectivePixelRatio(globalThis.devicePixelRatio, currentCap(contextoId)));
  return () => renderers.delete(renderer);
}
export function onQualityChange(listener) { listeners.add(listener); return () => listeners.delete(listener); }
let suspensiones = 0;

/**
 * Suspendo la adaptación automática mientras `promesa` está en curso (cargas, compilaciones o cambios pesados)
 * para que los fotogramas largos transitorios no distorsionen la medición; al finalizar reinicio los contadores.
 */
export function suspenderAdaptacion(promesa) {
  suspensiones++;
  Promise.resolve(promesa).catch(() => {}).finally(() => { suspensiones = Math.max(0, suspensiones - 1); if (!suspensiones) for (const c of contextos.values()) c.controlador.reset(); });
}

/**
 * Recibo la duración y el tiempo de CPU de cada fotograma dibujado por un contexto y, en modo automático,
 * ajusto dinámicamente la relación de píxeles o bajo un escalón de detalle cuando no queda margen.
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
/** Formateo el texto descriptivo de la resolución y adaptación activas para la interfaz. */
export function textoEstadoCalidad(state) {
  const partes = [`Resolución ×${coma(state.pixelRatio)}`];
  if (state.dinamica) partes.push(state.adapted ? 'ajustada para mantener la fluidez' : 'dinámica');
  return partes.join(' · ');
}

/** Formateo el resumen del procesador gráfico detectado y el aviso de aceleración por hardware si dibuja en CPU. */
export function textoEstadoGpu(state) {
  if (state.gpu.software) return 'Dibujando con la CPU: el navegador no usa la aceleración por hardware. Actívala en su configuración (Sistema → «Usar aceleración de gráficos cuando esté disponible») y reinícialo para ganar fluidez.';
  const clase = { dedicada: 'GPU dedicada', integrada: 'GPU integrada', movil: 'GPU de móvil' }[state.gpu.tipo];
  return `Dibujando con ${state.gpu.nombre}${clase ? ` (${clase})` : ''}.`;
}

/** Conecto los controles del menú (`[data-quality]` y `[data-gpu]`) y mantengo sincronizados sus textos de estado. */
export function bindQualityControls(root) {
  const buttons = [...(root?.querySelectorAll('[data-quality]') ?? [])];
  const gpuButtons = [...(root?.querySelectorAll('[data-gpu]') ?? [])];
  const status = root?.querySelector('[data-quality-status]');
  const gpuStatus = root?.querySelector('[data-gpu-status]');
  const gpuNote = root?.querySelector('[data-gpu-note]');
  const gpuInicial = gpuId;
  const sync = state => {
    // Reflejo en el menú únicamente el estado del contexto que se está dibujando en este momento.
    if (state.activo === false) return;
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
