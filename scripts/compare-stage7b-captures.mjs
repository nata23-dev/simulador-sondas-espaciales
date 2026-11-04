import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve('evidence/voyager-stage7b');
const before = JSON.parse(await fs.readFile(path.join(root, 'before-results.json')));
const after = JSON.parse(await fs.readFile(path.join(root, 'after-results.json')));
for (const shot of after.shots) {
  assert.equal(shot.illumination.outputColorSpace, 'srgb', shot.name);
  for (const [name, planet] of Object.entries(shot.illumination.planetas)) {
    assert.ok(Math.abs(planet.irradianceWm2 - 1361 / planet.distanceAU ** 2) < 1e-8,
      `${shot.name}: ${name} irradiance`);
  }
}
const rows = before.shots.map(a => {
  const b = after.shots.find(shot => shot.name === a.name);
  if (!b) throw Error(`Missing after view ${a.name}`);
  const positionOffset = Math.hypot(...a.camera.posicionEscena.map((v, i) =>
    v - b.camera.posicionEscena[i]));
  const angleOffset = Math.abs(a.camera.fovGrados - b.camera.fovGrados);
  const jdOffsetSeconds = a.historicalJdTdb === null && b.historicalJdTdb === null ? 0
    : Math.abs(a.historicalJdTdb - b.historicalJdTdb) * 86400;
  const matched = positionOffset < 1e-5 && angleOffset < 1e-9
    && jdOffsetSeconds < 0.001 && a.camera.modo === b.camera.modo
    && a.camera.objetivoMirada === b.camera.objetivoMirada
    && a.camera.objetoExteriorSeleccionado === b.camera.objetoExteriorSeleccionado;
  return {
    name: a.name, matched, positionOffsetScene: positionOffset,
    fovOffsetDeg: angleOffset, jdOffsetSeconds,
    beforeTransition: a.camera.transicionActiva,
    afterTransition: b.camera.transicionActiva,
    afterExposure: b.illumination?.exposure ?? null,
    beforeMedianFrameMs: a.medianFrameMs, afterMedianFrameMs: b.medianFrameMs
  };
});
const report = { matched: rows.filter(row => row.matched).length,
  total: rows.length, excluded: rows.filter(row => !row.matched).map(row => row.name),
  rows };
await fs.writeFile(path.join(root, 'comparison.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`MATCHED ${report.matched}/${report.total} EXCLUDED ${report.excluded.join(', ')}`);
if (report.matched < 18) process.exitCode = 1;
