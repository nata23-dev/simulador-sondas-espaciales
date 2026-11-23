// Etapa 14.1 — paleta de búsqueda y comandos. Reúne cuerpos y sondas (los mismos destinos del panel Explorar), las áreas
// del simulador y acciones de vista. Cada elección pulsa el control existente: no duplica lógica ni altera cálculos.
import { destinoFocoAlCerrar, moverFocoConTab } from './DialogFocus.js';

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

/**
 * Agrupa y ordena los resultados. `sources`: [[rótulo, elementos]] en el orden de la paleta. Solo devuelve grupos con algún
 * resultado (UX-01: no hay cabeceras vacías). Sin consulta se muestran solo los 10 primeros cuerpos y sondas.
 */
export function groupCommandResults(sources, query) {
  const q = normalize(String(query ?? '').trim());
  const score = item => {
    const t = normalize(item.title), d = normalize(item.desc ?? '');
    if (!q) return 1;
    if (t.startsWith(q)) return 3;
    if (t.split(/\s+/).some(word => word.startsWith(q))) return 2.5;
    if (t.includes(q)) return 2;
    return d.includes(q) ? 1 : 0;
  };
  const out = [];
  for (const [label, group] of sources) {
    const ranked = group.map(item => [score(item), item]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]).map(([, item]) => item);
    const limited = q ? ranked : label === 'Cuerpos y sondas' ? ranked.slice(0, 10) : [];
    if (limited.length) out.push({ label, items: limited });
  }
  return out;
}

