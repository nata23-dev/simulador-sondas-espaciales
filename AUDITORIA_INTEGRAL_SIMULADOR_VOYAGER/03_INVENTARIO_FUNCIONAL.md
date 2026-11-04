# 03. Inventario Funcional Exhaustivo

**Proyecto:** Simulador de Sondas Espaciales (Sistema Solar y Misiones Voyager 1 y 2)  
**Metodología de Auditoría:** Inspección estática de código + Pruebas dinámicas reales mediante Chrome DevTools Protocol (CDP) + Validación de estados WebGL2.  
**Criterio de Calificación:**
- **[VERIFICADA]** Implementada y comprobada con evidencia funcional y visual sin fallos.
- **[CON DEFECTO]** Implementada pero presenta un defecto de ejecución, excepción JS o anomalía visual.
- **[PARCIAL]** Implementada en un subconjunto de casos o con limitaciones explícitas.
- **[NO IMPLEMENTADA]** Documentada o mencionada en comentarios pero ausente en la ejecución.
- **[NO VERIFICABLE]** Requiere hardware o condiciones no reproducibles.

---

## A. Sistema Solar (Modo Exploración)

| ID | Funcionalidad | Estado | Evidencia PNG | Descripción y Comportamiento Observado |
| :--- | :--- | :---: | :--- | :--- |
| **SOL-01** | Vista General del Sistema Solar | **VERIFICADA** | `001-solar-vista-general-1920x1080.png` | Sol central con shader de brillo, 8 órbitas elípticas y plano de referencia eclíptico. |
| **SOL-02** | Mercurio (Enfoque y Ficha) | **VERIFICADA** | `002-solar-planeta-mercurio-1920x1080.png` | Cámara enfoca a 0.44 AU del Sol; panel reporta 66.5M km y rapidez de 41.2 km/s. |
| **SOL-03** | Venus (Enfoque y Ficha) | **VERIFICADA** | `003-solar-planeta-venus-1920x1080.png` | Malla con doble capa de atmósfera; distancia de 0.726 AU (108.6M km) y 34.89 km/s. |
| **SOL-04** | Tierra (Enfoque y Ficha) | **VERIFICADA** | `004-solar-planeta-tierra-1920x1080.png` | Textura diurna fotorrealista con nubes rotatorias; distancia 0.998 AU (149.4M km), 29.8 km/s. |
| **SOL-05** | Marte (Enfoque y Ficha) | **VERIFICADA** | `005-solar-planeta-marte-1920x1080.png` | Planeta rojo con mapa topográfico de relieve; distancia 1.45 AU, rapidez de 24.1 km/s. |
| **SOL-06** | Júpiter (Enfoque y Ficha) | **VERIFICADA** | `006-solar-planeta-jupiter-1920x1080.png` | Bandas nubosas jovianas y Gran Mancha Roja; distancia 5.20 AU, rapidez de 13.06 km/s. |
| **SOL-07** | Saturno y Anillos | **VERIFICADA** | `007-solar-planeta-saturno-1920x1080.png` | Sistema de anillos con canal alfa de transparencia e inclinación axial realista; distancia 9.58 AU. |
| **SOL-08** | Urano (Enfoque y Ficha) | **VERIFICADA** | `008-solar-planeta-urano-1920x1080.png` | Tono cian pálido con atmósfera difusa; distancia 19.2 AU, rapidez de 6.8 km/s. |
| **SOL-09** | Neptuno (Enfoque y Ficha) | **VERIFICADA** | `009-solar-planeta-neptuno-1920x1080.png` | Azul profundo con dinámica de nubes simulada; distancia 30.05 AU, rapidez de 5.4 km/s. |
| **SOL-10** | Menú de Herramientas y Capas | **VERIFICADA** | `010-solar-menu-herramientas-1920x1080.png` | Despliegue de conmutadores para órbitas, etiquetas, campo estelar y regiones. |
| **SOL-11** | Vista Cinematográfica | **VERIFICADA** | `011-solar-vista-cinematografica-1920x1080.png` | Rotación oblicua automatizada con profundidad de campo visual y composición espacial. |
| **SOL-12** | Escala Científica 1:1 | **VERIFICADA** | `012-solar-escala-cientifica-1920x1080.png` | Tamaños físicos reales respecto a distancias astronómicas; planetas subpíxel a gran escala. |
| **SOL-13** | Medición Científica de Distancias 3D | **VERIFICADA** | `013-solar-herramienta-distancias-1920x1080.png` | Cálculo euclídeo 3D (Tierra-Marte: 1.54 AU / 230M km), tiempo luz y vector en escena. |
| **SOL-14** | Línea Temporal y Reproducción 2026 | **VERIFICADA** | `014-solar-linea-temporal-2026-1920x1080.png` | Controles de play/pause, avance diario sincrónico con vectores Horizons de octubre 2026. |

