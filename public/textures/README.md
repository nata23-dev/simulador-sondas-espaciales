# Texturas planetarias

Las imágenes se almacenan localmente y se cargan desde `/textures/`. Proceden de [Solar System Scope / INOVE](https://www.solarsystemscope.com/textures/), distribuidas bajo [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/). Crédito: **Solar System Scope / INOVE**, con datos e imágenes de NASA. Se han usado los archivos originales de 2K (2048 × 1024 para los mapas equirectangulares); no se han ampliado.

La fuente indica que sus mapas se basan en datos de elevación e imágenes de NASA, con color ajustado y zonas sin observación rellenadas de forma ilustrativa. Son adecuados para visualización educativa, pero **no para análisis científico de superficies**. Véanse también las [pautas de uso de medios de NASA](https://www.nasa.gov/nasa-brand-center/images-and-media/).

## Archivos y origen

- `mercury.jpg`: [Mercurio](https://www.solarsystemscope.com/textures/download/2k_mercury.jpg).
- `venus_surface.jpg`: [superficie de Venus](https://www.solarsystemscope.com/textures/download/2k_venus_surface.jpg), parcialmente visible bajo las nubes.
- `venus_atmosphere.jpg`: [atmósfera de Venus](https://www.solarsystemscope.com/textures/download/2k_venus_atmosphere.jpg).
- `earth_daymap.jpg`: [Tierra de día](https://www.solarsystemscope.com/textures/download/2k_earth_daymap.jpg).
- `earth_clouds.jpg`: [nubes terrestres](https://www.solarsystemscope.com/textures/download/2k_earth_clouds.jpg); su luminancia se usa como transparencia.
- `earth_normal_map.png`: conversión sin cambio de escala del [mapa normal TIFF](https://www.solarsystemscope.com/textures/download/2k_earth_normal_map.tif). Solo modifica la iluminación de la superficie.
- `earth_roughness.png`: derivado visual del [mapa especular TIFF](https://www.solarsystemscope.com/textures/download/2k_earth_specular_map.tif). Se invirtió la luminancia y se limitó la rugosidad mínima a 0.2: el océano queda más liso que la tierra. No es una medición física de rugosidad.
- `mars.jpg`: [Marte](https://www.solarsystemscope.com/textures/download/2k_mars.jpg).
- `jupiter.jpg`: [Júpiter](https://www.solarsystemscope.com/textures/download/2k_jupiter.jpg).
- `saturn.jpg`: [Saturno](https://www.solarsystemscope.com/textures/download/2k_saturn.jpg).
- `saturn_ring_alpha.png`: [tira radial de los anillos de Saturno](https://www.solarsystemscope.com/textures/download/2k_saturn_ring_alpha.png), con transparencia.
- `uranus.jpg`: [Urano](https://www.solarsystemscope.com/textures/download/2k_uranus.jpg).
- `neptune.jpg`: [Neptuno](https://www.solarsystemscope.com/textures/download/2k_neptune.jpg).

Las inclinaciones axiales y los períodos de rotación relativos proceden de la [NASA Planetary Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/). La velocidad en pantalla es ilustrativa; la orientación de cada mapa no se calcula a partir de una época astronómica. El relieve y la rugosidad afectan exclusivamente al aspecto; las posiciones y escalas visuales originales no se modifican.
