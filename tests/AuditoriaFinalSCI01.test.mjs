// Auditoría final, fase 1 — SCI-01: segundos intercalares UTC en src/science/HistoricalTime.js.
// Evidencia del defecto: docs/auditoria-final/evidencias/ciencia/utc.txt (23:59:60 y 00:00:00 daban el mismo JD TDB y
// :60 se aceptaba en cualquier minuto). Los valores esperados se derivan aquí de la definición, no del código: el segundo
// insertado antes del salto que entra en vigor a la medianoche UTC E ocupa los segundos TAI [ΔAT₋, ΔAT₋ + 1) contados desde E,
// con ΔAT₋ = TAI − UTC antes del salto, y las 00:00:00 de E corresponden a ΔAT₋ + 1 s TAI desde esa misma medianoche.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IERS_LEAP_SECONDS_TABLE,
  TT_MINUS_TAI_SECONDS,
  jdTdbToHistoricalLabels,
  leapSecondEndingUtcDay,
  parseUtcTimestamp,
  roundedUtcLabelFromJdTai,
  tdbMinusTtSeconds,
  utcComponentsFromJdTai,
  utcTimestampToTdb
} from '../src/science/HistoricalTime.js';
import { datetimeLocalUtcToJdTdb, tdbToTimeScales, utcToTimeScales } from '../src/science/AstrodynamicsTime.js';
import { gregorianLabelToJulianMidnight, jdToGregorianComponents } from '../src/science/Time.js';

const DAY = 86400;
const TOLERANCE_S = 1e-4; // un JD en doble precisión resuelve ≈ 40 µs cerca de 2,46·10⁶
const seconds = (a, b) => (b - a) * DAY;
const previousDay = effectiveDateUtc => jdToGregorianComponents(gregorianLabelToJulianMidnight(effectiveDateUtc) - 1).dateIso;
const LEAPS = IERS_LEAP_SECONDS_TABLE.slice(1).map((entry, i) => ({ ...entry, before: IERS_LEAP_SECONDS_TABLE[i].taiMinusUtcSeconds, day: previousDay(entry.effectiveDateUtc) }));

test('SCI-01 · 2016-12-31 23:59:59 → 23:59:60 → 2017-01-01 00:00:00: tres instantes distintos, en orden y a 1 s', () => {
  const a = utcTimestampToTdb('2016-12-31 23:59:59');
  const b = utcTimestampToTdb('2016-12-31 23:59:60');
  const c = utcTimestampToTdb('2017-01-01 00:00:00');
  assert.ok(a.jdTdb < b.jdTdb && b.jdTdb < c.jdTdb, 'orden cronológico estricto');
  assert.ok(Math.abs(seconds(a.jdTdb, b.jdTdb) - 1) < TOLERANCE_S, `59 → 60: ${seconds(a.jdTdb, b.jdTdb)} s`);
  assert.ok(Math.abs(seconds(b.jdTdb, c.jdTdb) - 1) < TOLERANCE_S, `60 → 00: ${seconds(b.jdTdb, c.jdTdb)} s`);
  // TAI − UTC: el segundo insertado pertenece aún al día que termina (36 s); el salto a 37 s ocurre a medianoche.
  assert.deepEqual([a.taiMinusUtcSeconds, b.taiMinusUtcSeconds, c.taiMinusUtcSeconds], [36, 36, 37]);
  // Cálculo independiente de 23:59:60: medianoche del 31 + (86 400 + 36 + 32,184 + (TDB − TT)) s.
  const mid = gregorianLabelToJulianMidnight('2016-12-31');
  const jdTt = mid + (DAY + 36 + TT_MINUS_TAI_SECONDS) / DAY;
  assert.ok(Math.abs(seconds(mid + (DAY + 36 + TT_MINUS_TAI_SECONDS + tdbMinusTtSeconds(jdTt)) / DAY, b.jdTdb)) < TOLERANCE_S);
  // Inversas: cada instante vuelve a su etiqueta.
  assert.deepEqual([a, b, c].map(x => jdTdbToHistoricalLabels(x.jdTdb).labelUtc), ['2016-12-31 · 23:59:59 UTC', '2016-12-31 · 23:59:60 UTC', '2017-01-01 · 00:00:00 UTC']);
  assert.deepEqual([a, b, c].map(x => tdbToTimeScales(x.jdTdb).labelUtc), ['2016-12-31 · 23:59:59 UTC', '2016-12-31 · 23:59:60 UTC', '2017-01-01 · 00:00:00 UTC']);
  assert.deepEqual([a, b, c].map(x => jdTdbToHistoricalLabels(x.jdTdb).taiMinusUtcSeconds), [36, 36, 37]);
  assert.equal(jdTdbToHistoricalLabels(b.jdTdb).leapSecond, true);
  assert.equal(jdTdbToHistoricalLabels(a.jdTdb).leapSecond, false);
});

