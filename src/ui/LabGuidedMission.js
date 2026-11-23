// En este módulo guío al usuario paso a paso en su primera misión dentro del laboratorio: Cassini hacia Marte (escenario A1 de «Misión completa»).
// Aquí solo navego, resalto controles y pulso las mismas acciones que el usuario: no calculo nada por mi cuenta ni altero datos, y compruebo cada paso leyendo el estado real de la interfaz.
import { GUIDED_MISSION } from '../lab/FleetGuide.js';

const { probeId: PROBE, scenarioId: SCENARIO } = GUIDED_MISSION;
const COMPLETE = /^CADENA CALCULADA COMPLETA/;
const inStage = (api, stage, tab) => api.stage ? api.stage() === stage && (!tab || api.tab() === tab) : null;

// Defino los pasos de la misión guiada con su control objetivo, condición de cumplimiento, aviso contextual y acción asistida.
export const GUIDE_STEPS = Object.freeze([
  { id: 'intro', title: 'Tu primera misión: Cassini a Marte',
    text: 'En cinco pasos vas a elegir una sonda real, calcular su viaje a Marte con posiciones de NASA/JPL y verlo en 3D. Haz cada paso tú mismo o pulsa «Hazlo por mí».' },
  { id: 'probe', title: '1 · Elige la sonda', target: `.lab-probe-card[data-probe-id="${PROBE}"]`,
    text: 'En «1 · Elegir sonda» están las cuatro sondas reales. Elige Cassini: lleva 3000 kg de propelente y un motor de 445 N, suficiente para frenar al llegar. A la derecha verás su modelo 3D de NASA; sus cifras están en las pestañas «Arquitectura y componentes» e «Ingeniería».',
    enter: api => api.go('hangar'),
    isDone: api => api.activeProbeId() === PROBE,
    act: api => { api.go('hangar'); api.selectProbe(PROBE); } },
  { id: 'planner', title: '2 · Abre «Misión completa»',
    target: api => api.stage && api.stage() === 'plan' ? '[data-lab-tab="integrated"]' : '[data-lab-stage="plan"]',
    text: 'Es el planificador principal: une el viaje desde la Tierra, la llegada y la captura en un solo cálculo. En el panel de etapas, pulsa «2 · Planificar»: se abre en la pestaña «Misión completa».',
    isDone: api => inStage(api, 'plan', 'integrated') ?? (api.section() === 'planner' && api.plannerMode() === 'integrated'),
    act: api => api.go('planner', 'integrated') },
  { id: 'scenario', title: '3 · Elige el escenario', target: '#im-scenario',
    text: 'En «Escenario», elige «Marte · captura elíptica, apoapsis de 100 000 km». Sale de la Tierra el 30 de noviembre de 2028 y viaja 316 días; el simulador ajusta la fecha para gastar menos energía en la salida.',
    enter: api => api.go('planner', 'integrated'),
    isDone: api => api.integratedState().scenarioId === SCENARIO && api.activeProbeId() === PROBE,
    hint: api => api.activeProbeId() !== PROBE ? 'La sonda activa ya no es Cassini: vuelve a elegirla en la barra superior.' : null,
    act: api => { if (api.activeProbeId() !== PROBE) api.selectProbe(PROBE); api.go('planner', 'integrated'); api.applyScenario(SCENARIO); } },
  { id: 'compute', title: '4 · Calcula la misión', target: '#im-compute',
    text: 'Pulsa «Calcular misión». En unos segundos verás la cadena de fases en verde (crucero, llegada a Marte y captura) y, a la derecha, el propelente que gasta el encendido.',
    enter: api => api.go('planner', 'integrated'),
    isDone: api => { const s = api.integratedState(); return api.activeProbeId() === PROBE && s.scenarioId === SCENARIO && COMPLETE.test(s.mission?.verdict ?? ''); },
    hint: api => {
      const s = api.integratedState();
      if (s.busy) return 'Calculando…';
      if (api.activeProbeId() !== PROBE || s.scenarioId !== SCENARIO) return 'Cambió la sonda o el escenario: «Hazlo por mí» lo deja como en el paso anterior.';
      if (s.mission && !COMPLETE.test(s.mission.verdict)) return 'Este cálculo no completa la misión: revisa que la sonda sea Cassini y el escenario el de Marte.';
      return null;
    },
    act: async api => { if (api.activeProbeId() !== PROBE) api.selectProbe(PROBE); api.go('planner', 'integrated'); if (api.integratedState().scenarioId !== SCENARIO) api.applyScenario(SCENARIO); await api.computeIntegrated(); } },
  { id: 'play', title: '5 · Reprodúcela en 3D', target: '#im-execute',
    text: 'Pulsa «Reproducir en el Centro de Misión». Se abre «3 · Reproducir»: la barra inferior avanza el tiempo, la pestaña «Cámaras» cambia la vista y «Eventos» salta directamente a la captura en Marte.',
    isDone: api => api.section() === 'center' && api.centerKind() === 'integrated',
    hint: api => api.integratedState().executable ? null : 'Primero hace falta un cálculo vigente: vuelve al paso 4.',
    act: api => api.executeIntegrated() },
  { id: 'done', title: 'Misión en marcha',
    text: 'Cassini ya viaja hacia Marte. Para seguir: cambia a Voyager en la barra superior y vuelve a calcular (verás por qué no puede frenar), o elige «Júpiter (órbita tipo Juno) y sobrevuelo de Europa» con Juno.' }
]);

