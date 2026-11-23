// Auditoría final, fase 5 — UX-01: «Buscar» (paleta de comandos) por teclado y con lector de pantalla.
// Aquí: agrupación sin cabeceras vacías, ayudantes de foco con elementos simulados y, por lectura del código, dónde se atiende el
// teclado y qué estados accesibles se declaran. El recorrido real (Tab, Escape tras Tab, restauración del foco, ratón) se ejercita
// en Chrome: docs/auditoria-final/evidencias/fase5/verificar-fase5.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { groupCommandResults } from '../src/ui/CommandPalette.js';
import { indiceTab, moverFocoConTab, destinoFocoAlCerrar, esVisible, controlesEnfocables } from '../src/ui/DialogFocus.js';

const leer = ruta => readFileSync(new URL(`../${ruta}`, import.meta.url), 'utf8');
const cuerpos = ['Sol', 'Mercurio', 'Venus', 'Tierra', 'Luna', 'Marte', 'Fobos', 'Deimos', 'Júpiter', 'Ío', 'Europa', 'Ganímedes', 'Calisto', 'Saturno', 'Voyager 1', 'Voyager 2']
  .map(title => ({ type: 'body', title, desc: title.startsWith('Voyager') ? 'Sonda histórica' : 'Planeta' }));
const areas = [{ type: 'area', title: 'Sistema Solar', desc: 'Explorar · Planetas y lunas' }, { type: 'area', title: 'Laboratorio', desc: 'Misiones · Elegir sonda' }];
const acciones = [{ type: 'action', title: 'Medir distancias 3D', desc: 'Separación entre dos cuerpos en km y AU' }, { type: 'action', title: 'Cambiar la escala visual', desc: 'Científica 1:1 o exploratoria' }];
const fuentes = (b = cuerpos) => [['Cuerpos y sondas', b], ['Áreas del simulador', areas], ['Vista y herramientas', acciones]];

test('UX-01 · sin consulta: solo «Cuerpos y sondas», con los 10 primeros', () => {
  const grupos = groupCommandResults(fuentes(), '');
  assert.deepEqual(grupos.map(g => g.label), ['Cuerpos y sondas']);
  assert.equal(grupos[0].items.length, 10);
  assert.deepEqual(groupCommandResults(fuentes([]), ''), [], 'sin destinos no hay cabecera');
});

test('UX-01 · nunca se devuelve un grupo sin resultados (p. ej. «distancia» solo encuentra la herramienta)', () => {
  assert.deepEqual(groupCommandResults(fuentes(), 'distancia').map(g => [g.label, g.items.map(i => i.title)]), [['Vista y herramientas', ['Medir distancias 3D']]]);
  assert.deepEqual(groupCommandResults(fuentes(), 'zzzz'), []);
  const consultas = new Set(['', ' ', 'a', 'é', 'xyz']);
  for (const item of [...cuerpos, ...areas, ...acciones]) for (let i = 1; i <= item.title.length; i++) consultas.add(item.title.slice(0, i)).add(item.title.slice(-i));
  for (const q of consultas) for (const g of groupCommandResults(fuentes(), q)) assert.ok(g.items.length > 0, `grupo vacío con «${q}»`);
});

test('UX-01 · orden y acentos: empieza por > palabra > contiene > descripción', () => {
  assert.equal(groupCommandResults(fuentes(), 'jupiter')[0].items[0].title, 'Júpiter', 'sin acento encuentra «Júpiter»');
  const voy = groupCommandResults(fuentes(), 'voyager')[0].items.map(i => i.title);
  assert.deepEqual(voy, ['Voyager 1', 'Voyager 2']);
  const escala = groupCommandResults(fuentes(), 'escala');
  assert.deepEqual(escala.map(g => g.label), ['Vista y herramientas']);
  const sonda = groupCommandResults(fuentes(), 'sonda histórica')[0].items.map(i => i.title);
  assert.deepEqual(sonda, ['Voyager 1', 'Voyager 2'], 'la descripción también cuenta');
});

// Elementos simulados con la interfaz mínima que usan los ayudantes.
let activo = null;
const elemento = (nombre, { visible = true, deshabilitado = false, oculto = false } = {}) => ({
  nombre, isConnected: true, disabled: deshabilitado,
  getClientRects: () => (visible ? [{}] : []),
  closest: () => (oculto ? {} : null),
  focus() { activo = this; }
});
const contenedor = lista => ({ querySelectorAll: () => lista, contains: x => lista.includes(x) });

test('UX-01 · Tab cíclico: índices y caso de un solo control', () => {
  assert.equal(indiceTab(3, 0, false), 1);
  assert.equal(indiceTab(3, 2, false), 0);
  assert.equal(indiceTab(3, 0, true), 2);
  assert.equal(indiceTab(1, 0, false), 0, 'con un solo control (el campo) el foco no sale');
  assert.equal(indiceTab(1, 0, true), 0);
  assert.equal(indiceTab(3, -1, false), 0, 'desde fuera: el primero');
  assert.equal(indiceTab(3, -1, true), 2, 'desde fuera hacia atrás: el último');
  assert.equal(indiceTab(0, -1, false), -1);
});

