// Auditoría final, fase 4 — PERF-02: optimización del Sistema Solar 3D y de la reproducción continua.
// Comprueba:
//   1. Nivel de detalle geométrico adaptativo (esferas y capas secundarias) según perfil de calidad, tamaño aparente y selección,
//      conservando detalle máximo (48×32 y todas las capas) en calidad «Alta» y en inspección cercana.
//   2. Actualización parcial de rangos WebGL (addUpdateRange) en las polilíneas de recorrido de las sondas (`SpaceProbeVisual.js`),
//      evitando subir 393 KB por fotograma cuando solo cambian 1–2 segmentos, y omitiendo la subida si el estado no cambió.
//   3. Memorización temporal de `obtenerZonaEncuadre` y moderación adaptativa de actualizaciones DOM en reproducción continua.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GEOMETRIAS_ESFERA_LOD, resolverNivelLodEsfera, crearPlaneta } from '../src/graphics/PlanetFactory.js';
import { crearAtmosferaTierra, crearAtmosferaUrano } from '../src/graphics/Atmosphere.js';
import { crearSol } from '../src/graphics/Sun.js';
import { crearSondaVisual } from '../src/graphics/SpaceProbeVisual.js';

test('PERF-02 · LOD geométrico adaptativo: calidad Alta e inspección cercana conservan siempre el detalle máximo', () => {
  // En perfil 'alto' (GPU dedicada), siempre se usa la geometría de mayor resolución y todas las capas, incluso de lejos.
  assert.deepEqual(resolverNivelLodEsfera({ detalle: 'alto', radioPx: 0.4, seleccionado: false }), {
    nivel: 'alto',
    mostrarCapas: true
  });
  assert.deepEqual(resolverNivelLodEsfera({ detalle: 'alto', radioPx: 120, seleccionado: true }), {
    nivel: 'alto',
    mostrarCapas: true
  });

  // En cualquier perfil, un cuerpo seleccionado o observado de cerca (≥ 18 px) sube automáticamente al nivel alto con todas sus capas.
  for (const detalle of ['medio', 'bajo', 'minimo']) {
    assert.deepEqual(resolverNivelLodEsfera({ detalle, radioPx: 2, seleccionado: true }), {
      nivel: 'alto',
      mostrarCapas: true
    }, `${detalle} seleccionado`);
    assert.deepEqual(resolverNivelLodEsfera({ detalle, radioPx: 22, seleccionado: false }), {
      nivel: 'alto',
      mostrarCapas: true
    }, `${detalle} cercano`);
  }

  // En detalle 'bajo' o 'minimo' (p. ej. SwiftShader), los planetas lejanos subpíxel (< 5 px) bajan al nivel 'bajo' y ocultan capas subpíxel.
  assert.deepEqual(resolverNivelLodEsfera({ detalle: 'minimo', radioPx: 1.5, seleccionado: false }), {
    nivel: 'bajo',
    mostrarCapas: false
  });
  assert.deepEqual(resolverNivelLodEsfera({ detalle: 'bajo', radioPx: 10, seleccionado: false }), {
    nivel: 'medio',
    mostrarCapas: true
  });

  // Las geometrías compartidas reducen el recuento de triángulos de forma verificable entre niveles.
  const trisAlto = GEOMETRIAS_ESFERA_LOD.alto.index.count / 3;
  const trisMedio = GEOMETRIAS_ESFERA_LOD.medio.index.count / 3;
  const trisBajo = GEOMETRIAS_ESFERA_LOD.bajo.index.count / 3;
  assert.equal(trisAlto, 48 * (32 - 1) * 2);
  assert.equal(trisMedio, 32 * (24 - 1) * 2);
  assert.equal(trisBajo, 16 * (12 - 1) * 2);
  assert.ok(trisBajo < trisMedio && trisMedio < trisAlto);
});

