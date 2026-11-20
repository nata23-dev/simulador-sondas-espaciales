// Etapa 16 — misión guiada del laboratorio para quien llega por primera vez: Cassini a Marte (escenario A1 de «Misión completa»),
// un caso que el motor completa de principio a fin (tests/Stage16Coherence.test.mjs). Solo navega y pulsa los mismos controles
// que el usuario: no calcula nada por su cuenta, no cambia datos y cada paso se da por hecho mirando el estado real de la interfaz.
import { GUIDED_MISSION } from '../lab/FleetGuide.js';

const { probeId: PROBE, scenarioId: SCENARIO } = GUIDED_MISSION;
const COMPLETE = /^CADENA CALCULADA COMPLETA/;

export const GUIDE_STEPS = Object.freeze([
  { id: 'intro', title: 'Tu primera misión: Cassini a Marte',
    text: 'En cinco pasos vas a elegir una sonda real, calcular su viaje a Marte con posiciones de NASA/JPL y verlo en 3D. Haz cada paso tú mismo o pulsa «Hazlo por mí».' },
  { id: 'probe', title: '1 · Elige la sonda', target: `.lab-probe-card[data-probe-id="${PROBE}"]`,
    text: 'En el Hangar están las cuatro sondas. Elige Cassini: lleva 3000 kg de propelente y un motor de 445 N, suficiente para frenar al llegar. En el centro verás su modelo 3D de NASA y a la derecha, su ingeniería.',
    enter: api => api.go('hangar'),
    isDone: api => api.activeProbeId() === PROBE,
    act: api => { api.go('hangar'); api.selectProbe(PROBE); } },
  { id: 'planner', title: '2 · Abre «Misión completa»', target: '.lab-sections [data-planner-mode="integrated"]',
    text: 'Es el planificador principal: une el viaje desde la Tierra, la llegada y la captura en un solo cálculo. Está en la barra de arriba, en el paso «2 · Planificar».',
    isDone: api => api.section() === 'planner' && api.plannerMode() === 'integrated',
    act: api => api.go('planner', 'integrated') },
  { id: 'scenario', title: '3 · Elige el escenario', target: '#im-scenario',
    text: 'En «Escenario», elige «Marte · órbita elíptica de 3000 × 100 000 km». Sale de la Tierra el 30 de noviembre de 2028 y viaja 316 días; el simulador ajusta la fecha para gastar menos energía en la salida.',
    enter: api => api.go('planner', 'integrated'),
    isDone: api => api.integratedState().scenarioId === SCENARIO && api.activeProbeId() === PROBE,
    hint: api => api.activeProbeId() !== PROBE ? 'La sonda activa ya no es Cassini: vuelve a elegirla en la cabecera.' : null,
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
    text: 'Pulsa «Reproducir en el Centro de Misión». Allí la barra inferior avanza el tiempo, las cámaras de arriba cambian la vista y la lista «Fases y eventos» salta directamente a la captura en Marte.',
    isDone: api => api.section() === 'center' && api.centerKind() === 'integrated',
    hint: api => api.integratedState().executable ? null : 'Primero hace falta un cálculo vigente: vuelve al paso 4.',
    act: api => api.executeIntegrated() },
  { id: 'done', title: 'Misión en marcha',
    text: 'Cassini ya viaja hacia Marte. Para seguir: cambia a Voyager en la cabecera y vuelve a calcular (verás por qué no puede frenar), o elige «Júpiter (órbita tipo Juno) y sobrevuelo de Europa» con Juno.' }
]);

// 16: desplaza solo las zonas que el usuario puede desplazar. scrollIntoView también mueve contenedores con overflow
// oculto (el laboratorio entero subía y dejaba una franja vacía); su posición se restaura después.
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
  let index = 0, timer = null, autoAdvance = false, acting = false, target = null, minimized = false;
  const step = () => GUIDE_STEPS[index];
  const done = s => (s.isDone ? Boolean(s.isDone(api)) : true);

  function setTarget(selector) {
    target?.classList.remove('lab-guide-target'); target = null;
    if (!selector || dock.hidden) return;
    target = host.querySelector(selector);
    target?.classList.add('lab-guide-target');
  }
  function enter(i) {
    index = Math.max(0, Math.min(GUIDE_STEPS.length - 1, i)); autoAdvance = false;
    step().enter?.(api);
    render();
    requestAnimationFrame(() => { setTarget(step().target); revealInScrollAreas(target); });
  }
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
  function tick() {
    if (dock.hidden) return;
    if (target && !target.isConnected) setTarget(step().target);
    else if (!target && step().target) setTarget(step().target);
    render();
  }
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
  function start() {
    dock.hidden = false; setMinimized(false); enter(0);
    clearInterval(timer); timer = setInterval(tick, 400);
    requestAnimationFrame(() => $('#lab-guide-next').focus({ preventScroll: true }));
  }
  function stop() { dock.hidden = true; clearInterval(timer); timer = null; setTarget(null); }
  $('#lab-guide-next').addEventListener('click', () => { if (step().id === 'done') stop(); else enter(index + 1); });
  $('#lab-guide-back').addEventListener('click', () => enter(index - 1));
  $('#lab-guide-do').addEventListener('click', act);
  $('#lab-guide-close').addEventListener('click', stop);
  $('#lab-guide-min').addEventListener('click', () => setMinimized(!minimized));
  return { start, stop, isActive: () => !dock.hidden, currentStep: () => step().id, dispose() { stop(); dock.remove(); } };
}
