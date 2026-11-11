import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('evidence/voyager-stage10');
const { shots } = JSON.parse(await fs.readFile(path.join(root, 'after-results.json')));
// The historical controller reports a contextual look target that is not a
// body-center world vector. Only the exploratory planet target is valid here.
const targets = ['inner-mercury-phase'];
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const norm = a => Math.hypot(...a);
const subtract = (a, b) => a.map((value, index) => value - b[index]);
const results = shots.filter(shot => targets.some(target => shot.name.startsWith(`${target}-`)))
  .map(shot => {
    // The exploratory camera targets Mercury's center. The Sun is at scene origin.
    const body = shot.camera.objetivoEscena;
    const toSun = body.map(value => -value);
    const toCamera = subtract(shot.camera.posicionEscena, body);
    const cosPhase = Math.max(-1, Math.min(1, dot(toSun, toCamera) / (norm(toSun) * norm(toCamera))));
    const distanceAU = norm(body) / 32;
    return {
      name: shot.name,
      jdTdb: shot.historicalJdTdb,
      distanceAU,
      irradianceWm2: 1361 / distanceAU ** 2,
      phaseAngleDeg: Math.acos(cosPhase) * 180 / Math.PI,
      illuminatedDiskFraction: (1 + cosPhase) / 2,
      exposure: shot.illumination.exposure,
      approximation: 'Geometric disk phase from camera, body center and Sun center; no light-time or atmosphere.'
    };
  });
await fs.writeFile(path.join(root, 'phase-diagnostics.json'), JSON.stringify(results, null, 2) + '\n');
for (const result of results) console.log(result.name,
  `phase=${result.phaseAngleDeg.toFixed(2)}°`,
  `illuminated=${(100 * result.illuminatedDiskFraction).toFixed(1)}%`,
  `E=${result.irradianceWm2.toFixed(2)} W/m²`);
