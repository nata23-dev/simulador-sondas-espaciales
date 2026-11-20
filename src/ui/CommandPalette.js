// Etapa 14.1 — paleta de búsqueda y comandos. Reúne cuerpos y sondas (los mismos destinos del panel Explorar), las áreas
// del simulador y acciones de vista. Cada elección pulsa el control existente: no duplica lógica ni altera cálculos.
const normalize = value => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const ACTIONS = Object.freeze([
  { id: 'reset', title: 'Reencuadrar el objetivo actual', desc: 'Vuelve a centrar la cámara', selector: '#reset-button', icon: 'icon-reset' },
  { id: 'overview', title: 'Vista general del Sistema Solar', desc: 'Encuadre de todos los planetas', selector: '#options-overview-button', icon: 'icon-orbit' },
  { id: 'inner', title: 'Sistema interior', desc: 'Sol, Mercurio, Venus, Tierra y Marte', selector: '#region-inner-button', icon: 'icon-target' },
  { id: 'scale', title: 'Cambiar la escala visual', desc: 'Científica 1:1 o exploratoria (los centros no se mueven)', selector: '#scale-mode-button', icon: 'icon-scale' },
  { id: 'cinema', title: 'Vista cinematográfica', desc: 'Alterna la cámara cinematográfica', selector: '#perspective-button', icon: 'icon-camera' },
  { id: 'immersive', title: 'Modo inmersivo', desc: 'Oculta los paneles para ver solo la escena', selector: '#immersive-button', icon: 'icon-expand' },
  { id: 'distance', title: 'Medir distancias 3D', desc: 'Separación entre dos cuerpos en km y AU', selector: '#distance-menu', icon: 'icon-ruler', open: true },
  { id: 'panel', title: 'Panel de datos', desc: 'Ficha, telemetría y fuentes del objetivo', selector: '#inspector-toggle', icon: 'icon-info' }
]);

