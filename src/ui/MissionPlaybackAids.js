// En este módulo reúno las utilidades puras de presentación del Centro de Misión: agrupación de marcas de eventos,
// ventana de zoom temporal, interpretación de atajos de teclado, esquema geométrico de órbita y anuncios accesibles.

// Agrupo los eventos que quedarían demasiado juntos en la barra de tiempo para que no se solapen,
// devolviendo sus posiciones relativas dentro de [inicio, fin] sin descartar ningún evento.
export function agruparMarcas(eventos, { inicio = 0, fin, anchoPx, separacionMinPx = 12, maximo = 80 } = {}) {
  const ancho = fin - inicio;
  if (!(ancho > 0) || !(anchoPx > 0)) return [];
  const dentro = eventos.filter(e => Number.isFinite(e.elapsedSeconds) && e.elapsedSeconds >= inicio - 1e-9 && e.elapsedSeconds <= fin + 1e-9)
    .sort((a, b) => a.elapsedSeconds - b.elapsedSeconds);
  const agrupar = separacion => {
    const grupos = [];
    for (const e of dentro) {
      const x = (e.elapsedSeconds - inicio) / ancho * anchoPx, ultimo = grupos.at(-1);
      if (ultimo && x - ultimo.xPrimero < separacion) { ultimo.eventos.push(e); continue; }
      grupos.push({ xPrimero: x, eventos: [e] });
    }
    return grupos;
  };
  // Si supero el máximo de marcas visibles, amplío progresivamente la separación en lugar de omitir las últimas;
  // al alcanzar o superar el ancho completo siempre queda un único grupo, por lo que el bucle finaliza.
  let separacion = separacionMinPx, grupos = agrupar(separacion);
  while (grupos.length > Math.max(1, maximo)) { separacion *= 1.5; grupos = agrupar(separacion); }
  return grupos.map(g => ({ fraccion: Math.min(1, Math.max(0, g.xPrimero / anchoPx)), eventos: g.eventos }));
}

// Calculo una ventana temporal centrada alrededor de un instante concreto y acotada al rango [0, total] de la misión.
export function ventanaZoom({ total, centro, fraccion = 0.08, minimoS = 60 }) {
  if (!(total > 0)) return { inicio: 0, fin: 0 };
  const ancho = Math.min(total, Math.max(total * fraccion, minimoS));
  let inicio = Math.min(Math.max(0, centro), total) - ancho / 2;
  inicio = Math.min(Math.max(0, inicio), total - ancho);
  return { inicio, fin: inicio + ancho };
}

const EDITABLES = new Set(['INPUT', 'SELECT', 'TEXTAREA']);
// Traduzco una pulsación de teclado a una acción del Centro de Misión (play-pausa, anterior, siguiente, inicio o fin),
// ignorando combinaciones con modificadores y respetando controles editables, botones o elementos con teclado propio.
export function accionTeclaCentroMision({ key, ctrlKey = false, altKey = false, metaKey = false, shiftKey = false, tagName = '', editable = false, role = '' } = {}) {
  if (ctrlKey || altKey || metaKey || shiftKey || editable || EDITABLES.has(String(tagName).toUpperCase())) return null;
  if (['tab', 'slider', 'menuitem', 'option', 'listbox', 'radio'].includes(role)) return null;
  const boton = String(tagName).toUpperCase() === 'BUTTON' || String(tagName).toUpperCase() === 'SUMMARY' || role === 'button';
  if (key === ' ' || key === 'Spacebar') return boton ? null : 'play-pausa';
  if (key === 'ArrowLeft') return 'anterior';
  if (key === 'ArrowRight') return 'siguiente';
  if (key === 'Home') return 'inicio';
  if (key === 'End') return 'fin';
  return null;
}

// Calculo la geometría a escala común de la órbita alcanzada y la objetivo alrededor del cuerpo central,
// colocando el foco en el cuerpo y orientando el periapsis hacia +x dentro del cuadro del esquema.
export function esquemaOrbita({ radioCuerpoKm, alcanzada, objetivo = null, lado = 200, margen = 14, radioMinimoPx = 3 }) {
  const elipse = o => {
    if (!o || !Number.isFinite(o.periapsisAltitudeKm) || !Number.isFinite(o.apoapsisAltitudeKm)) return null;
    const rp = radioCuerpoKm + o.periapsisAltitudeKm, ra = radioCuerpoKm + o.apoapsisAltitudeKm;
    if (!(rp > 0) || !(ra >= rp)) return null;
    const a = (rp + ra) / 2;
    return { rp, ra, a, c: a - rp, b: Math.sqrt(rp * ra) };
  };
  const e1 = elipse(alcanzada), e0 = elipse(objetivo);
  if (!e1) return null;
  const lista = [e1, e0].filter(Boolean);
  // Centro el conjunto horizontalmente dejando el apoapsis más lejano a la izquierda del foco y el periapsis a la derecha.
  const izquierda = Math.max(...lista.map(e => e.ra)), derecha = Math.max(...lista.map(e => e.rp)), semiAlto = Math.max(...lista.map(e => e.b));
  const k = Math.min((lado - 2 * margen) / (izquierda + derecha), (lado / 2 - margen) / semiAlto);
  const focoX = lado / 2 + (izquierda - derecha) / 2 * k, focoY = lado / 2;
  const enPx = e => e && { cx: focoX - e.c * k, cy: focoY, rx: e.a * k, ry: e.b * k, periapsisX: focoX + e.rp * k, apoapsisX: focoX - e.ra * k };
  return { lado, foco: { x: focoX, y: focoY }, radioCuerpoPx: Math.max(radioMinimoPx, radioCuerpoKm * k), alcanzada: enPx(e1), objetivo: enPx(e0), escalaPxPorKm: k };
}

// Ajusto el extremo superior de la línea de tiempo al final exacto del cálculo cuando el paso del deslizador queda dentro de esta tolerancia.
export const TOLERANCIA_FINAL_LINEA_S = 0.0015;
export function instanteLineaTiempo(valor, maximo, tolerancia = TOLERANCIA_FINAL_LINEA_S) {
  return maximo - valor < tolerancia ? maximo : valor;
}
// Compongo el texto legible que lee el lector de pantalla para el control de la línea de tiempo en lugar de segundos en bruto.
export function textoValorLineaTiempo(transcurrido, restante, fase) {
  return [transcurrido, restante, fase].filter(Boolean).join(' · ');
}
// Genero el anuncio accesible cuando cambia la fase activa, evitando anunciar la preparación inicial o valores vacíos.
export function anuncioCambioFase(faseAnterior, fase) {
  return faseAnterior && fase && faseAnterior !== fase ? `Fase: ${fase}` : null;
}
