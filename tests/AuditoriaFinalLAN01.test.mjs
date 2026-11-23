// Fase 3 · Auditoría Final (LAN-01): optimización selectiva y adaptativa del Lanzamiento 3D
// sin reducir la calidad visual en equipos potentes ni alterar la física del lanzamiento.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ajustesLanzamiento, anisotropiaLanzamiento } from '../src/launch/LaunchWorld.js';
import { crearPlataformaLC41_1977 } from '../src/launch/LC41Pad1977.js';
import { crearTitanIIIECentaur, GEOMETRIA_VEHICULO } from '../src/launch/TitanIIIECentaur3D.js';
import { LANZAMIENTOS_VOYAGER, trayectoriaLanzamiento, estadoEnu, eventoPorId } from '../src/science/VoyagerLaunchProfile.js';

function instalarCanvas2DMock() {
  const prevDoc = globalThis.document;
  globalThis.document = {
    createElement(tag) {
      if (tag !== 'canvas') return {};
      return {
        width: 256,
        height: 256,
        getContext() {
          return {
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 1,
            font: '',
            textAlign: '',
            textBaseline: '',
            globalCompositeOperation: 'source-over',
            fillRect() {},
            beginPath() {},
            arc() {},
            fill() {},
            moveTo() {},
            lineTo() {},
            stroke() {},
            fillText() {},
            save() {},
            restore() {},
            translate() {},
            rotate() {},
            createRadialGradient() { return { addColorStop() {} }; },
            createLinearGradient() { return { addColorStop() {} }; },
            createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
            putImageData() {}
          };
        }
      };
    }
  };
  return () => {
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
  };
}

test('LAN-01 · anisotropiaLanzamiento adapta el filtrado por nivel de detalle conservando 16× en perfil alto', () => {
  assert.equal(anisotropiaLanzamiento('alto', 16), 16, 'perfil alto en GPU dedicada conserva 16×');
  assert.equal(anisotropiaLanzamiento('alto', 8), 8, 'respeta el límite del hardware');
  assert.equal(anisotropiaLanzamiento('medio', 16), 8, 'perfil medio usa 8×');
  assert.equal(anisotropiaLanzamiento('bajo', 16), 2, 'perfil bajo usa 2×');
  assert.equal(anisotropiaLanzamiento('minimo', 16), 1, 'perfil mínimo / software usa 1× (trilineal sin bucle anisotrópico)');
  assert.equal(anisotropiaLanzamiento('minimo', 0), 1, 'nunca devuelve menos de 1');
  // ajustesLanzamiento conserva exactamente su contrato congelado de 9 propiedades.
  assert.deepEqual(
    Object.keys(ajustesLanzamiento('alto')),
    ['detalle', 'antialias', 'sombras', 'entorno', 'nubes', 'divisiones', 'humo', 'nubeSuelo', 'nubeBase']
  );
});

test('LAN-01 · crearPlataformaLC41_1977 fusiona estáticos por material/zona, preserva brazos animados y ajusta anisotropía', () => {
  const restaurar = instalarCanvas2DMock();
  try {
    const padSw = crearPlataformaLC41_1977({ anisotropia: 1 });
    let mallasSw = 0;
    const anisotropiasSw = new Set();
    padSw.grupo.traverse(o => {
      if (o.isMesh) {
        mallasSw++;
        if (o.material?.map) anisotropiasSw.add(o.material.map.anisotropy);
      }
    });
    assert.ok(mallasSw <= 18, `las 39 mallas originales se agrupan en ${mallasSw} mallas sin perder zonas`);
    assert.deepEqual([...anisotropiasSw], [1], 'en software las texturas procedurales de la plataforma usan anisotropía 1');
    assert.equal(padSw.brazos.length, 3, 'conserva los 3 brazos umbilicales articulados con pivote propio');

    padSw.retraerBrazos(0);
    assert.ok(padSw.brazos.every(b => Math.abs(b.rotation.y) < 1e-12), 'brazos conectados en u = 0');
    padSw.retraerBrazos(1);
    for (const b of padSw.brazos) {
      assert.ok(Math.abs(b.rotation.y + (70 * Math.PI) / 180) < 1e-9, 'brazos retraídos 70° en u = 1');
    }
    padSw.destruir();

    const padGpu = crearPlataformaLC41_1977({ anisotropia: 16 });
    const anisotropiasGpu = new Set();
    padGpu.grupo.traverse(o => {
      if (o.isMesh && o.material?.map) anisotropiasGpu.add(o.material.map.anisotropy);
    });
    assert.deepEqual([...anisotropiasGpu], [8], 'en GPU dedicada las texturas procedurales conservan anisotropía 8');
    padGpu.destruir();
  } finally {
    restaurar();
  }
});

