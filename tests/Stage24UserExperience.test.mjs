// Etapa 24 · Experiencia de uso: ayudas del Centro de Misión (marcas agrupadas, zoom, atajos, esquema de la órbita final),
// rótulos que esquivan los controles, comparación con la misión real y objetivo de la captura en el resultado calculado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { agruparMarcas, ventanaZoom, accionTeclaCentroMision, esquemaOrbita } from '../src/ui/MissionPlaybackAids.js';
import { posicionEtiquetaLibre } from '../src/ui/PlanetLabels.js';
import { mainSceneFrameZone, MC_PANES } from '../src/ui/MissionControlCenter.js';
import { REAL_MISSIONS, REAL_MISSION_SOURCES, realMissionsFor, compararConMisionReal } from '../src/lab/RealMissionHistory.js';
import { termFor } from '../src/ui/LabGlossary.js';
import { historicalDesign } from '../src/lab/ProbeDesign.js';
import { INTEGRATED_SCENARIOS, integratedMissionInput, scenarioFormValues, refinementHalfSpanDays } from '../src/ui/IntegratedMissionPlanner.js';
import { computeIntegratedMission, ENCOUNTER_TARGETS } from '../src/lab/IntegratedMission.js';
import { refineTransferCandidate } from '../src/lab/InterplanetaryPlan.js';
import { createInterplanetaryEphemeris } from '../src/science/InterplanetaryEphemeris.js';
import { datetimeLocalUtcToJdTdb } from '../src/science/AstrodynamicsTime.js';

const ev = (id, t) => ({ id, title: `Evento ${id}`, elapsedSeconds: t });

test('24 · marcas: los eventos a menos de 12 px se agrupan y la ventana ampliada los separa', () => {
  const eventos = [ev('a', 0), ev('b', 5000), ev('c', 5005), ev('d', 5010), ev('e', 50000), ev('f', 100000)];
  const total = agruparMarcas(eventos, { inicio: 0, fin: 100000, anchoPx: 600 });
  assert.deepEqual(total.map(g => g.eventos.map(e => e.id).join('')), ['a', 'bcd', 'e', 'f']);
  assert.ok(Math.abs(total[1].fraccion - 0.05) < 1e-9, 'la marca del grupo queda en el primer evento');
  assert.equal(total.at(-1).fraccion, 1);
  // El grupo b–d ocupa 10 s: en una ventana de 22 s sus eventos quedan a 136 px y ya no se agrupan; los de fuera no aparecen.
  const z = ventanaZoom({ total: 100000, centro: 5005, fraccion: 22 / 100000, minimoS: 10 });
  assert.ok(Math.abs(z.fin - z.inicio - 22) < 1e-9 && z.inicio <= 5000 && z.fin >= 5010);
  const ampliada = agruparMarcas(eventos, { ...z, anchoPx: 600 });
  assert.deepEqual(ampliada.map(g => g.eventos.map(e => e.id).join('')), ['b', 'c', 'd']);
  // Eventos en el mismo instante: siguen juntos con cualquier ampliación (la interfaz no amplía y los nombra).
  assert.equal(agruparMarcas([ev('x', 5), ev('y', 5)], { inicio: 0, fin: 10, anchoPx: 600 }).length, 1);
  assert.deepEqual(agruparMarcas(eventos, { inicio: 0, fin: 0, anchoPx: 600 }), []);
  assert.deepEqual(agruparMarcas([{ id: 'n', elapsedSeconds: Number.NaN }], { inicio: 0, fin: 10, anchoPx: 600 }), []);
});

// Auditoría 24, D-01: con más grupos que el máximo, antes se descartaban las últimas marcas en silencio.
test('24 · marcas: por encima del máximo se agrupa más, sin perder ningún evento', () => {
  const muchos = Array.from({ length: 1000 }, (_, i) => ev(String(i), i));
  const grupos = agruparMarcas(muchos, { inicio: 0, fin: 999, anchoPx: 100000, maximo: 80 });
  assert.ok(grupos.length <= 80 && grupos.length > 1, `${grupos.length} grupos`);
  assert.equal(grupos.reduce((n, g) => n + g.eventos.length, 0), 1000);
  assert.equal(grupos.at(-1).eventos.at(-1).id, '999');
  assert.equal(agruparMarcas(muchos, { inicio: 0, fin: 999, anchoPx: 100000, maximo: 1 }).length, 1);
});

