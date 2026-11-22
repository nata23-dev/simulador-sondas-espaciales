# Recursos del lanzamiento 3D (etapa 25)

Se descargan solo al abrir «Lanzamiento 3D». Todos son de dominio público, de agencias de EE. UU. Están en proyección geográfica (EPSG:4326, norte arriba) y `src/launch/LaunchWorld.js` los coloca por latitud y longitud.

| Archivo | Contenido | Fuente y petición | Extensión | SHA-256 |
| --- | --- | --- | --- | --- |
| `earth-bmng-8192.jpg` | Tierra completa, 8192 × 4096 | NASA GIBS, capa `BlueMarble_NextGeneration` (WMS 1.3.0, `GetMap`) | 90° S–90° N, 180° O–180° E | `eb28cbd9241efd75efa280073e660ba4e7b03f84a939f634b93eddbd715f0aeb` |
| `earth-bmng-4096.jpg` | Igual, 4096 × 2048 (perfil de calidad «Baja») | Ídem | Ídem | `00405b3cb1327f4bf22bdcc987c610fceac39be90f98b6a435b373575ea26297` |
| `florida-bmng-2048.jpg` | Florida, 2048 × 2048 | Ídem | 23–34° N, 87–76° O | `d8d8d9bd9e95e981aa556a11239ff1da845a1737e0489a6c31a6b37e5c6958a2` |
| `cape-usgs-2048.jpg` | Cabo Cañaveral, 2048 × 2048 (≈ 11 m/píxel), **derivado** | USGS The National Map, servicio `USGSImageryOnly` (`export`), «USDA, USGS The National Map: Orthoimagery. Data refreshed June, 2024» | 28,465–28,705° N, 80,70–80,46° O | `16afa4284de53bd077ac469d49bf60d772580fa1662f0de759861db0706ec38b` |
| `lc41-usgs-2048.jpg` | Entorno de LC-41, 2048 × 2048 (≈ 1,2 m/píxel) | Ídem | 28,5710–28,5956° N, 80,5951–80,5705° O | `d242e879af7f2bb31189b3dde5e70a40826c7871f11c13939d2c9808c8267513` |

Peticiones (21-11-2026):

- GIBS: `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=BlueMarble_NextGeneration&CRS=EPSG:4326&STYLES=&FORMAT=image/jpeg&BBOX=<lat mín>,<lon mín>,<lat máx>,<lon máx>&WIDTH=…&HEIGHT=…`.
- USGS: `https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/export?bbox=<lon mín>,<lat mín>,<lon máx>,<lat máx>&bboxSR=4326&imageSR=4326&size=2048,2048&format=jpg&f=image`. El servidor amplía el recuadro pedido hasta hacerlo cuadrado. La extensión de la tabla es la que devuelve el propio servicio con `f=json`.

## Derivación de `cape-usgs-2048.jpg`

La ortoimagen original trae zonas «sin datos» en blanco puro sobre el océano: dos rectángulos al este. SHA-256 del original: `4b30c9b79e77db73e44f9f4bddd979eb60e94044906133c3a8ec5db82454fad9`.

El guion [`scripts/derive-launch-cape-fill.mjs`](../../scripts/derive-launch-cape-fill.mjs):

- rellena esas zonas, y un borde de 2 px, con un relleno difuso del color del mar vecino (ecuación de Laplace en una rejilla de 16 px y un ruido suave);
- no edita el resto, aunque la imagen se vuelve a codificar en JPEG con calidad 0,86.

El mar rellenado es, por tanto, **ilustrativo**.

## Límites

- Las ortoimágenes del USGS son de **2024**, no de 1977. En la imagen de LC-41 aparecen las instalaciones actuales del Atlas V, entre ellas el edificio de integración vertical, al sur. La plataforma de 1977 es un modelo 3D aproximado (`src/launch/LC41Pad1977.js`) que tapa la explanada central.
- Blue Marble Next Generation es un mosaico sin nubes de 2004, no la Tierra de 1977. Las nubes vistas desde el espacio proceden de `public/textures/earth_clouds.jpg` y son ilustrativas.