test('PERF-02 · crearPlaneta, crearAtmosfera y crearSol conmutan su geometría sin recrear mallas ni perder materiales', () => {
  const tierra = crearPlaneta({ nombre: 'Tierra', radio: 1.3, orbitaAU: 1, color: 0x3989ff });
  const saturno = crearPlaneta({ nombre: 'Saturno', radio: 2.8, orbitaAU: 9.537, color: 0xd5bd88 });
  assert.equal(tierra.obtenerNivelDetalle(), 'alto');

  tierra.actualizarNivelDetalle({ detalle: 'minimo', radioPx: 1.2, seleccionado: false });
  assert.equal(tierra.obtenerNivelDetalle(), 'bajo');

  // Al acercarse o seleccionarse, recupera de inmediato la geometría de alta resolución.
  tierra.actualizarNivelDetalle({ detalle: 'minimo', radioPx: 1.2, seleccionado: true });
  assert.equal(tierra.obtenerNivelDetalle(), 'alto');

  saturno.actualizarNivelDetalle({ detalle: 'bajo', radioPx: 2.0, seleccionado: false });
  assert.equal(saturno.obtenerNivelDetalle(), 'bajo');
  saturno.actualizarNivelDetalle({ detalle: 'alto', radioPx: 2.0, seleccionado: false });
  assert.equal(saturno.obtenerNivelDetalle(), 'alto');

  const atmTierra = crearAtmosferaTierra(1.3);
  const atmUrano = crearAtmosferaUrano(2.1);
  const geoInicial = atmTierra.geometry;
  atmTierra.userData.establecerNivelDetalle('bajo');
  assert.notEqual(atmTierra.geometry, geoInicial);
  atmTierra.userData.establecerNivelDetalle('alto');
  assert.equal(atmTierra.geometry, geoInicial);
  atmUrano.userData.establecerNivelDetalle('medio');
  assert.ok(atmUrano.geometry.index.count < geoInicial.index.count);

  const sol = crearSol();
  const mallaSol = sol.grupo.children[0];
  const geoSolAlta = mallaSol.geometry;
  sol.actualizarNivelDetalle({ detalle: 'minimo', radioPx: 3 });
  assert.ok(mallaSol.geometry.index.count < geoSolAlta.index.count);
  sol.actualizarNivelDetalle({ detalle: 'alto', radioPx: 3 });
  assert.equal(mallaSol.geometry, geoSolAlta);
});

test('PERF-02 · SpaceProbeVisual sube a WebGL solo el subrango sucio de la trayectoria recorrida y evita subidas redundantes', () => {
  const sonda = crearSondaVisual({
    idSonda: '__TEST_PROBE__',
    nombreGrupo: 'SondaTest',
    maxMuestrasTrayectoria: 1024,
    cargarModeloGlb: false
  });
  const n = 200;
  const vertices = new Float32Array(n * 3);
  const tiempos = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    vertices[i * 3] = i * 2;
    vertices[i * 3 + 1] = i * 0.5;
    vertices[i * 3 + 2] = -i;
    tiempos[i] = i * 10;
  }
  sonda.establecerTrayectoria(vertices, tiempos);

  const lineaRecorrida = sonda.trayectoriaGrupo.children[1];
  const geoRecorrida = lineaRecorrida.geometry;
  const attrRecorrido = geoRecorrida.getAttribute('position');

  // Al avanzar al instante t = 555 s (entre muestra 55 y 56), solo se marca sucio el tramo modificado, no los 1023 segmentos.
  attrRecorrido.clearUpdateRanges();
  const versionAntes = attrRecorrido.version;
  sonda.actualizarEstadoEscena({ x: 111, y: 27.75, z: -55.5 }, 555);
  assert.equal(attrRecorrido.version, versionAntes + 1);
  assert.equal(geoRecorrida.drawRange.count, 56 * 2);
  assert.equal(attrRecorrido.updateRanges.length, 1);
  assert.equal(attrRecorrido.updateRanges[0].start, 55 * 6);
  assert.equal(attrRecorrido.updateRanges[0].count, 6);

  // Si en el siguiente fotograma la posición y el tramo no cambiaron, no vuelve a incrementar `attrRecorrido.version`.
  const versionTrasPrimero = attrRecorrido.version;
  sonda.actualizarEstadoEscena({ x: 111, y: 27.75, z: -55.5 }, 555);
  assert.equal(attrRecorrido.version, versionTrasPrimero, 'sin subida redundante a GPU');

  // Al pasar del tramo 55 al 56, el rango sucio abarca únicamente los 2 segmentos contiguos (12 floats en lugar de 6138).
  sonda.actualizarEstadoEscena({ x: 113, y: 28.25, z: -56.5 }, 565);
  assert.equal(attrRecorrido.version, versionTrasPrimero + 1);
  assert.equal(attrRecorrido.updateRanges.length, 1);
  assert.equal(attrRecorrido.updateRanges[0].start, 55 * 6);
  assert.equal(attrRecorrido.updateRanges[0].count, 12);
});

test('PERF-02 · SolarSystem memoriza la zona de encuadre y MissionControlCenter modera el refresco DOM sin frenar la escena 3D', () => {
  const solarSource = readFileSync(new URL('../src/graphics/SolarSystem.js', import.meta.url), 'utf8');
  assert.match(solarSource, /zonaEncuadreCache/);
  assert.match(solarSource, /actualizarLodGeometria\(/);
  assert.match(solarSource, /intervaloEtiquetasMs/);

  const mccSource = readFileSync(new URL('../src/ui/MissionControlCenter.js', import.meta.url), 'utf8');
  assert.match(mccSource, /sincronizarEscenaSolo\(/);
  assert.match(mccSource, /intervaloDomMs/);
});