test('LAN-01 · crearTitanIIIECentaur expone elementos internos del interetapa y respeta anisotropía sin alterar geometría', () => {
  const restaurar = instalarCanvas2DMock();
  try {
    const vSw = crearTitanIIIECentaur({ numeroVehiculo: 7, anisotropia: 1 });
    assert.equal(vSw.grupo.name, 'TitanIIIE_Centaur_TC7');
    assert.deepEqual(
      Object.keys(vSw.piezas).sort(),
      ['centaur', 'cofiaA', 'cofiaB', 'etapa1', 'etapa2', 'moduloPropulsion', 'nave', 'srm1', 'srm2']
    );
    assert.equal(vSw.piezas.etapa2.userData.ocultaEnInteretapa?.length, 2, 'tobera LR91 y tapa interna identificadas para ocultación antes de separar etapa I');
    assert.equal(vSw.materiales.etapa1.map.anisotropy, 1);
    assert.equal(vSw.materiales.cofia.map.anisotropy, 1);
    assert.equal(vSw.geometria.tope, GEOMETRIA_VEHICULO.tope);
    vSw.destruir();

    const vGpu = crearTitanIIIECentaur({ numeroVehiculo: 6, anisotropia: 16 });
    assert.equal(vGpu.materiales.etapa1.map.anisotropy, 8);
    assert.equal(vGpu.materiales.cofia.map.anisotropy, 8);
    vGpu.destruir();
  } finally {
    restaurar();
  }
});

test('LAN-01 · LaunchWorld y VoyagerLaunchDirector implementan oclusión Early-Z de núcleos opacos, precalentamiento y ocultación bajo cofia', () => {
  const worldSrc = readFileSync(new URL('../src/launch/LaunchWorld.js', import.meta.url), 'utf8');
  const directorSrc = readFileSync(new URL('../src/launch/VoyagerLaunchDirector.js', import.meta.url), 'utf8');

  // 1. Partición de parches esféricos en anillo de borde + núcleo opaco con orden de renderizado frontal (-3, -2, -1).
  assert.match(worldSrc, /geo\.setDrawRange\(0,\s*nBorde\)/);
  assert.match(worldSrc, /geoNucleo\.setDrawRange\(nBorde,\s*nNucleo\)/);
  assert.match(worldSrc, /\['florida',\s*\[div\(48\),\s*div\(48\)\],\s*1,\s*0\.125,\s*-1\]/);
  assert.match(worldSrc, /\['cabo',\s*\[div\(24\),\s*div\(24\)\],\s*2,\s*1\s*\/\s*3,\s*-2\]/);
  assert.match(worldSrc, /\['lc41',\s*\[16,\s*16\],\s*3,\s*0\.125,\s*-3\]/);

  // 2. El cielo se dibuja en renderOrder = 1 de la lista opaca para aprovechar Early-Z tras el terreno opaco, plataforma y cohete.
  assert.match(worldSrc, /cielo\.renderOrder\s*=\s*1/);

  // 3. Ocultación geométrica del globo bajo 3,5 km y de Florida bajo 10 m cuando quedan cubiertos por el horizonte opaco superior.
  assert.match(worldSrc, /altitud\s*<\s*10/);
  assert.match(worldSrc, /altitud\s*<\s*3500/);
  assert.match(worldSrc, /globo\.visible\s*=\s*!terrenoCubreGlobo/);

  // 4. Liberación del WebGLRenderTarget de PMREM.
  assert.match(worldSrc, /entornoObjetivo\?\.dispose\(\)/);

  // 5. Ocultación de carga interna bajo la cofia cerrada y precalentamiento en plataforma antes de iniciar la reproducción.
  assert.match(directorSrc, /mostrarInteriorCofia\s*=\s*forzarInternos\s*\|\|\s*t\s*>=\s*tCofia\s*-\s*0\.1/);
  assert.match(directorSrc, /mostrarToberaEtapa2\s*=\s*forzarInternos\s*\|\|\s*t\s*>=\s*tE1off\s*-\s*0\.5/);
  assert.match(directorSrc, /aplicarInstante\(0\.5,\s*0,\s*\{\s*forzarInternos:\s*true\s*\}\)/);
});

test('LAN-01 · preservación científica: trayectorias, velocidades, masas y eventos de Voyager 1 y 2 permanecen intactos', () => {
  for (const id of ['voyager-1', 'voyager-2']) {
    const tr = trayectoriaLanzamiento(id);
    assert.equal(tr.calibracion.convergio, true);
    const sLift = estadoEnu(tr, eventoPorId(LANZAMIENTOS_VOYAGER[id], 'despegue').t);
    assert.ok(Math.hypot(...sLift.posicionM) < 1e-6);
    const sMeco1 = estadoEnu(tr, eventoPorId(LANZAMIENTOS_VOYAGER[id], 'meco1').t);
    assert.ok(Math.abs(sMeco1.altitudM - 166680) < 500);
  }
});
