# Análisis integral del simulador y plan de mejora

**Fecha:** 20-11-2026. **Rama:** `revision/modo-historico-voyager`, con la etapa 17.1 y sus correcciones sin commit.

Este documento es un análisis, no una aprobación: la auditoría independiente sigue siendo de Gemini. El plan del final es una **propuesta** y nada de él se ha empezado.

## 1. Qué hace el simulador

| Modo | Qué ofrece | Datos |
| --- | --- | --- |
| **Sistema Solar** (exploración) | Los ocho planetas, 10 lunas, Sol y fondo estelar; reloj; escala exploratoria o científica (radios 1:1); búsqueda; herramienta de distancias; cámaras | NASA/JPL Horizons 2026; Hipparcos (estrellas); texturas NASA/USGS con procedencia |
| **Misiones históricas Voyager** | Voyager 1 y 2 de 1977 a 2026: trayectoria, lanzamiento, encuentros, fotografías reales, recreación de cámara, visita guiada | Horizons/SPK por tramos; catálogo de fotografías con procedencia; los cortes SPK se declaran |
| **Laboratorio de misiones** | 1 · Elegir sonda (Voyager, Cassini, Dawn y Juno con modelos 3D oficiales de NASA, planos, ingeniería y ensamblaje experimental). 2 · Planificar («Misión completa» Tierra → Marte/Júpiter con encuentro, captura de empuje finito y energía; ventanas interplanetarias de Lambert; Tierra–Luna con DOPRI54; empuje finito; lanzamiento terrestre). 3 · Reproducir (Centro de Misión: reloj, telemetría, eventos y cámaras; las misiones heliocéntricas, en el Sistema Solar principal) | Efemérides Horizons 2026–2046 (ICRF eclíptico J2000, TDB); GM de DE440; parámetros de sondas con procedencia y nivel de calidad |

Base del código: unas 36 000 líneas en `src/` (Vite + Three.js, sin dependencias de interfaz), 44 archivos de prueba con 322 pruebas, 94 guiones en `scripts/`, 57 documentos y 65 MB de recursos públicos.

## 2. Qué funciona correctamente (con evidencia)

| Área | Cómo se comprobó | Resultado |
| --- | --- | --- |
| Pruebas automáticas | `node --test tests/*.test.mjs` | 323/323 (tras 17.1.1) |
| Compilación | `npm run build` y `GITHUB_PAGES=true npm run build` | correctas |
| **Cálculo de la misión guiada Cassini → Marte** | Guion nuevo [`scripts/audit-stage17_1-independent-science.mjs`](../scripts/audit-stage17_1-independent-science.mjs): referencias implementadas de cero, sin importar funciones del proyecto como oráculo | 31/31 comprobaciones ([JSON](../evidence/stage17_1/independent-science.json)) |
| · Lambert | Kepler universal propio (funciones de Stumpff) desde la Tierra hasta el punto de entrada en la esfera de influencia | 2 mm de diferencia |
| · C3 de salida | \|v − v_Tierra\|² | 8,9936 km²/s², exacto |
| · Tramos balísticos | Crucero, aproximación y órbita final propagados con Kepler propio frente a la reproducción | ≤ 2 mm |
| · Encendido de captura | Ecuación del cohete con Isp 311 s, 445 N | Δv 1 665,7 m/s exacto; pérdida gravitatoria 397 m/s |
| · Órbita final | Vis-viva propio | 315,5 × 100 000 km, ligada, igual a la declarada |
| · Hipérbola de llegada | e = 1 + r_p·v∞²/μ, giro 2·asin(1/e), parámetro B | diferencias < 10⁻⁹ |
| · Esfera de influencia | Laplace a·(μ/μ☉)^(2/5) | 577 215 km, diferencia relativa 4×10⁻⁷ |
| · Tiempo | TDB − UTC en 2028 | 69,183 s (37 + 32,184 s + término periódico) |
| **Efemérides 2026–2046** | Comparación con los elementos aproximados de Standish (JPL), 114 instantes por planeta | Interiores (heliocéntricos): 22–80″. Exteriores (baricéntricos): Neptuno 7″, Urano 76″, Júpiter 297″, Saturno 497″, dentro del orden del error publicado de esa tabla. Descarta cualquier error de marco, ejes, unidades u origen |
| Constantes GM | Contra DE440 (NASA/JPL SSD) | coinciden en todas las cifras |
| Escena principal = cálculo | Pruebas 17.1: planetas, Tierra, Marte y sonda idénticos a `stateAt` y a la muestra heliocéntrica | diferencia 0 |
| Navegador con **GPU real** (AMD RX 6650 XT, Direct3D 11) | `GPU=1 node scripts/verify-stage17-browser.mjs` en todas sus partes | ver §6 y el documento de 17.1 |
| Rendimiento | Compilación de producción con la GPU real, Chrome sin interfaz | 176–180 fps en los tres modos; percentil 95 del fotograma ≈ 6 ms; misión A1 calculada en 157 ms |
| Accesibilidad automática | Parte `a11y` y parte nueva `sr` (árbol de accesibilidad y anuncios) | un `h1`; ningún control sin nombre; escenas 3D con etiqueta; sin anuncios por fotograma |

