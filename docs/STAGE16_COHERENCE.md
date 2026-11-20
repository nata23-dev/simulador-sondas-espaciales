# Etapa 16 — Coherencia del laboratorio y misión guiada

Fecha: 2026-11-20 · Rama: `revision/modo-historico-voyager` · Base: 15.1 (`308b60d`).

Petición del usuario: «Realiza la etapa de coherencia, asegúrate de que lo que tenemos funciona correctamente, mejora la interfaz del laboratorio, más ordenado, fácil de entender para nuevos usuarios, podemos agregar una guía en una misión que sí funciona…».

La etapa no cambia la física, las constantes, los marcos, el integrador DOPRI54, los datos, los hashes ni los modelos 3D. Corrige incoherencias entre la flota fija de 15.1 (Voyager, Cassini, Dawn y Juno) y las herramientas que la usan, reordena el laboratorio y añade una misión guiada sobre un escenario que el modelo completa.

## 1. Incoherencias corregidas

Salen del análisis previo del laboratorio. Cada fila tiene una prueba en `tests/Stage16Coherence.test.mjs` o una comprobación en el navegador.

| Problema en 15.1 | Corrección en 16 |
| --- | --- |
| El lanzador demostrativo pone ≈ 2 800 kg en órbita. Cassini (5 606 kg) y Juno (3 625 kg) acababan en «IMPACTO CONFIRMADO» sin explicación. | Hay un segundo lanzador ilustrativo, «Pesado · demostrativo ×2,5»: el mismo cohete con masas y empujes ×2,5 y área frontal ×2,5^(2/3), con la misma Isp, Cd y relación empuje/peso. Al cambiar de sonda se elige el lanzador recomendado. La interfaz muestra la capacidad estimada (por bisección con el mismo `simulateLaunch`). Si la carga la supera, lo dice y propone el lanzador pesado. |
| Tierra–Luna partía de 200 km y ninguna sonda llegaba con ese valor. El botón «Ejecutar» seguía activo con un plan no viable. | Ahora parte de 100 000 km y muestra un consejo para la sonda activa, con un botón «Usar N km» cuando conviene. Voyager necesita 150 000 km. Cassini es viable desde ≈ 50 000 km y Juno desde la órbita geoestacionaria. Dawn sale «no verificable» a cualquier altitud. «Ejecutar» solo se activa con un plan viable y vigente; el motivo aparece en la información emergente. El selector solo ofrece la Luna, sin destinos «pendientes». |
| Con Dawn, la búsqueda interplanetaria comparaba sus 13 km/s de Δv ideal con la inyección y daba «suficiente», algo imposible con 92 mN. | Con propulsión eléctrica, la comprobación da «NO VERIFICABLE CON PROPULSIÓN ELÉCTRICA» y conserva las dos cifras, igual que en Tierra–Luna. |
| La ficha de los satélites decía «Descenso local: OPERATIVO» y «etapas pendientes», aunque desde 15.1 no hay módulos de aterrizaje. | Ahora la ficha dice que esta herramienta solo busca ventanas hacia planetas. Lleva a «Misión completa» (Europa, por ejemplo) o a buscar ventanas hacia el planeta del satélite. La función del motor y su prueba siguen igual. |
| Las pestañas «Hangar» e «Ingeniería» mostraban la misma pantalla. | Se retira la pestaña «Ingeniería». El enlace antiguo `engineering` abre el Hangar y desplaza la vista a la ingeniería. |
| «Ver simulación orbital» parecía usar la sonda activa. | Se llama «Demostración orbital», y su descripción y su información emergente dicen que es la Sonda Experimental 01 ficticia (DOPRI54). |
| En la misión completa no se sabía qué escenarios funcionan con cada sonda. «Personalizado» parecía otra sonda. | Los escenarios se agrupan por destino con nombres claros. Un recuadro de resultado esperado indica si la sonda activa completa el escenario según el modelo, por qué no, y qué sondas lo completan. Las 20 combinaciones se comprueban con el mismo motor. «Personalizado» pasa a llamarse «Personalizado (tus propios valores)». |
| En el Centro de Misión aparecía el contexto «Aterrizaje» aunque ninguna misión llega a la superficie. | El botón de ese contexto se oculta cuando la misión no tiene tramo de aterrizaje. |
| En el Hangar, seleccionar un subsistema no resaltaba nada en el modelo de NASA. | Una nota explica que el modelo oficial es una sola pieza. |
| El resumen de la cabecera (masa · Δv) se cortaba. | El texto es más corto y puede pasar a una segunda línea. |
| A 1366 px, la fila «Control · Telemetría · Vista amplia» del Centro de Misión quedaba debajo de la barra de cámaras. | En pantallas anchas esa fila ya no se parte en dos; el rótulo se recorta antes. |
| `scrollIntoView` desplazaba contenedores con `overflow:hidden`: el laboratorio subía y dejaba una franja vacía. Ocurría con la guía y con el enlace a ingeniería. | `revealInScrollAreas` desplaza la vista y devuelve los contenedores sin barra a su posición. |

