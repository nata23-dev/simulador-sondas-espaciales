// Etapa 25 — derivación de public/launch/cape-usgs-2048.jpg a partir de la ortoimagen original del USGS (ver public/launch/README.md).
// Uso: node scripts/derive-launch-cape-fill.mjs <original.jpg> <salida.jpg>. Rellena las zonas «sin datos» (blanco puro) del mar
// conectadas a tres semillas, más un borde de 2 px de transición, con un relleno difuso del color vecino. El resto de la imagen no
// se edita, pero el resultado se vuelve a codificar en JPEG (calidad 0,86). Necesita Playwright y Chrome (como los guiones de revisión).
// Fills the USGS no-data (pure white) areas of the Cape Canaveral orthoimage with the adjacent ocean colour.
// Flood fill from seeds inside the no-data rectangles only, so bright beaches and roofs are never touched.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(process.env.LOCALAPPDATA.replace(/\\/g, '/') + '/CodexScientificTools/voyager-e2e/package.json');
const { chromium } = require('playwright');
const [input, output] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
const dataUrl = 'data:image/jpeg;base64,' + fs.readFileSync(input).toString('base64');
const result = await page.evaluate(async src => {
  const img = new Image(); img.src = src; await img.decode();
  const w = img.naturalWidth, h = img.naturalHeight, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, w, h), px = d.data;
  const blanco = i => px[i] > 238 && px[i + 1] > 238 && px[i + 2] > 238;
  const marca = new Uint8Array(w * h), pila = [];
  for (const [x, y] of [[w - 5, 5], [w - 5, h / 2], [Math.round(w * 0.45), 5]]) if (blanco((y * w + x) * 4)) pila.push(y * w + x);
  let n = 0;
  while (pila.length) {
    const k = pila.pop(); if (marca[k]) continue; if (!blanco(k * 4)) continue;
    marca[k] = 1; n++;
    const x = k % w, y = (k - x) / w;
    if (x > 0) pila.push(k - 1); if (x < w - 1) pila.push(k + 1); if (y > 0) pila.push(k - w); if (y < h - 1) pila.push(k + w);
  }
  // Dilatar 2 px la máscara para cubrir el borde antialiasado.
  for (let pasada = 0; pasada < 2; pasada++) {
    const copia = marca.slice();
    for (let k = 0; k < w * h; k++) if (!copia[k]) { const x = k % w; if ((x > 0 && copia[k - 1]) || (x < w - 1 && copia[k + 1]) || (k >= w && copia[k - w]) || (k < w * (h - 1) && copia[k + w])) { marca[k] = 2; } }
  }
  // Relleno difuso: rejilla de celdas de 16 px; las celdas con datos fijan su color medio y las vacías se resuelven por Jacobi
  // (ecuación de Laplace), de modo que el color continúa el del borde sin escalones. Después, interpolación bilineal y ruido suave.
  const C = 16, gw = Math.ceil(w / C), gh = Math.ceil(h / C), val = new Float32Array(gw * gh * 3), fijo = new Uint8Array(gw * gh);
  for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) {
    let r = 0, gg = 0, b = 0, m = 0;
    for (let y = cy * C; y < Math.min(h, cy * C + C); y++) for (let x = cx * C; x < Math.min(w, cx * C + C); x++) { const k = y * w + x; if (!marca[k]) { r += px[k * 4]; gg += px[k * 4 + 1]; b += px[k * 4 + 2]; m++; } }
    const j = cy * gw + cx; if (m > C * C * 0.5) { fijo[j] = 1; val[j * 3] = r / m; val[j * 3 + 1] = gg / m; val[j * 3 + 2] = b / m; } else { val[j * 3] = 48; val[j * 3 + 1] = 83; val[j * 3 + 2] = 99; }
  }
  for (let it = 0; it < 3000; it++) for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) {
    const j = cy * gw + cx; if (fijo[j]) continue;
    const vec = [j - 1, j + 1, j - gw, j + gw].filter((q, i) => (i === 0 ? cx > 0 : i === 1 ? cx < gw - 1 : i === 2 ? cy > 0 : cy < gh - 1));
    for (let c = 0; c < 3; c++) { let sum = 0; for (const q of vec) sum += val[q * 3 + c]; val[j * 3 + c] = sum / vec.length; }
  }
  let semilla = 7; const azar = () => (semilla = (semilla * 16807) % 2147483647) / 2147483647;
  const muestra = (x, y, c) => { const fx = Math.min(gw - 1.001, Math.max(0, x / C - 0.5)), fy = Math.min(gh - 1.001, Math.max(0, y / C - 0.5)), x0 = Math.floor(fx), y0 = Math.floor(fy), u = fx - x0, v = fy - y0;
    const at = (xx, yy) => val[(yy * gw + xx) * 3 + c]; return (1 - u) * (1 - v) * at(x0, y0) + u * (1 - v) * at(x0 + 1, y0) + (1 - u) * v * at(x0, y0 + 1) + u * v * at(x0 + 1, y0 + 1); };
  for (let k = 0; k < w * h; k++) if (marca[k]) { const x = k % w, y = (k - x) / w, v = (azar() - 0.5) * 5; for (let c = 0; c < 3; c++) px[k * 4 + c] = muestra(x, y, c) + v; }
  const r = val[0], gg = val[1], b = val[2];
  g.putImageData(d, 0, 0);
  return { n, color: [r, gg, b].map(Math.round), out: c.toDataURL('image/jpeg', 0.86) };
}, dataUrl);
fs.writeFileSync(output, Buffer.from(result.out.split(',')[1], 'base64'));
console.log('píxeles rellenados', result.n, 'color', result.color);
await browser.close();
