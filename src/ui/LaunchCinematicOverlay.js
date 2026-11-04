import { FASES_LANZAMIENTO } from '../graphics/LaunchCinematicController.js';

export function crearSuperficieLanzamientoCinematografico({
  alPausar,
  alReanudar,
  alSaltar,
  alReiniciar
}) {
  const overlay = document.createElement('div');
  overlay.id = 'launch-cinematic-overlay';
  overlay.className = 'launch-cinematic-overlay';
  overlay.hidden = true;

  overlay.innerHTML = `
    <div class="launch-cinematic-topbar hud-secondary">
      <div class="launch-mission-badge">
        <span class="launch-tag">LANZAMIENTO HISTÓRICO 1977</span>
        <h2 id="launch-overlay-title" class="launch-title">Voyager 2</h2>
        <p id="launch-overlay-meta" class="launch-meta">
          20 de agosto de 1977 · 14:29:44 UTC · Titan IIIE-Centaur · LC-41 Cabo Cañaveral
        </p>
      </div>
      <div class="launch-top-actions">
        <button type="button" id="launch-skip-btn" class="button-secondary launch-action-btn">
          Saltar introducción ⏭
        </button>
      </div>
    </div>

    <div class="launch-cinematic-bottombar hud-secondary">
      <div class="launch-phase-container">
        <span class="launch-phase-tag" id="launch-phase-tag">Fase: Preparación en plataforma</span>
        <p class="launch-phase-desc" id="launch-phase-desc">
          El Titan IIIE-Centaur se encuentra en la plataforma LC-41 listo para la ignición.
        </p>
      </div>

      <div class="launch-progress-row">
        <div class="launch-progress-track">
          <div class="launch-progress-fill" id="launch-progress-bar" style="width: 0%"></div>
        </div>
      </div>

      <div class="launch-control-row">
        <button type="button" id="launch-pause-btn" class="launch-ctrl-btn">Pausar</button>
        <button type="button" id="launch-replay-btn" class="launch-ctrl-btn">Repetir ↺</button>
        <span class="launch-honesty-note">
          Reconstrucción visual cinematográfica basada en datos oficiales de NASA. La trayectoria interplanetaria utiliza efemérides Horizons.
        </span>
      </div>
    </div>
  `;

  document.querySelector('.scene-panel').append(overlay);

  const elTitle = overlay.querySelector('#launch-overlay-title');
  const elMeta = overlay.querySelector('#launch-overlay-meta');
  const elPhaseTag = overlay.querySelector('#launch-phase-tag');
  const elPhaseDesc = overlay.querySelector('#launch-phase-desc');
  const elProgressBar = overlay.querySelector('#launch-progress-bar');
  const btnPause = overlay.querySelector('#launch-pause-btn');
  const btnReplay = overlay.querySelector('#launch-replay-btn');
  const btnSkip = overlay.querySelector('#launch-skip-btn');

  let pausado = false;

  const DESCRIPCIONES_FASE = {
    [FASES_LANZAMIENTO.APROXIMACION_TIERRA]: {
      tag: 'Aproximación a Cabo Cañaveral',
      desc: 'Descenso orbital hacia el Complejo de Lanzamiento 41 en la costa atlántica de Florida.'
    },
    [FASES_LANZAMIENTO.PREPARACION_PLATAFORMA]: {
      tag: 'T-5s · Preparación en plataforma LC-41',
      desc: 'El Titan IIIE-Centaur de 48.8 m con sus dos propulsores sólidos UA1205 retrae los brazos umbilicales de servicio.'
    },
    [FASES_LANZAMIENTO.DESPEGUE]: {
      tag: 'T+0s · Despegue e Ignición',
      desc: 'Ignición simultánea de los dos propulsores de combustible sólido UA1205 generando 10.6 millones de Newtons de empuje.'
    },
    [FASES_LANZAMIENTO.ASCENSO_ATMOSFERICO]: {
      tag: 'Ascenso atmosférico a velocidad supersónica',
      desc: 'El cohete atraviesa la estratosfera; la curvatura terrestre se amplía y el cielo se oscurece hacia el negro espacial.'
    },
    [FASES_LANZAMIENTO.SEPARACION_ETAPAS]: {
      tag: 'Separación de propulsores y cofia',
      desc: 'Los propulsores sólidos UA1205 se separan lateralmente; la cofia Centaur Standard Shroud se abre revelando a Voyager.'
    },
    [FASES_LANZAMIENTO.INYECCION_VOYAGER]: {
      tag: 'Inyección hacia Júpiter y despliegue',
      desc: 'La etapa criogénica Centaur D-1T y Star-37E inyectan a la sonda en su trayectoria de escape interplanetaria.'
    }
  };

  btnPause.addEventListener('click', () => {
    pausado = !pausado;
    btnPause.textContent = pausado ? 'Reanudar' : 'Pausar';
    if (pausado) alPausar?.();
    else alReanudar?.();
  });

  btnReplay.addEventListener('click', () => {
    pausado = false;
    btnPause.textContent = 'Pausar';
    alReiniciar?.();
  });

  btnSkip.addEventListener('click', () => {
    alSaltar?.();
  });

  return {
    overlay,
    mostrar(visible = true, meta = null) {
      overlay.hidden = !visible;
      pausado = false;
      btnPause.textContent = 'Pausar';
      if (meta) {
        elTitle.textContent = meta.nombreMision;
        elMeta.textContent = `${meta.fechaLanzamientoUtc} · ${meta.vehiculo}`;
      }
    },
    esVisible: () => !overlay.hidden,
    actualizarFase({ fase, progresoNormalizado }) {
      const info = DESCRIPCIONES_FASE[fase];
      if (info) {
        elPhaseTag.textContent = `Fase: ${info.tag}`;
        elPhaseDesc.textContent = info.desc;
      }
      elProgressBar.style.width = `${Math.round(progresoNormalizado * 100)}%`;
    }
  };
}