export function createCommandPalette({ navigator } = {}) {
  const app = document.querySelector('#app');
  if (!app) return { open() {}, dispose() {} };
  const root = document.createElement('div');
  root.id = 'command-palette'; root.className = 'command-palette'; root.hidden = true;
  root.innerHTML = `<div class="cp-backdrop" data-cp-close></div>
    <div class="cp-dialog" role="dialog" aria-modal="true" aria-label="Buscar en el simulador">
      <div class="cp-input-row"><svg class="icon" aria-hidden="true"><use href="#icon-search"></use></svg>
        <input id="cp-input" type="search" autocomplete="off" spellcheck="false" placeholder="Buscar planetas, lunas, sondas, herramientas…" aria-controls="cp-results" aria-autocomplete="list" />
        <kbd>Esc</kbd></div>
      <div id="cp-results" class="cp-results" role="listbox" aria-label="Resultados"></div>
      <p class="cp-foot"><span><kbd>↑</kbd><kbd>↓</kbd> elegir</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Ctrl</kbd>+<kbd>K</kbd> o <kbd>/</kbd> para buscar</span></p>
    </div>`;
  app.append(root);
  const input = root.querySelector('#cp-input'), list = root.querySelector('#cp-results');
  let items = [], active = 0, lastFocus = null;

  function destinationItems() {
    return [...document.querySelectorAll('#context-search-results button[data-destination]')].map(button => {
      const id = button.dataset.destination, mode = button.dataset.destinationMode;
      const kind = mode === 'moon' ? 'Luna' : mode === 'planet' ? 'Planeta' : mode === 'historico' ? 'Sonda histórica' : 'Sonda experimental';
      return { type: 'body', id, title: button.textContent.trim(), desc: kind, mode, button, icon: mode === 'historico' || mode === 'experimental' ? 'icon-probe' : 'icon-planet' };
    });
  }
  function areaItems() {
    return (navigator?.areas ?? []).flatMap(group => group.items.map(area => ({ type: 'area', id: area.id, title: area.title, desc: `${group.group} · ${area.desc}`, icon: area.icon, area })));
  }
  function actionItems() {
    const lab = document.querySelector('#experimental-lab');
    if (app.dataset.appMode === 'experimental' && lab && !lab.hidden) return [];
    return ACTIONS.filter(action => { const el = document.querySelector(action.selector); return el && !el.disabled && el.offsetParent !== null || action.open; })
      .map(action => ({ type: 'action', ...action }));
  }
  function build(query) {
    const q = normalize(query.trim());
    const score = item => {
      const t = normalize(item.title), d = normalize(item.desc ?? '');
      if (!q) return 1;
      if (t.startsWith(q)) return 3;
      if (t.split(/\s+/).some(word => word.startsWith(q))) return 2.5;
      if (t.includes(q)) return 2;
      return d.includes(q) ? 1 : 0;
    };
    const groups = [['Cuerpos y sondas', destinationItems()], ['Áreas del simulador', areaItems()], ['Vista y herramientas', actionItems()]];
    const out = [];
    for (const [label, group] of groups) {
      const ranked = group.map(item => [score(item), item]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]).map(([, item]) => item);
      const limited = q ? ranked : ranked.slice(0, label === 'Cuerpos y sondas' ? 10 : 12);
      if (limited.length) out.push({ label, items: limited });
    }
    return out;
  }
  function render() {
    const groups = build(input.value);
    items = groups.flatMap(group => group.items);
    active = Math.min(active, Math.max(0, items.length - 1));
    list.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('p'); empty.className = 'cp-empty'; empty.textContent = 'Sin resultados. Prueba con «Júpiter», «Voyager», «lanzamiento» o «escala».';
      list.append(empty); input.removeAttribute('aria-activedescendant'); return;
    }
    let index = 0;
    for (const group of groups) {
      const heading = document.createElement('div'); heading.className = 'cp-group'; heading.textContent = group.label; heading.setAttribute('role', 'presentation');
      list.append(heading);
      for (const item of group.items) {
        const option = document.createElement('div');
        option.id = `cp-option-${index}`; option.className = 'cp-option'; option.setAttribute('role', 'option'); option.dataset.index = String(index);
        option.dataset.type = item.type;
        if (item.type === 'body') option.style.setProperty('--dot', `var(--body-${item.id}, var(--text-3))`);
        option.innerHTML = `<span class="cp-icon"><svg class="icon" aria-hidden="true"><use href="#${item.icon}"></use></svg></span><span class="cp-text"><strong></strong><small></small></span><span class="cp-kind"></span>`;
        option.querySelector('strong').textContent = item.title;
        option.querySelector('small').textContent = item.desc ?? '';
        option.querySelector('.cp-kind').textContent = item.type === 'body' ? '' : item.type === 'area' ? 'Ir' : 'Acción';
        option.addEventListener('pointermove', () => setActive(Number(option.dataset.index), false));
        option.addEventListener('click', () => choose(item));
        list.append(option);
        index++;
      }
    }
    setActive(active, false);
  }
  function setActive(index, scroll = true) {
    active = index;
    for (const option of list.querySelectorAll('.cp-option')) option.setAttribute('aria-selected', String(Number(option.dataset.index) === index));
    const current = list.querySelector(`#cp-option-${index}`);
    if (current) { input.setAttribute('aria-activedescendant', current.id); if (scroll) current.scrollIntoView({ block: 'nearest' }); }
  }
  async function choose(item) {
    close(false);
    if (item.type === 'area') { await navigator?.go(item.area); return; }
    if (item.type === 'action') {
      const el = document.querySelector(item.selector);
      if (!el) return;
      if (item.open) { const menu = document.querySelector('#tools-menu'); if (menu) menu.open = true; el.open = true; el.querySelector('summary')?.focus(); }
      else el.click();
      return;
    }
    const mode = app.dataset.appMode, lab = document.querySelector('#experimental-lab');
    const labOpen = mode === 'experimental' && lab && !lab.hidden;
    if (item.mode === 'historico' && mode !== 'historico') await navigator?.go('voyager');
    else if (item.mode === 'experimental' && (mode !== 'experimental' || labOpen)) await navigator?.go('orbital');
    else if (item.mode === 'moon' && mode !== 'exploracion') await navigator?.go('solar');
    else if (item.mode === 'planet' && labOpen) await navigator?.go('solar');
    requestAnimationFrame(() => item.button.click());
  }
  function open(query = '') {
    if (!root.hidden) { input.focus(); return; }
    lastFocus = document.activeElement;
    root.hidden = false; input.value = query; active = 0; render();
    requestAnimationFrame(() => input.focus());
    document.querySelector('#header-search')?.setAttribute('aria-expanded', 'true');
  }
  function close(restoreFocus = true) {
    if (root.hidden) return;
    root.hidden = true;
    document.querySelector('#header-search')?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) lastFocus?.focus?.({ preventScroll: true });
  }
  input.addEventListener('input', () => { active = 0; render(); });
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); if (items.length) setActive((active + 1) % items.length); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); if (items.length) setActive((active - 1 + items.length) % items.length); }
    else if (event.key === 'Enter') { event.preventDefault(); if (items[active]) choose(items[active]); }
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
  });
  root.addEventListener('click', event => { if (event.target.closest('[data-cp-close]')) close(); });
  const onOpenRequest = event => { event.preventDefault(); open(); };
  const onKey = event => {
    const typing = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); root.hidden ? open() : close(); }
    else if (event.key === '/' && !typing && root.hidden) { event.preventDefault(); open(); }
  };
  document.addEventListener('app:open-search', onOpenRequest);
  document.addEventListener('keydown', onKey);
  return {
    open, close,
    dispose() { document.removeEventListener('app:open-search', onOpenRequest); document.removeEventListener('keydown', onKey); root.remove(); }
  };
}
