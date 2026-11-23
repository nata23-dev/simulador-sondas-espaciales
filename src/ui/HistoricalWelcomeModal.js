/**
 * Modal de bienvenida elegante y breve para el Modo Histórico Voyager 1 y 2.
 * Presenta las dos opciones principales: Recorrido Guiado o Exploración Libre.
 */
import { destinoFocoAlCerrar, esVisible, moverFocoConTab } from './DialogFocus.js';

export function crearModalBienvenidaHistorica({
  alIniciarRecorridoGuiado,
  alExplorarLibremente,
  alVerLanzamiento
}) {
  const modal = document.createElement('div');
  modal.id = 'historical-welcome-modal';
  modal.className = 'photo-lightbox-modal historical-welcome-overlay';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'welcome-title');
  modal.hidden = true;

  modal.innerHTML = `
    <div class="welcome-card hud-secondary">
      <div class="welcome-header">
        <span class="eyebrow">NASA · MISIONES HISTÓRICAS 1977–2026</span>
        <h2 id="welcome-title">Explora las misiones Voyager</h2>
        <p class="welcome-intro">
          Sigue a Voyager 1 y 2 desde 1977, consulta fotografías NASA y explora sus trayectorias locales. Las discrepancias con Horizons directo siguen documentadas.
        </p>
      </div>

      <div class="welcome-actions">
        <button type="button" id="welcome-start-guided" class="button-primary welcome-btn-main">
          Iniciar recorrido guiado
        </button>
        <button type="button" id="welcome-explore-free" class="welcome-btn-secondary">
          Explorar libremente
        </button>
      </div>

      <div class="welcome-footer">
        <label class="welcome-dismiss-label">
          <input type="checkbox" id="welcome-dont-show-again" />
          <span>No mostrar esta bienvenida automáticamente al entrar</span>
        </label>
        <button type="button" id="welcome-close-btn" class="welcome-close-text">Cerrar</button>
      </div>
    </div>
  `;

  document.querySelector('.scene-panel').append(modal);

  const btnGuided = modal.querySelector('#welcome-start-guided');
  const btnFree = modal.querySelector('#welcome-explore-free');
  const btnClose = modal.querySelector('#welcome-close-btn');
  const checkDontShow = modal.querySelector('#welcome-dont-show-again');

  const STORAGE_KEY = 'voyager_simulator_hide_welcome_v1';
  let focoPrevio = null;

  // UX-02: la cabecera queda por encima del fondo del modal (workspace-layout.css) para poder usar la navegación global; la tarjeta
  // se centra en el espacio que queda debajo de ella.
  function ajustarACabecera() {
    const cabecera = document.querySelector('.app-header');
    const fondo = esVisible(cabecera) ? Math.max(0, Math.round(cabecera.getBoundingClientRect().bottom)) : 0;
    modal.style.setProperty('--welcome-cabecera', `${fondo}px`);
  }

  /**
   * Cierra la bienvenida. `restaurarFoco: false` cuando el foco ya va a otro sitio (un control de la cabecera, otro modo).
   */
  function cerrar({ restaurarFoco = true } = {}) {
    if (modal.hidden) return;
    modal.hidden = true;
    window.removeEventListener('resize', ajustarACabecera);
    if (checkDontShow.checked) {
      try {
        localStorage.setItem(STORAGE_KEY, 'true');
      } catch {}
    }
    // UX-02: el foco vuelve a donde estaba antes de abrirse (si sigue visible) en lugar de perderse en <body>.
    const actual = document.activeElement;
    const destino = restaurarFoco && (!actual || actual === document.body || modal.contains(actual)) ? destinoFocoAlCerrar(focoPrevio, modal) : null;
    if (destino) destino.focus({ preventScroll: true });
    else if (modal.contains(actual)) actual.blur();
    focoPrevio = null;
  }

  btnGuided.addEventListener('click', () => {
    cerrar();
    alIniciarRecorridoGuiado?.();
  });

  btnFree.addEventListener('click', () => {
    cerrar();
    alExplorarLibremente?.();
  });

  btnClose.addEventListener('click', () => cerrar());

  // Clic en el fondo (fuera de la tarjeta).
  modal.addEventListener('click', event => {
    if (event.target === modal) cerrar();
  });

  // Escape cierra la bienvenida y nada más (no llega a los demás atajos de Escape, p. ej. cerrar el panel lateral). UX-02: Tab y
  // Mayús+Tab recorren solo los controles de la tarjeta (diálogo modal), aunque el foco se haya quedado fuera tras un clic. La
  // paleta «Buscar», si está abierta encima, atiende estas teclas antes (fase de captura) y las marca como atendidas.
  document.addEventListener('keydown', event => {
    if (modal.hidden || event.defaultPrevented) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      cerrar();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      moverFocoConTab(modal, event.shiftKey);
    }
  });

  // UX-02: activar un control de la cabecera (cambiar de sección, Buscar, Menú) cierra la bienvenida y el control actúa con el
  // mismo clic. También cubre los cambios de sección pedidos desde la búsqueda o el menú (pulsan esos mismos botones).
  document.addEventListener('click', event => {
    if (modal.hidden || !event.target?.closest?.('.app-header :is(button, a[href], summary, input, select, [role="button"])')) return;
    cerrar({ restaurarFoco: false });
  }, true);

  return {
    modal,
    abrir(forzar = false) {
      if (!forzar) {
        try {
          if (localStorage.getItem(STORAGE_KEY) === 'true') return;
        } catch {}
      }
      if (modal.hidden) focoPrevio = document.activeElement;
      modal.hidden = false;
      ajustarACabecera();
      window.addEventListener('resize', ajustarACabecera);
      btnGuided.focus();
    },
    cerrar,
    estaAbierto: () => !modal.hidden
  };
}
