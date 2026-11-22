// Etapa 17 — ayudas contextuales para los términos científicos del laboratorio. Solo presentación: marca las etiquetas
// existentes (métricas, campos, cabeceras) cuyo texto empieza por un término conocido y muestra una explicación breve al
// pasar el puntero, al enfocarlas con el teclado o al tocarlas. No cambia ningún texto ni ningún cálculo.
export const GLOSSARY = Object.freeze([
  { id: 'dv', term: 'Δv (delta-v)', match: /^(Δv|Delta-v)|Δv (ideal|finito|impulsivo|sonda|de )/,
    text: 'Cambio de velocidad que puede dar la nave con su propelente, o que exige una maniobra. El «Δv ideal» sale de la ecuación de Tsiolkovski, sin pérdidas por gravedad ni por la duración del encendido.' },
  { id: 'isp', term: 'Impulso específico (Isp)', match: /^(Impulso específico|Isp)/,
    text: 'Eficiencia de un motor, en segundos: cuánto empuje da cada kilogramo de propelente por segundo. Con más Isp se gasta menos propelente para el mismo Δv.' },
  { id: 'c3', term: 'C3 (energía de salida)', match: /^C3/,
    text: 'Energía característica de salida: el cuadrado de la velocidad que le sobra a la nave al escapar de la Tierra (km²/s²). Cuanto mayor es, más potente debe ser el lanzamiento.' },
  { id: 'vinf', term: 'v∞ (velocidad de exceso hiperbólico)', match: /v∞/,
    text: 'Velocidad de la nave respecto a un planeta cuando todavía está lejos de su gravedad. Determina cuánto hay que frenar para quedar en órbita.' },
  { id: 'periapsis', term: 'Periapsis', match: /^Periapsis/,
    text: 'Punto de la órbita más cercano al cuerpo central. Aquí se da como altitud sobre la superficie salvo que se indique otra cosa.' },
  { id: 'apoapsis', term: 'Apoapsis', match: /^Apoapsis/,
    text: 'Punto de la órbita más alejado del cuerpo central.' },
  { id: 'aimed-capture', term: 'Captura apuntada', match: /^Captura apuntada/,
    text: 'Un encendido de captura largo baja el periapsis mientras actúa. Para acabar en la órbita pedida, la llegada se apunta a un periapsis más alto: se repiten el apuntado y el encendido hasta que el periapsis final coincide (método de la secante, con 10 m de tolerancia). Si no es posible, se dice por qué y la llegada se apunta al periapsis pedido.' },
  { id: 'parking-orbit', term: 'Órbita de aparcamiento', match: /^Órbita de aparcamiento/,
    text: 'Órbita baja alrededor de la Tierra donde la nave espera, tras el despegue, hasta llegar al punto desde el que la etapa superior la impulsa hacia el destino (inyección). La espera permite salir en la dirección correcta sin cambiar la hora del despegue.' },
  { id: 'azimuth', term: 'Acimut de lanzamiento', match: /^Acimut/,
    text: 'Dirección del despegue medida desde el norte: 90° es hacia el este, que es lo que más aprovecha la rotación de la Tierra. Lanzar más al norte inclina más la órbita; hace falta cuando la dirección de salida hacia el destino se aleja mucho del ecuador.' },
  { id: 'handoff', term: 'Empalme con el crucero', match: /^Empalme con el crucero/,
    text: 'Diferencia entre la velocidad con la que la nave sale de la esfera de influencia de la Tierra y la que pide la transferencia hacia el destino (problema de Lambert) en ese punto. El despegue, la espera y la inyección se ajustan hasta que es prácticamente cero.' },
  { id: 'nbody', term: 'Crucero de n cuerpos', match: /^(Crucero de n cuerpos|Solo los otros planetas)/,
    text: 'Propagación del crucero con la gravedad del Sol y de los planetas a la vez, integrada paso a paso. Las cónicas parcheadas solo usan el Sol en el crucero; la diferencia mide su error.' },
  { id: 'tcm', term: 'Corrección de trayectoria (TCM)', match: /^Corrección de trayectoria/,
    text: 'Pequeño encendido durante el crucero para volver a la trayectoria prevista. Aquí se calcula el que compensa la atracción de los otros planetas a los 10 días de crucero.' },
  { id: 'soi', term: 'Esfera de influencia (SOI)', match: /^(Esfera de influencia|SOI)/,
    text: 'Región donde la gravedad del planeta domina sobre la del Sol. En su frontera, la misión pasa del tramo heliocéntrico al planetocéntrico.' },
  { id: 'bplane', term: 'Plano B', match: /^Plano B/,
    text: 'Plano perpendicular a la dirección de llegada. Se usa para apuntar el paso por el planeta: B·T y B·R son las coordenadas del punto de mira y θ su orientación.' },
  { id: 'eccentricity', term: 'Excentricidad', match: /^Excentricidad/,
    text: 'Forma de la órbita: 0 es circular, entre 0 y 1 es elíptica (cerrada) y mayor que 1 es hiperbólica (la nave pasa de largo).' },
  { id: 'tdb', term: 'TDB (Tiempo Dinámico Baricéntrico)', match: /TDB/,
    text: 'Escala de tiempo de las efemérides y de los cálculos orbitales. Va unos 69 s por delante de UTC en la actualidad (unos 48 s en 1977); el simulador indica siempre cuál usa. En el Centro de Misión, «TDB − UTC» da la diferencia en el instante reproducido.' },
  { id: 'utc', term: 'UTC (Tiempo Universal Coordinado)', match: /^(Salida|Fecha|Llegada).*\(UTC\)|^UTC|^Fecha UTC/,
    text: 'La hora civil de los relojes. Las fechas que escribes se interpretan en UTC y se convierten a TDB para calcular; una fecha UTC futura es una predicción, porque aún no se conocen sus segundos intercalares.' },
  { id: 'lambert', term: 'Problema de Lambert', match: /Lambert/,
    text: 'Encontrar la órbita que une dos posiciones en un tiempo dado. Sirve para buscar transferencias entre planetas.' },
  { id: 'dopri', term: 'DOPRI54', match: /DOPRI54/,
    text: 'Integrador numérico de Dormand y Prince, de orden 5(4) y paso adaptativo. Propaga la trayectoria paso a paso a partir de las fuerzas gravitatorias.' },
  { id: 'rtg', term: 'RTG', match: /^(RTG|Generadores RTG)/,
    text: 'Generador termoeléctrico de radioisótopos: produce electricidad con el calor del plutonio-238. Pierde potencia con los años, no con la distancia al Sol.' },
  { id: 'com', term: 'Centro de masas', match: /^Centro de masas/,
    text: 'Punto de equilibrio de la nave. Si el empuje del motor no pasa cerca de él, la nave tiende a girar durante el encendido.' },
  { id: 'ephemeris', term: 'Efemérides', match: /^Efemérides/,
    text: 'Tablas de posición y velocidad de los cuerpos en función del tiempo. Aquí proceden de NASA/JPL Horizons y no se extrapolan fuera de su cobertura.' }
]);
const BY_ID = new Map(GLOSSARY.map(entry => [entry.id, entry]));
export const termFor = text => GLOSSARY.find(entry => entry.match.test(String(text ?? '').trim())) ?? null;

