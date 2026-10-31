import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { adaptHorizonsSample } from '../src/science/HorizonsEphemerides.js';
import { createScientificState } from '../src/science/ScientificState.js';

const original = JSON.parse(readFileSync(new URL('../public/data/efemerides-2026.json', import.meta.url)));
const sample = adaptHorizonsSample(original, 'Tierra', 0);
const metadata = { ...sample.provenance.sourceMetadata, ephemerisDatasetId: 'benchmark',
  ephemerisFile: 'data/benchmark.json', ephemerisFormat: 'horizons-daily-v1',
  ephemerisFormatVersion: 1, filePositionUnit: 'AU', fileVelocityUnit: 'AU/dia' };
const old = () => createScientificState({ ...sample,
  provenance: { ...sample.provenance, sourceMetadata: metadata } });
const current = () => Object.freeze({ ...sample,
  provenance: Object.freeze({ ...sample.provenance,
    sourceMetadata: Object.freeze({ ...metadata }) }) });
const count = 20000;
function measure(fn) {
  const results = [];
  for (let run = 0; run < 7; run++) {
    const start = performance.now();
    for (let i = 0; i < count; i++) fn();
    if (run > 0) results.push(performance.now() - start);
  }
  return results.sort((a, b) => a - b)[Math.floor(results.length / 2)];
}
measure(old); measure(current);
console.log(JSON.stringify({ sampleCount: count, oldMedianMs: measure(old),
  currentMedianMs: measure(current), scope: 'enrichment-only; no I/O, parsing or full provider' }));
