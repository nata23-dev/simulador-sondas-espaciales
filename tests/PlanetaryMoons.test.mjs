import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { MOONS, queryMoon, validateMoonDataset } from '../src/science/PlanetaryMoons.js';
import { UNIDADES_ESCENA_POR_KM } from '../src/graphics/ScaleModeConfig.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const original = JSON.parse(fs.readFileSync(path.join(root, 'public/data/moons-2026-10.json')));
const stage6 = JSON.parse(fs.readFileSync(path.join(root, 'public/data/moons-stage6-2026-10.json')));
const data = { ...original, moons: { ...original.moons, ...stage6.moons } };

test('ten NAIF IDs, planet centers, frame, 1h coverage and source hashes', () => {
  assert.equal(validateMoonDataset(data), true);
  assert.deepEqual(Object.keys(data.moons).sort(), Object.keys(MOONS).sort());
  for (const [key, moon] of Object.entries(MOONS)) {
    const body = data.moons[key];
    assert.equal(body.id, moon.id);
    assert.equal(body.center, moon.center);
    assert.match(body.source.targetHeader, new RegExp(`\\(${moon.id}\\)`));
    assert.match(body.source.centerHeader, new RegExp(`\\(${moon.center}\\)`));
    for (const source of [body.source, body.independentSource]) {
      const bytes = fs.readFileSync(path.join(root, source.rawFile));
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), source.sha256);
    }
  }
});

test('independent off-grid Horizons vectors constrain interpolation', () => {
  for (const key of Object.keys(MOONS)) {
    const ref = data.moons[key].independent[0];
    const result = queryMoon(data, key, ref[0]);
    assert.equal(result.status, 'Hermite C1');
    const positionErrorKm = Math.hypot(...result.positionKm.map((value,i) => value - ref[i+1]));
    const velocityErrorKmS = Math.hypot(...result.velocityKmS.map((value,i) => value - ref[i+4]));
    assert.ok(positionErrorKm < 1, `${key}: ${positionErrorKm} km`);
    assert.ok(velocityErrorKmS < 1e-5, `${key}: ${velocityErrorKmS} km/s`);
  }
});

test('no extrapolation, finite realistic distances and continuous position/velocity', () => {
  for (const key of Object.keys(MOONS)) {
    const rows = data.moons[key].rows;
    assert.equal(queryMoon(data, key, rows[0][0] - 1 / 24), null);
    assert.equal(queryMoon(data, key, rows.at(-1)[0] + 1 / 24), null);
    for (const row of rows) {
      const state = queryMoon(data, key, row[0]);
      assert.equal(state.status, 'exact');
      assert.deepEqual(state.positionKm, row.slice(1,4));
      assert.ok(state.distanceKm > MOONS[key].radiusKm * 10);
      assert.ok(state.distanceKm < 2_000_000);
      assert.ok(Math.abs(state.positionSceneOffset[0] - state.positionKm[0] * UNIDADES_ESCENA_POR_KM) < 1e-14);
    }
    for (let i=1;i<rows.length-1;i++) {
      const jd=rows[i][0], before=queryMoon(data,key,jd-1/86400), after=queryMoon(data,key,jd+1/86400);
      const jump = Math.hypot(...after.positionKm.map((value,j)=>value-before.positionKm[j]));
      const velJump = Math.hypot(...after.velocityKmS.map((value,j)=>value-before.velocityKmS[j]));
      const expected=2*Math.hypot(...rows[i].slice(4,7));
      assert.ok(Math.abs(jump-expected)<0.1, `${key} ${i} position discontinuity ${jump-expected}`);
      assert.ok(velJump < 0.01, `${key} ${i} velocity jump ${velJump}`);
    }
  }
});

test('one invalid moon does not invalidate the other nine', () => {
  const copy=structuredClone(data);
  copy.moons.Europa.center='5';
  const { data: isolated, invalid }=validateMoonDataset(copy,{isolate:true});
  assert.equal(Object.keys(isolated.moons).length,9);
  assert.match(invalid.Europa,/identity/);
  assert.ok(queryMoon(isolated,'Titania',isolated.moons.Titania.rows[1][0]));
  assert.equal(queryMoon(isolated,'Europa',2461323.5),null);
});

test('heliocentric Horizons chain closes with direct moon to planet vectors', () => {
  const audit=JSON.parse(fs.readFileSync(path.join(root,'evidence/stage4/absolute-frame-audit.json')));
  assert.equal(audit.rows.length,5);
  for(const row of audit.rows){
    assert.ok(row.heliocentricDifferenceVsDirectRelativeKm<1e-5, row.moon);
    assert.ok(row.localPlanetVsCurrentHorizonsPlanetKm<1e-5, row.moon);
    assert.ok(row.absoluteMoonPlacementVsCurrentHorizonsKm<1e-5, row.moon);
    for(const source of row.sources){
      const bytes=fs.readFileSync(path.join(root,source.rawFile));
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),source.sha256);
    }
  }
});