test('UX-01 · moverFocoConTab recorre solo controles visibles y habilitados del diálogo', () => {
  const campo = elemento('campo'), roto = elemento('deshabilitado', { deshabilitado: true }), invisible = elemento('invisible', { visible: false });
  const dentroDeOculto = elemento('en [hidden]', { oculto: true }), boton = elemento('botón');
  const dialogo = contenedor([campo, roto, invisible, dentroDeOculto, boton]);
  assert.deepEqual(controlesEnfocables(dialogo).map(e => e.nombre), ['campo', 'botón']);
  assert.equal(moverFocoConTab(dialogo, false, campo), boton);
  assert.equal(activo, boton);
  assert.equal(moverFocoConTab(dialogo, false, boton), campo);
  assert.equal(moverFocoConTab(dialogo, true, campo), boton);
  const fuera = elemento('fondo');
  assert.equal(moverFocoConTab(dialogo, false, fuera), campo, 'si el foco quedó fuera vuelve al diálogo');
  assert.equal(moverFocoConTab(contenedor([]), false, campo), null);
});

test('UX-01 · al cerrar, el foco vuelve a quien abrió; si ya no está, a «Buscar»', () => {
  const abridor = elemento('abridor'), buscar = elemento('Buscar'), campo = elemento('campo');
  const dialogo = contenedor([campo]);
  assert.equal(destinoFocoAlCerrar(abridor, dialogo, buscar), abridor);
  assert.equal(destinoFocoAlCerrar(elemento('oculto', { visible: false }), dialogo, buscar), buscar);
  assert.equal(destinoFocoAlCerrar({ ...abridor, isConnected: false }, dialogo, buscar), buscar, 'retirado del documento');
  assert.equal(destinoFocoAlCerrar(campo, dialogo, buscar), buscar, 'nunca un control del propio diálogo');
  assert.equal(destinoFocoAlCerrar(null, dialogo, buscar), buscar, 'abierta con Ctrl+K sin foco');
  assert.equal(destinoFocoAlCerrar(null, dialogo, elemento('Buscar oculto', { visible: false })), null);
  const body = elemento('body');
  assert.equal(esVisible(body, body), false, '<body> no es un destino');
});

test('UX-01 · el teclado se atiende en todo el diálogo (captura) y Escape/Tab no dependen de dónde esté el foco', () => {
  const src = leer('src/ui/CommandPalette.js');
  assert.match(src, /document\.addEventListener\('keydown', onDialogKey, true\)/, 'fase de captura en el documento');
  assert.doesNotMatch(src, /input\.addEventListener\('keydown'/, 'ya no solo en el campo');
  const manejador = src.slice(src.indexOf('const onDialogKey'), src.indexOf('const onFocusIn'));
  const iEscape = manejador.indexOf("event.key === 'Escape'"), iTab = manejador.indexOf("event.key === 'Tab'"), iDestino = manejador.indexOf('dialog.contains(event.target)');
  assert.ok(iEscape > 0 && iTab > iEscape && iDestino > iTab, 'Escape y Tab se atienden antes de mirar el destino del evento');
  assert.match(manejador, /moverFocoConTab\(dialog, event\.shiftKey\)/);
  assert.match(manejador, /event\.isComposing/, 'Enter durante una composición (IME) no elige');
  assert.match(src, /document\.addEventListener\('focusin', onFocusIn\)/);
  assert.match(src, /removeEventListener\('keydown', onDialogKey, true\)/, 'dispose retira los oyentes');
  assert.match(src, /removeEventListener\('focusin', onFocusIn\)/);
  assert.match(src, /destinoFocoAlCerrar\(lastFocus, root, document\.querySelector\('#header-search'\)\)/);
});

test('UX-01 · estados accesibles: combobox, grupos con rótulo, anuncio de resultados y «Buscar» ligado al diálogo', () => {
  const src = leer('src/ui/CommandPalette.js');
  assert.match(src, /id="cp-input"[^>]*role="combobox"[^>]*aria-expanded="true"[^>]*aria-haspopup="listbox"/);
  assert.match(src, /aria-controls="cp-results"/);
  assert.match(src, /id="cp-status" class="sr-only" role="status" aria-live="polite"/);
  assert.match(src, /setAttribute\('role', 'group'\); box\.setAttribute\('aria-labelledby', `cp-group-\$\{groupIndex\}`\)/);
  assert.match(src, /searchButton\?\.setAttribute\('aria-controls', 'command-palette'\)/);
  assert.match(src, /searchButton\?\.setAttribute\('aria-haspopup', 'dialog'\)/);
  assert.match(src, /aria-selected/);
  // El panel lateral ya no pisa aria-expanded de «Buscar» cuando «Buscar» controla la paleta.
  assert.match(leer('src/ui/WorkspaceLayout.js'), /getAttribute\('aria-controls'\) === 'context-inspector'\) search\.setAttribute\('aria-expanded'/);
  // El aspecto no cambia: el contenedor de grupo no tiene estilos y las reglas existentes no usan combinadores de hijo directo.
  const css = leer('src/ui/theme.css');
  assert.doesNotMatch(css, /\.cp-results\s*>/);
  assert.match(leer('src/style.css'), /\.sr-only\s*\{/);
});
