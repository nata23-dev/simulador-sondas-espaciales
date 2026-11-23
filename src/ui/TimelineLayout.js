// En este módulo reorganizo en el DOM los paneles temporales del Sistema Solar y del modo histórico para ofrecer
// controles compactos y menús avanzados sin alterar sus listeners ni su semántica de tiempo científico.
import './timeline-layout.css';

// Reubico los controles temporales existentes en una distribución unificada manteniendo intactos sus eventos y valores.
export function crearLayoutTemporal() {
  if (document.querySelector('.temporal-main')) return;
  const pick = selector => document.querySelector(selector);
  // Creo un desplegable de opciones temporales avanzadas con cierre mediante Escape o clic fuera del menú.
  function advanced(panel, id, label) {
    const details = document.createElement('details');
    details.id = id;
    details.className = 'temporal-advanced';
    const summary = document.createElement('summary');
    summary.textContent = label;
    summary.title = 'Abrir controles temporales avanzados';
    const body = document.createElement('div');
    body.className = 'temporal-advanced-body';
    details.append(summary, body);
    panel.append(details);
    details.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        details.open = false;
        summary.focus();
        event.stopPropagation();
      }
    });
    document.addEventListener('pointerdown', event => {
      if (details.open && !details.contains(event.target)) details.open = false;
    });
    return { details, body };
  }

  // Reordeno la barra temporal del Sistema Solar y agrupo la explicación TDB dentro del desplegable de opciones.
  const solar = pick('#timeline-panel');
  solar.classList.add('temporal-layout');
  const solarMain = document.createElement('div');
  solarMain.className = 'temporal-main temporal-main--solar';
  const solarControls = pick('.timeline-controls');
  const solarDate = pick('.date-field');
  const solarStatus = pick('#playback-status');
  solarMain.append(solarDate, solarControls, pick('.speed-field'));
  solar.prepend(solarMain);
  const solarAdvanced = advanced(solarMain, 'solar-time-options', 'Tiempo');
  solarAdvanced.body.append(pick('.timeline-heading'));
  const solarHelp = document.createElement('p');
  solarHelp.textContent = 'Fecha e instantes en TDB. En Sistema Solar se recorren muestras diarias; en Experimental, la reproducción utiliza el tiempo de misión del integrador orbital.';
  solarAdvanced.body.append(solarHelp);
  solarStatus.setAttribute('aria-live', 'polite');
  solar.append(pick('#timeline-range').closest('.range-row'));

  // Reordeno la barra temporal histórica separando el transporte principal de los ajustes de tiempo y selección de fecha.
  const historical = pick('#historical-timeline-panel');
  historical.classList.add('temporal-layout');
  const historicalMain = document.createElement('div');
  historicalMain.className = 'temporal-main temporal-main--historical';
  historicalMain.append(pick('.hist-clock-readout'), pick('.hist-transport-buttons'), pick('.hist-speed-label'));
  historical.prepend(historicalMain);
  const historyAdvanced = advanced(historicalMain, 'historical-time-options', 'Tiempo');
  const historyDate = advanced(historicalMain, 'historical-date-options', 'Fecha');
  const heading = document.createElement('strong');
  heading.className = 'temporal-options-heading';
  heading.textContent = 'Tiempo continuo · 1977–2026';
  const secondaryTransport = document.createElement('div');
  secondaryTransport.className = 'temporal-secondary-transport';
  secondaryTransport.append(pick('#hist-launch-btn'), pick('#hist-reverse-btn'), pick('#hist-latest-btn'));
  const assists = document.createElement('div');
  assists.className = 'temporal-assists';
  assists.append(...document.querySelectorAll('.hist-mini-check'));
  const jumps = pick('.hist-decade-bar');
  jumps.hidden = true;
  const openCatalog = document.createElement('button');
  openCatalog.type = 'button';
  openCatalog.className = 'temporal-open-catalog';
  openCatalog.textContent = 'Explorar acontecimientos (14)';
  openCatalog.addEventListener('click', () => pick('[data-inspector-tab="history"]').click());
  historyAdvanced.body.append(heading, secondaryTransport, assists, pick('#hist-event-pause-toast'), openCatalog);
  const eventNav = document.createElement('div');
  eventNav.className = 'historical-catalog-nav';
  eventNav.append(pick('#hist-prev-event-btn'), pick('#hist-next-event-btn'));
  eventNav.children[0].querySelector('span').textContent = 'Anterior acontecimiento';
  eventNav.children[1].querySelector('span').textContent = 'Siguiente acontecimiento';
  pick('#historical-event-detail').before(eventNav);
  historyDate.body.append(pick('.hist-date-selectors'));
  for (const item of [solarAdvanced.details, historyAdvanced.details, historyDate.details]) {
    item.addEventListener('toggle', () => {
      if (item.open) for (const other of [solarAdvanced.details, historyAdvanced.details, historyDate.details]) {
        if (other !== item) other.open = false;
      }
    });
  }
  historical.append(pick('.hist-range-row'));
  pick('.hist-transport-row').remove();
  // Evito abrir automáticamente un panel superpuesto cuando un hito pausa la reproducción; en su lugar lo indico en el disparador.
  const toast = pick('#hist-event-pause-toast');
  const updatePause = () => {
    historyAdvanced.details.querySelector('summary').textContent = toast.hidden ? 'Tiempo' : 'Tiempo · pausa en hito';
  };
  new MutationObserver(updatePause).observe(toast, { attributes: true, attributeFilter: ['hidden'] });
  updatePause();

  // Añado un indicador visual del estado del tiempo (en curso o en pausa) observando las etiquetas mantenidas por cada control.
  function stateChip(main, readPlaying, sources) {
    const chip = document.createElement('span');
    chip.className = 'temporal-state'; chip.setAttribute('aria-hidden', 'true');
    main.prepend(chip);
    const update = () => {
      const playing = readPlaying();
      chip.dataset.state = playing ? 'playing' : 'paused';
      chip.textContent = playing ? 'En curso' : 'En pausa';
    };
    const observer = new MutationObserver(update);
    for (const [node, options] of sources) if (node) observer.observe(node, options);
    update();
  }
  const playLabel = pick('#play-label');
  stateChip(solarMain, () => playLabel?.textContent.trim() === 'Pausar', [[playLabel, { childList: true, characterData: true, subtree: true }]]);
  const histPlay = pick('#hist-play-btn');
  stateChip(historicalMain, () => /^Pausar/.test(histPlay?.getAttribute('aria-label') ?? ''), [[histPlay, { attributes: true, attributeFilter: ['aria-label'] }]]);
}
