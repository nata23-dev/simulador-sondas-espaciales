import { MOON_RADIUS_SOURCE } from '../science/PlanetaryMoons.js';
import { MOON_CATALOG as MOONS } from '../science/MoonCatalog.js';

const km = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 });
export function crearPanelInfoLuna({ alPlaneta, alVistaGeneral }) {
  const panel = document.createElement('details');
  panel.id = 'moon-info';
  panel.className = 'moon-info';
  panel.hidden = true;
  panel.open = true;
  panel.innerHTML = `<summary>Satélite natural · <strong id="moon-info-title"></strong></summary>
    <div class="moon-info-content">
      <p id="moon-info-description"></p>
      <dl>
        <div><dt>Planeta central</dt><dd id="moon-info-parent"></dd></div>
        <div><dt>Identificador NAIF</dt><dd id="moon-info-naif"></dd></div>
        <div><dt>Radio medio documentado</dt><dd id="moon-info-radius"></dd></div>
        <div><dt>Distancia centro–centro calculada</dt><dd id="moon-info-distance"></dd></div>
        <div><dt>Efeméride</dt><dd id="moon-info-status"></dd></div>
      </dl>
      <p>Vector relativo al centro planetario · ICRF eclíptica J2000 · TDB · km. Interpolación Hermite C¹ dentro de la cobertura validada. Radio y distancia visual en escala científica 1:1.</p>
      <p id="moon-info-surface"></p>
      <p>Radio: <a href="${MOON_RADIUS_SOURCE}" target="_blank" rel="noopener">JPL SSD</a>. Posición: <a href="https://ssd.jpl.nasa.gov/horizons/" target="_blank" rel="noopener">JPL Horizons</a>.</p>
      <div class="moon-info-actions"><button id="moon-return-parent" type="button">Volver al planeta</button><button id="moon-return-overview" type="button">Vista general</button></div>
    </div>`;
  document.querySelector('#planet-info').after(panel);
  panel.querySelector('#moon-return-parent').addEventListener('click', () => alPlaneta?.());
  panel.querySelector('#moon-return-overview').addEventListener('click', () => alVistaGeneral?.());

  function actualizar(key, state) {
    panel.hidden = !key;
    if (!key) return;
    const moon = MOONS[key];
    panel.querySelector('#moon-info-title').textContent = moon.name;
    panel.querySelector('#moon-info-description').textContent = moon.description;
    panel.querySelector('#moon-info-parent').textContent = moon.parent === 'Jupiter' ? 'Júpiter' : moon.parent;
    panel.querySelector('#moon-info-naif').textContent = `${moon.id} · centro ${moon.center}`;
    panel.querySelector('#moon-info-radius').textContent = `${km.format(moon.radiusKm)} km`;
    panel.querySelector('#moon-info-distance').textContent = state ? `${km.format(state.distanceKm)} km` : 'Sin dato';
    panel.querySelector('#moon-info-status').textContent = state ? `${state.status} · ${state.jdTdb} JD TDB` : 'Fuera de cobertura';
    const visual = moon.texture;
    const source = document.createElement('a');
    source.href = visual.source;
    source.target = '_blank';
    source.rel = 'noopener';
    source.textContent = 'Fuente del mapa';
    panel.querySelector('#moon-info-surface').replaceChildren(
      document.createTextNode(`${visual.label} ${visual.limitation} `), source
    );
    panel.querySelector('#moon-return-parent').disabled = !state;
  }
  return { actualizar };
}
