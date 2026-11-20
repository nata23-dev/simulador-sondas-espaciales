// Etapas 14 y 14.1 — mapa de áreas del simulador y ruta de navegación de la cabecera. Solo navegación: reutiliza los
// botones de modo existentes y el evento «lab:navigate» del laboratorio; no crea estados de misión ni modifica cálculos.
export const AREAS = Object.freeze([
  { group: 'Explorar', items: [
    { id: 'solar', title: 'Sistema Solar', desc: 'Planetas, lunas y efemérides NASA/JPL 2026', mode: 'exploracion', icon: 'icon-orbit' },
    { id: 'voyager', title: 'Misiones históricas Voyager', desc: 'Voyager 1 y 2, 1977–2026: trayectorias, eventos y fotografías', mode: 'historico', icon: 'icon-probe' }
  ] },
  // 16: el laboratorio en tres pasos (elegir sonda → planificar → reproducir) y la misión guiada para empezar.
  { group: 'Laboratorio · 1 Elegir sonda', items: [
    { id: 'guide', title: 'Misión guiada', desc: 'Primeros pasos: Cassini a Marte en cinco pasos', mode: 'experimental', section: 'hangar', guide: true, icon: 'icon-target' },
    { id: 'hangar', title: 'Hangar', desc: 'Voyager, Cassini, Dawn y Juno: modelo 3D de NASA, ficha e ingeniería', mode: 'experimental', section: 'hangar', icon: 'icon-settings' }
  ] },
  { group: 'Laboratorio · 2 Planificar', items: [
    { id: 'integrated', title: 'Misión completa', desc: 'Viaje, llegada, captura y satélite en un solo cálculo', mode: 'experimental', section: 'planner', plannerMode: 'integrated', icon: 'icon-expand' },
    { id: 'interplanetary', title: 'Ventanas interplanetarias', desc: 'Mejores fechas de salida hacia un planeta (Lambert)', mode: 'experimental', section: 'planner', plannerMode: 'interplanetary', icon: 'icon-planet' },
    { id: 'lunar', title: 'Tierra–Luna', desc: 'Transferencia a la Luna con impulso ideal', mode: 'experimental', section: 'planner', plannerMode: 'lunar', icon: 'icon-target' },
    { id: 'finite', title: 'Empuje finito', desc: 'Encendidos con masa variable (dentro de Tierra–Luna)', mode: 'experimental', section: 'planner', plannerMode: 'lunar', focus: '#ft-controls-host', icon: 'icon-ruler' },
    { id: 'launch', title: 'Lanzamiento terrestre', desc: 'Despegue hasta una órbita baja con un lanzador ilustrativo', mode: 'experimental', section: 'launch', icon: 'icon-rocket' }
  ] },
  { group: 'Laboratorio · 3 Reproducir', items: [
    { id: 'center', title: 'Centro de Misión', desc: 'Reproducción 3D, eventos, cámaras y telemetría', mode: 'experimental', section: 'center', icon: 'icon-play' },
    { id: 'orbital', title: 'Demostración orbital', desc: 'Sonda Experimental 01 (ficticia, DOPRI54): no usa la sonda activa', mode: 'experimental', orbital: true, icon: 'icon-eye' }
  ] }
]);
const AREA_BY_ID = new Map(AREAS.flatMap(group => group.items).map(area => [area.id, area]));
const CRUMB_ROOT = { exploracion: 'Sistema Solar', historico: 'Voyager', experimental: 'Laboratorio' };

