# Etapa 12A — Laboratorio Experimental 2.0

## Arquitectura

- `src/lab/ComponentCatalog.js`: catálogo de piezas ficticias con unidades SI, función, dimensiones, masa, potencia, propelente y conexiones.
- `src/lab/ProbeDesign.js`: formato JSON versionado, tres diseños editables, estructura vacía, validación de conexiones, carga estructural y propelente; persistencia limitada a 30 diseños en `localStorage`.
- `src/lab/ProbeEngineering.js`: balance de masa, combustible, empuje, delta-v ideal y electricidad, sin modificar la trayectoria orbital.
- `src/lab/ProbeAssemblyView.js`: geometría procedural 3D de cada familia, montaje en puntos fijos, selección por clic y cámara orbital libre.
- `src/ui/ExperimentalLaboratory.js` y su CSS: catálogo, constructor y panel de ingeniería. La vista orbital anterior permanece accesible mediante «Ver simulación orbital».

El diseño modular es una capa de ingeniería conceptual. La sonda orbital `Sonda Experimental 01` conserva su definición, su estado inicial y su propagación DOPRI54. Las piezas guardadas no afectan masa dinámica, empuje, combustible ni trayectoria en ese motor. No hay maniobras, aterrizajes ni minería física en esta etapa.

## Procedencia de modelos y datos

Se consultó el [catálogo de recursos 3D de NASA](https://science.nasa.gov/3d-resources/) y la [guía oficial de uso de medios NASA](https://www.nasa.gov/nasa-brand-center/images-and-media/). NASA ofrece modelos descargables y permite uso informativo o educativo sujeto a sus condiciones; algunos medios de terceros y sus insignias requieren atención especial. Los modelos disponibles representan naves u objetos completos y no proporcionan las conexiones y tamaños normalizados que exige este constructor. Por ello, **las piezas nuevas son geometrías procedurales originales** hechas con Three.js, sin archivos comerciales ni servicios externos. El `Voyager.glb` existente permanece exclusivo de la visualización orbital previa.

Las masas, dimensiones, capacidades, empujes, Isp y potencias del catálogo son **parámetros plausibles e ilustrativos de equipos ficticios de entrenamiento**. No se presentan como fichas de equipos reales. La aceleración estándar usada en Tsiolkovsky, `g₀ = 9,80665 m/s²`, corresponde a la [tabla SI de NIST](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b9); no se usa un parámetro gravitacional planetario para ese cálculo ideal.

## Alcance y límites del cálculo

La masa seca suma bus y piezas. La masa cargada añade combustible de los tanques. El empuje se informa solo cuando motor y tanque comparten propelente. Para motores simultáneos compatibles, el Isp efectivo se pondera por flujo másico y `Δv = g₀ Isp ln(m₀/mf)` usa todo el combustible como límite ideal. No incorpora etapas, pérdidas gravitacionales, perfiles de encendido, rendimiento eléctrico ni flujo variable. Una pieza sin motor, tanque o combustible muestra «No disponible» con explicación.

La potencia instantánea distingue generación solar nominal a 1 AU, consumo en reposo y consumo activo adicional. La batería se expresa en Wh; la autonomía solo se estima cuando existe déficit de reposo y capacidad de batería. No se calcula eclipse, distancia solar real, orientación, eficiencia, degradación ni autonomía con ciclos de actividad.

Las conexiones son puntos predeterminados por estructura, uno por categoría de ubicación; la validación rechaza puntos duplicados, piezas en puntos incompatibles, exceso de carga y motor/tanque con propelentes distintos. La estabilidad mecánica fina, centro de masas, cargas de aterrizaje y envolventes de choque requieren modelos posteriores.

## Uso

En «Experimental» se abre el constructor. Selecciona una estructura o un diseño inicial, luego elige piezas y puntos de conexión. Se pueden reemplazar piezas ocupadas, retirarlas, cambiar la cantidad de combustible de un tanque, guardar en este navegador y recuperar, exportar o importar JSON. El archivo importado se valida antes de alterar el diseño activo. El modo orbital anterior se abre con «Ver simulación orbital» y se vuelve al constructor desde «Volver al constructor».

## Siguiente etapa

El formato versionado y la separación entre catálogo, diseño, cálculos y Three.js permiten incorporar futuros subsistemas de planificación, propulsión, descenso y exploración. Su conexión con el motor físico exige definir primero masa variable, eventos de maniobra y condiciones de operación verificables.
