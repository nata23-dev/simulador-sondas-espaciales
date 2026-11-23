// Auditoría final, fase 1 — STAB-01: avisos cuando una escena 3D no puede crear su contexto WebGL 2.
// Solo informa: no sustituye la escena científica por una imagen aproximada ni simula el dibujo.
import { WEBGL2_UNAVAILABLE_HINTS, WEBGL2_UNAVAILABLE_MESSAGE, WEBGL2_UNAVAILABLE_TITLE, esFalloWebGL } from '../graphics/WebGLSupport.js';

const texto = error => String(error?.message ?? error ?? 'error desconocido');

/**
 * Escena principal: sin ella no funciona ningún modo, así que el aviso ocupa la pantalla (diálogo de alerta accesible),
 * sustituye «Esperando datos…» en el estado de la fuente, deja inerte la interfaz cuyos controles ya no responderían y ofrece
 * volver a cargar (por ejemplo, después de activar la aceleración gráfica). Devuelve el elemento del aviso.
 */
export function mostrarFalloEscenaPrincipal(error, { documento = globalThis.document, recargar = () => globalThis.location?.reload() } = {}) {
  const webgl = esFalloWebGL(error);
  const titulo = webgl ? WEBGL2_UNAVAILABLE_TITLE : 'No se pudo iniciar la escena 3D';
  const estado = documento.querySelector('#data-status');
  if (estado) estado.textContent = `${titulo}: la escena 3D no se pudo iniciar.`;
  documento.querySelector('#app')?.setAttribute('inert', '');

  const crear = (etiqueta, clase, contenido) => {
    const el = documento.createElement(etiqueta);
    if (clase) el.className = clase;
    if (contenido != null) el.textContent = contenido;
    return el;
  };
  const aviso = crear('div', 'webgl-unavailable');
  aviso.id = 'webgl-unavailable';
  aviso.setAttribute('role', 'alertdialog');
  aviso.setAttribute('aria-modal', 'true');
  aviso.setAttribute('aria-labelledby', 'webgl-unavailable-title');
  aviso.setAttribute('aria-describedby', 'webgl-unavailable-text');
  const panel = crear('div', 'webgl-unavailable__panel');
  const rotulo = crear('span', 'webgl-unavailable__eyebrow', 'SIMULADOR DE SONDAS ESPACIALES');
  const encabezado = crear('h2', 'webgl-unavailable__title', titulo);
  encabezado.id = 'webgl-unavailable-title';
  const explicacion = crear('p', 'webgl-unavailable__text', webgl ? WEBGL2_UNAVAILABLE_MESSAGE : `La escena 3D del simulador no se pudo crear: ${texto(error)}.`);
  explicacion.id = 'webgl-unavailable-text';
  panel.append(rotulo, encabezado, explicacion);
  if (webgl) {
    const lista = crear('ul', 'webgl-unavailable__hints');
    for (const consejo of WEBGL2_UNAVAILABLE_HINTS) lista.append(crear('li', null, consejo));
    panel.append(lista);
  }
  panel.append(crear('p', 'webgl-unavailable__note', 'Sin la escena 3D no se muestran el Sistema Solar, las misiones históricas ni el laboratorio: el simulador no la sustituye por una imagen aproximada.'));
  panel.append(crear('p', 'webgl-unavailable__detail', `Detalle técnico: ${texto(error?.cause ?? error)}`));
  const boton = crear('button', 'webgl-unavailable__retry', 'Volver a intentar');
  boton.type = 'button';
  boton.addEventListener('click', () => recargar());
  panel.append(boton);
  aviso.append(panel);
  documento.body.append(aviso);
  boton.focus?.();
  return aviso;
}

/**
 * Vista 3D secundaria (laboratorio): reemplaza el contenido de su contenedor por un aviso de estado. El resto del panel sigue
 * funcionando (`sigue` dice qué). Devuelve el párrafo del aviso.
 */
function textoVistaNoDisponible(error, vista, sigue) {
  const motivo = esFalloWebGL(error) ? 'este dispositivo o navegador no pudo inicializar WebGL 2' : texto(error);
  return `${vista} no está disponible: ${motivo}.${sigue ? ` ${sigue}` : ''}`;
}

export function mostrarVista3DNoDisponible(host, error, { vista, sigue = '' }) {
  const documento = host.ownerDocument ?? globalThis.document;
  const aviso = documento.createElement('p');
  aviso.className = 'webgl-view-unavailable';
  aviso.setAttribute('role', 'status');
  aviso.textContent = textoVistaNoDisponible(error, vista, sigue);
  host.replaceChildren(aviso);
  return aviso;
}

// Para una vista que se abre desde un botón (el lanzamiento 3D): el aviso queda visible justo después de `referencia`, sin
// sustituir nada. Con el mismo `id` se reutiliza el aviso anterior en lugar de acumular otro.
export function mostrarAvisoJunto(referencia, error, { id, vista, sigue = '' }) {
  const documento = referencia.ownerDocument ?? globalThis.document;
  let aviso = documento.getElementById?.(id) ?? null;
  if (!aviso) {
    aviso = documento.createElement('p');
    aviso.id = id;
    aviso.className = 'webgl-view-unavailable webgl-view-unavailable--inline';
    aviso.setAttribute('role', 'status');
  }
  aviso.textContent = textoVistaNoDisponible(error, vista, sigue);
  referencia.after(aviso);
  return aviso;
}
