// Auditoría final, fase 1 — STAB-01: fallo al crear el contexto WebGL 2.
// La prueba de navegador equivalente es docs/auditoria-final/evidencias/ciencia/fallos.mjs (caso «sinWebGL2»). Aquí se
// ejercitan en Node el camino real de three.js (getContext('webgl2') → null), la escena principal, los avisos y, por lectura
// del código, que todas las vistas 3D crean su renderizador con el mismo tratamiento.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';

// Lienzo cuyo getContext devuelve null, como cuando el navegador no puede dar WebGL 2.
const canvasSinWebGL = () => ({ style: {}, setAttribute() {}, addEventListener() {}, removeEventListener() {}, getContext: () => null });
globalThis.document = { createElementNS: () => canvasSinWebGL(), createElement: () => canvasSinWebGL() };

const { crearRenderizadorWebGL, esFalloWebGL, WebGLUnavailableError, WEBGL2_UNAVAILABLE_MESSAGE, WEBGL2_UNAVAILABLE_TITLE, WEBGL2_UNAVAILABLE_HINTS } = await import('../src/graphics/WebGLSupport.js');
const { mostrarAvisoJunto, mostrarFalloEscenaPrincipal, mostrarVista3DNoDisponible } = await import('../src/ui/WebGLUnavailableNotice.js');
const { createSolarSystem } = await import('../src/graphics/SolarSystem.js');

const silenciarThree = fn => { const original = console.error; console.error = () => {}; try { return fn(); } finally { console.error = original; } };

test('STAB-01 · three.js sin contexto WebGL 2 → WebGLUnavailableError con la causa original', () => {
  let capturado = null;
  silenciarThree(() => { try { crearRenderizadorWebGL({ canvas: canvasSinWebGL(), antialias: true }, 'prueba'); } catch (error) { capturado = error; } });
  assert.ok(capturado instanceof WebGLUnavailableError);
  assert.ok(esFalloWebGL(capturado));
  assert.equal(capturado.contexto, 'prueba');
  assert.match(capturado.cause.message, /Error creating WebGL context/);
  assert.ok(capturado.message.startsWith(WEBGL2_UNAVAILABLE_MESSAGE));
  assert.match(WEBGL2_UNAVAILABLE_MESSAGE, /WebGL 2/);
  assert.equal(esFalloWebGL(new Error('otra cosa')), false);
  assert.equal(esFalloWebGL(null), false);
});

test('STAB-01 · con WebGL disponible se crea el mismo renderizador, con las mismas opciones', () => {
  const opciones = { antialias: true, powerPreference: 'high-performance' };
  class RenderizadorFalso { constructor(o) { this.opciones = o; } }
  const r = crearRenderizadorWebGL(opciones, 'prueba', RenderizadorFalso);
  assert.ok(r instanceof RenderizadorFalso);
  assert.equal(r.opciones, opciones, 'las opciones pasan sin copiar ni cambiar');
  assert.equal(crearRenderizadorWebGL.length, 1);
});

test('STAB-01 · la escena principal real falla con el error tipado antes de tocar el DOM', () => {
  const contenedor = { añadidos: 0, appendChild() { this.añadidos++; } };
  let capturado = null;
  silenciarThree(() => { try { createSolarSystem(contenedor); } catch (error) { capturado = error; } });
  assert.ok(esFalloWebGL(capturado), `error recibido: ${capturado?.message}`);
  assert.equal(capturado.contexto, 'escena principal');
  assert.match(capturado.cause.message, /Error creating WebGL context/);
  assert.equal(contenedor.añadidos, 0, 'no queda ningún lienzo a medias en la página');
});

// ---------- DOM mínimo para los avisos ----------
class El {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = new Map(); this.listeners = {}; this.text = ''; this.focused = false; }
  set textContent(v) { this.children = []; this.text = String(v); }
  get textContent() { return this.text + this.children.map(c => c.textContent).join(''); }
  append(...n) { this.children.push(...n); }
  replaceChildren(...n) { this.children = [...n]; this.text = ''; }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.get(k) ?? null; }
  hasAttribute(k) { return this.attrs.has(k); }
  addEventListener(t, fn) { (this.listeners[t] ??= []).push(fn); }
  click() { for (const fn of this.listeners.click ?? []) fn(); }
  focus() { this.focused = true; }
  find(pred) { for (const c of this.children) { if (pred(c)) return c; const f = c.find?.(pred); if (f) return f; } return null; }
  findAll(pred, out = []) { for (const c of this.children) { if (pred(c)) out.push(c); c.findAll?.(pred, out); } return out; }
}
function documentoFalso() {
  const estado = new El('p'); estado.textContent = 'Esperando datos…';
  const app = new El('div'), body = new El('body');
  return { estado, app, body, createElement: tag => new El(tag), querySelector: s => ({ '#data-status': estado, '#app': app })[s] ?? null };
}