## 3. Qué se corrigió en esta revisión

| # | Problema | Causa | Corrección |
| --- | --- | --- | --- |
| 1 | Al llegar a la Luna (Tierra–Luna), la fase se rotulaba «Llegada al destino (sin captura)» | Clave `arrival` repetida en las etiquetas de fase del Centro de Misión: la de la transferencia interplanetaria pisaba la de Tierra–Luna (error presente desde antes de 17.1) | La llegada heliocéntrica usa su propia fase `arrival-helio`; prueba que impide claves repetidas |
| 2 | Llevar la línea de tiempo al final dejaba la misión «en pausa» a 0,0007 s del final, sin «Simulación finalizada» | El control tiene paso de 0,001 s: su máximo no coincide con la duración en coma flotante | El final del control es el final exacto del cálculo |
| 3 | El escenario A1 se llamaba «órbita elíptica de 3000 × 100 000 km», pero la órbita calculada es de 315,5 × 100 000 km, y la fase solo decía «ÓRBITA OBJETIVO ALCANZADA» | La captura apaga el motor al alcanzar el apoapsis objetivo; en un encendido de 4,5 h con 445 N el periapsis baja de 3000 a 315,5 km. **El cálculo era correcto**; el rótulo prometía otra cosa | Rótulo «Marte · captura elíptica, apoapsis de 100 000 km» y detalle de la fase con la órbita resultante y el periapsis apuntado (también en la captura en un satélite). Sin cambios de física |
| 4 | La cámara de destino dejaba Marte en pocos píxeles | Encuadre fijo que componía planeta y sonda desde lejos | Cámara a unos 4 radios del planeta, del lado del Sol, mirando a la sonda; se recalcula en cada fotograma hasta que el usuario arrastra (disco de Marte de unos 222 px de radio a 1366×768) |
| 5 | La vista general no se reencuadraba al entrar en vista inmersiva | Sin aviso del cambio de tamaño | `ResizeObserver` en la ventana de la escena: la vista general se recalcula al ocultar el panel, entrar en inmersiva o girar el móvil |
| 6 | Lector de pantalla: la línea de tiempo se leía como «27377840»; los cambios de fase no se anunciaban | Sin `aria-valuetext` ni región viva para la fase | Valor legible («X d transcurridos · Y d restantes · fase») y región oculta que anuncia «Fase: …» |
| 7 | Cálculo muerto en cada fotograma: `SolarSystem.js` consultaba y medía un panel antiguo sin usar el resultado | Resto de la etapa 14 | Eliminado |
| 8 | Restos de la plantilla de Vite (`src/counter.js`, `src/assets/*`, `public/icons.svg` con iconos de redes sociales, publicados en GitHub Pages) | Plantilla inicial | Eliminados |
| 9 | 39 reglas CSS y una entrada de `WorkspaceLayout.js` que apuntaban al panel retirado de la Sonda Experimental 01 | Retirada de 17.1 | Eliminadas (los selectores no coincidían con ningún elemento) |
| 10 | 13 importaciones y variables sin uso en `src/` (ESLint) | Restos de etapas anteriores | Eliminadas; ESLint con reglas de errores: 0 errores |

## 4. Qué necesita corrección o decisión (no corregido aquí)

Estos puntos cambian el modelo físico, los datos o el alcance, así que requieren tu decisión y, después, validación de Gemini.