## 2. Laboratorio en tres pasos

La barra de secciones sigue el flujo real: **1 Elegir sonda** (Hangar) → **2 Planificar** (Misión completa, Ventanas interplanetarias, Tierra–Luna, Lanzamiento) → **3 Reproducir** (Centro de Misión), con el botón dorado «Misión guiada» a la derecha. Desaparece la segunda fila de modos del planificador: cada modalidad tiene su propio botón. El mapa de áreas (`AppNavigator`) usa los mismos tres grupos.

En el Hangar, una tarjeta de bienvenida («¿Primera vez en el laboratorio?») abre la guía.

«Misión completa» ahora muestra primero lo esencial:

1. tres pasos numerados;
2. el escenario;
3. el resultado esperado con la sonda activa;
4. «Calcular misión» y «Reproducir».

Las fechas, el destino y las órbitas están en «Ajustar destino, fechas y órbitas», un bloque plegable. El grupo «Vehículo» se retira porque la sonda se elige en la cabecera.

La portada sustituye la tarjeta de lanzamiento por «Tu primera misión: Cassini a Marte», que abre la guía. La tarjeta de Europa indica que está pendiente de auditoría independiente.

Se retiran los selectores CSS de los controles eliminados en 15/15.1 (catálogo de piezas, adaptadores, importación y exportación, sección de descenso, modos del Hangar y del planificador) de `experimental-laboratory.css` y `theme.css`. Se conservan los que comprueban las pruebas de 12D.1. Los estilos nuevos usan los tokens de 14.1 (grafito, dorado para misiones, verde y ámbar siempre acompañados de texto) y respetan `prefers-reduced-motion`.

## 3. Misión guiada

`src/ui/LabGuidedMission.js` muestra una tarjeta fija abajo a la derecha (a todo el ancho en móvil) y resalta en dorado el control que hay que usar. La misión es **Cassini · escenario A1 (órbita elíptica de 3 000 × 100 000 km en Marte)**. Según el modelo, Cassini y Juno son las sondas que completan ese escenario.

| Paso | Qué se pide | Se marca hecho cuando… |
| --- | --- | --- |
| Intro | Explica el recorrido | — |
| 1 | Elegir Cassini en el Hangar | la sonda activa es Cassini |
| 2 | Abrir «Misión completa» | la sección activa es esa modalidad |
| 3 | Elegir el escenario A1 | `#im-scenario` vale A1 |
| 4 | Calcular | hay un resultado completo y vigente |
| 5 | Reproducir en el Centro de Misión | el Centro tiene la misión integrada |
| Final | Propone seguir con Voyager (no puede frenar) o con Juno hacia Júpiter y Europa | — |

Cada paso se puede hacer a mano o con «Hazlo por mí», que usa los mismos controles de la interfaz y no tiene atajos internos. Al completar una acción, la guía avanza sola. La tarjeta tiene botones para minimizarla, salir y volver al paso anterior.

## 4. Resultado esperado con cada sonda

Fuente: `src/lab/FleetGuide.js`. La prueba ejecuta cada combinación con `computeIntegratedMission` y los mismos datos del formulario (`integratedMissionInput`). Si cambia un parámetro del catálogo o del motor y el texto deja de corresponder, la prueba falla.