test('SCI-01 · cada salto positivo de la tabla: ida y vuelta antes, dentro (con fracciones) y después', () => {
  assert.equal(LEAPS.length, 27, '27 segundos intercalares de 1972-06-30 a 2016-12-31');
  for (const leap of LEAPS) {
    const E = leap.effectiveJdUtcPseudo, next = leap.effectiveDateUtc;
    // [etiqueta UTC, segundos TAI desde la medianoche E, etiqueta esperada al ms, TAI − UTC esperado, etiqueta redondeada al segundo]
    const cases = [
      [`${leap.day} 23:59:59`, leap.before - 1, `${leap.day} 23:59:59.000`, leap.before, `${leap.day} · 23:59:59 UTC`],
      [`${leap.day} 23:59:59.25`, leap.before - 0.75, `${leap.day} 23:59:59.250`, leap.before, `${leap.day} · 23:59:59 UTC`],
      [`${leap.day} 23:59:59.75`, leap.before - 0.25, `${leap.day} 23:59:59.750`, leap.before, `${leap.day} · 23:59:60 UTC`],
      [`${leap.day} 23:59:60`, leap.before, `${leap.day} 23:59:60.000`, leap.before, `${leap.day} · 23:59:60 UTC`],
      [`${leap.day} 23:59:60.25`, leap.before + 0.25, `${leap.day} 23:59:60.250`, leap.before, `${leap.day} · 23:59:60 UTC`],
      [`${leap.day} 23:59:60.75`, leap.before + 0.75, `${leap.day} 23:59:60.750`, leap.before, `${next} · 00:00:00 UTC`],
      [`${next} 00:00:00`, leap.before + 1, `${next} 00:00:00.000`, leap.before + 1, `${next} · 00:00:00 UTC`],
      [`${next} 00:00:00.25`, leap.before + 1.25, `${next} 00:00:00.250`, leap.before + 1, `${next} · 00:00:00 UTC`]
    ];
    let previous = null;
    for (const [utc, taiSecondsFromE, labelMs, taiMinusUtc, rounded] of cases) {
      const r = utcTimestampToTdb(utc);
      assert.equal(r.taiMinusUtcSeconds, taiMinusUtc, `${utc}: TAI − UTC`);
      // Independiente: JD TAI = E + segundos TAI / 86 400; TDB = TAI + 32,184 s + (TDB − TT).
      const jdTai = E + taiSecondsFromE / DAY;
      const expected = jdTai + (TT_MINUS_TAI_SECONDS + tdbMinusTtSeconds(jdTai)) / DAY;
      assert.ok(Math.abs(seconds(expected, r.jdTdb)) < TOLERANCE_S, `${utc}: ${seconds(expected, r.jdTdb)} s respecto al cálculo independiente`);
      if (previous) assert.ok(r.jdTdb > previous.jdTdb, `${utc}: posterior al anterior`);
      previous = r;
      const back = jdTdbToHistoricalLabels(r.jdTdb);
      assert.equal(`${back.utc.dateIso} ${back.utc.timeHms}.${String(back.utc.millisecond).padStart(3, '0')}`, labelMs, `${utc}: inversa al ms`);
      assert.equal(back.taiMinusUtcSeconds, taiMinusUtc, `${utc}: TAI − UTC de la inversa`);
      assert.equal(tdbToTimeScales(r.jdTdb).labelUtc, rounded, `${utc}: inversa redondeada al segundo`);
      assert.equal(roundedUtcLabelFromJdTai(jdTai), rounded, `${utc}: redondeo desde TAI`);
      // utcToTimeScales / tdbToTimeScales siguen siendo una la inversa de la otra (TAI y TT idénticos).
      const f = utcToTimeScales(utc), g = tdbToTimeScales(f.jdTdb);
      assert.ok(Math.abs(seconds(f.jdTai, g.jdTai)) < TOLERANCE_S && Math.abs(seconds(f.jdTt, g.jdTt)) < TOLERANCE_S, `${utc}: TAI/TT coherentes`);
      assert.equal(g.taiMinusUtcSeconds, taiMinusUtc);
    }
  }
});

