import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { acquireAndWrite, queryParameters,
  validateAcquisitionConfig } from './HorizonsAcquisition.mjs';

async function main(args) {
  if (args.length !== 3 || args[0] !== '--config'
    || !['--dry-run', '--execute'].includes(args[2])) {
    throw new Error('Uso: node scripts/descargar-efemerides.mjs --config RUTA.json --dry-run|--execute');
  }
  const input = JSON.parse(await readFile(args[1], 'utf8'));
  const config = validateAcquisitionConfig(input);
  if (args[2] === '--dry-run') {
    console.log(JSON.stringify({ datasetId: config.datasetId, outputFile: config.outputFile,
      expectedSamplesPerBody: config.expectedSamplesPerBody,
      queries: config.bodies.map(body => ({ bodyId: body.id,
        parameters: queryParameters(config, body.id) })) }, null, 2));
    return;
  }
  const result = await acquireAndWrite(input, { contact: process.env.HORIZONS_CONTACT });
  console.log(JSON.stringify(result, null, 2));
  console.log('Incorpore catalogEntry al catálogo versionado después de revisar el archivo y su metadata.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => {
    console.error(`Adquisición detenida: ${error.message}`);
    process.exitCode = 1;
  });
}
