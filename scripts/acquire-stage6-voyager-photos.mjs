import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

// Original NASA/JPL Photojournal JPEGs. A JPEG may be a processed historical
// composite; each catalog entry identifies the instrument and processing.
const photos = {
  'v1-io-plumes-1979': 'PIA00379',
  'v1-europa-1979': 'PIA00016',
  'v2-europa-1979': 'PIA00459',
  'v1-ganymede-1979': 'PIA02279',
  'v1-galilean-1979': 'PIA00012',
  'v1-titan-haze-1980': 'PIA01533',
  'v2-titania-1986': 'PIA01979',
  'v2-miranda-1986': 'PIA01354'
};

const directory = path.resolve('public/images/voyager');
await mkdir(directory, { recursive: true });
for (const [name, id] of Object.entries(photos)) {
  const uri = `https://assets.science.nasa.gov/dynamicimage/assets/science/psd/photojournal/pia/pia${id.slice(3, 5)}/${id.toLowerCase()}/${id}.jpg`;
  const response = await fetch(uri);
  if (!response.ok || !response.headers.get('content-type')?.includes('image/')) {
    throw new Error(`${id}: HTTP ${response.status} ${response.headers.get('content-type')}`);
  }
  const data = Buffer.from(await response.arrayBuffer());
  if (data[0] !== 0xff || data[1] !== 0xd8) throw new Error(`${id}: no es JPEG`);
  const file = path.join(directory, `${name}.jpg`);
  await writeFile(file, data);
  console.log(`${id} ${file} ${data.length} ${createHash('sha256').update(data).digest('hex')}`);
}