const CANDIDATES = '.lab-metric > span, .lab-facts dt, th, legend, summary, .lab-field, .lab-eng-card > span';

export function createLabGlossary(root) {
  const tip = document.createElement('div');
  tip.className = 'lab-tooltip'; tip.id = 'lab-tooltip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true;
  document.body.append(tip);
  let current = null, timer = null;
  function mark(element, entry) {
    element.dataset.term = entry.id; element.classList.add('lab-term');
    if (!element.closest('label') && !element.matches('summary, button')) element.tabIndex = 0;
    element.setAttribute('aria-describedby', 'lab-tooltip');
  }
  // Las etiquetas de campo envuelven el texto inicial en un <span> para no tocar el control que contienen.
  function annotate(scope = root) {
    for (const element of scope.querySelectorAll(CANDIDATES)) {
      if (element.dataset.termChecked) continue;
      element.dataset.termChecked = '1';
      if (element.matches('.lab-field')) {
        const node = [...element.childNodes].find(child => child.nodeType === 3 && child.textContent.trim());
        const entry = node && termFor(node.textContent);
        if (entry) { const span = document.createElement('span'); span.textContent = node.textContent; node.replaceWith(span); mark(span, entry); }
        continue;
      }
      const own = element.matches('summary') ? element.firstChild?.textContent : element.textContent;
      const entry = termFor(own);
      if (entry) mark(element, entry);
    }
  }
  function show(element) {
    const entry = BY_ID.get(element.dataset.term); if (!entry) return;
    current = element;
    tip.replaceChildren(); const title = document.createElement('strong'); title.textContent = entry.term;
    const text = document.createElement('span'); text.textContent = entry.text; tip.append(title, text);
    tip.hidden = false;
    const box = element.getBoundingClientRect(), width = Math.min(320, window.innerWidth - 16);
    tip.style.width = `${width}px`;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, box.left));
    const below = box.bottom + 8, height = tip.offsetHeight;
    tip.style.left = `${left}px`;
    tip.style.top = `${below + height > window.innerHeight - 8 ? Math.max(8, box.top - height - 8) : below}px`;
  }
  function hide() { tip.hidden = true; current = null; }
  const over = event => { const el = event.target.closest?.('[data-term]'); if (el && root.contains(el)) { clearTimeout(timer); show(el); } };
  const out = event => { if (current && !current.contains(event.relatedTarget)) { clearTimeout(timer); timer = setTimeout(hide, 120); } };
  const key = event => { if (event.key === 'Escape') hide(); };
  root.addEventListener('mouseover', over); root.addEventListener('focusin', over);
  root.addEventListener('mouseout', out); root.addEventListener('focusout', out);
  root.addEventListener('click', event => { const el = event.target.closest?.('[data-term]'); if (el && !el.closest('label')) show(el); });
  document.addEventListener('keydown', key);
  window.addEventListener('scroll', hide, true);
  // Las tablas de resultados se rehacen al calcular: se revisan en lote, como mucho dos veces por segundo.
  let pending = null;
  const observer = new MutationObserver(() => { if (!pending) pending = setTimeout(() => { pending = null; annotate(); }, 500); });
  observer.observe(root, { childList: true, subtree: true });
  annotate();
  return {
    annotate, hide,
    dispose() { observer.disconnect(); clearTimeout(pending); document.removeEventListener('keydown', key); window.removeEventListener('scroll', hide, true); tip.remove(); }
  };
}
