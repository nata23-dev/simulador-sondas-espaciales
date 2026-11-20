// Etapa 14.1 — portada del Sistema Solar: misiones destacadas como puerta de entrada a Voyager y al laboratorio.
// Cada tarjeta solo navega con los controles existentes. Las imágenes son fotografías Voyager (NASA/JPL) ya incluidas en el
// proyecto con sus créditos; no se presentan como vistas del simulador.
const BASE = import.meta.env.BASE_URL;
const STORAGE_KEY = 'simulador:featured-collapsed';

const CARDS = Object.freeze([
  { id: 'voyager-1', accent: 'voyager-1', title: 'Voyager 1', meta: 'Lanzada el 5 sep 1977', text: 'Júpiter, Saturno y Titán; hoy, el objeto humano más lejano.', image: 'images/voyager/v1-jupiter-grs-1979-thumb.jpg', alt: 'Gran Mancha Roja de Júpiter fotografiada por Voyager 1 en 1979', area: 'voyager', destination: 'voyager-1' },
  { id: 'voyager-2', accent: 'voyager-2', title: 'Voyager 2', meta: 'Neptuno · 25 ago 1989', text: 'La única visita a Urano y Neptuno, con el gran recorrido de 1977–1989.', image: 'images/voyager/v2-neptune-gds-1989-thumb.jpg', alt: 'Neptuno y su Gran Mancha Oscura fotografiados por Voyager 2 en 1989', area: 'voyager', destination: 'voyager-2' },
  // 16: puerta de entrada para quien llega por primera vez al laboratorio.
  { id: 'guide', accent: 'mission', title: 'Tu primera misión: Cassini a Marte', meta: 'Laboratorio · misión guiada en 5 pasos', text: 'Elige la sonda, calcula el viaje con efemérides de NASA/JPL y míralo en 3D.', image: 'textures/mars.jpg', alt: '', area: 'guide', planet: true },
  { id: 'integrated', accent: 'mission', title: 'Misión completa a Europa', meta: 'Laboratorio · pendiente de auditoría independiente', text: 'Captura en Júpiter y sobrevuelo de Europa con Cassini o Juno, por fases.', image: 'images/voyager/v1-europa-1979-thumb.jpg', alt: 'Europa fotografiada por Voyager 1 en 1979', area: 'integrated' }
]);

export function createFeaturedMissions({ navigator } = {}) {
  const app = document.querySelector('#app');
  const scene = document.querySelector('.scene-panel');
  if (!app || !scene) return { dispose() {} };
  const panel = document.createElement('aside');
  panel.id = 'featured-panel'; panel.className = 'featured-panel hud-secondary';
  panel.setAttribute('aria-label', 'Misiones destacadas');
  panel.innerHTML = `<div class="fm-head"><span class="fm-title">Misiones destacadas</span>
      <button type="button" class="fm-collapse" aria-expanded="true" aria-controls="featured-list" title="Contraer"><svg class="icon" aria-hidden="true"><use href="#icon-chevrons-left"></use></svg></button></div>
    <div id="featured-list" class="fm-list"></div>
    <div class="fm-foot"><button type="button" class="fm-all"><svg class="icon" aria-hidden="true"><use href="#icon-grid"></use></svg>Todas las áreas</button><small>Fotografías: NASA/JPL (Voyager)</small></div>`;
  const list = panel.querySelector('.fm-list');
  for (const card of CARDS) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'fm-card'; button.dataset.card = card.id; button.dataset.accent = card.accent;
    button.innerHTML = `<span class="fm-text"><strong></strong><span class="fm-meta"></span><small></small></span><span class="fm-media"></span>`;
    button.querySelector('strong').textContent = card.title;
    button.querySelector('.fm-meta').textContent = card.meta;
    button.querySelector('small').textContent = card.text;
    const media = button.querySelector('.fm-media');
    if (card.planet) { media.classList.add('fm-planet'); media.style.backgroundImage = `url("${BASE}${card.image}")`; }
    else { const img = document.createElement('img'); img.src = `${BASE}${card.image}`; img.alt = card.alt; img.loading = 'lazy'; img.decoding = 'async'; media.append(img); }
    button.addEventListener('click', () => open(card));
    list.append(button);
  }
  scene.append(panel);
  const collapseButton = panel.querySelector('.fm-collapse');
  let collapsed = false;
  try { collapsed = localStorage.getItem(STORAGE_KEY) === '1'; } catch { /* almacenamiento no disponible */ }
  if (window.matchMedia?.('(max-width: 760px)').matches) collapsed = true;
  function setCollapsed(value, remember = true) {
    collapsed = value; panel.dataset.collapsed = String(value);
    collapseButton.setAttribute('aria-expanded', String(!value));
    collapseButton.title = value ? 'Mostrar misiones destacadas' : 'Contraer';
    if (remember) { try { localStorage.setItem(STORAGE_KEY, value ? '1' : '0'); } catch { /* sin persistencia */ } }
  }
  collapseButton.addEventListener('click', () => setCollapsed(!collapsed));
  panel.querySelector('.fm-all').addEventListener('click', () => document.querySelector('#app-nav-toggle')?.click());
  async function open(card) {
    setCollapsed(true, false);
    await navigator?.go(card.area);
    if (card.destination) requestAnimationFrame(() => document.querySelector(`#context-search-results [data-destination="${card.destination}"]`)?.click());
  }
  const inspector = document.querySelector('#context-inspector');
  function updateVisibility() {
    const visible = app.dataset.appMode === 'exploracion' && !app.classList.contains('is-immersive')
      && (!inspector || inspector.dataset.state === 'closed' || !inspector.dataset.state);
    panel.hidden = !visible;
  }
  const observer = new MutationObserver(updateVisibility);
  observer.observe(app, { attributes: true, attributeFilter: ['data-app-mode', 'class'] });
  if (inspector) observer.observe(inspector, { attributes: true, attributeFilter: ['data-state'] });
  setCollapsed(collapsed, false);
  updateVisibility();
  return { dispose() { observer.disconnect(); panel.remove(); } };
}
