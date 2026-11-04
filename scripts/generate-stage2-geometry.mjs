import fs from 'node:fs/promises';
import path from 'node:path';

const evidenceDir = process.env.EVIDENCE_DIR || 'evidencias/etapa-02/Despues';
const out = process.env.REPORT_PATH || path.join(evidenceDir, 'CAMARAS_Y_GEOMETRIA.md');
const data = JSON.parse(await fs.readFile(path.join(evidenceDir, 'stage2-results.json'), 'utf8'));
if (data.failure || data.errors.length) throw Error('No se genera un informe de una ejecución fallida');
const rows = data.captures.filter(item => item.geometry);
if (rows.length !== 9) throw Error(`Se esperaban nueve escenas científicas; se obtuvieron ${rows.length}`);

const number = (value, digits = 2) => Number(value).toLocaleString('es-MX', {
  minimumFractionDigits: digits, maximumFractionDigits: digits
});
const vector = v => `(${number(v.x, 0)}, ${number(v.y, 0)}, ${number(v.z, 0)})`;
const scientific = value => Number(value).toExponential(2);
const table = rows.map(({ name, geometry: g }) => {
  const angular = g.angularDiameterDeg < 0.01
    ? `${number(g.angularDiameterDeg * 3600, 3)}″`
    : `${number(g.angularDiameterDeg, 3)}°`;
  return `| ${name} | ${g.utc} / ${g.tdb} | ${g.observer} → ${g.target} | ${number(g.distanceKm, 1)} | ${vector(g.vectorKm)} | ${number(g.fovReferenceDeg, 3)}° vertical | ${angular} |`;
}).join('\n');
const maxPositionError = Math.max(...rows.map(x => x.geometry.scenePositionError));
const minDirectionDot = Math.min(...rows.map(x => x.geometry.directionDot));
const before = data.captures.find(x => x.name === '22-antes-comparador');
const open = data.captures.find(x => x.name === '23-comparador-iss');
const after = data.captures.find(x => x.name === '25-despues-comparador');

const report = `# Cámaras y geometría

## Definición y transformación

Las posiciones de Voyager y de los cuerpos proceden de los estados históricos locales NASA/JPL Horizons ya integrados. Para cada vista, el controlador copia exactamente la posición espacial de la Voyager. La dirección de mirada es la resta normalizada \`P_objetivo − P_sonda\`. La transformación a Three.js es \`(x, z, −y) × (32 unidades/AU) / 149 597 870,7 km/AU\`. El mismo cambio de ejes se aplica a observador y objetivo, por lo que no invierte la dirección.

Las cifras siguientes provienen de \`Evidencias/Despues/stage2-results.json\`, registrado en Chrome durante la ejecución E2E. Los vectores se expresan en km en el marco heliocéntrico de los datos locales; sus valores están redondeados sólo para presentación. \`Distancia = |vector|\`, \`diámetro = 2 atan(radio físico / distancia)\`. Para Saturno, el FOV contextual utiliza además el radio de encuadre de anillos 2,02 veces el radio físico. Para Sol, la dirección es hacia el origen heliocéntrico.

| Captura | Instante UTC / TDB | Observador → objetivo | Distancia km | Vector objetivo − Voyager (km) | FOV | Diámetro angular físico |
|---|---|---|---:|---|---:|---:|
${table}

En las nueve escenas, el error máximo entre la cámara y la posición espacial renderizada de la Voyager fue ${scientific(maxPositionError)} unidades de escena; el coseno mínimo entre la mirada y el vector transformado fue ${Number(minDirectionDot).toFixed(9)}. Estos son controles internos de consistencia geométrica, no mediciones independientes de actitud de vuelo.

## FOV de instrumentos

La documentación NASA especifica un campo **cuadrado** de 7,4×7,4 mrad para ISS/NAC (≈0,424° por lado) y 56×56 mrad para WAC (≈3,2° por lado): [NASA NTRS, diseño de Voyager](https://ntrs.nasa.gov/api/citations/19770022102/downloads/19770022102.pdf); [NASA NTRS, cámaras](https://ntrs.nasa.gov/citations/19820036881). \`THREE.PerspectiveCamera.fov\` es vertical. En canvas apaisado se usa como vertical el ángulo por lado y el cuadrado central delimita la huella del instrumento. En canvas retrato se aplica \`FOV_vertical = 2 atan(tan(FOV_lado/2) / aspect)\`; así el FOV horizontal del cuadrado central sigue siendo 0,424° o 3,2°. El resto del canvas fuera del cuadrado se oscurece de forma tenue como contexto, sin cambiar escala, radio ni distancia. Las opciones 18° y 45° son vistas contextuales verticales; el FOV contextual automático puede ser mayor cuando el diámetro angular físico lo exige.

Una imagen original requiere además la actitud histórica y calibración del instrumento para coincidir píxel a píxel. No se dispone aquí de CK/IK SPICE. La recreación sólo apunta geométricamente al centro del cuerpo y conserva su posición y escala física.

## Pale Blue Dot

En la captura \`13-pale-blue-dot.png\`, la Tierra está a ${number(rows.find(x => x.name === '13-pale-blue-dot').geometry.distanceKm, 1)} km según el snapshot local, con diámetro angular ${number(rows.find(x => x.name === '13-pale-blue-dot').geometry.angularDiameterDeg * 3600, 3)}″. En la fotografía histórica NASA la Tierra ocupa una fracción de píxel; el indicador de la interfaz sólo muestra su dirección, no agranda el planeta. Fuente sobre la fotografía y el instrumento: [NASA/JPL, Pale Blue Dot Revisited](https://science.nasa.gov/photojournal/pale-blue-dot-revisited/).

## Comparador temporal

Antes de abrir A/B: motor global JD TDB ${before?.state.engine?.jdTdb}; cámara ${before?.state.camera?.modo}; acontecimiento ${before?.state.event}. Durante la comparación se consultó localmente la fecha documental ${open?.state.comparatorDateTdb}; el motor global conservó JD TDB ${open?.state.engine?.jdTdb}. Tras cerrar, el motor registró JD TDB ${after?.state.engine?.jdTdb}, cámara ${after?.state.camera?.modo} y acontecimiento ${after?.state.event}. El E2E exigió igualdad del reloj global antes/durante/después en el caso pausado y restauración de reproducción en un caso activo separado.

## Alcance

Los estados NASA/JPL se leyeron de archivos locales del proyecto. El test de 13 muestras retenidas del repositorio sigue pasando, pero esta etapa no hizo una consulta externa nueva ni comparó actitudes históricas instrumentales. Los FOV contextuales son decisiones de composición basadas en ángulo físico, claramente diferenciadas del campo ISS.
`;
await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, report);
console.log(`Informe geométrico: ${out}`);
