import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createHistoricalEphemerisResolver } from '../src/science/HistoricalEphemerisResolver.js';
import { HISTORICAL_MISSIONS_CATALOG } from '../src/science/VoyagerHistoricalMissions.js';

const root = new URL('../evidence/stage2-3/ConsultasOriginales/', import.meta.url);
const prior = new URL('../evidence/stage2-2/ConsultasOriginales/', import.meta.url);
const publicRoot = new URL('../public/', import.meta.url);
const cases = [
  'v1-jupiter-1979', 'v2-jupiter-1979', 'v1-saturn-1980',
  'v2-saturn-1981', 'v2-uranus-1986', 'v2-neptune-1989'
];

async function vectors(base, stem) {
  const bytes = await readFile(new URL(`${stem}.json`, base));
  const metadata = JSON.parse(await readFile(new URL(`${stem}.request.json`, base), 'utf8'));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256);
  assert.equal(metadata.httpStatus, 200);
  const text = JSON.parse(bytes).result;
  const rows = text.match(/\$\$SOE\s*\n([\s\S]*?)\$\$EOE/)?.[1].trim()
    .split(/\r?\n/).map(line => line.split(',').slice(2, 8).map(Number));
  assert.ok(rows?.every(row => row.length === 6 && row.every(Number.isFinite)));
  return rows;
}

const norm = values => Math.hypot(...values);
const subtract = (a, b) => a.map((value, i) => value - b[i]);

test('los seis vectores directos Horizons cierran con nave y planeta referidos al mismo baricentro', async () => {
  for (const id of cases) {
    const [probe, center, direct] = await Promise.all([
      vectors(root, `${id}-probe-barycenter`),
      vectors(root, `${id}-planet-barycenter`),
      vectors(prior, `${id}-relative-probe`)
    ]);
    assert.equal(probe.length, 121);
    assert.equal(center.length, 121);
    assert.equal(direct.length, 121);
    for (let i = 0; i < 121; i++) {
      const residual = subtract(subtract(probe[i], center[i]), direct[i]);
      assert.ok(norm(residual.slice(0, 3)) < 1e-6, `${id} muestra ${i}`);
      assert.ok(norm(residual.slice(3)) < 1e-9, `${id} velocidad ${i}`);
    }
  }
});

test('la polilínea científica corta ambos empalmes SPK sin desplazar sus extremos', async () => {
  const resolver = createHistoricalEphemerisResolver({
    loadJson: async relative => JSON.parse(await readFile(new URL(relative, publicRoot), 'utf8'))
  });
  for (const mission of Object.values(HISTORICAL_MISSIONS_CATALOG)) {
    const { knots } = await resolver.loadMissionTrajectoryBackbone(mission.id);
    const breaks = knots.map((k, i) => k.breakBefore ? i : -1).filter(i => i >= 0);
    assert.equal(breaks.length, 1, mission.id);
    const i = breaks[0];
    const splice = mission.spkSegmentSplice;
    assert.ok(knots[i - 1].jdTdb <= splice.beforeJdTdb + 1e-8);
    assert.ok(knots[i].jdTdb >= splice.afterJdTdb - 1e-8);
    for (const j of [i - 1, i]) {
      const resolved = await resolver.resolveProbeState(mission.id, knots[j].jdTdb);
      assert.ok(resolved.state, `${mission.id}: extremo ${j} sin estado`);
      for (const axis of ['x', 'y', 'z']) {
        assert.ok(Math.abs(resolved.state.position[axis] - knots[j][`${axis}Km`]) < 1e-6);
      }
    }
    const gap = await resolver.resolveProbeState(mission.id, (splice.beforeJdTdb + splice.afterJdTdb) / 2);
    assert.equal(gap.status, 'spk_segment_transition');
    assert.equal(gap.state, null);
  }
});

test('los empalmes Horizons de 1981 y 1989 tienen saltos medidos y no son trayectorias continuas', async () => {
  for (const [stem, minimumJumpKm] of [
    ['v1-handoff-1981-1s', 60000], ['v2-handoff-1989-1s', 500]
  ]) {
    const rows = await vectors(root, stem);
    assert.equal(rows.length, 241);
    const before = rows[120], after = rows[121];
    const residual = norm([0, 1, 2].map(i => after[i] - before[i]
      - (before[i + 3] + after[i + 3]) / 2));
    assert.ok(residual > minimumJumpKm);
    const smooth = norm([0, 1, 2].map(i => before[i] - rows[119][i]
      - (before[i + 3] + rows[119][i + 3]) / 2));
    assert.ok(smooth < 0.01);
  }
});

test('los segmentos locales de encuentro conservan posición y velocidad en sus bordes', async () => {
  const resolver = createHistoricalEphemerisResolver({
    loadJson: async relative => JSON.parse(await readFile(new URL(relative, publicRoot), 'utf8'))
  });
  for (const id of cases) {
    const probeId = id.startsWith('v1-') ? '-31' : '-32';
    const data = JSON.parse(await readFile(new URL(`data/historical/encounters/hist-flyby-${id}.json`, publicRoot), 'utf8'));
    for (const jd of [data.series[probeId][0][0], data.series[probeId].at(-1)[0]]) {
      const [before, after] = await Promise.all([-1, 1].map(seconds =>
        resolver.resolveBodyState(probeId, jd + seconds / 86400)));
      if (after.status === 'spk_segment_transition') {
        assert.equal(id, 'v2-neptune-1989');
        continue;
      }
      assert.ok(before.state && after.state);
      const residual = norm(['x', 'y', 'z'].map(axis => after.state.position[axis]
        - before.state.position[axis] - after.state.velocity[axis]
        - before.state.velocity[axis]));
      assert.ok(residual < 0.001, `${id}: discontinuidad local de encuentro`);
    }
  }
});