| Escenario | Voyager | Cassini | Dawn | Juno |
| --- | --- | --- | --- | --- |
| A1 · Marte, elíptica 3 000 × 100 000 km | no (agota la hidracina) | **sí** | no (motor iónico) | **sí** |
| A2 · Marte, circular 400 km (exigente) | no | no | no | no |
| A3 · Marte, sobrevuelo | **sí** | **sí** | **sí** | **sí** |
| C1 · Júpiter tipo Juno + sobrevuelo de Europa | no | **sí** | no (sin potencia a 5,2 AU) | **sí** |
| C2 · Júpiter + captura en Europa (exigente) | no | no | no | no |

Tierra–Luna (`LUNAR_GUIDE`), altitud de la órbita inicial:

| Sonda | Altitud recomendada | Estado | Altitud mínima viable |
| --- | --- | --- | --- |
| Voyager | 150 000 km | viable | ≈ 150 000 km |
| Cassini | 100 000 km | viable | ≈ 50 000 km |
| Dawn | 100 000 km | no verificable | ninguna con impulso ideal |
| Juno | 100 000 km | viable | órbita geoestacionaria (35 786 km) |

Lanzamiento (programa de ascenso por defecto):

| Lanzador | Capacidad nominal | Capacidad por bisección | Sondas que pone en órbita |
| --- | --- | --- | --- |
| Ligero | 2 800 kg | ≈ 2 813 kg | Voyager y Dawn |
| Pesado ×2,5 | 6 900 kg | ≈ 6 934 kg | las cuatro |

«Viable / completa según el modelo» no equivale a éxito operativo. Los lanzadores son ilustrativos.

## 5. Archivos

- Lógica:
  - `src/lab/LaunchVehicle.js`: `scaleLauncher`, `HEAVY_DEMO_LAUNCHER`, `LAUNCHER_PRESETS` y `recommendedLauncherPreset`.
  - `src/lab/LaunchPlan.js`: `estimatePayloadCapacityKg`.
  - `src/lab/InterplanetaryPlan.js`: comprobación «no verificable» con propulsión eléctrica.
  - `src/lab/FleetGuide.js` (nuevo).
- Interfaz:
  - `src/ui/ExperimentalLaboratory.js`, `src/ui/LabGuidedMission.js` (nuevo) y `src/ui/IntegratedMissionPlanner.js`.
  - `src/ui/LaunchPlanner.js`, `src/ui/MissionPlanner.js` y `src/ui/InterplanetaryPlanner.js`.
  - `src/ui/MissionControlCenter.js`, `src/ui/AppNavigator.js` y `src/ui/FeaturedMissions.js`.
  - `src/ui/experimental-laboratory.css` y `src/ui/theme.css`.
- Pruebas y evidencia: `tests/Stage16Coherence.test.mjs` (11 pruebas), `scripts/verify-stage16-browser.mjs` y `evidence/stage16/`.

## 6. Verificación

- `node --test tests/*.test.mjs`: **298/298**, que son las 287 anteriores más 11 nuevas. No se ha eliminado ni relajado ninguna prueba.
- `npm run build`: correcto, con el mismo aviso de tamaño de bloque que antes. `git diff --check`: limpio.
- Navegador: `scripts/verify-stage16-browser.mjs`, Chrome sin interfaz con SwiftShader, una instancia, evidencia en `evidence/stage16/`. El resultado está en la sección 7.

## 7. Resultado en el navegador

Pasada del 2026-11-20, con el servidor de desarrollo ya abierto y una sola instancia de Chrome:

- `stage16-browser-all.json`: recorrido guiado, herramientas y responsive. Sin errores de consola ni desbordamiento horizontal.
- `stage16-browser-responsive.json`: responsive repetido después de ajustar la barra de secciones a 1340 px o menos. Las capturas `r*` son de esta pasada.

1. **Misión guiada a 1366 × 768** (capturas `g1366_*`):
   - Se entra desde la tarjeta de portada «Tu primera misión: Cassini a Marte» con almacenamiento limpio. La sonda por defecto es Cassini y el modelo de NASA carga.
   - Cada paso se marca «✓ Hecho» al hacerlo a mano (sonda, modalidad, escenario A1 ya elegido). El cálculo se hizo con «Hazlo por mí» y la guía avanzó sola.
   - Veredicto: «CADENA CALCULADA COMPLETA SEGÚN EL MODELO (cónicas parcheadas). Viabilidad operativa: no verificada.» La cadena tiene inyección, crucero, aproximación, captura con empuje finito y energía.
   - «Reproducir en el Centro de Misión» completa el paso 5. El Centro muestra «Misión completa · Tierra → Marte (2028-11-29)», con el contexto «Aterrizaje» oculto. «Terminar» cierra la guía.
