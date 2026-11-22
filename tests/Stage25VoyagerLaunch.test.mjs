// Etapa 25 · Lanzamiento Voyager desde LC-41: datos documentados, tiempo sidéreo, Sol y ascenso ilustrativo calibrado.
// Referencias independientes: JPL Horizons (consultado el 21-11-2026 con el sitio 80,58306° O, 28,58333° N, 0 m), Meeus
// «Astronomical Algorithms» (ejemplos 12.a, 12.b y 25.a) y las tablas 4-2 a 4-4 del informe de vuelo TC-6.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LANZAMIENTOS_VOYAGER, LC41, TITAN_IIIE_CENTAUR, FUENTES_LANZAMIENTO, ALTITUD_APARCAMIENTO_M, RADIO_TIERRA_M, MU_TIERRA_M3_S2,
  tiempoSidereoMedioGrados, posicionSolar, solEnLC41, alturaAcimut, fechaJulianaDesdeMs, matrizEcuatorialAEnu, instanteUtcMs,
  eventoPorId, trayectoriaLanzamiento, estadoEnu, calibrarAscenso, puntoSubsolar, estadoInercial, inercialAEnu, propagarBalistico
} from '../src/science/VoyagerLaunchProfile.js';
import { crearLineaTiempo, formatearRelojMision, INICIO_MISION_S } from '../src/launch/LaunchTimeline.js';

