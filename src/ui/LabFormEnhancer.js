// En este módulo mejoro la presentación visual de los formularios y resultados del laboratorio.
// Leo valores ya escritos en el DOM para generar resúmenes compactos, tonos de veredicto y tiras de cifras clave; nunca calculo magnitudes físicas ni modifico entradas o resultados.

// Defino qué métricas existentes extraigo de cada panel de resultados y con qué rótulo corto las muestro.
const KPI_CONFIG = Object.freeze({
  'ln-results': [[/^Δv propulsivo integrado$/, 'Δv integrado'], [/^Propelente consumido$/, 'Propelente usado'], [/^Perigeo \(altitud\)$/, 'Perigeo'], [/^Apogeo \(altitud\)$/, 'Apogeo']],
  'ld-results': [[/^Contacto: velocidad vertical$/, 'Contacto vertical'], [/^Contacto: velocidad horizontal$/, 'Contacto horizontal'], [/^Δv propulsivo integrado$/, 'Δv integrado'], [/^Duración$/, 'Duración']],
  'mission-summary': [[/^Tiempo de vuelo$/, 'Tiempo de vuelo'], [/^Δv inyección terrestre$/, 'Δv de inyección'], [/^Δv total presupuestado$/, 'Δv presupuestado'], [/^Combustible requerido, ideal$/, 'Combustible requerido']],
  'ip-selected': [[/^Tiempo de vuelo$/, 'Tiempo de vuelo'], [/^C3 de salida$/, 'C3 de salida'], [/^v∞ de salida$/, 'v∞ salida'], [/^v∞ de llegada$/, 'v∞ llegada']],
  'im-summary': [[/^Duración de la cadena$/, 'Duración'], [/^C3 de salida/, 'C3 de salida'], [/^Masa en la inyección$/, 'Masa inicial'], [/^Periapsis de llegada$/, 'Llegada']]
});
// Uso estas expresiones únicamente para asignar el tono cromático del veredicto sin alterar nunca su texto.
const BAD = /NO VIABLE|INSUFICIENTE|IMPACTO|AGOTADO|BRUSCO|FALL|SIN CAPTURA|NO ALCANZ|NO CONVERG|NO VERIFICABLE|NO DISPONIBLE|EMPUJE INSUFICIENTE/i;
const OK = /ALCANZAD|SUAVE|VIABLE|COMPLETA|LOGRAD|CONVERG/i;

const unitOf = text => /\(([^()]{1,14})\)\s*$/.exec(text)?.[1] ?? '';
const shortValue = text => { const first = text.split(' · ')[0].trim(); return first.length > 26 ? `${first.slice(0, 25)}…` : first; };

