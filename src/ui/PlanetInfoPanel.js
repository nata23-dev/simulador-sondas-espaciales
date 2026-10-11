// Unidad astronómica exacta (IAU 2012): 149 597 870 700 m.
export const KILOMETROS_POR_AU = 149597870.7;
export const SEGUNDOS_POR_DIA = 86400;

const ETIQUETAS = { Jupiter: 'Júpiter' };
const formatoAU = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
const formatoKm = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
const formatoVelocidad = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 3 });

export function derivarDatos(estado) {
  const p = estado.posicionAU;
  const v = estado.velocidadAUporDia;
  const distanciaAU = Math.hypot(p.x, p.y, p.z);
  const velocidadAUporDia = Math.hypot(v.x, v.y, v.z);
  return {
    distanciaAU,
    distanciaKm: distanciaAU * KILOMETROS_POR_AU,
    velocidadAUporDia,
    velocidadKmPorSegundo: velocidadAUporDia * KILOMETROS_POR_AU / SEGUNDOS_POR_DIA
  };
}

export function crearPanelInfoPlaneta() {
  const panel = document.querySelector('#planet-info');
  panel.querySelector('summary').addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      panel.open = !panel.open;
    }
  });
  const campos = Object.fromEntries([
    'title', 'distance-au', 'distance-km', 'pos-x', 'pos-y', 'pos-z',
    'speed', 'speed-au', 'date', 'reference'
  ].map(nombre => [nombre, document.querySelector(`#info-${nombre}`)]));

  function actualizar(nombre, estado, metadatos, fechaISO) {
    if (!nombre || !estado) {
      panel.hidden = true;
      return;
    }

    const aparece = panel.hidden;
    const calculados = derivarDatos(estado);
    panel.hidden = false;
    if (aparece && window.matchMedia('(max-width: 760px)').matches) panel.open = false;
    campos.title.textContent = ETIQUETAS[nombre] ?? nombre;
    campos['distance-au'].textContent = `${formatoAU.format(calculados.distanciaAU)} AU`;
    campos['distance-km'].textContent = `${formatoKm.format(calculados.distanciaKm)} km`;
    campos['pos-x'].textContent = `${formatoAU.format(estado.posicionAU.x)} AU`;
    campos['pos-y'].textContent = `${formatoAU.format(estado.posicionAU.y)} AU`;
    campos['pos-z'].textContent = `${formatoAU.format(estado.posicionAU.z)} AU`;
    campos.speed.textContent = `${formatoVelocidad.format(calculados.velocidadKmPorSegundo)} km/s`;
    campos['speed-au'].textContent = `${formatoAU.format(calculados.velocidadAUporDia)} AU/día`;
    campos.date.textContent = `${fechaISO} · 00:00 TDB`;
    campos.date.title = estado.fechaTDB;
    campos.reference.textContent = `${metadatos.plano} · ${metadatos.referencia} · centro: Sol`;
  }

  actualizar(null);
  return { actualizar };
}
