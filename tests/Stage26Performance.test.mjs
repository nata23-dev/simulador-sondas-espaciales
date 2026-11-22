// Etapa 26 · rendimiento y contador de FPS. Las correcciones del lanzamiento 3D (sombras sin recompilar, atmósfera en dos mallas,
// texturas decodificadas fuera del hilo principal y subidas antes de reproducir, entorno precompilado) necesitan WebGL y se
// comprueban en Chrome con scripts/profile-launch-performance.mjs (ver docs/STAGE26_PERFORMANCE.md). Aquí, la lógica sin DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resumirFotogramas, estadoFps, textoFps } from '../src/ui/FpsMeter.js';
import { archivoGlobo, RECURSOS_LANZAMIENTO } from '../src/launch/LaunchWorld.js';
import { autoInitialCap } from '../src/graphics/QualityProfile.js';

test('26 · contador: resumen de una ventana de fotogramas', () => {
  const r = resumirFotogramas([16, 17, 16, 17, 16, 17]);
  assert.equal(r.fotogramas, 6);
  assert.ok(Math.abs(r.mediaMs - 16.5) < 1e-12);
  assert.ok(Math.abs(r.fps - 1000 / 16.5) < 1e-9);
  assert.equal(r.peorMs, 17);
  assert.equal(r.tirones, 0);
  // Un tirón de 120 ms baja la media y se cuenta; los intervalos no válidos (pestaña oculta, NaN, ≤ 0) se descartan.
  const t = resumirFotogramas([16.7, 16.7, 120, 16.7, NaN, -3, 0, 5000]);
  assert.equal(t.fotogramas, 4);
  assert.equal(t.peorMs, 120);
  assert.equal(t.tirones, 1);
  assert.ok(Math.abs(t.fps - 4000 / 170.1) < 1e-9);
  assert.equal(resumirFotogramas([]), null);
  assert.equal(resumirFotogramas([NaN, 0, 2000]), null);
});

test('26 · contador: estado de color y texto con coma decimal', () => {
  assert.equal(estadoFps(60), 'bien');
  assert.equal(estadoFps(50), 'bien');
  assert.equal(estadoFps(49.9), 'aviso');
  assert.equal(estadoFps(30), 'aviso');
  assert.equal(estadoFps(29.9), 'mal');
  assert.equal(estadoFps(NaN), 'mal');
  assert.deepEqual(textoFps(resumirFotogramas([16.7, 16.6, 16.8])), { principal: '60 FPS', detalle: '16,7 ms · peor 17' });
  assert.deepEqual(textoFps(null), { principal: '— FPS', detalle: 'midiendo…' });
});

test('26 · lanzamiento: textura del globo según el perfil de calidad y el equipo', () => {
  const { archivo: grande, ligero } = RECURSOS_LANZAMIENTO.globo;
  assert.match(grande, /8192/);
  assert.match(ligero, /4096/);
  assert.equal(archivoGlobo({ calidad: 'alto' }), grande);
  assert.equal(archivoGlobo({ calidad: 'auto', escritorio: true }), grande);
  assert.equal(archivoGlobo({ calidad: 'auto', escritorio: false }), ligero, 'móvil o equipo modesto en automática: 4096 px');
  assert.equal(archivoGlobo({ calidad: 'medio', escritorio: true }), ligero);
  assert.equal(archivoGlobo({ calidad: 'bajo', escritorio: true }), ligero);
  assert.equal(archivoGlobo({ calidad: 'alto', maxTextura: 4096 }), ligero, 'una GPU que no admite 8192 px recibe la de 4096');
  // Los dos archivos existen y son las mismas imágenes de Blue Marble que en la etapa 25 (no se añade ni cambia ningún recurso).
  const readme = readFileSync(new URL('../public/launch/README.md', import.meta.url), 'utf8');
  assert.match(readme, /earth-bmng-8192\.jpg/);
  assert.match(readme, /earth-bmng-4096\.jpg/);
  // «Escritorio» es el mismo criterio que el tope inicial de la calidad automática.
  assert.equal(autoInitialCap({ coarsePointer: false, deviceMemoryGb: 8, cores: 8 }), 2);
  assert.equal(autoInitialCap({ coarsePointer: true }), 1.5);
});