const cerca = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} frente a ${b} (±${tol})`);
const angDif = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

test('25: tiempo sidéreo medio frente a Meeus (ejemplos 12.a y 12.b)', () => {
  cerca(tiempoSidereoMedioGrados(2446895.5), 197.693195, 1e-5, '1987-04-10 0h UT');
  cerca(tiempoSidereoMedioGrados(2446896.30625), 128.7378734, 1e-5, '1987-04-10 19:21 UT');
});

test('25: posición aparente del Sol frente a Meeus 25.a (fórmula de baja precisión, ≈ 0,01°)', () => {
  const s = posicionSolar(2448908.5); // 1992-10-13 0h TD
  cerca(s.raDeg, 198.38083, 0.01, 'AR'); cerca(s.decDeg, -7.78507, 0.01, 'Dec');
});

test('25: Sol visto desde LC-41 en ambos despegues frente a JPL Horizons', () => {
  // Horizons, Sol (10) desde coord@399, acimut/elevación aparentes sin refracción y tiempo sidéreo local aparente.
  const casos = [
    { id: 'voyager-2', utc: '1977-08-20T14:29:44.000Z', az: 102.334482376, el: 46.018744145, last: 7.0441223032 },
    { id: 'voyager-1', utc: '1977-09-05T12:56:01.218Z', az: 95.551714665, el: 24.039886298, last: 6.5292978308 }
  ];
  for (const c of casos) {
    const ms = Date.parse(c.utc), sol = solEnLC41(ms);
    assert.ok(angDif(sol.azDeg, c.az) < 0.02, `${c.id} acimut ${sol.azDeg}`);
    cerca(sol.altDeg, c.el, 0.02, `${c.id} elevación`);
    // Medio frente a aparente: difieren en la ecuación de los equinoccios (≤ 1,2 s).
    const lmst = ((tiempoSidereoMedioGrados(fechaJulianaDesdeMs(ms)) + LC41.lonDeg) % 360 + 360) % 360 / 15;
    cerca(lmst * 3600, c.last * 3600, 1.5, `${c.id} tiempo sidéreo local (s)`);
    const [e, n, u] = sol.enu; cerca(Math.hypot(e, n, u), 1, 1e-12, 'vector unitario'); assert.ok(e > 0 && u > 0, 'mañana: Sol al este y sobre el horizonte');
  }
  // Con el despegue de cada misión según su secuencia: misma referencia.
  const v2 = solEnLC41(instanteUtcMs(LANZAMIENTOS_VOYAGER['voyager-2'], 0.2));
  cerca(v2.altDeg, 46.0187, 0.02, 'Voyager 2 desde la secuencia');
});

test('25: la matriz ecuatorial → ENU es ortonormal y lleva el polo norte celeste a la altura de la latitud', () => {
  const M = matrizEcuatorialAEnu(Date.parse('1977-08-20T14:29:44Z'));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cerca(M[i][0] * M[j][0] + M[i][1] * M[j][1] + M[i][2] * M[j][2], i === j ? 1 : 0, 1e-12, `fila ${i}·${j}`);
  const polo = [M[0][2], M[1][2], M[2][2]];
  cerca(Math.asin(polo[2]) * 180 / Math.PI, LC41.latDeg, 1e-9, 'altura del polo'); cerca(polo[0], 0, 1e-12, 'polo al norte');
  // Mismo resultado que alturaAcimut para el Sol.
  const ms = Date.parse('1977-09-05T12:56:01.218Z'), s = posicionSolar(fechaJulianaDesdeMs(ms));
  const ra = s.raDeg * Math.PI / 180, de = s.decDeg * Math.PI / 180, v = [Math.cos(de) * Math.cos(ra), Math.cos(de) * Math.sin(ra), Math.sin(de)];
  const M2 = matrizEcuatorialAEnu(ms), enu = M2.map(f => f[0] * v[0] + f[1] * v[1] + f[2] * v[2]);
  const aa = alturaAcimut(s, fechaJulianaDesdeMs(ms), LC41.latDeg, LC41.lonDeg);
  cerca(Math.asin(enu[2]) * 180 / Math.PI, aa.altDeg, 1e-9, 'altura'); cerca((Math.atan2(enu[0], enu[1]) * 180 / Math.PI + 360) % 360, aa.azDeg, 1e-9, 'acimut');
});

test('25: secuencias de vuelo ordenadas, con fuente y con nota cuando son reconstruidas', () => {
  for (const mision of Object.values(LANZAMIENTOS_VOYAGER)) {
    const ids = mision.eventos.map(e => e.id);
    assert.equal(new Set(ids).size, ids.length, 'ids únicos');
    for (let i = 1; i < mision.eventos.length; i++) assert.ok(mision.eventos[i].t > mision.eventos[i - 1].t, `${mision.id}: ${ids[i]} después de ${ids[i - 1]}`);
    for (const e of mision.eventos) {
      assert.ok(['tc6', 'prensa', 'reconstruido'].includes(e.fuente), `${e.id}: fuente`);
      if (e.fuente === 'reconstruido') assert.ok(e.nota?.length > 20, `${e.id}: explica cómo se reconstruyó`);
    }
    for (const k of ['tc6', 'resumen', 'prensa']) assert.match(FUENTES_LANZAMIENTO[k].url, /^https:\/\//);
  }
  // Valores del informe TC-6 (tabla «Sequence of events», columna real) y del dossier de prensa (secuencia del 20-08-1977, +0,2 s).
  const v1 = LANZAMIENTOS_VOYAGER['voyager-1'], v2 = LANZAMIENTOS_VOYAGER['voyager-2'];
  assert.deepEqual(['srm-separacion', 'cofia', 'meco1', 'mes2', 'meco2', 'separacion-nave', 'pm-apagado'].map(id => eventoPorId(v1, id).t), [123.2, 272.2, 594.0, 3199.8, 3535.3, 3705.2, 3767.3]);
  assert.deepEqual(['etapa1-ignicion', 'srm-separacion', 'cofia', 'meco1'].map(id => +eventoPorId(v2, id).t.toFixed(1)), [111.2, 122.2, 271.2, 590.2]);
  assert.equal(v1.srmIgnicionUtc, '1977-09-05T12:56:00.958Z');
  assert.equal(new Date(instanteUtcMs(v2, eventoPorId(v2, 'despegue').t)).toISOString(), '1977-08-20T14:29:44.000Z');
  cerca(eventoPorId(v2, 'pm-apagado').t - eventoPorId(v2, 'despegue').t, 3739, 1e-9, 'Voyager 2: inyección a T + 1 h 02 min 19 s');
});

test('25: el vehículo documentado en unidades SI', () => {
  const V = TITAN_IIIE_CENTAUR;
  cerca(V.alturaTotalM, 48.768, 1e-3, 'altura 160 ft');
  cerca(V.cofia.cilindroAlturaM + V.cofia.narizAlturaM, V.cofia.alturaM, 1e-9, 'cofia: cilindro + nariz = 58 ft');
  cerca(V.srm.segmentosAlturaM.central, 3.2766, 1e-4, 'segmento central 129 in');
  cerca(V.masaDespegueKg, 620514.8, 0.5, '1 368 000 lb');
  // Etapa I: masa de propulsante / caudal = tiempo; el informe da 150,1 s de combustión real (112,1 → 262,2 s).
  const caudal = V.etapa1.empujeN / (V.etapa1.ispVacioS * 9.80665), prop = V.etapa1.masaLlenaKg - V.etapa1.masaVaciaKg;
  cerca(prop / caudal, 150.1, 2, 'coherencia de la etapa I con el vuelo');
  cerca(V.nave.moduloMisionKg + V.nave.moduloPropulsionKg + V.nave.adaptadorKg, 2092.2, 1e-9, 'componentes de la nave');
});

test('25: el ascenso calibrado llega a la órbita de aparcamiento documentada en MECO-1', () => {
  for (const id of ['voyager-1', 'voyager-2']) {
    const tr = trayectoriaLanzamiento(id), c = tr.calibracion;
    assert.equal(c.convergio, true, `${id}: calibración`);
    const meco1 = eventoPorId(tr.mision, 'meco1').t, s = estadoEnu(tr, meco1);
    cerca(s.altitudM, ALTITUD_APARCAMIENTO_M, 500, `${id}: 90 millas náuticas`);
    cerca(s.rapidezInercialMS, Math.sqrt(MU_TIERRA_M3_S2 / (RADIO_TIERRA_M + s.altitudM)), 2, `${id}: velocidad circular`);
    // Empuje/peso al despegue = 2 × 1,2 Mlbf / 1 368 000 lb (ambos documentados).
    cerca(tr.comprobaciones.empujePesoDespegue, 2.4e6 / 1.368e6, 0.01, `${id}: empuje/peso`);
    // Parámetros dentro de rangos físicos: θ₁ (ángulo sobre la horizontal al separar los SRM), β y la masa inerte deducida de los SRM.
    assert.ok(c.anguloSrmDeg > 10 && c.anguloSrmDeg < 45, `${id}: θ₁ = ${c.anguloSrmDeg}`);
    assert.ok(c.beta >= 0 && c.beta < 0.9, `${id}: β = ${c.beta}`);
    const fraccionInerte = tr.comprobaciones.inerteSrmKg / tr.comprobaciones.masaSrmTotalKg;
    assert.ok(fraccionInerte > 0.05 && fraccionInerte < 0.3, `${id}: fracción inerte de los SRM ${fraccionInerte}`);
  }
});

test('25: validación independiente con el informe TC-6 (no se usó en la calibración)', () => {
  const tr = trayectoriaLanzamiento('voyager-1');
  // Tabla 4-3: C3 tras MECO-2 ≈ 51,0 km²/s² (previsto 51,05; telemetría 50,997). Tabla 4-4: tras el módulo de propulsión ≈ 105,4.
  cerca(tr.comprobaciones.c3TrasMeco2Km2S2, 51.0, 51.0 * 0.06, 'C3 tras el Centaur');
  cerca(tr.comprobaciones.c3TrasPmKm2S2, 105.43, 105.43 * 0.04, 'C3 de inyección');
  // Inclinación de la órbita de aparcamiento (tabla 4-2: 28,52°), del momento angular del modelo en MECO-1.
  cerca(tr.comprobaciones.inclinacionAparcamientoDeg, tr.mision.inclinacionAparcamientoDeg, 0.2, 'inclinación');
});

test('25: geometría ENU (girando con la Tierra) coherente con la altitud y el acimut de vuelo', () => {
  for (const id of ['voyager-1', 'voyager-2']) {
    const tr = trayectoriaLanzamiento(id), lift = eventoPorId(tr.mision, 'despegue').t;
    const s0 = estadoEnu(tr, lift);
    assert.ok(Math.hypot(...s0.posicionM) < 1e-6, 'en la plataforma al despegar');
    const sube = estadoEnu(tr, lift + 8);
    assert.ok(sube.direccion[2] > 0.9999, 'ascenso vertical'); assert.ok(Math.hypot(sube.posicionM[0], sube.posicionM[1]) < 1, 'sin deriva lateral respecto al suelo (solo Coriolis)');
    for (const t of [60, 300, 594, 2000, 4000]) {
      const s = estadoEnu(tr, t), p = s.posicionM;
      cerca(Math.hypot(p[0], p[1], p[2] + RADIO_TIERRA_M) - RADIO_TIERRA_M, s.altitudM, 1e-3, `${id} t=${t}: altitud`);
      cerca(Math.hypot(...s.direccion), 1, 1e-9, 'dirección unitaria');
    }
    // A 300 s el vehículo va hacia el acimut de vuelo (la rotación terrestre apenas lo desvía todavía).
    const p = estadoEnu(tr, 300).posicionM, rumbo = (Math.atan2(p[0], p[1]) * 180 / Math.PI + 360) % 360;
    assert.ok(angDif(rumbo, tr.mision.acimutVueloDeg) < 3, `${id}: rumbo ${rumbo}`);
    assert.ok(estadoEnu(tr, 1e6).extrapolado, 'fuera de la trayectoria se marca, no se inventa');
  }
});

test('25: la calibración es determinista', () => {
  const a = calibrarAscenso(LANZAMIENTOS_VOYAGER['voyager-2']), b = calibrarAscenso(LANZAMIENTOS_VOYAGER['voyager-2']);
  assert.deepEqual(a, b);
});

test('25: punto subsolar coherente con la altura del Sol en LC-41 y con el mediodía de Greenwich', () => {
  // A mediodía UTC el punto subsolar está cerca del meridiano 0 (la ecuación del tiempo lo desplaza ≤ 4,1°).
  for (const iso of ['1977-08-20T12:00:00Z', '1977-09-05T12:00:00Z', '2000-02-11T12:00:00Z']) {
    const p = puntoSubsolar(Date.parse(iso));
    assert.ok(Math.abs(p.lonDeg) < 4.2, `${iso}: longitud subsolar ${p.lonDeg}`);
    assert.ok(p.lonDeg >= -180 && p.lonDeg < 180);
  }
  // Coherencia independiente: el ángulo entre LC-41 y el punto subsolar es 90° menos la altura del Sol vista desde LC-41.
  for (const m of Object.values(LANZAMIENTOS_VOYAGER)) {
    const ms = instanteUtcMs(m, 0), p = puntoSubsolar(ms), sol = solEnLC41(ms), D = Math.PI / 180;
    const cosAng = Math.sin(LC41.latDeg * D) * Math.sin(p.latDeg * D) + Math.cos(LC41.latDeg * D) * Math.cos(p.latDeg * D) * Math.cos((LC41.lonDeg - p.lonDeg) * D);
    cerca(90 - Math.acos(cosAng) / D, sol.altDeg, 0.02, `${m.id}: altura del Sol desde el punto subsolar`);
    assert.ok(p.lonDeg > LC41.lonDeg, `${m.id}: por la mañana en Florida el punto subsolar está al este de LC-41`);
  }
});

test('25: línea de tiempo de la presentación monótona, invertible y en tiempo real alrededor de los acontecimientos', () => {
  for (const m of Object.values(LANZAMIENTOS_VOYAGER)) {
    const l = crearLineaTiempo(m);
    assert.equal(l.tInicio, INICIO_MISION_S);
    cerca(l.tFin, eventoPorId(m, 'pm-separacion').t + 8, 1e-9, `${m.id}: final de la presentación`);
    assert.ok(l.duracion > 120 && l.duracion < 360, `${m.id}: duración ${l.duracion} s`);
    let anterior = -Infinity;
    for (let p = 0; p <= l.duracion; p += l.duracion / 3000) {
      const t = l.misionDesdePresentacion(p);
      assert.ok(t >= anterior - 1e-9, `${m.id}: no monótona en p = ${p}`);
      anterior = t;
      cerca(l.presentacionDesdeMision(t), p, 1e-6, `${m.id}: inversa en p = ${p}`);
    }
    // Cuenta atrás y acontecimientos clave a velocidad real (×1).
    // (de T − 24 s a T + 20 s el tramo es ×1; luego el ascenso con motores sólidos va a ×6 entre acontecimientos)
    for (const t of [-20, -8, -2, 0.5, 12]) cerca(l.factorEn(l.presentacionDesdeMision(t)), 1, 1e-9, `${m.id}: ×1 en T ${t}`);
    assert.ok(l.factorEn(l.presentacionDesdeMision(60)) > 1, `${m.id}: ascenso acelerado a T + 60 s`);
    // ×1 en los acontecimientos de tramo real; como mucho ×3 en la cofia y en la separación de la nave (tramos lentos).
    for (const [id, maximo] of [['srm-separacion', 1], ['meco1', 1], ['mes2', 1], ['meco2', 1], ['cofia', 2], ['separacion-nave', 3], ['pm-ignicion', 3]]) {
      const ev = l.eventos.find(e => e.id === id);
      assert.ok(l.factorEn(ev.p) <= maximo + 1e-9, `${m.id}: ${id} a ×${l.factorEn(ev.p)} (máximo ×${maximo})`);
      cerca(l.misionDesdePresentacion(ev.p), ev.t, 1e-6, `${m.id}: ${id} cae en su instante`);
    }
    // La órbita de aparcamiento sí se acelera (más de 40 min de misión en pocos segundos de pantalla).
    const enCrucero = l.presentacionDesdeMision((eventoPorId(m, 'meco1').t + eventoPorId(m, 'mes2').t) / 2);
    assert.ok(l.factorEn(enCrucero) >= 100, `${m.id}: crucero a ×${l.factorEn(enCrucero)}`);
    // Planos y fases cubren todo el intervalo; los acontecimientos están ordenados.
    for (let t = l.tInicio; t <= l.tFin; t += 7) { assert.ok(l.planoEn(t)?.id, `plano en ${t}`); assert.ok(l.faseEn(t)?.titulo, `fase en ${t}`); }
    assert.deepEqual(l.eventos.map(e => e.t), [...l.eventos.map(e => e.t)].sort((a, b) => a - b));
    assert.equal(l.siguienteEvento(-5).id, 'srm-ignicion');
    assert.equal(l.eventoAnterior(eventoPorId(m, 'cofia').t + 1).id, 'cofia');
  }
});

test('25: reloj de misión', () => {
  assert.equal(formatearRelojMision(-10), 'T − 00:10');
  assert.equal(formatearRelojMision(0), 'T + 00:00');
  assert.equal(formatearRelojMision(125.9), 'T + 02:05');
  assert.equal(formatearRelojMision(3739.2), 'T + 1:02:19');
});

test('25: el vuelo libre de las piezas separadas parte del estado del vehículo y conserva la energía', () => {
  const tr = trayectoriaLanzamiento('voyager-1'), t0 = eventoPorId(LANZAMIENTOS_VOYAGER['voyager-1'], 'separacion-nave').t;
  const e0 = estadoInercial(tr, t0);
  // Mismo instante: misma posición en la escena que el vehículo.
  const enu = inercialAEnu(tr, t0, e0.p), ref = estadoEnu(tr, t0).posicionM;
  for (let i = 0; i < 3; i++) cerca(enu[i], ref[i], 1e-6, 'posición ENU en la separación');
  // Energía específica de dos cuerpos constante tras 600 s (RK4 con paso de 1 s).
  const energia = s => (s.v[0] ** 2 + s.v[1] ** 2 + s.v[2] ** 2) / 2 - MU_TIERRA_M3_S2 / Math.hypot(...s.p);
  const e1 = propagarBalistico({ t: t0, p: e0.p, v: e0.v }, 600, { paso: 1 });
  cerca(e1.t, t0 + 600, 1e-9, 'instante final');
  cerca(energia(e1) / energia(e0), 1, 1e-9, 'energía relativa');
});