test('STAB-01 · aviso de la escena principal: accesible, sustituye «Esperando datos…» y ofrece reintentar', () => {
  const doc = documentoFalso();
  let recargas = 0, error = null;
  silenciarThree(() => { try { crearRenderizadorWebGL({ canvas: canvasSinWebGL() }, 'escena principal'); } catch (e) { error = e; } });
  const aviso = mostrarFalloEscenaPrincipal(error, { documento: doc, recargar: () => recargas++ });
  assert.doesNotMatch(doc.estado.textContent, /Esperando datos/);
  assert.match(doc.estado.textContent, /WebGL 2/);
  assert.ok(doc.app.hasAttribute('inert'), 'la interfaz sin escena queda inerte');
  assert.equal(doc.body.children.at(-1), aviso);
  assert.equal(aviso.getAttribute('role'), 'alertdialog');
  assert.equal(aviso.getAttribute('aria-modal'), 'true');
  const titulo = aviso.find(c => c.id === 'webgl-unavailable-title'), texto = aviso.find(c => c.id === 'webgl-unavailable-text');
  assert.equal(aviso.getAttribute('aria-labelledby'), titulo.id);
  assert.equal(aviso.getAttribute('aria-describedby'), texto.id);
  assert.equal(titulo.textContent, WEBGL2_UNAVAILABLE_TITLE);
  assert.equal(texto.textContent, WEBGL2_UNAVAILABLE_MESSAGE);
  assert.equal(aviso.findAll(c => c.tagName === 'LI').length, WEBGL2_UNAVAILABLE_HINTS.length);
  assert.match(aviso.textContent, /Error creating WebGL context/, 'detalle técnico con la causa');
  assert.match(aviso.textContent, /no la sustituye por una imagen aproximada/);
  const boton = aviso.find(c => c.tagName === 'BUTTON');
  assert.equal(boton.type, 'button');
  assert.ok(boton.focused, 'el foco va al botón del aviso');
  boton.click();
  assert.equal(recargas, 1);
});

test('STAB-01 · otro error de arranque de la escena se explica sin atribuirlo a WebGL', () => {
  const doc = documentoFalso();
  const aviso = mostrarFalloEscenaPrincipal(new Error('textura corrupta'), { documento: doc, recargar: () => {} });
  assert.equal(aviso.find(c => c.id === 'webgl-unavailable-title').textContent, 'No se pudo iniciar la escena 3D');
  assert.match(aviso.textContent, /textura corrupta/);
  assert.equal(aviso.findAll(c => c.tagName === 'LI').length, 0);
  assert.doesNotMatch(doc.estado.textContent, /Esperando datos/);
});

test('STAB-01 · vistas 3D del laboratorio: aviso de estado en su panel, con lo que sigue disponible', () => {
  const host = new El('div'); host.ownerDocument = { createElement: tag => new El(tag) };
  host.append(new El('canvas'));
  const aviso = mostrarVista3DNoDisponible(host, new WebGLUnavailableError('Centro de Misión', new Error('x')), { vista: 'La vista 3D del Centro de Misión', sigue: 'La telemetría sigue disponible.' });
  assert.deepEqual(host.children, [aviso]);
  assert.equal(aviso.getAttribute('role'), 'status');
  assert.equal(aviso.textContent, 'La vista 3D del Centro de Misión no está disponible: este dispositivo o navegador no pudo inicializar WebGL 2. La telemetría sigue disponible.');
  const otro = mostrarVista3DNoDisponible(host, new Error('sin memoria'), { vista: 'El modelo 3D' });
  assert.equal(otro.textContent, 'El modelo 3D no está disponible: sin memoria.');
});

test('STAB-01 · lanzamiento 3D: aviso visible junto al botón, reutilizado en un segundo intento fallido', () => {
  const contenedor = new El('div'), acciones = new El('div');
  contenedor.append(acciones);
  const porId = new Map();
  acciones.ownerDocument = { createElement: tag => new El(tag), getElementById: id => porId.get(id) ?? null };
  acciones.after = nodo => { if (!contenedor.children.includes(nodo)) contenedor.children.splice(contenedor.children.indexOf(acciones) + 1, 0, nodo); porId.set(nodo.id, nodo); };
  const fallo = new WebGLUnavailableError('lanzamiento 3D', new Error('x'));
  const opciones = { id: 'hist-launch-webgl-note', vista: 'El lanzamiento 3D', sigue: 'El Sistema Solar y las misiones siguen disponibles.' };
  const aviso = mostrarAvisoJunto(acciones, fallo, opciones);
  assert.deepEqual(contenedor.children, [acciones, aviso], 'justo después de los botones, sin sustituirlos');
  assert.equal(aviso.id, 'hist-launch-webgl-note');
  assert.equal(aviso.getAttribute('role'), 'status');
  assert.equal(aviso.className, 'webgl-view-unavailable webgl-view-unavailable--inline');
  assert.equal(aviso.textContent, 'El lanzamiento 3D no está disponible: este dispositivo o navegador no pudo inicializar WebGL 2. El Sistema Solar y las misiones siguen disponibles.');
  assert.equal(mostrarAvisoJunto(acciones, fallo, opciones), aviso, 'el segundo fallo reutiliza el aviso');
  assert.equal(contenedor.children.length, 2);
});

