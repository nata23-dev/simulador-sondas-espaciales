# Presentación de datos y controles

`TimelineControls.js` recorre únicamente las muestras diarias existentes entre las fechas `inicio` y `fin` del JSON de Horizons. Usa aritmética de calendario para construir los valores del selector y la barra; cada registro permanece etiquetado a las **00:00 TDB**. No convierte TDB a UTC, interpola ni extrapola posiciones. Mantiene un solo temporizador de reproducción, que se reinicia al cambiar la velocidad.

`PlanetInfoPanel.js` muestra las componentes de posición del JSON en AU. Calcula distancia heliocéntrica y rapidez como las magnitudes de los respectivos vectores, y convierte los resultados con **1 AU = 149 597 870,7 km** ([definición IAU 2012](https://iauarchive.eso.org/public/themes/measuring/)) y **1 día = 86 400 s**. Son valores derivados de las efemérides de [NASA/JPL Horizons](https://ssd.jpl.nasa.gov/horizons/), no mediciones de un motor físico propio. El plano y la referencia se leen de los metadatos del archivo original.

Las etiquetas de `PlanetLabels.js` se proyectan sobre los centros visuales de los planetas y se omiten si coinciden demasiado en pantalla. Las líneas orbitales son ilustrativas; sus interruptores no modifican coordenadas, efemérides ni materiales planetarios.
