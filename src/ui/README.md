# Presentación de datos y controles

## Marco de exploración y navegación

`WorkspaceLayout.js` se inicializa después de los controladores existentes y antes de cargar datos. Reubica sus nodos DOM, conservando identificadores, valores y listeners. No copia telemetría ni calcula estados físicos. `workspace-layout.css` define el marco visual por separado de los estilos de contenido existentes.

El dock ofrece herramientas e inspector. El inspector contiene Telemetría, Historia, Fotografías y Cámaras (las tres últimas solo en histórico). Su estado `data-state` es `closed`, `half` o `expanded`: en escritorio es lateral; hasta 760px se convierte en panel inferior con scroll interno. Al cerrar queda `inert`; las pestañas admiten flechas, Inicio y Fin. Escape cierra herramientas y paneles; el visor fotográfico contiene el foco y lo devuelve al control de origen.

`TimelineLayout.js` conserva los controles originales y agrupa fechas/hitos/asistencias en desplegables. No modifica las semánticas UTC/TDB, velocidades ni temporizadores. El aviso de pausa por hito se anuncia en el disparador de avanzados, sin cubrir la reproducción.

`SolarSystem.js` calcula el área visual libre y ajusta la proyección exterior para componer el objeto enfocado cuando cambia el inspector. Primera persona y recreación mantienen su FOV instrumental y posición física. El diagnóstico de solo lectura expone `transicionActiva` para esperar al encuadre antes de capturar.

Los identificadores del motor de cámara son `exterior`, `first_person` y `photo_recreation`; la UI usa estos mismos valores. Los textos públicos permanecen en español.

`TimelineControls.js` recorre únicamente las muestras diarias existentes entre las fechas `inicio` y `fin` del JSON de Horizons. Usa aritmética de calendario para construir los valores del selector y la barra; cada registro permanece etiquetado a las **00:00 TDB**. No convierte TDB a UTC, interpola ni extrapola posiciones. Mantiene un solo temporizador de reproducción, que se reinicia al cambiar la velocidad.

`PlanetInfoPanel.js` muestra las componentes de posición del JSON en AU. Calcula distancia heliocéntrica y rapidez como las magnitudes de los respectivos vectores, y convierte los resultados con **1 AU = 149 597 870,7 km** ([definición IAU 2012](https://iauarchive.eso.org/public/themes/measuring/)) y **1 día = 86 400 s**. Son valores derivados de las efemérides de [NASA/JPL Horizons](https://ssd.jpl.nasa.gov/horizons/), no mediciones de un motor físico propio. El plano y la referencia se leen de los metadatos del archivo original.

Las etiquetas de `PlanetLabels.js` se proyectan sobre los centros visuales de los planetas y se omiten si coinciden demasiado en pantalla. Las líneas orbitales son ilustrativas; sus interruptores no modifican coordenadas, efemérides ni materiales planetarios.

# Lunas y encuentros: Etapa 06

La ampliación a diez lunas, la cobertura científica, el comparador de fotografías Voyager y los límites SPK nave–luna están documentados en [STAGE_06.md](../../docs/STAGE_06.md). El catálogo físico está en `src/science/PlanetaryMoons.js`; `src/science/MoonCatalog.js` reúne metadatos científicos y visuales. Las fuentes y límites de los mapas se describen en `public/textures/moons/README.md`.