2. **Herramientas con las cuatro sondas a 1600 × 900** (capturas `t1600_*`):
   - Lanzamiento: Cassini y Juno usan el lanzador pesado y Voyager y Dawn el ligero; las cuatro alcanzan órbita. Con el ligero, Cassini da «IMPACTO CONFIRMADO» y se explica: 5 606 kg frente a ≈ 2 813 kg, con la propuesta del pesado.
   - Tierra–Luna: solo ofrece la Luna, a 100 000 km. Cassini y Juno son viables; Voyager, con «Usar 150 000 km», también. Dawn sale «NO VERIFICABLE», con «Ejecutar» desactivado y el motivo en la información emergente.
   - Interplanetario: Dawn da «NO VERIFICABLE CON PROPULSIÓN ELÉCTRICA». Europa remite a «Misión completa».
   - Misión completa: el resultado esperado de A1 y C1 coincide con la tabla de la sección 4 para las cuatro sondas. C1 con Juno da la cadena completa según el modelo.
   - «Demostración orbital»: se abre con ese nombre y vuelve al planificador.
3. **Responsive** en 320 × 568, 375 × 667, 390 × 844, 768 × 1024, 1280 × 720, 1366 × 768 y 1920 × 1080 (capturas `r*`): Hangar con la guía, «Misión completa» con la guía y la guía minimizada.
   - Ningún botón de la barra, de la guía ni del resultado esperado queda recortado.
   - Ningún botón de la barra de secciones se sale de la ventana. A 1280 px «Misión guiada» pasa a la segunda fila; antes de este ajuste quedaba cortado.

Cómo se hacen los clics: Chrome con SwiftShader se queda a veces sin fotogramas (ver la sección 8). Por eso el guion pulsa con el ratón en el centro de cada control, después de comprobar que es visible, está activo y nada lo tapa. Las esperas mueven el puntero.

## 8. Límites y pendientes

- **Auditoría y revisión:** falta la auditoría independiente de Gemini y la revisión con GPU real. La verificación en el navegador se hizo con SwiftShader.
- **Fotogramas en Chrome sin interfaz:** a veces Chrome con SwiftShader deja de producir fotogramas al cambiar de herramienta. No se pierde ningún contexto WebGL y un movimiento del ratón los reanuda. También ocurre con la versión 15.1 (compilación de `308b60d` probada aparte), así que no lo introduce esta etapa. El guion hace clics reales del ratón después de comprobar que el control es visible, está activo y no tiene nada encima. Falta confirmarlo con GPU.
- **Lanzador pesado:** es una escala ilustrativa del demostrativo, no un cohete real. La capacidad depende del programa de ascenso por defecto, y al cambiar ese programa la cifra mostrada es solo orientativa.
- **Textos de la guía y del resultado esperado:** son fijos, pero las pruebas los comparan con el motor.
- **Código conservado a propósito:** `LandingPlanner.js` sigue en el repositorio (lo inspecciona una prueba de 12F.1). La función interplanetaria aún devuelve `localOperations` (lo comprueba `InterplanetaryPlanning.test.mjs`), aunque la interfaz ya no lo muestra.
- **Cabecera global a 768 px:** el nombre del simulador queda debajo de las pestañas de modo. Ya ocurría en 15.1 (`evidence/stage15_1/r768x1024_01_hangar_juno.png`). Es la cabecera común, no el laboratorio, y no se ha cambiado en esta etapa.
- **Orden en tablet y móvil:** en una sola columna, la escena aparece antes que los controles del planificador, como en etapas anteriores. La guía desplaza la vista hasta el control indicado.
- **Publicación:** los cambios se suben a la rama de trabajo, no a `main`. El despliegue en GitHub Pages solo ocurre al publicar en `main` y no se ha autorizado.
