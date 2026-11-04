// Visual metadata only. Map orientation is not tied to a validated CK/IAU frame.
export const MOON_TEXTURES = Object.freeze({
  Luna: {
    file: 'moon-lroc-color-2k.jpg',
    source: 'https://svs.gsfc.nasa.gov/4720/',
    label: 'NASA SVS / LROC WAC; color visible aproximado.',
    limitation: 'Mosaico estético global; regiones polares con datos de menor resolución. Orientación absoluta no validada.'
  },
  Io: {
    file: 'io-voyager-usgs-seam-feathered.png',
    illustration: 'io-illustrative.jpg', observedMask: 'io-observed-mask.png',
    source: 'https://science.nasa.gov/3d-resources/jupiter-io-a/',
    label: 'NASA / USGS / JPL; mosaico Voyager de Ío en color procesado.',
    limitation: 'Derivado del JPEG Voyager original con uniones locales atenuadas; persisten diferencias de resolución. Huecos polares ilustrativos sin valor geográfico confirmado, actividad visual no fechada y orientación absoluta no validada.'
  },
  Europa: {
    file: 'europa-usgs-voyager-galileo-2k.jpg',
    illustration: 'europa-illustrative-2k.jpg', observedMask: 'europa-usgs-observed-mask-2k.png',
    source: 'https://astrogeology.usgs.gov/search/map/europa_voyager_galileo_ssi_global_mosaic_500m',
    label: 'USGS / NASA; mosaico Voyager y Galileo SSI en escala de grises.',
    limitation: 'La cuña polar sin datos usa relleno ilustrativo, separado por máscara. No es color natural; resolución de origen variable y orientación absoluta no validada.'
  },
  Ganymede: {
    file: 'ganymede-usgs-voyager-galileo-color-2k.jpg',
    illustration: 'ganymede-illustrative-2k.jpg', observedMask: 'ganymede-usgs-observed-mask-2k.png',
    source: 'https://astrogeology.usgs.gov/search/map/ganymede_voyager_galileo_ssi_color_global_mosaic_1_4km',
    label: 'USGS / NASA; mosaico global Voyager y Galileo SSI en color procesado.',
    limitation: 'Las cuñas polares sin datos usan relleno ilustrativo identificado por máscara. El color combina filtros de distintas bandas; orientación absoluta no validada.'
  },
  Callisto: {
    file: 'callisto-usgs-voyager-galileo-2k.jpg',
    illustration: 'callisto-illustrative-2k.jpg', observedMask: 'callisto-usgs-observed-mask-2k.png',
    source: 'https://astrogeology.usgs.gov/search/map/callisto_galileo_voyager_global_mosaic_1km',
    label: 'USGS / NASA; mosaico global Voyager y Galileo SSI en escala de grises.',
    limitation: 'Las cuñas polares sin datos usan relleno ilustrativo identificado por máscara. Cobertura de origen desigual; orientación absoluta no validada.'
  },
  Titan: {
    file: 'titan-cassini-938nm.jpg',
    source: 'https://science.nasa.gov/resource/titan-mosaic-the-surface-under-the-haze/',
    label: 'NASA / Cassini; superficie en infrarrojo cercano, 938 nm.',
    limitation: 'Mapa infrarrojo conservado como referencia documental, oculto en la vista visible. Disco y neblina ámbar ilustrativos; sin modelo de dispersión calibrado ni orientación absoluta validada.'
  },
  Enceladus: {
    file: 'enceladus-cassini-2014-2k.jpg',
    source: 'https://science.nasa.gov/photojournal/color-maps-of-enceladus-2014/',
    label: 'NASA / JPL-Caltech / SSI / LPI; mosaico global Cassini en color ampliado.',
    limitation: 'Colores realzados con ultravioleta e infrarrojo; no equivalen a color natural. Resolución de origen variable, sin chorros históricos específicos ni orientación absoluta validada.'
  },
  Titania: {
    file: 'titania-voyager-usgs.jpg',
    illustration: 'titania-illustrative.jpg',
    observedMask: 'titania-observed-mask.png',
    source: 'https://science.nasa.gov/3d-resources/uranus-titania/',
    label: 'NASA / USGS / JPL; mosaico Voyager en escala de grises.',
    limitation: 'Las regiones observadas conservan la cartografía auténtica; las faltantes usan una reconstrucción artística ilustrativa, sin valor geográfico confirmado. Orientación absoluta no validada.'
  },
  Miranda: {
    file: 'miranda-voyager-usgs.jpg',
    illustration: 'miranda-illustrative.jpg', observedMask: 'miranda-observed-mask.png',
    source: 'https://science.nasa.gov/3d-resources/uranus-miranda/',
    label: 'NASA / USGS / JPL; mosaico Voyager de Miranda en escala de grises.',
    limitation: 'La región no observada usa reconstrucción ilustrativa sin valor geográfico confirmado. Orientación absoluta no validada.'
  },
  Triton: {
    file: 'triton-voyager-usgs.jpg',
    illustration: 'triton-illustrative.jpg',
    observedMask: 'triton-observed-mask.png',
    source: 'https://science.nasa.gov/3d-resources/neptune-triton/',
    label: 'NASA / USGS / JPL; mosaico Voyager de color procesado.',
    limitation: 'Las regiones observadas conservan la cartografía auténtica; las faltantes usan una reconstrucción artística ilustrativa, sin valor geográfico confirmado. Color procesado y orientación absoluta no validada.'
  }
});
