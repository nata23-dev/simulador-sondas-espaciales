// En este módulo gestiono la interfaz superpuesta del lanzamiento 3D: muestro el reloj de misión, el factor de aceleración,
// la altitud y velocidad del modelo, la fase activa, los acontecimientos con su fuente, los controles de reproducción y los avisos accesibles.
import { LANZAMIENTOS_VOYAGER, FUENTES_LANZAMIENTO } from '../science/VoyagerLaunchProfile.js';

const FECHA = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const HORA = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'UTC' });
// Reutilizo un formateador numérico por cantidad de decimales porque actualizo estos datos en cada fotograma del lanzamiento.
const formatosNum = new Map();
const NUM = (v, d) => {
  let formato = formatosNum.get(d);
  if (!formato) formatosNum.set(d, formato = new Intl.NumberFormat('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }));
  return formato.format(v);
};
const FUENTE_TEXTO = { tc6: 'informe de vuelo TC-6', prensa: 'dossier de prensa de NASA', reconstruido: 'reconstruido' };
// Defino los acontecimientos principales que marco sobre la barra de progreso; los demás los muestro en el panel al producirse.
const MARCAS = ['despegue', 'srm-separacion', 'cofia', 'meco1', 'mes2', 'separacion-nave', 'pm-apagado', 'mastiles'];

// Extraigo los metadatos legibles del lanzamiento histórico (nombre, vehículo, fecha y hora UTC de despegue).
export function metadatosLanzamiento(misionId) {
  const m = LANZAMIENTOS_VOYAGER[misionId];
  if (!m) return null;
  const despegue = Date.parse(m.srmIgnicionUtc) + m.eventos.find(e => e.id === 'despegue').t * 1000;
  return { misionId, nombreMision: m.nombre, vehiculo: m.vehiculo, fecha: FECHA.format(despegue), horaUtc: HORA.format(despegue) };
}

// Construyo la capa visual del lanzamiento cinematográfico sobre la escena y conecto todos sus controles de reproducción.
export function crearSuperficieLanzamientoCinematografico({ alPausar, alSiguiente, alAnterior, alVelocidad, alSaltar, alReiniciar, alIrAEvento }) {
  const overlay = document.createElement('div');
  overlay.id = 'launch-cinematic-overlay';
  overlay.className = 'launch-cinematic-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="launch-cinematic-topbar">
      <div class="launch-mission-badge">
        <span class="launch-tag">Lanzamiento histórico · 1977</span>
        <h2 id="launch-overlay-title" class="launch-title">Voyager 2</h2>
        <p id="launch-overlay-meta" class="launch-meta"></p>
      </div>
      <div class="launch-telemetry" aria-label="Reloj de misión y estado del vehículo">
        <div class="launch-clock-row"><span class="launch-clock" id="launch-clock">T − 00:24</span><span class="launch-rate" id="launch-rate" title="Velocidad de la reproducción respecto al tiempo real">×1</span></div>
        <p class="launch-utc" id="launch-utc"></p>
        <dl class="launch-readouts">
          <div><dt>Altitud</dt><dd id="launch-alt">0 km</dd></div>
          <div><dt title="Respecto a un sistema que no gira con la Tierra (incluye 0,41 km/s de rotación terrestre en LC-41)">Vel. inercial</dt><dd id="launch-vel">0,00 km/s</dd></div>
          <div><dt title="Respecto al suelo, que gira con la Tierra">Vel. suelo</dt><dd id="launch-vel-ground">0,00 km/s</dd></div>
        </dl>
        <p class="launch-model-note">Ascenso ilustrativo calibrado, no telemetría</p>
      </div>
      <button type="button" id="launch-skip-btn" class="launch-action-btn">Volver al Sistema Solar</button>
    </div>

    <p class="launch-loading" id="launch-loading" role="status" hidden>Acercándose a la Tierra…</p>

    <div class="launch-cinematic-bottombar">
      <div class="launch-phase-container">
        <span class="launch-phase-tag" id="launch-phase-tag">Aproximación a Cabo Cañaveral</span>
        <p class="launch-phase-desc" id="launch-phase-desc"></p>
        <p class="launch-event" id="launch-event"></p>
      </div>
      <div class="launch-progress-row">
        <div class="launch-progress-track" id="launch-progress-track">
          <div class="launch-progress-fill" id="launch-progress-bar"></div>
        </div>
        <div class="launch-ticks" id="launch-ticks"></div>
      </div>
      <div class="launch-control-row">
        <button type="button" id="launch-prev-btn" class="launch-ctrl-btn" aria-label="Acontecimiento anterior">⏮</button>
        <button type="button" id="launch-pause-btn" class="launch-ctrl-btn launch-ctrl-btn--main">Pausar</button>
        <button type="button" id="launch-next-btn" class="launch-ctrl-btn" aria-label="Siguiente acontecimiento">⏭</button>
        <div class="launch-speed" role="group" aria-label="Velocidad de reproducción">
          <button type="button" class="launch-ctrl-btn" data-speed="1" aria-pressed="true">×1</button>
          <button type="button" class="launch-ctrl-btn" data-speed="2" aria-pressed="false">×2</button>
          <button type="button" class="launch-ctrl-btn" data-speed="4" aria-pressed="false">×4</button>
        </div>
        <button type="button" id="launch-replay-btn" class="launch-ctrl-btn">Repetir</button>
        <details class="launch-fidelity">
          <summary>Fidelidad y fuentes</summary>
          <ul>
            <li><strong>Documentado:</strong> hora de lanzamiento, lugar (LC-41), secuencia de vuelo (<a href="${FUENTES_LANZAMIENTO.tc6.url}" target="_blank" rel="noopener">informe TC-6</a> para la Voyager 1; <a href="${FUENTES_LANZAMIENTO.prensa.url}" target="_blank" rel="noopener">dossier de prensa</a> para la Voyager 2), medidas, empujes y masas del vehículo (<a href="${FUENTES_LANZAMIENTO.resumen.url}" target="_blank" rel="noopener">resumen de sistemas</a>).</li>
            <li><strong>Calculado:</strong> posición del Sol y de las estrellas para el instante (contrastada con JPL Horizons).</li>
            <li><strong>Ilustrativo:</strong> trayectoria de ascenso (modelo sin atmósfera calibrado para llegar a la órbita de aparcamiento documentada), llamas, humo, viento y nubes (más nubosidad el 20 de agosto según la fotografía PIA21744).</li>
            <li><strong>Aproximado:</strong> plataforma y torres de 1977, a partir de fotografías; el terreno es la ortoimagen del USGS de 2024 y la Tierra, Blue Marble de NASA.</li>
            <li>Al final se muestra el modelo 3D oficial de NASA de la Voyager con los mástiles desplegados; el despliegue real del magnetómetro fue posterior.</li>
          </ul>
        </details>
      </div>
    </div>
    <p class="sr-only" id="launch-live" aria-live="polite"></p>
  `;
  document.querySelector('.scene-panel').append(overlay);

  const $ = sel => overlay.querySelector(sel);
  const el = {
    titulo: $('#launch-overlay-title'), meta: $('#launch-overlay-meta'), reloj: $('#launch-clock'), factor: $('#launch-rate'), utc: $('#launch-utc'),
    alt: $('#launch-alt'), vel: $('#launch-vel'), velSuelo: $('#launch-vel-ground'), carga: $('#launch-loading'), fase: $('#launch-phase-tag'), faseTexto: $('#launch-phase-desc'),
    evento: $('#launch-event'), barra: $('#launch-progress-bar'), marcas: $('#launch-ticks'), vivo: $('#launch-live'), pausa: $('#launch-pause-btn')
  };
  // Conecto los botones de pausa, salto entre acontecimientos, repetición, salida y cambio de velocidad de reproducción.
  $('#launch-pause-btn').addEventListener('click', () => alPausar?.());
  $('#launch-next-btn').addEventListener('click', () => alSiguiente?.());
  $('#launch-prev-btn').addEventListener('click', () => alAnterior?.());
  $('#launch-replay-btn').addEventListener('click', () => alReiniciar?.());
  $('#launch-skip-btn').addEventListener('click', () => alSaltar?.());
  const botonesVelocidad = [...overlay.querySelectorAll('[data-speed]')];
  for (const b of botonesVelocidad) b.addEventListener('click', () => {
    const k = Number(b.dataset.speed);
    botonesVelocidad.forEach(o => o.setAttribute('aria-pressed', String(o === b)));
    alVelocidad?.(k);
  });
  let faseActual = null;

  return {
    overlay,
    // Muestro u oculto la capa del lanzamiento y restablezco el encabezado y el estado visual de los controles.
    mostrar(visible = true, meta = null) {
      overlay.hidden = !visible;
      if (!visible) return;
      el.pausa.textContent = 'Pausar';
      botonesVelocidad.forEach(o => o.setAttribute('aria-pressed', String(o.dataset.speed === '1')));
      if (meta) {
        el.titulo.textContent = meta.nombreMision;
        el.meta.textContent = `${meta.fecha} · ${meta.horaUtc} UTC · ${meta.vehiculo} · LC-41, Cabo Cañaveral (Florida)`;
      }
      el.marcas.replaceChildren(); el.evento.textContent = ''; faseActual = null;
    },
    esVisible: () => !overlay.hidden,
    establecerCargando(texto) { el.carga.hidden = !texto; el.carga.textContent = texto ?? ''; overlay.classList.toggle('is-loading', Boolean(texto)); },
    // Coloco los botones de los hitos principales a lo largo de la barra de progreso según su instante de presentación.
    configurarLinea(eventos, duracion) {
      el.marcas.replaceChildren(...eventos.filter(e => MARCAS.includes(e.id)).map(e => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'launch-tick'; b.style.left = `${(100 * e.p / duracion).toFixed(2)}%`;
        b.title = e.nombre; b.setAttribute('aria-label', `Ir a: ${e.nombre}`);
        b.addEventListener('click', () => alIrAEvento?.(e.id));
        return b;
      }));
    },
    // Actualizo en cada fotograma el reloj, las lecturas del ascenso, la barra de avance y los anuncios accesibles cuando cambia el evento.
    actualizar(estado) {
      el.reloj.textContent = estado.reloj;
      const f = estado.factor * estado.velocidad;
      el.factor.textContent = estado.pausado ? 'En pausa' : `×${f >= 10 || Math.abs(f - Math.round(f)) < 0.05 ? Math.round(f) : NUM(f, 1)}`;
      el.factor.dataset.estado = estado.pausado ? 'pausa' : f > 1.05 ? 'acelerado' : 'real';
      el.utc.textContent = `${HORA.format(estado.utcMs)} UTC`;
      el.alt.textContent = `${NUM(estado.altitudKm, estado.altitudKm < 10 ? 2 : 0)} km`;
      el.vel.textContent = `${NUM(estado.velocidadKmS, 2)} km/s`;
      el.velSuelo.textContent = `${NUM(estado.velocidadSueloKmS, 2)} km/s`;
      el.pausa.textContent = estado.pausado ? 'Reanudar' : 'Pausar';
      el.barra.style.width = `${(100 * estado.progreso).toFixed(2)}%`;
      if (estado.fase.id !== faseActual) {
        faseActual = estado.fase.id;
        el.fase.textContent = estado.fase.titulo; el.faseTexto.textContent = estado.fase.texto;
      }
      if (estado.evento) {
        const e = estado.evento;
        el.evento.textContent = `${e.nombre} · ${e.t < 0 ? '' : 'T + '}${e.t < 60 ? `${NUM(e.t, 1)} s` : `${Math.floor(e.t / 60)} min ${NUM(e.t % 60, 0)} s`} · ${FUENTE_TEXTO[e.fuente]}${e.nota ? ` (${e.nota})` : ''}`;
      } else el.evento.textContent = 'Cuenta atrás: los tiempos de vuelo se cuentan desde la ignición de los motores sólidos (T 0).';
      if (estado.eventoNuevo) el.vivo.textContent = `${estado.reloj}: ${estado.eventoNuevo.nombre}.`;
    }
  };
}
