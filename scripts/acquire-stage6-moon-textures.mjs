import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'public/textures/moons');
await fs.mkdir(output, { recursive: true });
const sources = {
  'io-voyager-usgs.jpg': 'https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/image/jupiter---io-(a)/Jupiter%20-%20Io%20(A).jpg',
  'ganymede-voyager-usgs.jpg': 'https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/image/jupiter---ganymede/Jupiter%20-%20Ganymede.jpg',
  'callisto-voyager-usgs.jpg': 'https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/image/jupiter---callisto/Jupiter%20-%20Callisto.jpg',
  'enceladus-voyager-usgs.jpg': 'https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/image/saturn---enceladus/Saturn%20-%20Enceladus.jpg',
  'miranda-voyager-usgs.jpg': 'https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/image/uranus---miranda/Uranus%20-%20Miranda.jpg'
};
for (const [file, url] of Object.entries(sources)) {
  const destination = path.join(output, file);
  if (await fs.stat(destination).catch(() => null)) continue;
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/jpeg')) {
    throw Error(`${file}: HTTP ${response.status}, ${response.headers.get('content-type')}`);
  }
  await fs.writeFile(destination, Buffer.from(await response.arrayBuffer()), { flag: 'wx' });
  console.log(file);
}
