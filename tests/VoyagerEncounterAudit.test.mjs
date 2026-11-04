import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createHistoricalEphemerisResolver } from '../src/science/HistoricalEphemerisResolver.js';
import { getHistoricalEventById } from '../src/science/VoyagerHistoricalEvents.js';
import { utcTimestampToTdb } from '../src/science/HistoricalTime.js';

const base = new URL('../public/data/historical/encounters/hist-flyby-v2-neptune-1989', import.meta.url);
const publicRoot = new URL('../public/', import.meta.url);
const loadJson = async relative => JSON.parse(await readFile(new URL(relative, publicRoot), 'utf8'));

test('Neptuno: la discrepancia NSSDCA aparece en vectores locales íntegros, antes de interpolar', async () => {
  const bytes = await readFile(new URL(`${base.href}.json`));
  const data = JSON.parse(bytes);
  const meta = JSON.parse(await readFile(new URL(`${base.href}.metadata.json`), 'utf8'));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), meta.sha256);
  assert.equal(data.acquisition.origin, 'SUN_CENTER');
  assert.equal(data.acquisition.frameId, 'ICRF_ECLIPTIC_J2000');
  assert.equal(data.acquisition.timeScale, 'TDB');
  assert.equal(data.acquisition.correction, 'NONE');
  assert.deepEqual(data.acquisition.solutionIds.slice(0, 2).map(x => x.bodyId), ['-32', '899']);

  const event = getHistoricalEventById('v2-neptune-1989');
  const time = utcTimestampToTdb(event.dateUtc);
  assert.ok(Math.abs(time.jdTdb - event.jdTdb) < 1e-12);
  assert.ok(time.tdbMinusUtcSeconds > 56 && time.tdbMinusUtcSeconds < 57);
  const probe = data.series['-32'];
  const planet = data.series['899'];
  const index = probe.findIndex(row => row[1] === 'A.D. 1989-Aug-25 04:00:00.0000');
  assert.ok(index > 0);
  assert.equal(probe[index][0], planet[index][0]);
  const p = probe[index], n = planet[index];
  const rawDistance = Math.hypot(p[2] - n[2], p[3] - n[3], p[4] - n[4]);
  const nssdcDistance = 1.18 * 24760;
  assert.ok(rawDistance > 33000 && rawDistance - nssdcDistance > 4500);

  const resolver = createHistoricalEphemerisResolver({ loadJson });
  const [resolvedProbe, resolvedPlanet] = await Promise.all([
    resolver.resolveBodyState('-32', event.jdTdb),
    resolver.resolveBodyState('899', event.jdTdb)
  ]);
  assert.equal(resolvedProbe.datasetId, 'hist-flyby-v2-neptune-1989');
  assert.equal(resolvedPlanet.datasetId, 'hist-flyby-v2-neptune-1989');
  const rp = resolvedProbe.state.position, rn = resolvedPlanet.state.position;
  const eventDistance = Math.hypot(rp.x - rn.x, rp.y - rn.y, rp.z - rn.z);
  assert.ok(eventDistance > 34000 && eventDistance < 35000);
  assert.ok(eventDistance - nssdcDistance > 5000);
});
