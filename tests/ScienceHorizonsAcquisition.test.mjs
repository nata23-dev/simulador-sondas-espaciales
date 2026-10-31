import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { acquireAndWrite, prepareHorizonsDataset, queryParameters,
  validateAcquisitionConfig } from '../scripts/HorizonsAcquisition.mjs';

const original = JSON.parse(readFileSync(new URL('../public/data/efemerides-2026.json', import.meta.url)));
const profile = JSON.parse(readFileSync(new URL('../scripts/efemerides-2026-profile.json', import.meta.url)));

function config(bodies = [{ id: '399', type: 'planet' }]) {
  return { ...profile, datasetId: 'fixture-2026', bodies, endTdb: '2026-10-02',
    outputFile: 'public/data/fixture-2026.json' };
}

function responseFor(name, version = 'mock-api-v1') {
  const id = name === 'Tierra' ? '399' : '499';
  const rows = original.planetas[name].slice(0, 2);
  const lines = rows.map(row => [row.jdTDB, row.fechaTDB,
    row.posicionAU.x, row.posicionAU.y, row.posicionAU.z,
    row.velocidadAUporDia.x, row.velocidadAUporDia.y,
    row.velocidadAUporDia.z].join(','));
  return { signature: { version }, solutionId: `mock-solution-${name}`,
    result: `Target body name: ${name} (${id}) {source: mock-solution-${name}}\nCenter body name: Sun (10)\n$$SOE\n${lines.join('\n')}\n$$EOE` };
}

function mockFetch(log, dataById = { '399': responseFor('Tierra'), '499': responseFor('Marte') }) {
  let active = false;
  return async (url, options) => {
    assert.equal(active, false, 'las solicitudes no deben ser simultáneas');
    active = true;
    const id = new URL(url).searchParams.get('COMMAND').replaceAll("'", '');
    log.push({ id, url, agent: options.headers['User-Agent'] });
    await Promise.resolve();
    active = false;
    return { ok: true, status: 200, json: async () => dataById[id] };
  };
}

test('perfil original conserva parámetros astronómicos y 32 muestras esperadas', () => {
  const validated = validateAcquisitionConfig(profile);
  assert.equal(validated.expectedSamplesPerBody, 32);
  assert.equal(validated.bodies.length, 8);
  const params = queryParameters(validated, '399');
  assert.equal(params.CENTER, "'500@10'");
  assert.equal(params.TIME_TYPE, "'TDB'");
  assert.equal(params.STEP_SIZE, "'1 d'");
  assert.equal(params.REF_SYSTEM, "'ICRF'");
  assert.equal(params.OUT_UNITS, "'AU-D'");
});

test('CLI dry-run termina sin contacto ni red y solo emite consultas', () => {
  const env = { ...process.env };
  delete env.HORIZONS_CONTACT;
  const output = execFileSync(process.execPath,
    ['scripts/descargar-efemerides.mjs', '--config', 'scripts/efemerides-2026-profile.json', '--dry-run'],
    { encoding: 'utf8', env });
  const plan = JSON.parse(output);
  assert.equal(plan.queries.length, 8);
  assert.equal(plan.outputFile, 'public/data/efemerides-2026.json');
});

test('configuración inválida e incompatible se rechaza antes de solicitar datos', () => {
  for (const change of [
    { endTdb: '2026-02-30' }, { cadenceSeconds: 50000 },
    { origin: 'EARTH_CENTER' }, { frameId: 'otro' }, { timeScale: 'UTC' },
    { fileUnits: { position: 'km', velocity: 'km/s' } },
    { outputFile: '../fuera.json' }, { minIntervalMs: 100 },
    { bodies: [{ id: '399', type: 'planet' }, { id: '399', type: 'planet' }] }
  ]) assert.throws(() => validateAcquisitionConfig({ ...config(), ...change }));
});

test('adquisición con respuestas locales produce estados y entrada compatibles', async () => {
  const requests = [];
  const sleeps = [];
  const prepared = await prepareHorizonsDataset(config([
    { id: '399', type: 'planet' }, { id: '499', type: 'planet' }]),
  { fetchImpl: mockFetch(requests), sleep: async ms => { sleeps.push(ms); },
    now: () => new Date('2026-10-29T12:00:00Z'), contact: 'responsable@example.org' });
  assert.deepEqual(requests.map(request => request.id), ['399', '499']);
  assert.ok(requests.every(request => request.agent.includes('responsable@example.org')));
  assert.deepEqual(sleeps, [1000]);
  assert.equal(prepared.dataset.states.length, 4);
  assert.equal(prepared.catalogEntry.sourceVersion, 'mock-api-v1');
  assert.equal(prepared.catalogEntry.format, 'scientific-states-v1');
  assert.equal(prepared.dataset.states[0].position.unit, 'km');
  assert.equal(prepared.dataset.states[0].velocity.unit, 'km/s');
  assert.equal(prepared.dataset.states[0].provenance.sourceMetadata.solutionId, 'mock-solution-Tierra');
  assert.equal(prepared.dataset.states[0].provenance.queriedAtUtc, '2026-10-29T12:00:00.000Z');
  assert.ok(prepared.sha256.length === 64);
  assert.ok(!prepared.datasetText.includes('responsable@example.org'));
  assert.ok(!prepared.metadataText.includes('responsable@example.org'));
});