// Regresión 17/17.1: en la parada del tabulador del botón del calendario de un campo de fecha, Chrome no aplica :focus ni
// :focus-visible al campo (solo :focus-within). La comprobación de comportamiento está en scripts/verify-stage24-browser.mjs.
test('24 · los campos de fecha muestran anillo de foco', () => {
  const css = readFileSync(new URL('../src/ui/theme.css', import.meta.url), 'utf8');
  assert.match(css, /input:is\(\[type="date"\],\[type="datetime-local"\]\):focus-within \{ outline:2px solid var\(--blue\)/);
  assert.match(css, /#experimental-lab \.lab-field input:is\(\[type="date"\],\[type="datetime-local"\]\):focus-within \{ outline:none; border-color:var\(--blue\); box-shadow:/);
});

test('24 · zoom temporal: la ventana queda dentro de la misión y respeta la anchura mínima', () => {
  assert.deepEqual(ventanaZoom({ total: 1000, centro: 0, fraccion: 0.1, minimoS: 10 }), { inicio: 0, fin: 100 });
  assert.deepEqual(ventanaZoom({ total: 1000, centro: 1000, fraccion: 0.1, minimoS: 10 }), { inicio: 900, fin: 1000 });
  assert.deepEqual(ventanaZoom({ total: 1000, centro: 500, fraccion: 0.001, minimoS: 60 }), { inicio: 470, fin: 530 });
  assert.deepEqual(ventanaZoom({ total: 30, centro: 15, fraccion: 0.5, minimoS: 60 }), { inicio: 0, fin: 30 });
  assert.deepEqual(ventanaZoom({ total: 0, centro: 3 }), { inicio: 0, fin: 0 });
});

test('24 · atajos: espacio, flechas, Inicio y Fin solo fuera de campos, botones y controles con teclado propio', () => {
  const a = (key, extra = {}) => accionTeclaCentroMision({ key, tagName: 'BODY', ...extra });
  assert.equal(a(' '), 'play-pausa');
  assert.equal(a('ArrowLeft'), 'anterior');
  assert.equal(a('ArrowRight'), 'siguiente');
  assert.equal(a('Home'), 'inicio');
  assert.equal(a('End'), 'fin');
  assert.equal(a('Enter'), null);
  for (const tagName of ['INPUT', 'SELECT', 'TEXTAREA']) assert.equal(a('ArrowRight', { tagName }), null, tagName);
  assert.equal(a(' ', { tagName: 'BUTTON' }), null, 'el espacio pulsa el botón enfocado');
  assert.equal(a('ArrowRight', { tagName: 'BUTTON' }), 'siguiente', 'las flechas sí funcionan con un botón enfocado');
  assert.equal(a(' ', { tagName: 'SUMMARY' }), null);
  for (const role of ['tab', 'slider', 'radio', 'listbox']) assert.equal(a('ArrowLeft', { tagName: 'DIV', role }), null, role);
  for (const mod of ['ctrlKey', 'altKey', 'metaKey', 'shiftKey']) assert.equal(a('ArrowLeft', { [mod]: true }), null, mod);
  assert.equal(a(' ', { tagName: 'DIV', editable: true }), null);
});

test('24 · esquema de la órbita: foco en el cuerpo, periapsis a la derecha, apoapsis a la izquierda y todo dentro del lado', () => {
  const R = 3389.5, alcanzada = { periapsisAltitudeKm: 315.5, apoapsisAltitudeKm: 33000 }, objetivo = { periapsisAltitudeKm: 3000, apoapsisAltitudeKm: 33000 };
  const g = esquemaOrbita({ radioCuerpoKm: R, alcanzada, objetivo, lado: 220, margen: 14 });
  const k = g.escalaPxPorKm;
  assert.ok(Math.abs(g.alcanzada.periapsisX - g.foco.x - (R + 315.5) * k) < 1e-9);
  assert.ok(Math.abs(g.foco.x - g.alcanzada.apoapsisX - (R + 33000) * k) < 1e-9);
  assert.ok(Math.abs(g.radioCuerpoPx - R * k) < 1e-9, 'el cuerpo se dibuja a la misma escala');
  for (const e of [g.alcanzada, g.objetivo]) {
    assert.ok(e.cx - e.rx >= 14 - 1e-9 && e.cx + e.rx <= 220 - 14 + 1e-9, 'cabe en horizontal');
    assert.ok(e.cy - e.ry >= 14 - 1e-9 && e.cy + e.ry <= 220 - 14 + 1e-9, 'cabe en vertical');
    // El foco de cada elipse es el centro del cuerpo: c = a − rp.
    assert.ok(Math.abs(Math.sqrt(e.rx ** 2 - e.ry ** 2) - (g.foco.x - e.cx)) < 1e-6);
  }
  assert.equal(esquemaOrbita({ radioCuerpoKm: R, alcanzada: { periapsisAltitudeKm: 300, apoapsisAltitudeKm: null } }), null, 'sin órbita cerrada no hay esquema');
  assert.equal(esquemaOrbita({ radioCuerpoKm: R, alcanzada }).objetivo, null);
  const lejos = esquemaOrbita({ radioCuerpoKm: 71492, alcanzada: { periapsisAltitudeKm: 4200, apoapsisAltitudeKm: 8.1e6 }, radioMinimoPx: 3 });
  assert.equal(lejos.radioCuerpoPx, 3, 'un cuerpo diminuto a escala se dibuja con un radio mínimo visible');
});

test('24 · rótulos: esquivan los controles probando debajo del marcador y, si tampoco caben, se ocultan', () => {
  const pastilla = { left: 100, right: 220, top: 10, bottom: 40 };
  assert.equal(posicionEtiquetaLibre({ x: 160, yArriba: 60, yAbajo: 120, ancho: 80 }), 60, 'sin obstáculos, encima');
  assert.equal(posicionEtiquetaLibre({ x: 160, yArriba: 45, yAbajo: 120, ancho: 80, obstaculos: [pastilla] }), 120, 'bajo la pastilla, debajo del marcador');
  assert.equal(posicionEtiquetaLibre({ x: 160, yArriba: 45, yAbajo: 50, ancho: 80, obstaculos: [pastilla, { left: 0, right: 400, top: 30, bottom: 80 }] }), null);
  assert.equal(posicionEtiquetaLibre({ x: 320, yArriba: 45, yAbajo: 120, ancho: 80, obstaculos: [pastilla] }), 45, 'lejos en x no choca');
  assert.equal(posicionEtiquetaLibre({ x: 160, yArriba: 45, ancho: 80, obstaculos: [pastilla] }), null, 'sin alternativa, se oculta');
});

test('24 · zona del Sistema Solar principal: los controles sobre la escena se entregan como obstáculos en coordenadas del lienzo', () => {
  const z = mainSceneFrameZone({ stage: { top: 100, bottom: 700, left: 300, right: 1300, height: 600 }, bar: { top: 140, bottom: 180, left: 310, right: 900, width: 590, height: 40 },
    transport: { top: 620, bottom: 660, left: 314, right: 1286, width: 972, height: 40 }, canvas: { top: 0, left: 0, right: 1600, bottom: 900 },
    obstacles: [{ top: 108, bottom: 132, left: 1100, right: 1200, width: 100, height: 24 }, { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }] });
  assert.equal(z.obstaculos.length, 3, 'barra de cámaras, reproducción y pastilla; los ocultos (0 × 0) no cuentan');
  assert.deepEqual(z.obstaculos[2], { left: 1096, right: 1204, top: 104, bottom: 136 });
});

test('24 · misión real: fechas verificadas en NASA, ordenadas y con fuente; Cassini según el plan de mejora', () => {
  const cassini = realMissionsFor('cassini')[0];
  assert.deepEqual(cassini.hitos.map(h => h.fecha), ['1997-10-15', '1998-04-26', '1999-06-24', '1999-08-18', '2000-12-30', '2004-07-01']);
  assert.deepEqual(cassini.hitos.map(h => h.cuerpo).filter(Boolean), ['Venus', 'Venus', 'Tierra', 'Júpiter', 'Saturno']);
  for (const [probe, missions] of Object.entries(REAL_MISSIONS)) for (const m of missions) {
    const dates = m.hitos.map(h => h.fecha);
    assert.ok(dates.every(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`))), `${probe}: fechas ISO`);
    assert.deepEqual([...dates].sort(), dates, `${probe}: hitos en orden`);
    assert.match(REAL_MISSION_SOURCES[m.fuente]?.url ?? '', /^https:\/\/(nssdc\.gsfc\.nasa\.gov|science\.nasa\.gov)\//, `${probe}: fuente de NASA`);
  }
  assert.equal(realMissionsFor('voyager')[0].hitos[0].fecha, '1977-08-20', 'la Voyager 2 se lanzó antes que la 1');
  assert.equal(realMissionsFor('voyager')[1].hitos[0].fecha, '1977-09-05');
  assert.deepEqual(realMissionsFor('experimental'), []);
});

test('24 · comparación con la misión real: no confunde simulación e historia', () => {
  const marte = compararConMisionReal('cassini', ['Marte']);
  assert.equal(marte.coincidencias.length, 0);
  assert.match(marte.resumen, /no fue a Marte.*Saturno.*no una reconstrucción histórica/);
  const dawn = compararConMisionReal('dawn', ['Marte']);
  assert.deepEqual(dawn.coincidencias.map(c => c.fecha), ['2009-02-18']);
  assert.match(dawn.resumen, /también pasó por Marte.*no son los históricos/);
  assert.equal(compararConMisionReal('voyager', ['Jupiter', 'Europa']).coincidencias.length, 2, 'ignora tildes');
  assert.match(compararConMisionReal('juno', ['Luna']).resumen, /no fue a la Luna/);
  assert.equal(compararConMisionReal('cassini', []), null, 'sin destino no hay comparación');
  assert.equal(compararConMisionReal('experimental', ['Marte']), null);
});

test('24 · encabezados y fechas: el panel no repite «Reproducción» como encabezado y las fechas explican UTC/TDB', () => {
  const src = readFileSync(new URL('../src/ui/MissionControlCenter.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /<h3 id="mc-pane-title"/, 'el título del panel ya no es un h3 bajo el h2 del laboratorio');
  assert.match(src, /<p id="mc-pane-title" class="lab-panel-title">/);
  assert.equal(Object.keys(MC_PANES).length, 6);
  assert.equal(termFor('Fecha UTC')?.id, 'utc');
  assert.equal(termFor('TDB − UTC')?.id, 'tdb');
  assert.equal(termFor('Salida (UTC)')?.id, 'utc');
});

// Réplica de IntegratedMissionPlanner.compute() para el escenario guiado A1 (Cassini → Marte).
const json = file => JSON.parse(readFileSync(file, 'utf8'));
const catalog = { catalogVersion: 1, datasets: [...json('public/data/interplanetary-ephemerides-catalog-v1.json').datasets, ...json('public/data/encounter-ephemerides-catalog-v1.json').datasets] };
const ephemeris = createInterplanetaryEphemeris({ catalog, loadJson: async file => json(`public/${file}`) });

test('24 · la fase de captura declara su objetivo y el radio del cuerpo (A1, Cassini → Marte)', async () => {
  const v = scenarioFormValues(INTEGRATED_SCENARIOS.find(s => s.id === 'A1')), target = ENCOUNTER_TARGETS[v.destinationId];
  let departureJdTdb = datetimeLocalUtcToJdTdb(v.departureUtc), tofDays = v.tofDays;
  const covE = ephemeris.coverage('399'), covT = ephemeris.coverage(target.ephemerisId), margin = Math.max(30, 0.02 * tofDays) + 140;
  const helio = await ephemeris.loadWindow(['399', target.ephemerisId], Math.max(covE.startJdTdb, covT.startJdTdb, departureJdTdb - margin), Math.min(covE.endJdTdb, covT.endJdTdb, departureJdTdb + tofDays + margin + 200));
  if (v.refine) {
    const r = refineTransferCandidate(helio, { destinationId: target.ephemerisId, departureJdTdb, tofDays, criterion: 'c3', halfSpanDepartureDays: refinementHalfSpanDays(tofDays), halfSpanTofDays: refinementHalfSpanDays(tofDays) });
    if (Number.isFinite(r.score)) { departureJdTdb = r.departureJdTdb; tofDays = r.tofDays; }
  }
  // Modo sin compensar (17.1), para comparar objetivo y alcanzado distintos; la etapa 20 prueba el modo por defecto.
  const input = integratedMissionInput({ ...v, destinationId: target.id, departureJdTdb, tofDays, compensate: false }, { ...historicalDesign('cassini'), id: 'flota-cassini' });
  const mission = computeIntegratedMission(input, { helio, moons: null });
  const capture = mission.phases.find(p => p.id === 'capture');
  assert.equal(capture.bodyName, 'Marte');
  assert.equal(capture.bodyRadiusKm, target.radiusKm);
  assert.equal(capture.objective.periapsisAltitudeKm, input.profile.planet.periapsisAltitudeKm);
  assert.equal(capture.objective.apoapsisAltitudeKm, input.profile.planet.captureBurns.at(-1).apoapsisAltitudeKm);
  const o = capture.insertion.finalOrbit;
  assert.ok(o.bound);
  // 17.1 documentó el desplazamiento del periapsis en A1 (3000 → 315,5 km): el objetivo y lo alcanzado son distintos y ambos se muestran.
  assert.ok(Math.abs(o.periapsisAltitudeKm - 315.5) < 1, `periapsis alcanzado ${o.periapsisAltitudeKm}`);
  const g = esquemaOrbita({ radioCuerpoKm: capture.bodyRadiusKm, alcanzada: o, objetivo: capture.objective });
  assert.ok(g && g.objetivo && g.alcanzada.rx > 0);
});

// 24: `!important` solo en utilidades (ocultar con [hidden], texto para lectores de pantalla y movimiento reducido). El resto
// se resolvió con especificidad; scripts/css-computed-snapshot.mjs comprobó en Chrome que los estilos calculados no cambian.
test('24 · CSS: !important solo en [hidden], .sr-only y prefers-reduced-motion', async () => {
  const { readdirSync } = await import('node:fs');
  const files = ['src/style.css', ...readdirSync('src/ui').filter(f => f.endsWith('.css')).map(f => `src/ui/${f}`)];
  let total = 0;
  for (const file of files) {
    const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    // Recorre las reglas con su selector y el @media que las contiene.
    const stack = []; let buffer = '';
    for (const ch of css) {
      if (ch === '{') { stack.push(buffer.trim()); buffer = ''; continue; }
      if (ch === '}') {
        if (buffer.includes('!important')) {
          const selector = stack.at(-1) ?? '', media = stack.slice(0, -1).join(' ');
          const ok = /\[hidden\]/.test(selector) || /^\.sr-only$/.test(selector) || /prefers-reduced-motion\s*:\s*reduce/.test(media);
          assert.ok(ok, `${file}: «${selector}» usa !important fuera de una utilidad`);
          total += buffer.split('!important').length - 1;
        }
        stack.pop(); buffer = ''; continue;
      }
      buffer += ch;
    }
  }
  assert.equal(total, 26, 'declaraciones !important restantes (eran 92 antes de la etapa 24)');
});
