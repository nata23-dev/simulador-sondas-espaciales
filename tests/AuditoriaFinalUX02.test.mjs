// Auditoría final, fase 5 — UX-02: la bienvenida de Misiones históricas se cierra con Escape, «Cerrar», clic en el fondo y al usar
// la cabecera, y no queda abierta sobre otra sección. Lectura del código y de las reglas CSS; el recorrido real (incluido el clic
// en la cabecera sin que el modal lo intercepte) se ejercita en Chrome: docs/auditoria-final/evidencias/fase5/verificar-fase5.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = ruta => readFileSync(new URL(`../${ruta}`, import.meta.url), 'utf8');
const modal = leer('src/ui/HistoricalWelcomeModal.js');
const main = leer('src/main.js');

test('UX-02 · se conservan las opciones de la bienvenida y el recorrido guiado', () => {
  for (const id of ['welcome-start-guided', 'welcome-explore-free', 'welcome-dont-show-again', 'welcome-close-btn']) assert.ok(modal.includes(`id="${id}"`), id);
  assert.match(modal, /btnGuided\.addEventListener\('click', \(\) => \{\s*cerrar\(\);\s*alIniciarRecorridoGuiado\?\.\(\);/);
  assert.match(modal, /btnFree\.addEventListener\('click', \(\) => \{\s*cerrar\(\);\s*alExplorarLibremente\?\.\(\);/);
  assert.match(main, /alIniciarRecorridoGuiado: \(\) => \{\s*continuarRecorridoHistorico\(\);/);
  assert.match(main, /#hist-welcome-open-btn'\)\.addEventListener\('click', \(\) => \{\s*modalBienvenida\.abrir\(true\);/, 'se puede volver a abrir desde el panel');
  assert.match(modal, /role', 'dialog'/); assert.match(modal, /aria-modal', 'true'/);
});

test('UX-02 · cierre con «Cerrar», con el fondo y con Escape (solo la bienvenida)', () => {
  assert.match(modal, /btnClose\.addEventListener\('click', \(\) => cerrar\(\)\)/);
  assert.match(modal, /if \(event\.target === modal\) cerrar\(\);/, 'clic fuera de la tarjeta');
  const teclado = modal.slice(modal.indexOf("document.addEventListener('keydown'"), modal.indexOf("document.addEventListener('click'"));
  assert.match(teclado, /if \(modal\.hidden \|\| event\.defaultPrevented\) return;/, 'si la paleta «Buscar» está encima, ella atiende Escape');
  assert.match(teclado, /event\.key === 'Escape'\) \{\s*event\.preventDefault\(\);\s*event\.stopImmediatePropagation\(\);\s*cerrar\(\);/);
  assert.match(teclado, /event\.key === 'Tab'\) \{\s*event\.preventDefault\(\);\s*moverFocoConTab\(modal, event\.shiftKey\);/, 'el foco no sale de la tarjeta');
  // El oyente de Escape se registra antes que los de WorkspaceLayout (panel lateral): stopImmediatePropagation los deja fuera.
  assert.ok(main.indexOf('crearModalBienvenidaHistorica({') < main.indexOf('crearWorkspaceLayout({'));
});

test('UX-02 · la cabecera queda por encima del fondo y usarla cierra la bienvenida', () => {
  assert.match(modal, /document\.addEventListener\('click', event => \{\s*if \(modal\.hidden \|\| !event\.target\?\.closest\?\.\('\.app-header :is\(button, a\[href\], summary, input, select, \[role="button"\]\)'\)\) return;\s*cerrar\(\{ restaurarFoco: false \}\);\s*\}, true\);/);
  const css = leer('src/ui/workspace-layout.css');
  const zModal = Number(css.match(/#app \.photo-lightbox-modal \{ z-index:(\d+)/)[1]);
  const zCabecera = Number(css.match(/#app:has\(#historical-welcome-modal:not\(\[hidden\]\)\) \.app-header \{ z-index:(\d+); \}/)[1]);
  assert.ok(zCabecera > zModal, `cabecera ${zCabecera} > fondo ${zModal}`);
  assert.match(leer('src/style.css'), /\.app-header \{\s*position:absolute;\s*z-index:6;/, 'sin la bienvenida la cabecera sigue con su z-index');
  // La tarjeta se coloca debajo de la cabecera: nada de la tarjeta queda tapado.
  assert.match(css, /#app #historical-welcome-modal \{ padding-top:calc\(var\(--welcome-cabecera, 0px\) \+ 16px\); \}/);
  assert.match(css, /#app #historical-welcome-modal \.welcome-card \{ max-height:calc\(100dvh - var\(--welcome-cabecera, 0px\) - 32px\); \}/);
  assert.match(modal, /modal\.style\.setProperty\('--welcome-cabecera', `\$\{fondo\}px`\)/);
  assert.match(modal, /window\.addEventListener\('resize', ajustarACabecera\)/);
  assert.match(modal, /window\.removeEventListener\('resize', ajustarACabecera\)/);
});

test('UX-02 · la bienvenida no bloquea otras secciones', () => {
  const salida = main.slice(main.indexOf("if (modoPrevio === 'historico') {"), main.indexOf("const fecha2026"));
  assert.match(salida, /modalBienvenida\?\.cerrar\(\{ restaurarFoco: false \}\)/, 'se cierra al salir de Misiones históricas');
  assert.match(main, /if \(modoOperacion === 'historico'\) modalBienvenida\?\.abrir\(false\);/, 'no se abre si mientras cargaba el usuario cambió de sección');
  assert.doesNotMatch(main.replace(/if \(modoOperacion === 'historico'\) modalBienvenida\?\.abrir\(false\);/, ''), /modalBienvenida\?\.abrir\(false\)/);
});

test('UX-02 · foco: se guarda al abrir y vuelve al cerrar (salvo al usar la cabecera)', () => {
  assert.match(modal, /if \(modal\.hidden\) focoPrevio = document\.activeElement;/);
  assert.match(modal, /destinoFocoAlCerrar\(focoPrevio, modal\)/);
  assert.match(modal, /function cerrar\(\{ restaurarFoco = true \} = \{\}\) \{\s*if \(modal\.hidden\) return;/);
});
