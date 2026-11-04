/**
 * Modal de bienvenida elegante y breve para el Modo Histórico Voyager 1 y 2.
 * Presenta las dos opciones principales: Recorrido Guiado o Exploración Libre.
 */
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

  function cerrar() {
    modal.hidden = true;
    if (checkDontShow.checked) {
      try {
        localStorage.setItem(STORAGE_KEY, 'true');
      } catch {}
    }
  }

  btnGuided.addEventListener('click', () => {
    cerrar();
    alIniciarRecorridoGuiado?.();
  });

  btnFree.addEventListener('click', () => {
    cerrar();
    alExplorarLibremente?.();
  });

  btnClose.addEventListener('click', cerrar);

  modal.addEventListener('click', event => {
    if (event.target === modal) cerrar();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !modal.hidden) cerrar();
  });

  return {
    modal,
    abrir(forzar = false) {
      if (!forzar) {
        try {
          if (localStorage.getItem(STORAGE_KEY) === 'true') return;
        } catch {}
      }
      modal.hidden = false;
      btnGuided.focus();
    },
    cerrar,
    estaAbierto: () => !modal.hidden
  };
}