export function createCommandPalette({ navigator } = {}) {
  const app = document.querySelector('#app');
  if (!app) return { open() {}, dispose() {} };
  const root = document.createElement('div');
  root.id = 'command-palette'; root.className = 'command-palette'; root.hidden = true;
  // UX-01: el campo es un combobox con su lista siempre desplegada mientras el diálogo está abierto; el número de resultados se
  // anuncia en #cp-status (visualmente oculto).
  root.innerHTML = `<div class="cp-backdrop" data-cp-close></div>
    <div class="cp-dialog" role="dialog" aria-modal="true" aria-label="Buscar en el simulador">
      <div class="cp-input-row"><svg class="icon" aria-hidden="true"><use href="#icon-search"></use></svg>
        <input id="cp-input" type="search" role="combobox" aria-expanded="true" aria-haspopup="listbox" autocomplete="off" spellcheck="false" placeholder="Buscar planetas, lunas, sondas, herramientas…" aria-label="Buscar planetas, lunas, sondas, áreas y herramientas" aria-controls="cp-results" aria-autocomplete="list" />
        <kbd>Esc</kbd></div>
      <div id="cp-results" class="cp-results" role="listbox" aria-label="Resultados"></div>
      <p id="cp-status" class="sr-only" role="status" aria-live="polite"></p>
      <p class="cp-foot"><span><kbd>↑</kbd><kbd>↓</kbd> elegir</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Ctrl</kbd>+<kbd>K</kbd> o <kbd>/</kbd> para buscar</span></p>
    </div>`;
  app.append(root);
  const input = root.querySelector('#cp-input'), list = root.querySelector('#cp-results'), dialog = root.querySelector('.cp-dialog');
  const status = root.querySelector('#cp-status');
  let items = [], active = 0, lastFocus = null;
  // UX-01: «Buscar» abre este diálogo (no el panel Explorar): su estado accesible lo lleva la paleta.
  const searchButton = document.querySelector('#header-search');
  searchButton?.setAttribute('aria-controls', 'command-palette');
  searchButton?.setAttribute('aria-haspopup', 'dialog');
  searchButton?.setAttribute('aria-expanded', 'false');

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
    return groupCommandResults([['Cuerpos y sondas', destinationItems()], ['Áreas del simulador', areaItems()], ['Vista y herramientas', actionItems()]], query);
  }
  function render() {
    const groups = build(input.value);
    items = groups.flatMap(group => group.items);
    active = Math.min(active, Math.max(0, items.length - 1));
    list.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('p'); empty.className = 'cp-empty'; empty.textContent = input.value.trim() ? 'Sin resultados. Prueba con «Júpiter», «Voyager», «lanzamiento» o «escala».' : 'Escribe el nombre de un cuerpo, una sonda, un área o una herramienta.';
      list.append(empty); input.removeAttribute('aria-activedescendant'); status.textContent = empty.textContent; return;
    }
    status.textContent = items.length === 1 ? '1 resultado.' : `${items.length} resultados.`;
    let index = 0;
    for (const [groupIndex, group] of groups.entries()) {
      // Solo se dibujan grupos con resultados (build). Cada grupo es un role="group" con su rótulo: el lector anuncia a qué grupo
      // pertenece la opción activa. El contenedor no tiene estilo propio: el aspecto no cambia.
      const box = document.createElement('div'); box.setAttribute('role', 'group'); box.setAttribute('aria-labelledby', `cp-group-${groupIndex}`);
      const heading = document.createElement('div'); heading.className = 'cp-group'; heading.id = `cp-group-${groupIndex}`; heading.textContent = group.label; heading.setAttribute('role', 'presentation');
      box.append(heading);
      list.append(box);
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
        box.append(option);
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
      if (item.open) { navigator?.open?.(); el.open = true; el.querySelector('summary')?.focus(); } // 29: la herramienta vive en el «Menú»
      else el.click();
      return;
    }
    const mode = app.dataset.appMode, lab = document.querySelector('#experimental-lab');
    const labOpen = mode === 'experimental' && lab && !lab.hidden;
    if (item.mode === 'historico' && mode !== 'historico') await navigator?.go('voyager');
    else if (item.mode === 'moon' && mode !== 'exploracion') await navigator?.go('solar');
    else if (item.mode === 'planet' && labOpen) await navigator?.go('solar');
    requestAnimationFrame(() => item.button.click());
  }
  // UX-01: tras elegir, si la acción no movió el foco a otro control (quedó en el campo ya oculto o en <body>), vuelve a quien abrió.
  function restoreFocusAfterChoice() {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const current = document.activeElement;
      if (root.hidden && (!current || current === document.body || root.contains(current))) restoreFocus();
    }));
  }
  // UX-01: el foco vuelve al control que abrió la búsqueda; si ya no está (o se abrió con Ctrl+K sin foco), al botón «Buscar».
  function restoreFocus() {
    const target = destinoFocoAlCerrar(lastFocus, root, document.querySelector('#header-search'));
    if (target) target.focus({ preventScroll: true });
    else if (root.contains(document.activeElement)) document.activeElement.blur();
  }
  function open(query = '') {
    if (!root.hidden) { input.focus(); return; }
    lastFocus = document.activeElement;
    root.hidden = false; input.value = query; active = 0; render();
    input.focus({ preventScroll: true });
    requestAnimationFrame(() => { if (!root.hidden) input.focus({ preventScroll: true }); });
    searchButton?.setAttribute('aria-expanded', 'true');
  }
  function close(restore = true) {
    if (root.hidden) return;
    root.hidden = true;
    searchButton?.setAttribute('aria-expanded', 'false');
    if (restore) restoreFocus();
    else restoreFocusAfterChoice();
  }
  input.addEventListener('input', () => { active = 0; render(); });
  // UX-01: el teclado se atiende a nivel de documento (fase de captura) mientras el diálogo está abierto, esté donde esté el foco
  // (antes solo en el campo: tras Tab, Escape dejaba de cerrar). Escape cierra solo la paleta (otros diálogos debajo no lo reciben).
  const onDialogKey = event => {
    if (root.hidden || event.defaultPrevented) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
    // Tab y Mayús+Tab recorren solo los controles del diálogo (hoy, el campo: las opciones se eligen con las flechas, patrón
    // combobox con aria-activedescendant).
    if (event.key === 'Tab') { event.preventDefault(); event.stopPropagation(); moverFocoConTab(dialog, event.shiftKey); return; }
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    const navigation = event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter';
    if (!dialog.contains(event.target)) {
      input.focus({ preventScroll: true }); // p. ej. tras un clic en una zona sin controles de la lista
      if (!navigation) return;
    } else if (event.target !== input) return;
    if (!navigation) return;
    event.preventDefault(); event.stopPropagation();
    if (event.key === 'ArrowDown') { if (items.length) setActive((active + 1) % items.length); }
    else if (event.key === 'ArrowUp') { if (items.length) setActive((active - 1 + items.length) % items.length); }
    else if (items[active]) choose(items[active]);
  };
  // UX-01: si otro código mueve el foco fuera del diálogo mientras está abierto, vuelve al campo (aria-modal).
  const onFocusIn = event => { if (!root.hidden && !root.contains(event.target)) input.focus({ preventScroll: true }); };
  root.addEventListener('click', event => {
    if (event.target.closest('[data-cp-close]')) { close(); return; }
    if (!root.hidden && event.target !== input) input.focus({ preventScroll: true }); // clic en zona sin controles: el teclado sigue
  });
  const onOpenRequest = event => { event.preventDefault(); open(); };
  const onKey = event => {
    const typing = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); root.hidden ? open() : close(); }
    else if (event.key === '/' && !typing && root.hidden) { event.preventDefault(); open(); }
  };
  document.addEventListener('app:open-search', onOpenRequest);
  document.addEventListener('keydown', onDialogKey, true);
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('keydown', onKey);
  return {
    open, close,
    dispose() {
      document.removeEventListener('app:open-search', onOpenRequest); document.removeEventListener('keydown', onDialogKey, true);
      document.removeEventListener('focusin', onFocusIn); document.removeEventListener('keydown', onKey); root.remove();
    }
  };
}
