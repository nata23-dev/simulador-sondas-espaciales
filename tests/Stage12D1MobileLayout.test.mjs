import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Pruebas estáticas de las correcciones 12D.1 (DEF-12C-HER-01/02/03). La comprobación en pantalla se hizo aparte en navegador.
const css = readFileSync(new URL('../src/ui/experimental-laboratory.css', import.meta.url), 'utf8');
const block = query => { const i = css.lastIndexOf(`@media(max-width:${query}px) {`); assert.ok(i >= 0, `bloque ${query}`); let depth = 0, j = css.indexOf('{', i);
  for (let k = j; k < css.length; k++) { if (css[k] === '{') depth++; if (css[k] === '}' && --depth === 0) return css.slice(i, k + 1); } return ''; };
const rule = (text, selector) => { let from = 0; for (;;) { const at = text.indexOf(selector + ' {', from); if (at < 0) return ''; if (at === 0 || ' }'.includes(text[at - 1])) return text.slice(text.indexOf('{', at) + 1, text.indexOf('}', at)); from = at + 1; } };

test('DEF-12C-HER-01: etiqueta y estado de reproducción no se superponen a 320 px', () => {
  const narrow = block(420);
  assert.match(rule(narrow, '.mc-stage .lab-stage-top'), /flex-direction:\s*column/);
  assert.match(rule(narrow, '#mc-stage-status'), /overflow-wrap:\s*anywhere/);
  assert.match(rule(narrow, '.mc-camera-bar'), /top:\s*44px/); // debajo de las dos líneas del título
});
test('DEF-12C-HER-02: todas las cámaras de misión son accesibles', () => {
  const narrow = block(420);
  assert.match(rule(narrow, '.mc-camera-bar'), /flex-wrap:\s*wrap/);
  assert.doesNotMatch(rule(narrow, '.mc-camera-bar'), /nowrap/);
  assert.match(rule(narrow, '.mc-camera-bar button'), /flex:\s*1 1 auto/);
});
test('DEF-12C-HER-03: las pestañas del laboratorio caben en el viewport estrecho', () => {
  const narrow = block(560);
  assert.match(rule(narrow, '.lab-sections'), /flex-wrap:\s*wrap/);
  assert.match(rule(narrow, '.lab-sections button'), /flex:\s*1 1 auto/);
});