test('reintentos secuenciales respetan espera progresiva y Retry-After', async () => {
  let attempts = 0;
  const delays = [];
  const fetchImpl = async () => {
    attempts++;
    if (attempts === 1) return { ok: false, status: 429,
      headers: { get: () => '3' } };
    if (attempts === 2) return { ok: false, status: 503,
      headers: { get: () => null } };
    return { ok: true, status: 200, json: async () => responseFor('Tierra') };
  };
  await prepareHorizonsDataset(config(), { fetchImpl, sleep: async ms => { delays.push(ms); },
    contact: 'responsable@example.org' });
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [3000, 1000, 2000, 1000]);
});

test('fallos de HTTP, tabla, versión y contacto detienen la adquisición', async () => {
  await assert.rejects(prepareHorizonsDataset(config(), { fetchImpl: mockFetch([]) }), /correo de contacto/);
  await assert.rejects(prepareHorizonsDataset(config(), {
    fetchImpl: async () => ({ ok: false, status: 400 }),
    sleep: async () => {}, contact: 'responsable@example.org' }), /HTTP 400/);
  await assert.rejects(prepareHorizonsDataset(config(), {
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ result: 'Target body name: Tierra (399)\nCenter body name: Sun (10)\n$$SOE\nmal\n$$EOE' }) }),
    sleep: async () => {}, contact: 'responsable@example.org' }), /se esperaban/);
  const wrong = responseFor('Tierra');
  wrong.result = wrong.result.replace('2026-Oct-01', '2026-Feb-30');
  await assert.rejects(prepareHorizonsDataset(config(), {
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => wrong }),
    sleep: async () => {}, contact: 'responsable@example.org' }), /Etiqueta gregoriana/);
  const wrongBody = responseFor('Tierra');
  wrongBody.result = wrongBody.result.replace('Tierra (399)', 'Tierra (499)');
  await assert.rejects(prepareHorizonsDataset(config(), {
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => wrongBody }),
    sleep: async () => {}, contact: 'responsable@example.org' }), /cuerpo distinto/);
  const wrongCenter = responseFor('Tierra');
  wrongCenter.result = wrongCenter.result.replace('Sun (10)', 'Earth (399)');
  await assert.rejects(prepareHorizonsDataset(config(), {
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => wrongCenter }),
    sleep: async () => {}, contact: 'responsable@example.org' }), /centro distinto/);
  const nonfinite = responseFor('Tierra');
  nonfinite.result = nonfinite.result.replace(String(original.planetas.Tierra[0].posicionAU.x), 'NaN');
  await assert.rejects(prepareHorizonsDataset(config(), {
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => nonfinite }),
    sleep: async () => {}, contact: 'responsable@example.org' }), /componentes o fecha/);
  await assert.rejects(prepareHorizonsDataset(config([
    { id: '399', type: 'planet' }, { id: '499', type: 'planet' }]), {
    fetchImpl: mockFetch([], { '399': responseFor('Tierra', 'v1'), '499': responseFor('Marte', 'v2') }),
    sleep: async () => {}, contact: 'responsable@example.org' }), /versiones de API diferentes/);
  await assert.rejects(prepareHorizonsDataset(config(), {
    fetchImpl: async () => ({ ok: false, status: 429,
      headers: { get: () => new Date(Date.now() + 600000).toUTCString() } }),
    sleep: async () => {}, contact: 'responsable@example.org' }), /espera superior/);
});

test('archivo existente se reutiliza por configuración e integridad, sin red ni sobrescritura', async () => {
  const files = new Map();
  const fs = { readFile: async path => {
    if (!files.has(path)) { const error = new Error('missing'); error.code = 'ENOENT'; throw error; }
    return files.get(path);
  }, writeFile: async (path, text, options) => {
    assert.equal(options.flag, 'wx');
    if (files.has(path)) throw new Error('overwrite');
    files.set(path, text);
  }, mkdir: async () => {} };
  let requests = 0;
  const fetchImpl = async (...args) => { requests++; return mockFetch([])(...args); };
  const options = { fs, fetchImpl, sleep: async () => {}, contact: 'responsable@example.org' };
  const first = await acquireAndWrite(config(), options);
  assert.equal(first.reused, false);
  assert.equal(requests, 1);
  const second = await acquireAndWrite(config(), { fs, fetchImpl: async () => { throw new Error('red inesperada'); } });
  assert.equal(second.reused, true);
  assert.equal(requests, 1);
  files.set(config().outputFile, `${files.get(config().outputFile)} `);
  await assert.rejects(acquireAndWrite(config(), { fs }), /integridad/);
});