1. **El periapsis de captura se desplaza en encendidos largos.** El cálculo lo hace bien y ahora lo dice, pero no lo compensa: un planificador real apuntaría la llegada a otro periapsis para acabar en la órbita pedida. Afecta a A1 (3000 → 315 km) y a C1/C2 (4200 → 3735 km en Júpiter).
2. **La salida es una condición inicial, no un lanzamiento.** La misión empieza en la Tierra con la v∞ ya aplicada («la inyección la realiza un lanzador externo no modelado»). El lanzamiento de 12E existe, pero no está enlazado.
3. **El crucero es una cónica pura**, sin correcciones de trayectoria ni perturbaciones de otros planetas. Se declara, pero no se cuantifica el error frente a un modelo de n cuerpos.
4. **Las misiones con satélite (C1/C2 → Europa) y las geocéntricas** siguen en la escena local del Centro de Misión.
5. **Trayectoria Voyager 1977–2026**: los cortes SPK siguen sin fuente homogénea (documentado en las etapas 08–09).
6. **Pendientes de etapas anteriores:** auditorías de 12C, 13 y 14 a 17 (12E, 12F y 12G están aprobadas por Gemini; 17.1, por Claude con observaciones: [informe](STAGE17_1_AUDIT_CLAUDE.md)); campo de fecha sin anillo de foco desde la etapa 17.

## 5. Qué sobra o se pensó para algo que no se usa

| Elemento | Situación | Tamaño | Propuesta |
| --- | --- | --- | --- |
| Motor de descenso y aterrizaje 12F (`src/lab/BodyLanding*.js`) e interfaz `src/ui/LandingPlanner.js` | La interfaz lo retiró en 15.1 por tu decisión; `IntegratedMission` lo conserva, pero siempre recibe `landing: { enabled: false }`. `LandingPlanner.js` no es alcanzable | 6 archivos y sus pruebas | Decidir: retirarlo o volver a ofrecerlo |
| Sonda Experimental 01 (`ExperimentalProbe01.js`, `TrajectoryPropagator.js`) | Solo la usan las pruebas DOPRI54, conservada por tu decisión | 550 líneas | Mantener (decisión vigente) |
| 14 exportaciones que nadie importa (`saveDesign`, `powerBalance`, `jdTdbToCalendarDate`, `sampleInsertionSegment`…) | Restos de diseños anteriores | pequeñas | Retirar |
| CSS heredado: `.welcome-features-grid`, `#main-mode-links`, `.hist-more-jumps` | No coinciden con nada; además hay 5 444 líneas de CSS en 6 hojas con 92 `!important`, por capas de las etapas 14, 14.1 y 17 | — | Consolidar en `theme.css` y retirar las capas sobrescritas |
| Decodificador Draco duplicado | `DRACOLoader` de three declara rutas por defecto que Vite copia a `dist/assets` (5 archivos), aunque se usa la copia de `public/libs/draco` | 1,3 MB en `dist` | Usar una sola copia |
| Originales de texturas de lunas (`*-voyager-usgs.jpg` de Calisto, Encélado, Europa, Ganímedes e Ío) | Fuentes de las texturas derivadas; la aplicación no los carga, pero se publican | 3,1 MB | Moverlos fuera de `public/` (con su procedencia) |
| `scripts/` | 94 guiones, unos 60 de una sola etapa (capturas, auditorías antiguas, diagnósticos) | — | Archivar con un índice |
| `evidence/` en Git | 2 425 archivos (86 MB), incluidos 4 `.zip` y copias de seguridad; `.git` ocupa 382 MB en local | 86 MB | Reducir: evidencias de etapas cerradas fuera del repositorio o como adjuntos de *release* |

## 6. Rendimiento medido (GPU real, compilación de producción)

| Medida | Valor |
| --- | --- |
| Fotogramas por segundo: exploración, Voyager y reproducción Cassini → Marte | 180 · 178 · 176 (Chrome sin interfaz, sin límite de 60 Hz) |
| Memoria JS | 28 MB (exploración) y 44 MB (reproducción) |
| Primera pintura | ≈ 1,0 s en local |
| **Descarga al arrancar** | **20,1 MB en 65 peticiones; igual en móvil** |
| De ellos | 12 MB de JPG, 4,6 MB de modelos GLB (Voyager 3,0 MB y Cassini 1,6 MB, aunque se empiece en exploración) y unos 6 MB de texturas 2k de lunas, a veces en dos versiones |
| JavaScript principal | 1,57 MB en un solo archivo (461 kB comprimido); 4 tareas largas al arrancar, la mayor de 719 ms |

