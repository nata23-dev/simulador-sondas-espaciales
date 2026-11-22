# Originales de texturas de lunas (no publicados)

Etapa 19. Estos cinco JPEG son los originales descargados de NASA 3D Resources (mosaicos de Voyager procesados por USGS/JPL) de los que se derivaron las texturas de `public/textures/moons/` (ilustraciones, máscaras y, en Ío, el derivado sin costura). La aplicación no los carga, así que ya no se publican. Se movieron con `git mv`, **sin modificar**: el historial de Git conserva su recorrido. Fuentes, fechas y licencias: [`public/textures/moons/README.md`](../../../public/textures/moons/README.md) y los guiones `scripts/acquire-stage5-textures.py` y `scripts/acquire-stage6-moon-textures.mjs`.

| Archivo | Bytes | SHA-256 |
| --- | ---: | --- |
| callisto-voyager-usgs.jpg | 783 405 | b9f4fa5db94debabd12814853fd132db3449889646a490b6f95a897b2c47b121 |
| enceladus-voyager-usgs.jpg | 472 211 | 4e16d38b98b788468e4f005b56d04282ccfe2f086eebfb1c0e5d20d8fd65ebef |
| europa-voyager-usgs.jpg | 610 862 | 50d01ca5c01352d1c507bb17fefd1c46ba11260305656250062c6cdac89c8ebf |
| ganymede-voyager-usgs.jpg | 710 923 | 1aa9d5a6f20e72230c13ce3d78592fc056e22f1e1ee39ea7acfa7e08d09fe173 |
| io-voyager-usgs.jpg | 702 001 | fdd79a58331864ec1f93035b3ebb92767b01715d2ce75d5b73cf8537b6af3382 |

Los guiones de auditoría de las etapas 10 y 11 y `scripts/derive-io-seam-texture.py` leen ahora el original de Ío desde aquí. Los guiones de adquisición descargarían en `public/textures/moons/`; no se ejecutan sin autorización.