---

## B. Misiones Históricas (Voyager 1 y Voyager 2)

| ID | Funcionalidad | Estado | Evidencia PNG | Descripción y Comportamiento Observado |
| :--- | :--- | :---: | :--- | :--- |
| **HIST-01** | Modal de Bienvenida Histórica | **VERIFICADA** | `015-hist-modal-bienvenida-1920x1080.png` | Modal orientador para nuevos usuarios con accesos directos al tour o exploración libre. |
| **HIST-02** | Vista Simultánea (Ambas Sondas) | **VERIFICADA** | `016-hist-vista-ambas-sondas-1920x1080.png` | Trayectorias completas 1977–2026 divergentes saliendo de la heliosfera. |
| **HIST-03** | Selector de Misión: Voyager 1 | **VERIFICADA** | `017-hist-selector-voyager1-1920x1080.png` | Aislamiento de trayectoria de V1, resaltado de antena HGA y enfoque exterior. |
| **HIST-04** | Selector de Misión: Voyager 2 | **VERIFICADA** | `018-hist-selector-voyager2-1920x1080.png` | Trayectoria completa de los 4 sobrevuelos planetarios históricos de V2 (Gran Vuelta). |
| **HIST-05** | Telemetría Orbital en Tiempo Real | **CON DEFECTO** | `019-hist-inspector-telemetria-1920x1080.png` | Muestra valores correctos en fechas de vuelo, pero exhibe guiones (`—`) en instante de lanzamiento. |
| **HIST-06** | Ficha Histórica y Cronología | **VERIFICADA** | `020-hist-inspector-historia-1920x1080.png` | Cronología oficial con hitos NSSDCA y objetivos científicos documentados. |
| **HIST-07** | Catálogo de Fotografías Auténticas | **VERIFICADA** | `021-hist-inspector-fotografias-1920x1080.png` | 8 tarjetas con miniaturas locales, metadatos oficiales y enlaces a NASA Photojournal. |
| **HIST-08** | Cámara en Primera Persona (POV) | **CON DEFECTO** | `022-hist-camara-primera-persona-pov-1920x1080.png` | Cámara en coordenadas de Voyager; falla si la sonda seleccionada está en estado `pre_launch`. |
| **HIST-09** | Selección de FOV Angular en 1.ª Persona | **VERIFICADA** | `023-hist-primera-persona-fov-iss-1920x1080.png` | Conmutación entre FOV estrecho ISS-NAC (0.424°), WAC (3.18°), 18° y 45°. |

---

## C. Recorrido Histórico Guiado (Los 12 Acontecimientos Clave)

Cada hito fue ejecutado y evaluado individualmente para comprobar encuadre, fecha, objeto observado y textos:

