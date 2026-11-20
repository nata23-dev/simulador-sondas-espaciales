// Etapa 15 — perfiles de calidad gráfica para equipos de escritorio y móviles. Solo presentación: limitan la resolución interna
// de render (relación de píxeles) de todas las vistas WebGL; no modifican cálculos, escalas físicas ni datos.
// «Automática» parte de una estimación del equipo y baja un escalón si la escena principal sostiene < 30 FPS durante 4 s.

export const QUALITY_PROFILES = Object.freeze({
  auto: Object.freeze({ id: 'auto', label: 'Automática', pixelRatioCap: null }),
  alto: Object.freeze({ id: 'alto', label: 'Alta', pixelRatioCap: 2 }),
  medio: Object.freeze({ id: 'medio', label: 'Media', pixelRatioCap: 1.5 }),
  bajo: Object.freeze({ id: 'bajo', label: 'Baja', pixelRatioCap: 1 })
});
const STORAGE_KEY = 'simulador:calidad-grafica';
const AUTO_STEPS = Object.freeze([2, 1.5, 1.25, 1, 0.85]);
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

function readStored() {
  try { const value = globalThis.localStorage?.getItem(STORAGE_KEY); return QUALITY_PROFILES[value] ? value : 'auto'; } catch { return 'auto'; }
}
function store(id) { try { globalThis.localStorage?.setItem(STORAGE_KEY, id); } catch { /* sin persistencia */ } }

let profileId = readStored();
let autoCap = null;
const renderers = new Set(), listeners = new Set();
const monitor = createFrameMonitor();

function deviceInfo() {
  const nav = globalThis.navigator ?? {};
  return { coarsePointer: Boolean(globalThis.matchMedia?.('(pointer: coarse)').matches), deviceMemoryGb: nav.deviceMemory ?? null, cores: nav.hardwareConcurrency ?? null };
}
function currentCap() {
  if (profileId !== 'auto') return QUALITY_PROFILES[profileId].pixelRatioCap;
  autoCap ??= autoInitialCap(deviceInfo());
  return autoCap;
}
function applyAll() {
  const ratio = effectivePixelRatio(globalThis.devicePixelRatio, currentCap());
  for (const renderer of renderers) renderer.setPixelRatio(ratio); // setPixelRatio vuelve a dimensionar con el tamaño vigente
  const state = getQualityState();
  for (const listener of listeners) listener(state);
}

export function getQualityState() {
  return Object.freeze({ profile: profileId, label: QUALITY_PROFILES[profileId].label, pixelRatioCap: currentCap(),
    pixelRatio: effectivePixelRatio(globalThis.devicePixelRatio, currentCap()), adapted: profileId === 'auto' && autoCap != null && autoCap < autoInitialCap(deviceInfo()) });
}
export function setQualityProfile(id) {
  if (!QUALITY_PROFILES[id]) return getQualityState();
  profileId = id; store(id);
  if (id === 'auto') autoCap = null;
  monitor.reset(); applyAll();
  return getQualityState();
}
/** Registra un renderizador WebGL: recibe la relación de píxeles del perfil ahora y en cada cambio. Devuelve la baja. */
export function registerRenderer(renderer) {
  if (!renderer?.setPixelRatio) return () => {};
  renderers.add(renderer);
  renderer.setPixelRatio(effectivePixelRatio(globalThis.devicePixelRatio, currentCap()));
  return () => renderers.delete(renderer);
}
export function onQualityChange(listener) { listeners.add(listener); return () => listeners.delete(listener); }
/** Llamado por el bucle de la escena principal con el intervalo entre fotogramas (s). Solo actúa en modo automático. */
export function reportFrame(deltaSeconds) {
  if (profileId !== 'auto' || !monitor.report(deltaSeconds)) return;
  const cap = currentCap(), next = AUTO_STEPS.find(step => step < cap - 1e-9);
  if (next == null) return;
  autoCap = next; applyAll();
}

/** Conecta un grupo de botones `[data-quality]` y un texto de estado. */
export function bindQualityControls(root) {
  const buttons = [...(root?.querySelectorAll('[data-quality]') ?? [])];
  const status = root?.querySelector('[data-quality-status]');
  const sync = state => {
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.quality === state.profile));
    if (status) status.textContent = `Resolución de render ×${state.pixelRatio.toFixed(2).replace(/\.?0+$/, '')}${state.adapted ? ' · reducida automáticamente por rendimiento' : ''}`;
  };
  for (const button of buttons) button.addEventListener('click', () => setQualityProfile(button.dataset.quality));
  sync(getQualityState());
  return onQualityChange(sync);
}