La fluidez no es un problema. El coste está en la **primera carga**, sobre todo en móvil y con conexiones lentas.

## 7. Mejoras de experiencia de uso recomendadas

1. **Resultado de la captura a la vista:** un esquema pequeño de la órbita final (periapsis y apoapsis) en «Resultados», con el objetivo frente a lo alcanzado.
2. **Atajos de teclado en el Centro de Misión:** espacio (reproducir o pausar), ← / → (evento anterior o siguiente), Inicio / Fin. Hoy no existen.
3. **Marcas de eventos agrupadas** cuando comparten píxel (inserción y fin de cadena) y zoom temporal alrededor de un evento.
4. **Rótulos de planetas que eviten los controles** de la vista inmersiva (por ejemplo, «SATURNO» bajo la pastilla «PAUSADA»).
5. **Comparación con la misión real:** junto al resultado de Cassini → Marte, una ficha con lo que hizo la Cassini real (lanzamiento 1997, asistencias Venus–Venus–Tierra–Júpiter, llegada a Saturno en 2004), para no confundir simulación e historia.
6. **Móvil:** panel del Centro de Misión como hoja inferior y vista inmersiva por defecto en pantallas estrechas.
7. **Encabezados:** «Reproducción» aparece como h2 y h3 seguidos; un solo nivel por sección ayuda al lector de pantalla.
8. **Unidades y escalas:** un selector km/AU y una explicación UTC/TDB al pasar por la fecha.

## 8. Plan de mejora propuesto (para tu aprobación)

Cada bloque es una etapa autorizable por separado: implementación, pruebas, revisión en navegador y auditoría de Gemini antes de pasar al siguiente. El orden es una recomendación.

| Etapa | Contenido | Valor | Riesgo |
| --- | --- | --- | --- |
| **18 · Carga rápida** | Modelos GLB y texturas de lunas bajo demanda; división del JavaScript (laboratorio, histórico, lanzamiento) en módulos que se cargan al entrar; una sola copia de Draco; perfil de texturas para móvil | Arranque estimado de 20 MB a unos 6–8 MB; menos bloqueos | Bajo (sin cambios de física ni datos) |
| **19 · Limpieza** | Decidir el motor de aterrizaje; retirar las exportaciones sin uso; consolidar el CSS; archivar los guiones de una sola etapa; aligerar `evidence/` | Código más pequeño y mantenible | Bajo, salvo el aterrizaje (decisión tuya) |
| **20 · Captura apuntada** | Compensar el desplazamiento del periapsis en encendidos largos (búsqueda del periapsis de llegada que da la órbita pedida); el resultado frente al objetivo en «Resultados» | Órbitas finales que coinciden con lo planificado | Medio: cambia el modelo y necesita validación independiente |
| **21 · Lanzamiento → inyección** | Enlazar el lanzamiento de 12E con una órbita de aparcamiento y una inyección de empuje finito hacia Marte | La misión empieza en la plataforma, no en una v∞ dada | Alto: contrato nuevo entre módulos |
| **22 · Crucero realista** | Propagación de n cuerpos (DOPRI54 con planetas de Horizons) en paralelo a la cónica, con su diferencia, y correcciones de trayectoria | Cuantifica el error de las cónicas parcheadas | Medio-alto |
| **23 · Satélites en la escena principal** | Lunas galileanas de la ventana de la misión en la escena principal para C1/C2 | Europa reproducida en el Sistema Solar | Medio |
| **24 · Experiencia de uso** | Puntos 1–8 del §7 | Uso más claro y accesible | Bajo |
| Continuo | Auditorías pendientes (Gemini o Claude); prueba real con NVDA o Narrador; ESLint (solo reglas de errores) en la CI; sustituir las pruebas que solo comprueban texto del código por pruebas de comportamiento (O-03 de la auditoría de 17.1) | Garantías | — |

Lo que este plan **no** propone: cambiar datos de Horizons, hashes, kernels, fotografías o modelos de NASA; inventar parámetros de sondas; extrapolar efemérides fuera de su cobertura.