// ---------- Lectura del código: ningún renderizador escapa al tratamiento ----------
const fuentes = dir => readdirSync(dir).flatMap(f => { const p = path.join(dir, f); return statSync(p).isDirectory() ? fuentes(p) : p.endsWith('.js') ? [p] : []; });
const leer = p => readFileSync(p, 'utf8');

test('STAB-01 · todos los WebGLRenderer de src/ se crean con crearRenderizadorWebGL', () => {
  const directos = fuentes('src').filter(p => /new\s+THREE\.WebGLRenderer\s*\(/.test(leer(p))).map(p => p.replaceAll('\\', '/'));
  assert.deepEqual(directos, [], 'solo WebGLSupport.js construye el renderizador (con el constructor inyectado)');
  const usuarios = fuentes('src').filter(p => /crearRenderizadorWebGL\(/.test(leer(p)) && !p.endsWith('WebGLSupport.js')).map(p => path.basename(p)).sort();
  assert.deepEqual(usuarios, ['LaunchWorld.js', 'MissionExecutionView.js', 'MissionTrajectoryView.js', 'ProbeAssemblyView.js', 'SolarSystem.js']);
});

test('STAB-01 · main.js captura la escena principal y detiene el arranque sin excepción no capturada', () => {
  const main = leer('src/main.js');
  assert.match(main, /const simulador = crearEscenaPrincipalOAvisar\(\(\) => createSolarSystem\(/);
  assert.match(main, /\n\)\);\nif \(!simulador\) await new Promise\(\(\) => \{\}\);\n/);
  assert.match(main, /function crearEscenaPrincipalOAvisar\(crear\) \{\n\s+try \{\n\s+return crear\(\);\n\s+\} catch \(error\) \{[^}]*mostrarFalloEscenaPrincipal\(error\);\n\s+return null;/);
  assert.equal((main.match(/createSolarSystem\(/g) ?? []).length, 1, 'una sola creación de la escena principal');
  // El lanzamiento 3D (contexto propio) informa el motivo si falla su WebGL 2.
  assert.match(main, /if \(esFalloWebGL\(error\)\) \{\n\s+estadoDatos\.textContent = 'Lanzamiento 3D no disponible:[^\n]*\n[^\n]*\.closest\('\.hist-mission-quick-actions'\);\n\s+if \(acciones\) mostrarAvisoJunto\(acciones, error, \{ id: 'hist-launch-webgl-note'/);
  // Un intento nuevo retira el aviso del anterior.
  assert.match(main, /lanzamientoEnCurso = true;\n\s+document\.querySelector\('#hist-launch-webgl-note'\)\?\.remove\(\);/);
});

test('STAB-01 · las vistas secundarias se degradan en su panel y el lanzamiento no deja su lienzo', () => {
  const casos = [
    ['src/ui/ExperimentalLaboratory.js', /try \{ view = createProbeAssemblyView\([\s\S]{0,400}catch \(error\) \{[\s\S]{0,300}mostrarVista3DNoDisponible\(\$\('#lab-canvas'\), error/],
    ['src/ui/MissionControlCenter.js', /try \{ view = createMissionExecutionView\([\s\S]{0,200}catch \(error\) \{\s*mostrarVista3DNoDisponible\(\$\('#mc-canvas'\), error/],
    ['src/ui/MissionPlanner.js', /try \{ trajectoryView = createMissionTrajectoryView\([\s\S]{0,120}catch \(error\) \{ mostrarVista3DNoDisponible\(\$\('#mission-canvas'\), error/]
  ];
  for (const [file, pattern] of casos) assert.match(leer(file), pattern, file);
  assert.match(leer('src/launch/VoyagerLaunchDirector.js'), /try \{ mundo = crearMundoLanzamiento\(\{[^}]*\}\); \}\n\s*catch \(error\) \{ canvas\.remove\(\); throw error; \}/);
});