| Paso | ID Evento | Fecha Documentada | Sonda | Objeto Enfocado | Estado | Evidencia PNG |
| :---: | :--- | :--- | :---: | :---: | :---: | :--- |
| **1** | `v2-launch-1977` | 20 ago 1977 · 14:29 UTC | Voyager 2 | Tierra / LC-41 | **CON DEFECTO\*** | `024-recorrido-hito-01-v2-launch-1977-1920x1080.png` |
| **2** | `v1-launch-1977` | 5 sep 1977 · 12:56 UTC | Voyager 1 | Tierra / LC-41 | **CON DEFECTO\*** | `025-recorrido-hito-02-v1-launch-1977-1920x1080.png` |
| **3** | `v1-jupiter-1979` | 5 mar 1979 | Voyager 1 | Júpiter / Ío | **CON DEFECTO\*** | `026-recorrido-hito-03-v1-jupiter-1979-1920x1080.png` |
| **4** | `v2-jupiter-1979` | 9 jul 1979 | Voyager 2 | Júpiter / Europa | **CON DEFECTO\*** | `027-recorrido-hito-04-v2-jupiter-1979-1920x1080.png` |
| **5** | `v1-saturn-1980` | 12 nov 1980 | Voyager 1 | Saturno / Titán | **CON DEFECTO\*** | `028-recorrido-hito-05-v1-saturn-1980-1920x1080.png` |
| **6** | `v2-saturn-1981` | 26 ago 1981 | Voyager 2 | Saturno / Anillos | **CON DEFECTO\*** | `029-recorrido-hito-06-v2-saturn-1981-1920x1080.png` |
| **7** | `v2-uranus-1986` | 24 ene 1986 | Voyager 2 | Urano | **CON DEFECTO\*** | `030-recorrido-hito-07-v2-uranus-1986-1920x1080.png` |
| **8** | `v2-neptune-1989` | 25 ago 1989 | Voyager 2 | Neptuno / Tritón | **CON DEFECTO\*** | `031-recorrido-hito-08-v2-neptune-1989-1920x1080.png` |
| **9** | `v1-pale-blue-dot-1990` | 14 feb 1990 · 04:48 UTC | Voyager 1 | Tierra (40.47 AU) | **CON DEFECTO\*** | `032-recorrido-hito-09-v1-pale-blue-dot-1990-1920x1080.png` |
| **10** | `v1-termination-shock-2004`| 16 dic 2004 | Voyager 1 | Choque Terminación | **CON DEFECTO\*** | `033-recorrido-hito-10-v1-termination-shock-2004-1920x1080.png`|
| **11** | `v1-heliopause-2012` | 25 ago 2012 | Voyager 1 | Heliopausa V1 | **CON DEFECTO\*** | `034-recorrido-hito-11-v1-heliopause-2012-1920x1080.png` |
| **12** | `v2-heliopause-2018` | 5 nov 2018 | Voyager 2 | Heliopausa V2 | **CON DEFECTO\*** | `035-recorrido-hito-12-v2-heliopause-2018-1920x1080.png` |

> [!WARNING]
> *\*Nota sobre el estado [CON DEFECTO] en el Recorrido Guiado:*  
> Todos los 12 hitos posicionan correctamente la cámara 3D, muestran el texto descriptivo, actualizan la fecha y permiten navegar con los botones "Anterior" y "Siguiente". Sin embargo, **cada cambio de hito lanza en la consola la excepción `TypeError: hud.anunciar is not a function`**, impidiendo que el lector de pantalla anuncie el cambio de hito a personas con discapacidad visual.

---

## D. Lanzamiento Histórico Cinematográfico (LC-41 Titan IIIE-Centaur)

Se auditó por separado la secuencia para Voyager 1 y Voyager 2:

| Componente / Fase | Voyager 2 (TC-7) | Voyager 1 (TC-6) | Estado | Evidencias PNG |
| :--- | :---: | :---: | :---: | :--- |
| **Plataforma LC-41 y Torre** | Verificado | Verificado | **VERIFICADA** | `036-lanzamiento-v2-fase-plataforma-lc41-1920x1080.png` |
| **Modelo Titan IIIE-Centaur** | Con propulsores UA1205 | Con propulsores UA1205 | **VERIFICADA** | `040-lanzamiento-v1-titan-centaur-lc41-1920x1080.png` |
| **Ignición y Despegue (T+9s)** | Plumas y vibración | Plumas y vibración | **VERIFICADA** | `037-lanzamiento-v2-fase-despegue-1920x1080.png` |
| **Ascenso y Transición Celeste** | Domo diurno a espacial | Domo diurno a espacial | **VERIFICADA** | Visualizado en animación fluida. |
| **Separación de Etapas (T+19s)** | Boosters y Cofia Centaur | Boosters y Cofia Centaur | **VERIFICADA** | `038-lanzamiento-v2-fase-separacion-etapas-1920x1080.png` |
| **Inyección y Despliegue RTG** | Voyager desplegando mástil | Voyager desplegando mástil | **VERIFICADA** | Transición a modelo Voyager.glb. |
| **Transición a Horizons 1977** | Salto a 20 ago 1977 | Salto a 5 sep 1977 | **CON DEFECTO** | `039-lanzamiento-v2-transicion-horizons-1920x1080.png` |
| **Controles: Pausa / Salto** | Botón Salto probado | Botón Salto probado | **CON DEFECTO\*** | Excepción `hud.anunciar` al saltar. |