test('SCI-01 · paso fino de 0,1 s a través de 2016-12-31 23:59:60: monótono y sin huecos ni solapes', () => {
  // 23:59:58.0 … 23:59:60.9 y 2017-01-01 00:00:00.0 … 00:00:00.9: 40 instantes separados 0,1 s
  const instants = [];
  for (let s = 58; s <= 60; s++) for (let d = 0; d < 10; d++) instants.push(`2016-12-31 23:59:${s}.${d}`);
  for (let d = 0; d < 10; d++) instants.push(`2017-01-01 00:00:00.${d}`);
  const jds = instants.map(t => utcTimestampToTdb(t).jdTdb);
  for (let i = 1; i < jds.length; i++) assert.ok(Math.abs(seconds(jds[i - 1], jds[i]) - 0.1) < TOLERANCE_S, `${instants[i - 1]} → ${instants[i]}: ${seconds(jds[i - 1], jds[i])} s`);
  for (const [i, jd] of jds.entries()) {
    const u = jdTdbToHistoricalLabels(jd).utc;
    assert.equal(`${u.dateIso} ${u.timeHms}.${Math.round(u.millisecond / 100)}`, instants[i]);
  }
  assert.equal(instants.length, 40);
});

test('SCI-01 · «:60» solo en 23:59:60 de los días con salto positivo tabulado', () => {
  for (const leap of LEAPS) {
    assert.equal(parseUtcTimestamp(`${leap.day} 23:59:60`).leapSecond, true, leap.day);
    assert.equal(parseUtcTimestamp(`${leap.day}T23:59:60.5Z`).daySeconds, DAY + 0.5);
    assert.deepEqual(leapSecondEndingUtcDay(gregorianLabelToJulianMidnight(leap.day)), { dateUtc: leap.effectiveDateUtc, taiMinusUtcBeforeSeconds: leap.before, taiMinusUtcAfterSeconds: leap.before + 1 });
  }
  const invalid = [
    '2020-03-03 12:34:60', // el caso de la auditoría: antes se normalizaba en silencio a 12:35:00
    '2016-12-31 23:58:60', '2016-12-31 22:59:60', '2016-12-30 23:59:60', '2017-01-01 23:59:60',
    '2017-06-30 23:59:60', '2018-12-31 23:59:60', // fechas habituales de salto sin salto anunciado
    '2026-12-31 23:59:60', // futuro: la tabla no anuncia saltos (no se inventan)
    '1971-12-31 23:59:60' // antes de la tabla: el valor inicial de 10 s no fue un segundo insertado
  ];
  for (const text of invalid) assert.throws(() => utcTimestampToTdb(text), /Segundo intercalar inexistente/, text);
  assert.throws(() => utcTimestampToTdb('2016-12-31 23:59:61'), /fuera de rango/);
  assert.throws(() => datetimeLocalUtcToJdTdb('2020-03-03T12:34:60'), /Segundo intercalar inexistente/);
  assert.equal(leapSecondEndingUtcDay(gregorianLabelToJulianMidnight('2020-03-03')), null);
  assert.equal(parseUtcTimestamp('2020-03-03 12:34:59').leapSecond, false);
});

