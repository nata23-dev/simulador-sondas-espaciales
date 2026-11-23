// En este módulo gestiono el diálogo modal de bienvenida del Modo Histórico Voyager 1 y 2.
// Ofrezco elegir entre el recorrido guiado o la exploración libre, atrapo el foco del teclado dentro de la tarjeta y respeto los controles de la cabecera global.
import { destinoFocoAlCerrar, esVisible, moverFocoConTab } from './DialogFocus.js';

// Construyo el diálogo de bienvenida, persisto la preferencia de no volver a mostrarlo y conecto el cierre accesible por teclado y cabecera.
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

  // Mido la altura actual de la cabecera global para centrar la tarjeta en el área útil que queda debajo de ella.
  function ajustarACabecera() {
    const cabecera = document.querySelector('.app-header');
    const fondo = esVisible(cabecera) ? Math.max(0, Math.round(cabecera.getBoundingClientRect().bottom)) : 0;
    modal.style.setProperty('--welcome-cabecera', `${fondo}px`);
  }

  // Cierro el diálogo, guardo la preferencia si el usuario marcó la casilla y devuelvo el foco al control anterior salvo que otro control ya lo haya tomado.
  function cerrar({ restaurarFoco = true } = {}) {
    if (modal.hidden) return;
    modal.hidden = true;
    window.removeEventListener('resize', ajustarACabecera);
    if (checkDontShow.checked) {
      try {
        localStorage.setItem(STORAGE_KEY, 'true');
      } catch {}
    }
    // Si el foco sigue dentro del modal o se perdió en <body>, lo devuelvo al elemento que estaba activo antes de abrirlo.
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

  // Cierro la bienvenida cuando el usuario pulsa sobre el fondo oscuro fuera de la tarjeta.
  modal.addEventListener('click', event => {
    if (event.target === modal) cerrar();
  });

  // Cierro únicamente este diálogo con Escape y mantengo Tab y Mayús+Tab circulando dentro de sus controles;
  // si la paleta de búsqueda está encima, ella atiende primero en captura y marca el evento como prevenido.
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

  // Si el usuario pulsa cualquier control de la cabecera global (cambiar modo, Buscar o Menú), cierro la bienvenida en captura sin robar el foco al destino.
  document.addEventListener('click', event => {
    if (modal.hidden || !event.target?.closest?.('.app-header :is(button, a[href], summary, input, select, [role="button"])')) return;
    cerrar({ restaurarFoco: false });
  }, true);

  return {
    modal,
    // Muestro el modal (respetando la preferencia guardada salvo que se fuerce), ajusto su posición y llevo el foco al botón principal.
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