// Desplazo únicamente los contenedores con scroll real: guardo y restauro la posición de los ancestros con overflow oculto para evitar que scrollIntoView desplace todo el laboratorio.
export function revealInScrollAreas(element, options = { block: 'nearest', inline: 'nearest' }) {
  if (!element?.scrollIntoView) return;
  const locked = [];
  for (let node = element.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (/hidden|clip/.test(`${style.overflowX} ${style.overflowY}`)) locked.push([node, node.scrollTop, node.scrollLeft]);
  }
  element.scrollIntoView(options);
  for (const [node, top, left] of locked) { node.scrollTop = top; node.scrollLeft = left; }
}

// Construyo el asistente flotante de la misión guiada, vigilo el progreso real y resalto el siguiente control sugerido.
export function createLabGuidedMission({ host, api }) {
  const dock = document.createElement('aside');
  dock.id = 'lab-guide'; dock.className = 'lab-guide'; dock.hidden = true;
  dock.setAttribute('aria-labelledby', 'lab-guide-title');
  dock.innerHTML = `<div class="lab-guide-head"><span class="eyebrow" id="lab-guide-step">Misión guiada</span>
      <div class="lab-guide-tools"><button type="button" id="lab-guide-min" aria-expanded="true" title="Minimizar">Minimizar</button><button type="button" id="lab-guide-close" title="Salir de la misión guiada">Salir</button></div></div>
    <ol class="lab-guide-progress" aria-hidden="true"></ol>
    <h3 id="lab-guide-title"></h3><p id="lab-guide-text"></p><p id="lab-guide-status" role="status"></p>
    <div class="lab-guide-actions"><button type="button" id="lab-guide-back">Anterior</button><button type="button" id="lab-guide-do">Hazlo por mí</button><button type="button" id="lab-guide-next" class="button-primary">Siguiente</button></div>`;
  host.append(dock);
  const $ = selector => dock.querySelector(selector);
  const progress = $('.lab-guide-progress');
  for (const step of GUIDE_STEPS.slice(1, -1)) { const dot = document.createElement('li'); dot.dataset.step = step.id; progress.append(dot); }
  let index = 0, timer = null, autoAdvance = false, acting = false, target = null, targetSelector = null, minimized = false;
  const step = () => GUIDE_STEPS[index];
  const done = s => (s.isDone ? Boolean(s.isDone(api)) : true);

  const selectorOf = value => typeof value === 'function' ? value(api) : value ?? null;
  // Aplico o retiro la clase de resaltado sobre el control correspondiente al paso actual.
  function setTarget(value) {
    const selector = selectorOf(value);
    target?.classList.remove('lab-guide-target'); target = null; targetSelector = selector;
    if (!selector || dock.hidden) return;
    target = host.querySelector(selector);
    target?.classList.add('lab-guide-target');
  }
  // Cambio de paso, ejecuto su preparación de vista y llevo su objetivo a la zona visible en el siguiente fotograma.
  function enter(i) {
    index = Math.max(0, Math.min(GUIDE_STEPS.length - 1, i)); autoAdvance = false;
    step().enter?.(api);
    render();
    requestAnimationFrame(() => { setTarget(step().target); revealInScrollAreas(target); });
  }
  // Actualizo textos, indicadores de progreso, estado accesible y avance automático tras «Hazlo por mí».
  function render() {
    const s = step(), real = s.isDone ? done(s) : null, numbered = GUIDE_STEPS.length - 2;
    $('#lab-guide-step').textContent = s.id === 'intro' ? 'Misión guiada' : s.id === 'done' ? 'Misión guiada · completada' : `Misión guiada · paso ${index} de ${numbered}`;
    $('#lab-guide-title').textContent = s.title; $('#lab-guide-text').textContent = s.text;
    for (const [k, dot] of [...progress.children].entries()) {
      dot.dataset.state = k + 1 < index || (k + 1 === index && real) || s.id === 'done' ? 'done' : k + 1 === index ? 'current' : 'todo';
    }
    const status = $('#lab-guide-status'), hint = s.hint?.(api);
    status.textContent = acting ? (s.id === 'compute' ? 'Calculando la misión…' : 'Un momento…') : real ? '✓ Hecho. Pulsa «Siguiente».' : hint ?? (s.isDone ? 'Esperando a que lo hagas…' : '');
    status.dataset.state = real ? 'done' : hint ? 'hint' : 'wait';
    $('#lab-guide-back').hidden = index === 0;
    $('#lab-guide-do').hidden = !s.act || real;
    $('#lab-guide-do').disabled = acting;
    const next = $('#lab-guide-next');
    next.textContent = s.id === 'intro' ? 'Empezar' : s.id === 'done' ? 'Terminar' : 'Siguiente';
    next.disabled = Boolean(s.isDone) && !real;
    $('#lab-guide-close').textContent = s.id === 'intro' ? 'Ahora no' : 'Salir';
    dock.dataset.step = s.id;
    if (real && autoAdvance && !acting) { autoAdvance = false; setTimeout(() => { if (!dock.hidden && step() === s) enter(index + 1); }, 700); }
  }
  // Compruebo periódicamente si cambió el control objetivo o si el usuario completó manualmente el paso actual.
  function tick() {
    if (dock.hidden) return;
    const wanted = selectorOf(step().target);
    if ((target && !target.isConnected) || wanted !== targetSelector || (!target && wanted)) { setTarget(step().target); if (wanted !== null) revealInScrollAreas(target); }
    render();
  }
  // Ejecuto de forma asíncrona la acción asistida del paso actual y activo el avance automático al completarse.
  async function act() {
    const s = step(); if (!s.act || acting) return;
    acting = true; autoAdvance = true; render();
    try { await s.act(api); } catch (error) { console.error('Misión guiada:', error); autoAdvance = false; }
    finally { acting = false; render(); requestAnimationFrame(() => setTarget(step().target)); }
  }
  function setMinimized(value) {
    minimized = value; dock.dataset.minimized = String(value);
    $('#lab-guide-min').setAttribute('aria-expanded', String(!value));
    $('#lab-guide-min').textContent = value ? 'Mostrar' : 'Minimizar';
  }
  // Inicio la misión guiada desde la introducción, activo el temporizador de comprobación y enfoco el botón principal.
  function start() {
    dock.hidden = false; setMinimized(false); enter(0);
    clearInterval(timer); timer = setInterval(tick, 400);
    requestAnimationFrame(() => $('#lab-guide-next').focus({ preventScroll: true }));
  }
  // Cierro el asistente, detengo su temporizador y retiro cualquier resaltado pendiente en el laboratorio.
  function stop() { dock.hidden = true; clearInterval(timer); timer = null; setTarget(null); }
  $('#lab-guide-next').addEventListener('click', () => { if (step().id === 'done') stop(); else enter(index + 1); });
  $('#lab-guide-back').addEventListener('click', () => enter(index - 1));
  $('#lab-guide-do').addEventListener('click', act);
  $('#lab-guide-close').addEventListener('click', stop);
  $('#lab-guide-min').addEventListener('click', () => setMinimized(!minimized));
  return { start, stop, isActive: () => !dock.hidden, currentStep: () => step().id, dispose() { stop(); dock.remove(); } };
}