export function createAppNavigator() {
  const app = document.querySelector('#app');
  const header = document.querySelector('.app-header');
  const switcher = document.querySelector('#app-mode-switcher');
  if (!app || !header || !switcher) return { dispose() {}, go() {}, areas: AREAS };
  const wrap = document.createElement('div');
  wrap.className = 'app-navigator hud-secondary';
  wrap.innerHTML = `<button type="button" id="app-nav-toggle" class="app-nav-toggle header-action" aria-expanded="false" aria-controls="app-nav-panel" title="Mapa de áreas del simulador">
      <svg class="icon" aria-hidden="true"><use href="#icon-grid"></use></svg><span>Áreas</span></button>
    <div id="app-nav-panel" class="app-nav-panel" role="dialog" aria-label="Mapa de áreas del simulador" hidden>
      <div class="app-nav-head"><span class="eyebrow">Mapa del simulador</span><strong>¿A dónde quieres ir?</strong></div>
      <div class="app-nav-groups"></div>
      <p class="app-nav-foot">Las áreas del laboratorio comparten la sonda activa y la misión preparada para el Centro de Misión.</p>
    </div>`;
  switcher.after(wrap);
  const toggle = wrap.querySelector('#app-nav-toggle'), panel = wrap.querySelector('#app-nav-panel');
  // El panel vive en #app (no en la cabecera) para quedar por encima del laboratorio y de la escena en cualquier modo.
  app.append(panel);
  const groups = panel.querySelector('.app-nav-groups');
  for (const { group, items } of AREAS) {
    const section = document.createElement('section'); section.className = 'app-nav-group';
    const title = document.createElement('h3'); title.textContent = group; section.append(title);
    for (const area of items) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.area = area.id;
      button.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#${area.icon}"></use></svg><span><strong></strong><small></small></span>`;
      button.querySelector('strong').textContent = area.title; button.querySelector('small').textContent = area.desc;
      button.addEventListener('click', () => go(area));
      section.append(button);
    }
    groups.append(section);
  }

  // Ruta de la cabecera: «Simulador › área › objeto o herramienta». Lee títulos ya presentes en la interfaz.
  const brandText = header.querySelector('.brand > div');
  const crumb = document.createElement('nav');
  crumb.className = 'app-crumb'; crumb.setAttribute('aria-label', 'Ubicación actual');
  crumb.innerHTML = '<span class="app-crumb-root"></span><span class="app-crumb-leaf"></span>';
  brandText?.append(crumb);
  const crumbRoot = crumb.querySelector('.app-crumb-root'), crumbLeaf = crumb.querySelector('.app-crumb-leaf');
  function updateCrumb() {
    const mode = app.dataset.appMode;
    const lab = document.querySelector('#experimental-lab');
    let root = CRUMB_ROOT[mode] ?? '', leaf = '';
    if (mode === 'experimental') leaf = lab && !lab.hidden ? document.querySelector('#lab-tool-title')?.textContent?.trim() ?? '' : 'Demostración orbital';
    else leaf = document.querySelector('#context-title')?.textContent?.trim() ?? '';
    if (leaf === root || leaf === 'Explorar destinos') leaf = '';
    crumbRoot.textContent = root; crumbLeaf.textContent = leaf; crumbLeaf.hidden = !leaf;
  }
  const crumbObserver = new MutationObserver(updateCrumb);
  crumbObserver.observe(app, { attributes: true, attributeFilter: ['data-app-mode'] });
  for (const selector of ['#context-title', '#lab-tool-title']) {
    const node = document.querySelector(selector);
    if (node) crumbObserver.observe(node, { childList: true, characterData: true, subtree: true });
  }
  const lab = document.querySelector('#experimental-lab');
  if (lab) crumbObserver.observe(lab, { attributes: true, attributeFilter: ['hidden'] });
  updateCrumb();

  function setOpen(open) {
    if (open) panel.style.setProperty('--app-nav-top', `${Math.ceil(header.getBoundingClientRect().bottom + 6)}px`);
    panel.hidden = !open; toggle.setAttribute('aria-expanded', String(open));
    if (open) { markCurrent(); panel.querySelector('[aria-current="page"], button')?.focus({ preventScroll: true }); }
  }
  function currentArea() {
    const mode = app.dataset.appMode;
    if (mode === 'exploracion') return 'solar';
    if (mode === 'historico') return 'voyager';
    const labNode = document.querySelector('#experimental-lab');
    if (!labNode || labNode.hidden) return 'orbital';
    const section = labNode.dataset.section;
    if (section === 'planner') return labNode.dataset.plannerMode === 'lunar' ? 'lunar' : labNode.dataset.plannerMode;
    return section;
  }
  function markCurrent() {
    const id = currentArea();
    for (const button of groups.querySelectorAll('button')) {
      if (button.dataset.area === id) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    }
  }
  function waitForMode(mode, timeoutMs = 4000) {
    return new Promise(resolve => {
      const started = performance.now();
      (function poll() { if (app.dataset.appMode === mode || performance.now() - started > timeoutMs) resolve(); else requestAnimationFrame(poll); })();
    });
  }
  async function go(areaOrId) {
    const area = typeof areaOrId === 'string' ? AREA_BY_ID.get(areaOrId) : areaOrId;
    if (!area) return;
    setOpen(false);
    if (app.dataset.appMode !== area.mode) switcher.querySelector(`button[data-mode-btn="${area.mode}"]`)?.click();
    if (area.mode !== 'experimental') { await waitForMode(area.mode); return; }
    await waitForMode('experimental');
    if (area.orbital) { document.querySelector('[data-lab-action="orbital"]')?.click(); return; }
    document.dispatchEvent(new CustomEvent('lab:navigate', { detail: { section: area.section, plannerMode: area.plannerMode, focus: area.focus, guide: area.guide } }));
  }
  toggle.addEventListener('click', () => setOpen(panel.hidden));
  const onKey = event => { if (event.key === 'Escape' && !panel.hidden) { setOpen(false); toggle.focus(); } };
  const onPointer = event => { if (!panel.hidden && !wrap.contains(event.target) && !panel.contains(event.target)) setOpen(false); };
  document.addEventListener('keydown', onKey);
  document.addEventListener('pointerdown', onPointer);
  return {
    areas: AREAS, go, currentArea, waitForMode,
    dispose() { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onPointer); crumbObserver.disconnect(); wrap.remove(); panel.remove(); crumb.remove(); }
  };
}