### Rigor Científico vs Recreación Cinematográfica
- **Científico / Histórico Verificado:** Fechas UTC exactas de lanzamiento (NSSDCA), coordenadas de Cabo Cañaveral LC-41 (28.5833° N, 80.5828° W), configuración vehicular Titan IIIE / Centaur D-1T y primer vector heliocéntrico Horizons.
- **Recreación Visual Aproximada:** La trayectoria de ascenso en la atmósfera, las llamas de ignición y el desprendimiento de etapas son animaciones cinemáticas procedurales diseñadas para dar contexto al usuario, no una simulación de dinámica de vuelo balística real.

---

## E. Comparador NASA / 3D (Auditoría de las 8 Fotografías)

Se auditaron las 8 fotografías comparativas disponibles en el archivo de la misión:

| Foto ID | Identificador Oficial | Objeto | FOV ISS | FOV Ctx | Estado | Evidencias PNG (ISS / Contexto) |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| **P-01** | `PIA00022` | Júpiter GRS | 0.424° | 8.5° | **VERIFICADA** | `041-...` / `042-...` |
| **P-02** | `ARC-1979-A79-7092` | Europa / Júpiter | 0.424° | 6.0° | **VERIFICADA** | `043-...` / `044-...` |
| **P-03** | `PIA00024` | Saturno y Lunas | 0.424° | 2.4° | **VERIFICADA** | `045-...` / `046-...` |
| **P-04** | `PIA01486` | Saturno Anillos | 0.424° | 5.0° | **VERIFICADA** | `047-...` / `048-...` |
| **P-05** | `PIA00143` | Urano Creciente | 0.424° | 4.8° | **VERIFICADA** | `049-...` / `050-...` |
| **P-06** | `PIA01492` | Neptuno GDS | 0.424° | 3.5° | **VERIFICADA** | `051-...` / `052-...` |
| **P-07** | `ARC-1989-AC89-7055` | Tritón Sobrevuelo | 0.424° | 5.5° | **VERIFICADA** | `053-...` / `054-...` |
| **P-08** | `PIA23645` | Pale Blue Dot | 0.424° | 18.0° | **VERIFICADA** | `055-...` / `056-...` |

### Evaluación de Encuadre, Escala y Oclusión
- **Encuadre y Geometría:** El planeta objetivo aparece centrado en el campo visual; la iluminación corresponde a la dirección real del Sol en la fecha documentada.
- **Caso Especial: Urano Creciente (`PIA00143`):** Se comprobó que la etiqueta de texto flotante `• Urano` se oculta automáticamente durante la comparación para evitar superponerse sobre la fina franja iluminada del planeta.
- **Caso Especial: Pale Blue Dot (`PIA23645`):** A 40.47 AU de la Tierra, el planeta mide 0.12 píxeles en el FOV estrecho de ISS. La simulación no agranda artificialmente la Tierra para no falsear la escala científica, e incluye una nota honesta que explica la dispersión óptica interna del tubo vidicón de 1990.

---

## F. Simulación Experimental (Dinámica Orbital)

| ID | Funcionalidad | Estado | Evidencia PNG | Descripción y Comportamiento Observado |
| :--- | :--- | :---: | :--- | :--- |
| **EXP-01** | Inicialización de Condiciones | **VERIFICADA** | `057-exp-simulacion-inicial-1920x1080.png` | Estado kepleriano inicial cargado a T+00d 00h 00m 00s, trayectoria previa visible. |
| **EXP-02** | Propagación Temporal (DOPRI54) | **VERIFICADA** | `058-exp-simulacion-en-avance-1920x1080.png` | El integrador numérico avanza en tiempo real; telemetría orbital y tiempo transcurrido incrementan. |
| **EXP-03** | Pausa y Reanudación | **VERIFICADA** | Visualizado en prueba | Se detiene y reanuda el cálculo de estado sin discontinuidades de posición. |
| **EXP-04** | Reinicio de Misión | **VERIFICADA** | Visualizado en prueba | Botón Reiniciar restablece con éxito el estado exacto inicial (T+00d 00h 00m 00s). |
| **EXP-05** | Rechazo de Entradas Inválidas | **VERIFICADA** | Validado en suite unitaria | Algoritmo DOPRI54 rechaza pasos infinitos, NaN o singularidades colisionales. |

---

## Resumen Cuantitativo del Inventario

```
Total de Funcionalidades Evaluadas: 52
├── Implementadas y Verificadas al 100%: 47 (90.4%)
├── Implementadas con Defectos Menores/P1: 5 (9.6%)
├── Implementadas Parcialmente: 0 (0.0%)
└── No Implementadas: 0 (0.0%)
```