// Observo el contenedor del laboratorio y programo en el siguiente fotograma los resúmenes, las cifras clave y los tonos de estado.
export function createLabFormEnhancer() {
  const lab = document.querySelector('#experimental-lab');
  if (!lab) return { dispose() {} };
  let scheduled = 0;

  function fieldLabel(field) {
    return [...field.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join(' ').trim();
  }
  // Pinto en la cabecera de cada bloque desplegable un resumen corto con hasta tres parámetros configurados.
  function summarize(details) {
    const summary = details.querySelector(':scope > summary');
    if (!summary) return;
    let tag = summary.querySelector(':scope > .section-summary');
    const parts = [];
    for (const field of details.querySelectorAll(':scope > label.lab-field, :scope > .lab-field-row > label.lab-field')) {
      const control = field.querySelector('input:not([type=checkbox]):not([type=hidden]), select');
      if (!control || parts.length >= 3) continue;
      let value = control.tagName === 'SELECT' ? control.selectedOptions[0]?.textContent?.trim() ?? '' : control.value.trim();
      if (!value) continue;
      if (control.type === 'number' && Number.isFinite(Number(value))) value = Number(value).toLocaleString('en-US', { maximumFractionDigits: 3 });
      if (value.length > 22) value = `${value.slice(0, 21)}…`;
      const unit = control.type === 'number' ? unitOf(fieldLabel(field)) : '';
      parts.push(unit ? `${value} ${unit}` : value);
    }
    const text = parts.join(' · ');
    if (!text) { tag?.remove(); return; }
    if (!tag) { tag = document.createElement('span'); tag.className = 'section-summary'; tag.setAttribute('aria-hidden', 'true'); summary.append(tag); }
    if (tag.textContent !== text) tag.textContent = text;
  }
  // Deduzco el tono visual de los bloques de estado que todavía no traen un data-tone explícito.
  function toneVerdicts() {
    for (const status of lab.querySelectorAll('.mission-status')) {
      // Respeto el tono cuando el planificador ya lo declaró explícitamente.
      if (status.dataset.tone) continue;
      const text = status.textContent;
      const tone = BAD.test(text) ? 'bad' : OK.test(text) ? 'ok' : 'neutral';
      if (status.dataset.heroTone !== tone) status.dataset.heroTone = tone;
    }
  }
  // Construyo o actualizo la tira de cifras clave encima del bloque de métricas cuando hay al menos dos valores válidos.
  function renderKpis(id) {
    const container = lab.querySelector(`#${id}`);
    if (!container) return;
    let strip = container.parentElement.querySelector(`:scope > .lab-kpis[data-for="${id}"]`);
    const rows = [...container.querySelectorAll('.lab-metric')].map(row => [row.firstElementChild?.textContent?.trim() ?? '', row.lastElementChild?.textContent?.trim() ?? '']);
    const picked = [];
    for (const [pattern, label] of KPI_CONFIG[id]) {
      const match = rows.find(([name, value]) => pattern.test(name) && value && value !== '—');
      if (match) picked.push([label, shortValue(match[1])]);
    }
    if (picked.length < 2) { strip?.remove(); return; }
    if (!strip) {
      strip = document.createElement('dl'); strip.className = 'lab-kpis'; strip.dataset.for = id;
      container.before(strip);
    }
    const signature = picked.map(pair => pair.join('=')).join('|');
    if (strip.dataset.signature === signature) return;
    strip.dataset.signature = signature;
    strip.replaceChildren(...picked.map(([label, value]) => {
      const item = document.createElement('div'); const dt = document.createElement('dt'); const dd = document.createElement('dd');
      dt.textContent = label; dd.textContent = value; item.append(dt, dd); return item;
    }));
  }
  // Ejecuto el refresco consolidado una sola vez por fotograma.
  function refresh() {
    scheduled = 0;
    for (const details of lab.querySelectorAll('details.ft-section')) summarize(details);
    for (const id of Object.keys(KPI_CONFIG)) renderKpis(id);
    toneVerdicts();
  }
  const schedule = () => { if (!scheduled) scheduled = requestAnimationFrame(refresh); };
  lab.addEventListener('input', schedule);
  lab.addEventListener('change', schedule);
  lab.addEventListener('click', schedule);
  // Ignoro las mutaciones que produzco yo mismo en resúmenes y cifras clave para evitar bucles de observación.
  const own = node => node.nodeType === 1 && node.matches('.section-summary, .lab-kpis');
  const isOwn = m => (m.target.nodeType === 1 && m.target.closest('.section-summary, .lab-kpis'))
    || (m.addedNodes.length + m.removedNodes.length > 0 && [...m.addedNodes, ...m.removedNodes].every(own));
  // Ignoro también las actualizaciones continuas del Centro de Misión, que reescribe telemetría en cada fotograma sin afectar a los formularios.
  const inCenter = m => (m.target.nodeType === 1 ? m.target : m.target.parentElement)?.closest('#lab-mission-center');
  const observer = new MutationObserver(mutations => { if (!mutations.every(m => isOwn(m) || inCenter(m))) schedule(); });
  observer.observe(lab, { childList: true, subtree: true, characterData: true });
  schedule();
  return { refresh, dispose() { observer.disconnect(); lab.removeEventListener('input', schedule); lab.removeEventListener('change', schedule); lab.removeEventListener('click', schedule); } };
}