test('SCI-01 · fechas ordinarias: misma conversión de siempre (épocas Voyager y salida de A1)', () => {
  // Independiente: JD TDB = medianoche + (segundos del día + ΔAT + 32,184 + (TDB − TT)) / 86 400, con ΔAT de la tabla.
  const cases = [['1977-08-20T14:29:00Z', '1977-08-20', 14 * 3600 + 29 * 60, 16], ['1977-09-05T12:56:00Z', '1977-09-05', 12 * 3600 + 56 * 60, 16],
    ['1990-02-14T05:30:00Z', '1990-02-14', 5 * 3600 + 30 * 60, 25], ['2028-11-30', '2028-11-30', 0, 37]];
  for (const [text, date, daySeconds, deltaAt] of cases) {
    const mid = gregorianLabelToJulianMidnight(date), jdTt = mid + (daySeconds + deltaAt + TT_MINUS_TAI_SECONDS) / DAY;
    const expected = mid + (daySeconds + deltaAt + TT_MINUS_TAI_SECONDS + tdbMinusTtSeconds(jdTt)) / DAY;
    const r = utcTimestampToTdb(text);
    assert.equal(r.taiMinusUtcSeconds, deltaAt, text);
    assert.equal(r.jdTdb, expected, `${text}: misma aritmética, mismo resultado bit a bit`);
  }
  assert.equal(datetimeLocalUtcToJdTdb('2028-11-30'), utcTimestampToTdb('2028-11-30').jdTdb);
  assert.equal(jdTdbToHistoricalLabels(utcTimestampToTdb('1977-08-20T14:29:00Z').jdTdb).labelUtc, '1977-08-20 · 14:29:00 UTC');
  // Último instante de un día con salto, a 1 µs del segundo insertado: antes tomaba el ΔAT del día siguiente (+1 s).
  const edge = utcTimestampToTdb('2016-12-31 23:59:59.999999');
  assert.equal(edge.taiMinusUtcSeconds, 36);
  assert.ok(Math.abs(seconds(edge.jdTdb, utcTimestampToTdb('2016-12-31 23:59:60').jdTdb) - 1e-6) < TOLERANCE_S);
});

test('SCI-01 · componentes UTC desde TAI: 23:59:60 completo y fronteras redondeadas al milisegundo', () => {
  const E = gregorianLabelToJulianMidnight('2017-01-01');
  assert.equal(utcComponentsFromJdTai(E + 36 / DAY).utc.timeHms, '23:59:60');
  assert.equal(utcComponentsFromJdTai(E + 36.9994 / DAY).utc.millisecond, 999);
  const after = utcComponentsFromJdTai(E + 36.9996 / DAY); // redondea a las 00:00:00.000 del día siguiente
  assert.equal(after.leapSecond, false);
  assert.equal(`${after.utc.dateIso} ${after.utc.timeHms}.${after.utc.millisecond}`, '2017-01-01 00:00:00.0');
  assert.equal(after.taiMinusUtcSeconds, 37);
  const before = utcComponentsFromJdTai(E + 35.9994 / DAY);
  assert.equal(`${before.utc.dateIso} ${before.utc.timeHms}.${before.utc.millisecond}`, '2016-12-31 23:59:59.999');
  assert.equal(utcComponentsFromJdTai(E + 35.9996 / DAY).utc.timeHms, '23:59:60');
});
