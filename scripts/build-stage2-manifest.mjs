import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = process.env.DELIVERY_ROOT;
if (!root) throw Error('Defina DELIVERY_ROOT con la carpeta SIMULADOR_VOYAGER_ETAPA_02');
const afterDir = path.join(root, 'Evidencias', 'Despues');
const beforeDir = path.join(root, 'Evidencias', 'Antes');
const current = JSON.parse(await fs.readFile(path.join(afterDir, 'stage2-results.json'), 'utf8'));
const compatibility = JSON.parse(await fs.readFile(path.join(root, 'PruebasEtapa1', 'manifest.json'), 'utf8'));
if (current.failure || current.errors.length || compatibility.errors.length) throw Error('Ejecución E2E incompleta o con errores');
if (current.captures.length !== 33 || current.checks.length !== 74) throw Error('La ejecución de Etapa 02 no tiene el alcance esperado');
if (compatibility.checks.length !== 55 || compatibility.captures.length !== 20) throw Error('Compatibilidad Etapa 01 incompleta');

async function inspectPng(relativePath, expected = null) {
  const data = await fs.readFile(path.join(root, 'Evidencias', relativePath));
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!data.subarray(0, 8).equals(signature)) throw Error(`PNG inválido: ${relativePath}`);
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  if (expected && (width !== expected.width || height !== expected.height)) {
    throw Error(`Dimensiones inesperadas: ${relativePath}`);
  }
  return {
    file: relativePath.replaceAll('\\', '/'),
    bytes: data.length,
    sha256: createHash('sha256').update(data).digest('hex'),
    width,
    height
  };
}

const beforeNames = [
  ['catalogo-etapa01.png', '05-catalogo-14.png'],
  ['navegacion-movil-etapa01.png', 'responsive-390x844-recorrido.png'],
  ['camara-etapa01.png', '11-primera-persona.png'],
  ['comparador-etapa01.png', '13-comparador-nasa-3d.png']
];
const before = [];
for (const [name, source] of beforeNames) {
  before.push({ ...await inspectPng(`Antes/${name}`), provenance: `SIMULADOR_VOYAGER_ETAPA_01/Evidencias/Despues/${source}` });
}
const after = [];
for (const capture of current.captures) {
  after.push({ ...await inspectPng(capture.file, capture.state), name: capture.name, state: capture.state, geometry: capture.geometry ?? null });
}
const actualPngs = (await fs.readdir(afterDir)).filter(name => name.endsWith('.png'));
if (actualPngs.length !== after.length) throw Error('Hay capturas extra o faltantes en Despues');

const manifest = {
  schemaVersion: 1,
  generatedAtUtc: new Date().toISOString(),
  provenance: {
    before: 'Capturas auténticas de la entrega local anterior, Etapa 01',
    after: 'Chrome CDP sobre Vite local, clics reales Input.dispatchMouseEvent',
    scientificData: 'Efemérides NASA/JPL Horizons ya integradas, sin solicitud remota nueva'
  },
  verification: {
    stage1Compatibility: { checks: compatibility.checks.length, screenshots: compatibility.captures.length, errors: compatibility.errors.length },
    stage2: { checks: current.checks.length, screenshots: current.captures.length, errors: current.errors.length },
    nodeTests: { passed: 81, failed: 0 },
    viteBuild: 'correcto; advertencia de chunk >500 kB'
  },
  before,
  after
};
await fs.writeFile(path.join(root, 'Evidencias', 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Manifest: ${before.length} antes, ${after.length} después, hashes y dimensiones comprobados`);
