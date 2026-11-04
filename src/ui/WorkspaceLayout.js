import './workspace-layout.css';
import { crearLayoutTemporal } from './TimelineLayout.js';

// Adaptador de presentación: reutiliza los nodos y sus controladores científicos.
export function crearWorkspaceLayout({ alBuscarDestino } = {}) {
  const app = document.querySelector('#app');
  app.classList.add('workspace-ready');
  const scene = document.querySelector('.scene-panel');
  const inspector = document.createElement('aside');
  inspector.id = 'context-inspector';
  inspector.className = 'hud-secondary';
  inspector.dataset.state = 'closed';
  inspector.setAttribute('aria-labelledby', 'context-title');
  inspector.innerHTML = `<div class="inspector-heading"><div><span class="eyebrow">EXPLORAR · COMPRENDER</span><strong id="context-title">Explorar destinos</strong></div><button id="inspector-expand" type="button" aria-label="Ampliar panel" title="Ampliar panel"><svg class="icon"><use href="#icon-expand"></use></svg></button><button id="inspector-close" type="button" aria-label="Cerrar panel" title="Cerrar panel"><svg class="icon"><use href="#icon-close"></use></svg></button></div><div class="inspector-tabs" role="tablist" aria-label="Contenido del panel"></div><div id="inspector-content"></div>`;
  scene.append(inspector);
  const panes = new Map();
  const definitions = [
    ['explore', 'Explorar', ['destination-menu']],
    ['probe', 'Sonda', ['mission-panel']],
    ['telemetry', 'Datos', ['planet-info', 'moon-info', 'voyager-science-panel']],
    ['history', 'Historia', ['historical-events-panel', 'historical-launch-card']],
    ['photos', 'Fotos', ['historical-photos-panel']],
    ['navigation', 'Cámaras', ['historical-topbar']]
  ];
  let active = 'explore';
  const visited = new Set();
  let previousFocus;
  const title = inspector.querySelector('#context-title');
  function updateTitle() {
    const tour = document.querySelector('#guided-tour-dock');
    if (active === 'history' && tour && !tour.hidden) title.textContent = tour.querySelector('#tour-title').textContent;
    else if (active === 'explore') {
      title.textContent = app.dataset.appMode === 'historico' ? 'Misiones Voyager' : app.dataset.appMode === 'experimental' ? 'Sonda Experimental 01' : 'Explorar destinos';
    }
    else if (active === 'probe') title.textContent = 'Sonda Experimental 01';
    else if (active === 'telemetry') {
      const selectedName = app.dataset.appMode === 'historico'
        ? document.querySelector('#voyager-card-heading')?.textContent
        : !document.querySelector('#moon-info')?.hidden
          ? document.querySelector('#moon-info-title')?.textContent
          : document.querySelector('#info-title')?.textContent;
      title.textContent = selectedName && selectedName !== 'Planeta' ? selectedName : 'Información';
    } else title.textContent = ({ history: 'Historia Voyager', photos: 'Fotografías NASA', navigation: 'Cámaras' })[active];
  }
  function state(value) {
    if (value !== 'closed') {
      document.querySelector('#tools-menu').open = false;
      document.querySelector('#view-menu').open = false;
      for (const menu of document.querySelectorAll('.temporal-advanced')) menu.open = false;
    }
    inspector.dataset.state = value;
    inspector.inert = value === 'closed';
    const tourButton = document.querySelector('#hist-start-tour-btn');
    const tourHome = document.querySelector('#historical-journey-entry');
    if (tourButton && tourHome) {
      const showInScene = value === 'closed' && app.dataset.appMode === 'historico' && matchMedia('(max-width: 760px)').matches;
      const wasFocused = document.activeElement === tourButton;
      const destination = showInScene ? scene : tourHome;
      if (tourButton.parentNode !== destination) destination.append(tourButton);
      tourButton.classList.toggle('tour-scene-entry', showInScene);
      if (wasFocused && !showInScene) document.querySelector('#tour-play-btn')?.focus({ preventScroll: true });
    }
    const resizeButton = inspector.querySelector('#inspector-expand');
    const resizeLabel = value === 'expanded' ? 'Contraer panel' : 'Ampliar panel';
    resizeButton.setAttribute('aria-label', resizeLabel);
    resizeButton.title = resizeLabel;
    resizeButton.setAttribute('aria-expanded', String(value === 'expanded'));
    resizeButton.querySelector('use').setAttribute('href', value === 'expanded' ? '#icon-chevron' : '#icon-expand');
    document.querySelector('#inspector-toggle').setAttribute('aria-expanded', String(value !== 'closed'));
    document.querySelector('#header-search')?.setAttribute('aria-expanded', String(value !== 'closed' && active === 'explore'));
    window.dispatchEvent(new Event('resize'));
  }
  function select(id, open = true) {
    const changing = active !== id;
    active = id;
    updateTitle();
    for (const [key, pane] of panes) {
      pane.hidden = key !== id;
      const tab = inspector.querySelector(`[data-inspector-tab="${key}"]`);
      tab.setAttribute('aria-selected', String(key === id));
      tab.tabIndex = key === id ? 0 : -1;
      if (key === id && !visited.has(id)) for (const detail of pane.querySelectorAll(':scope > details')) detail.open = true;
    }
    visited.add(id);
    if (id === 'history') document.querySelector('#historical-events-panel').open = document.querySelector('#guided-tour-dock')?.hidden !== false;
    if (changing) inspector.querySelector('#inspector-content').scrollTop = 0;
    if (open) state('half');
  }
  for (const [id, label, nodes] of definitions) {
    const tab = document.createElement('button');
    tab.type = 'button'; tab.dataset.inspectorTab = id;
    tab.id = `tab-${id}`; tab.textContent = label;
    tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', `pane-${id}`);
    inspector.querySelector('.inspector-tabs').append(tab);
    const pane = document.createElement('div');
    pane.className = 'inspector-pane'; pane.id = `pane-${id}`;
    pane.setAttribute('role', 'tabpanel'); pane.setAttribute('aria-labelledby', tab.id);
    for (const nodeId of nodes) pane.append(document.getElementById(nodeId));
    panes.set(id, pane); inspector.querySelector('#inspector-content').append(pane);
    tab.addEventListener('click', () => select(id));
    tab.addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const tabs = [...inspector.querySelectorAll('[role=tab]')].filter(t => !t.hidden);
      const index = tabs.indexOf(tab);
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].click(); tabs[next].focus();
    });
  }
  const probeIntro = document.createElement('p');
  probeIntro.className = 'context-intro probe-intro';
  probeIntro.textContent = 'Selecciona la sonda con Enfocar. Inicia o pausa su recorrido aquí; ajusta la trayectoria y apariencia en Visualización.';
  panes.get('probe').prepend(probeIntro);
  const missionPanel = document.querySelector('#mission-panel');
  const visualSettings = document.createElement('details');
  visualSettings.className = 'context-advanced probe-settings';
  visualSettings.innerHTML = '<summary>Visualización de la sonda</summary>';
  const trajectoryToggle = missionPanel.querySelector('.mission-switch');
  const appearanceSelect = missionPanel.querySelector('.mission-visual-selector');
  trajectoryToggle.before(visualSettings);
  visualSettings.append(trajectoryToggle, appearanceSelect);
  const searchArea = document.createElement('section');
  searchArea.className = 'context-search';
  searchArea.innerHTML = '<label for="context-search-input">Buscar planetas y sondas</label><input id="context-search-input" type="search" placeholder="Nombre del destino" autocomplete="off" /><div id="context-search-results" role="group" aria-label="Destinos disponibles"></div><p id="context-search-status" role="status">Selecciona un destino para enfocarlo.</p>';
  panes.get('explore').prepend(searchArea);
  const searchInput = searchArea.querySelector('input');
  const results = searchArea.querySelector('#context-search-results');
  const searchStatus = searchArea.querySelector('#context-search-status');
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const destinations = [...document.querySelectorAll('#planet-select option')]
    .filter(option => option.value)
    .map(option => ({ id: option.value, label: option.textContent, mode: option.dataset.kind === 'moon' ? 'moon' : 'planet' }));
  destinations.push(
    { id: 'voyager-1', label: 'Voyager 1', mode: 'historico' },
    { id: 'voyager-2', label: 'Voyager 2', mode: 'historico' },
    { id: 'both', label: 'Ambas Voyager', mode: 'historico' },
    { id: 'experimental-probe', label: 'Sonda Experimental 01', mode: 'experimental' }
  );
  let selectedDestination = null;
  for (const destination of destinations) {
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.destination = destination.id;
    button.dataset.destinationMode = destination.mode;
    button.textContent = destination.label;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      if (alBuscarDestino?.(destination.id) === false) {
        searchStatus.textContent = `${destination.label} todavía no está disponible en esta fecha.`;
        return;
      }
      selectedDestination = destination.id;
      searchStatus.textContent = `Seleccionado: ${destination.label}`;
      for (const item of results.children) item.setAttribute('aria-pressed', String(item === button));
    });
    results.append(button);
  }
  function refreshDestinations() {
    const query = normalize(searchInput.value.trim());
    let count = 0;
    for (const button of results.children) {
      const mode = button.dataset.destinationMode;
      const available = mode === 'planet' || (mode === 'moon' && app.dataset.appMode === 'exploracion')
        || (mode === app.dataset.appMode && (mode !== 'historico' || query));
      button.hidden = !available || !normalize(button.textContent).includes(query);
      if (!button.hidden) count++;
      button.setAttribute('aria-pressed', String(button.dataset.destination === selectedDestination));
    }
    if (!count) searchStatus.textContent = 'No hay destinos con ese nombre en el modo actual.';
    else if (selectedDestination) {
      const label = destinations.find(item => item.id === selectedDestination)?.label ?? selectedDestination;
      searchStatus.textContent = `Seleccionado: ${label}`;
    } else searchStatus.textContent = `${count} destinos disponibles. Selecciona uno para enfocarlo.`;
  }
  searchInput.addEventListener('input', refreshDestinations);
  const intro = document.createElement('p'); intro.className = 'context-intro';
  panes.get('telemetry').prepend(intro);
  function updateIntro() {
    if (app.dataset.appMode === 'historico') {
      const guided = document.querySelector('#guided-tour-dock');
      const triggered = document.querySelector('#hist-event-pause-toast');
      const event = guided && !guided.hidden ? guided.querySelector('#tour-title').textContent.trim()
        : triggered && !triggered.hidden ? document.querySelector('#hist-ev-title')?.textContent?.trim() : null;
      const phase = document.querySelector('#voyager-phase-label')?.textContent?.trim();
      intro.textContent = event && event !== '—' ? `Acontecimiento: ${event}. ${phase && phase !== '—' ? phase : ''}`
        : phase && phase !== '—' ? `Etapa de misión: ${phase}. Datos para la fecha seleccionada.`
          : 'Selecciona una sonda y una fecha para consultar su trayectoria documentada.';
    } else {
      if (!document.querySelector('#moon-info')?.hidden) {
        intro.textContent = 'Satélite natural en la fecha seleccionada. Distancia derivada del vector directo luna–centro planetario de JPL Horizons.';
        updateTitle();
        return;
      }
      const name = document.querySelector('#info-title')?.textContent?.trim();
      intro.textContent = name && name !== 'Planeta' ? `${name} en la fecha seleccionada. Distancias y rapidez derivadas de los vectores NASA/JPL Horizons.` : 'Selecciona un planeta para consultar sus datos esenciales.';
    }
    updateTitle();
  }
  for (const selector of ['#hist-ev-title', '#voyager-phase-label', '#voyager-card-heading', '#info-title', '#moon-info-title']) {
    const node = document.querySelector(selector);
    if (node) new MutationObserver(updateIntro).observe(node, { childList: true, characterData: true, subtree: true });
  }
  new MutationObserver(updateIntro).observe(document.querySelector('#moon-info'), { attributes: true, attributeFilter: ['hidden'] });
  const eventToast = document.querySelector('#hist-event-pause-toast');
  if (eventToast) new MutationObserver(updateIntro).observe(eventToast, { attributes: true, attributeFilter: ['hidden'] });
  updateIntro();
  searchInput.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    const first = [...results.children].find(button => !button.hidden);
    if (first) { event.preventDefault(); first.click(); }
  });
  for (const [parent, selectors, label] of [
    ['#planet-info .info-content', ['.coordinates', '.info-footnotes'], 'Coordenadas y referencia'],
    ['#mission-panel .mission-body', ['.mission-metrics', '.mission-model-note'], 'Datos de la simulación']
  ]) {
    const container = document.querySelector(parent);
    const items = selectors.map(selector => container?.querySelector(selector)).filter(Boolean);
    if (!items.length) continue;
    const details = document.createElement('details'); details.className = 'context-advanced';
    details.innerHTML = `<summary>${label}</summary>`;
    items[0].before(details); details.append(...items);
  }
  const voyagerMetrics = document.querySelector('#voyager-science-panel .voyager-telemetry-grid');
  if (voyagerMetrics) {
    const metrics = [...voyagerMetrics.children];
    const mainIndices = new Set([0, 3, 4, 6]);
    voyagerMetrics.append(...metrics.filter((_, index) => mainIndices.has(index)));
    const advancedMetrics = metrics.filter((_, index) => !mainIndices.has(index));
    const details = document.createElement('details'); details.className = 'context-advanced';
    details.innerHTML = '<summary>Más datos orbitales y procedencia</summary>';
    const grid = document.createElement('dl'); grid.className = 'voyager-telemetry-grid';
    grid.append(...advancedMetrics);
    details.append(grid, document.querySelector('#voyager-science-panel .voyager-provenance-box'));
    voyagerMetrics.after(details);
    for (const section of [voyagerMetrics, grid]) {
      const updateAvailability = () => {
        for (const row of section.children) {
          const value = row.querySelector('dd');
          row.hidden = Boolean(value && ['—', '–', ''].includes(value.textContent.trim()));
        }
      };
      new MutationObserver(updateAvailability).observe(section, { subtree: true, childList: true, characterData: true });
      updateAvailability();
    }
  }
  const dock = document.createElement('nav'); dock.id = 'workspace-dock'; dock.className = 'hud-secondary';
  dock.setAttribute('aria-label', 'Vista y cámara');
  dock.innerHTML = `<button id="inspector-toggle" type="button" aria-controls="context-inspector" aria-expanded="false" aria-label="Abrir panel contextual" title="Panel contextual"><svg class="icon"><use href="#icon-target"/></svg><span>Panel</span></button>`;
  scene.append(dock);
  dock.append(document.querySelector('#reset-button'));
  dock.append(document.querySelector('#perspective-button'));
  dock.append(document.querySelector('#view-menu'));
  dock.append(document.querySelector('#scale-mode-button'));
  dock.append(document.querySelector('#immersive-button'));
  const dockLabels = [
    ['#inspector-toggle', 'Explorar y consultar datos'],
    ['#reset-button', 'Reencuadrar objetivo actual'],
    ['#perspective-button', 'Alternar vista cinematográfica'],
    ['#view-menu > summary', 'Capas y vista general'],
    ['#scale-mode-button', 'Cambiar escala visual'],
    ['#immersive-button', 'Activar modo inmersivo']
  ];
  for (const [selector, label] of dockLabels) {
    const control = dock.querySelector(selector);
    control?.setAttribute('title', label);
    control?.setAttribute('aria-label', label);
  }
  document.querySelector('#options-overview-button').setAttribute('title', 'Vista general del Sistema Solar');
  document.querySelector('#options-overview-button').setAttribute('aria-label', 'Vista general del Sistema Solar');
  document.querySelector('#fp-exit-btn').setAttribute('title', 'Volver desde Voyager a la vista exterior');
  document.querySelector('#fp-exit-btn').setAttribute('aria-label', 'Volver desde Voyager a la vista exterior');
  const search = document.createElement('button');
  search.type = 'button'; search.id = 'header-search'; search.textContent = 'Buscar destino';
  search.setAttribute('aria-controls', 'context-inspector');
  search.setAttribute('aria-expanded', 'false');
  search.addEventListener('click', () => { select('explore'); searchInput.focus(); });
  document.querySelector('.app-header').append(search);
  const toolsMenu = document.createElement('details');
  toolsMenu.id = 'tools-menu'; toolsMenu.className = 'main-menu hud-secondary';
  toolsMenu.innerHTML = `<summary aria-label="Abrir menú principal">Menú <svg class="icon"><use href="#icon-chevron"></use></svg></summary><div class="tools-content"><section class="main-menu-group"><span class="menu-heading">Herramientas</span><div id="main-tool-links"></div></section><section class="main-menu-group"><span class="menu-heading">Ayuda y datos</span><div id="main-help-links"></div></section></div>`;
  document.querySelector('.app-header').append(toolsMenu);
  const toolLinks = toolsMenu.querySelector('#main-tool-links');
  toolLinks.append(document.querySelector('#distance-menu'));
  toolsMenu.querySelector('#main-help-links').append(document.querySelector('#camera-help'), document.querySelector('#source-menu'));
  document.querySelector('#camera-help > summary').append(' Ayuda de navegación');
  const missionDock = document.querySelector('#hist-mission-dock');
  if (missionDock) {
    const actions = missionDock.querySelector('.hist-mission-quick-actions');
    const journey = document.createElement('section');
    journey.id = 'historical-journey-entry';
    journey.className = 'historical-journey-entry';
    journey.innerHTML = '<span class="eyebrow">HISTORIA DE LAS VOYAGER</span><p>Recorre 12 pasos guiados o consulta los 14 acontecimientos en Historia.</p>';
    const startTourButton = missionDock.querySelector('#hist-start-tour-btn');
    journey.append(startTourButton);
    startTourButton.addEventListener('click', () => select('history'));
    panes.get('explore').prepend(journey);
    const context = document.createElement('p');
    context.id = 'historical-journey-status';
    context.className = 'historical-journey-status';
    context.setAttribute('role', 'status');
    context.textContent = '12 pasos guiados · 14 acontecimientos para explorar';
    inspector.querySelector('.inspector-heading > div').append(context);
    const experiences = document.createElement('details');
    experiences.className = 'historical-experiences';
    experiences.innerHTML = '<summary>Lanzamiento y ayuda</summary>';
    experiences.append(actions);
    missionDock.append(experiences);
    panes.get('explore').append(missionDock);
  }
  const guidedTour = document.querySelector('#guided-tour-dock');
  if (guidedTour) {
    const tourSection = document.createElement('div');
    tourSection.id = 'pane-tour';
    tourSection.hidden = true;
    panes.get('history').prepend(tourSection);
    tourSection.append(guidedTour);
    new MutationObserver(() => {
      const visible = !guidedTour.hidden && app.dataset.appMode === 'historico';
      tourSection.hidden = !visible;
      if (visible) select('history');
      updateTitle();
      updateIntro();
    }).observe(guidedTour, { attributes: true, attributeFilter: ['hidden'] });
    new MutationObserver(() => {
      updateTitle(); updateIntro();
      if (active === 'history' && !guidedTour.hidden) inspector.querySelector('#inspector-content').scrollTop = 0;
    }).observe(guidedTour.querySelector('#tour-title'), { childList: true, characterData: true, subtree: true });
  }
  const cameraPane = panes.get('navigation');
  const cameraContext = document.createElement('p');
  cameraContext.id = 'camera-context';
  cameraContext.className = 'context-intro';
  cameraContext.setAttribute('role', 'status');
  cameraContext.textContent = 'Vista exterior. Elige «Desde Voyager» para mirar desde la trayectoria local de la nave.';
  cameraPane.prepend(cameraContext);
  for (const [selector, label] of [
    ['#hist-exterior-focus-bar', 'Seguimiento exterior sin cambiar las sondas visibles'],
    ['#hist-toggle-traj-btn', 'Capas visuales']
  ]) {
    const node = cameraPane.querySelector(selector);
    const group = selector === '#hist-toggle-traj-btn' ? node?.closest('.hist-pill-bar') : node;
    if (!group) continue;
    const details = document.createElement('details');
    details.className = 'context-advanced camera-advanced';
    const summary = document.createElement('summary');
    summary.textContent = label;
    group.before(details);
    details.append(summary, group);
  }
  document.querySelector('#inspector-toggle').addEventListener('click', () => {
    previousFocus = document.activeElement;
    document.querySelector('#tools-menu').open = false;
    if (inspector.dataset.state === 'closed') { select(active); inspector.querySelector('[aria-selected=true]').focus(); }
    else close();
  });
  function close() { state('closed'); (previousFocus?.isConnected ? previousFocus : document.querySelector('#inspector-toggle')).focus({preventScroll:true}); }
  document.querySelector('#inspector-close').addEventListener('click', close);
  document.querySelector('#inspector-expand').addEventListener('click', () => state(inspector.dataset.state === 'expanded' ? 'half' : 'expanded'));
  toolsMenu.addEventListener('toggle', () => {
    if (toolsMenu.open) {
      state('closed');
      document.querySelector('#view-menu').open = false;
      for (const menu of document.querySelectorAll('.temporal-advanced')) menu.open = false;
    }
  });
  document.querySelector('#view-menu').addEventListener('toggle', event => {
    if (event.currentTarget.open) {
      state('closed'); toolsMenu.open = false;
      for (const menu of document.querySelectorAll('.temporal-advanced')) menu.open = false;
    }
  });
  document.addEventListener('pointerdown', e => { if (!toolsMenu.contains(e.target)) toolsMenu.open = false; });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    toolsMenu.open = false;
    if (document.querySelector('#photo-lightbox-modal').hidden && document.querySelector('#photo-comparator-panel').hidden && inspector.dataset.state !== 'closed') close();
  });
  for (const id of ['historical-events-panel', 'historical-photos-panel']) {
    const node = document.getElementById(id);
    node.open = false;
    node.addEventListener('toggle', () => {
      const key = id.includes('photos') ? 'photos' : 'history';
      if (node.open && active !== key) select(key);
    });
  }
  const comparator = document.querySelector('#photo-comparator-panel');
  let comparatorFocus;
  let comparatorTab = 'explore';
  let comparatorPanelState = 'closed';
  let comparatorCatalogOpen = false;
  document.addEventListener('click', () => {
    if (comparator.hidden) comparatorCatalogOpen = document.querySelector('#historical-events-panel').open;
  }, true);
  new MutationObserver(() => {
    if (!comparator.hidden) {
      comparatorFocus = document.activeElement;
      comparatorTab = active;
      comparatorPanelState = inspector.dataset.state;
      state('closed'); toolsMenu.open = false;
      document.querySelector('#comp-close-btn').focus({preventScroll:true});
    } else {
      select(comparatorTab, comparatorPanelState !== 'closed');
      if (comparatorTab === 'history') document.querySelector('#historical-events-panel').open = comparatorCatalogOpen;
      if (comparatorPanelState === 'expanded') state('expanded');
      comparatorFocus?.focus({preventScroll:true});
    }
  }).observe(comparator, {attributes:true, attributeFilter:['hidden']});
  function modeChanged() {
    const historical = app.dataset.appMode === 'historico';
    document.querySelector('#brand-eyebrow').textContent = historical ? 'MISIONES HISTÓRICAS' : app.dataset.appMode === 'experimental' ? 'SIMULACIÓN EXPERIMENTAL' : 'SISTEMA SOLAR';
    for (const key of ['history', 'photos', 'navigation']) inspector.querySelector(`[data-inspector-tab=${key}]`).hidden = !historical;
    inspector.querySelector('[data-inspector-tab=probe]').hidden = app.dataset.appMode !== 'experimental';
    document.querySelector('#historical-journey-status').hidden = !historical;
    document.querySelector('#historical-journey-entry').hidden = !historical;
    selectedDestination = null;
    searchInput.value = '';
    refreshDestinations();
    updateIntro();
    if (app.dataset.appMode === 'experimental') missionPanel.open = true;
    select(app.dataset.appMode === 'experimental' ? 'probe' : 'explore', false);
    state(matchMedia('(max-width: 760px)').matches ? 'closed' : historical || app.dataset.appMode === 'experimental' ? 'half' : 'closed');
  }
  new MutationObserver(modeChanged).observe(app, {attributes:true, attributeFilter:['data-app-mode']});
  matchMedia('(max-width: 760px)').addEventListener('change', () => state(inspector.dataset.state));
  for (const id of ['planet-info']) {
    const node = document.getElementById(id);
    new MutationObserver(() => {
      if (!node.hidden && app.dataset.appMode === 'exploracion') select('telemetry');
    }).observe(node, {attributes:true, attributeFilter:['hidden']});
  }
  document.addEventListener('sim:object-selected', event => {
    if (event.detail?.id) {
      selectedDestination = event.detail.id;
      const label = destinations.find(item => item.id === selectedDestination)?.label ?? selectedDestination;
      searchStatus.textContent = `Seleccionado: ${label}`;
      refreshDestinations();
    }
    const historicalPlanet = app.dataset.appMode === 'historico'
      && destinations.some(item => item.id === event.detail?.id && item.mode === 'planet');
    if (app.dataset.appMode === 'historico') return;
    select(app.dataset.appMode === 'experimental' && event.detail?.id === 'experimental-probe'
      ? 'probe' : historicalPlanet ? 'explore' : 'telemetry');
  });
  // Modal: foco contenido y retorno al control que lo abrió.
  const modal = document.querySelector('#photo-lightbox-modal');
  let modalFocus;
  new MutationObserver(() => {
    if (!modal.hidden) { modalFocus = document.activeElement; modal.querySelector('#lightbox-close-btn').focus(); }
    else modalFocus?.focus({preventScroll:true});
  }).observe(modal, {attributes:true, attributeFilter:['hidden']});
  modal.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const items = [...modal.querySelectorAll('button, a[href]')].filter(n => !n.disabled);
    if (e.shiftKey && document.activeElement === items[0]) { e.preventDefault(); items.at(-1).focus(); }
    else if (!e.shiftKey && document.activeElement === items.at(-1)) { e.preventDefault(); items[0].focus(); }
  });
  crearLayoutTemporal();
  for (const menu of document.querySelectorAll('.temporal-advanced')) {
    menu.addEventListener('toggle', () => {
      if (menu.open) { state('closed'); toolsMenu.open = false; }
    });
  }
  modeChanged();
}
