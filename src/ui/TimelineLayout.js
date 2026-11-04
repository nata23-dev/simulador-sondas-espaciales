import './timeline-layout.css';

// Reparent existing controls: their listeners, values and scientific time semantics stay intact.
export function crearLayoutTemporal() {
  if (document.querySelector('.temporal-main')) return;
  const pick = selector => document.querySelector(selector);
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
  // Do not auto-open an overlay when a hito pauses the engine; announce it in the trigger.
  const toast = pick('#hist-event-pause-toast');
  const updatePause = () => {
    historyAdvanced.details.querySelector('summary').textContent = toast.hidden ? 'Tiempo' : 'Tiempo · pausa en hito';
  };
  new MutationObserver(updatePause).observe(toast, { attributes: true, attributeFilter: ['hidden'] });
  updatePause();
}
