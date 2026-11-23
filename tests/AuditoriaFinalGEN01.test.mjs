// Auditoría final, fase 5 — GEN-01: el README describe lo que existe (transferencias interplanetarias por cónicas parcheadas) sin
// presentarlo como validado, y conserva las instrucciones de instalación, build y publicación.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { ENCOUNTER_TARGETS } from '../src/lab/IntegratedMission.js';
import { MODEL_LIMITS } from '../src/lab/InterplanetaryPlan.js';

const raiz = new URL('../', import.meta.url);
const readme = readFileSync(new URL('README.md', raiz), 'utf8');

test('GEN-01 · ya no afirma que las transferencias interplanetarias no existen', () => {
  assert.doesNotMatch(readme, /transferencias interplanetarias completas aún no existen/);
  assert.match(readme, /cónicas parcheadas/);
  for (const modulo of ['src/science/LambertSolver.js', 'src/lab/InterplanetaryPlan.js', 'src/lab/IntegratedMission.js', 'src/lab/EncounterDesign.js', 'src/lab/OrbitalInsertion.js', 'src/lab/EarthDeparture.js', 'src/lab/NBodyCruise.js']) {
    assert.ok(existsSync(new URL(modulo, raiz)), `existe ${modulo}`);
  }
  assert.equal(Object.keys(ENCOUNTER_TARGETS).length, 7, '«los siete planetas»');
  assert.match(readme, /Destinos: los siete planetas/);
});

test('GEN-01 · declara los límites del modelo y no lo presenta como validado', () => {
  assert.match(readme, /\*\*No hay\*\* integración de n cuerpos continua de toda la misión ni asistencias gravitatorias/);
  assert.match(readme, /solo como comparación/);
  assert.match(readme, /«Implementada» no significa «validada»/);
  assert.match(readme, /Pendiente la validación final completa/);
  assert.doesNotMatch(readme, /transferencias? interplanetarias? (?:están |quedan )?validad/i);
  assert.ok(MODEL_LIMITS.some(l => /Sin asistencias gravitacionales/.test(l)), 'coincide con los límites declarados en el código');
});

test('GEN-01 · la cobertura citada coincide con el catálogo de efemérides interplanetarias', () => {
  const catalogo = JSON.parse(readFileSync(new URL('public/data/interplanetary-ephemerides-catalog-v1.json', raiz), 'utf8'));
  const inicio = Math.min(...catalogo.datasets.map(d => d.coverage.startJdTdb)), fin = Math.max(...catalogo.datasets.map(d => d.coverage.endJdTdb));
  const fecha = jd => new Date(Date.UTC(2000, 0, 1) + (jd - 2451544.5) * 86400000).toISOString().slice(0, 10);
  assert.equal(`${fecha(inicio)} → ${fecha(fin)}`, '2026-11-18 → 2046-01-01');
  assert.ok(readme.includes(`cobertura ${fecha(inicio)} → ${fecha(fin)}, sin extrapolar`));
});

test('GEN-01 · se conservan instalación, build y publicación', () => {
  for (const orden of ['npm ci', 'npm run dev', 'npm run lint', 'npm test', 'npm run build', 'npm run preview']) assert.ok(readme.includes(orden), orden);
  assert.match(readme, /GITHUB_PAGES=true/);
  assert.match(readme, /\.github\/workflows\/deploy\.yml/);
  assert.match(readme, /\/simulador-sondas-espaciales\//);
});
