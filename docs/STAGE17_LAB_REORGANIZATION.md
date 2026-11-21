# Etapa 17 — Reorganización del laboratorio en tres etapas

Fecha: 2026-11-20 · Rama: `revision/modo-historico-voyager` · Base: 16 (`582d7db`).

Petición del usuario: «Reorganización integral del Laboratorio de Misiones y unificación visual del simulador». El laboratorio pasa a tener un panel lateral con tres etapas (1 Elegir sonda → 2 Planificar → 3 Reproducir), pestañas dentro de cada etapa, una barra de resumen «Sonda · Destino · Estado» y reglas que impiden reproducir una trayectoria que no existe o que se calculó con otro vehículo. La petición pedía implementarlo en el proyecto, no proponerlo.

**Lo que no cambia:**

- la física, las constantes, los marcos y el integrador DOPRI54;
- los datos, las efemérides, los hashes, los kernels y las fotografías existentes;
- los modelos 3D de NASA (incluido `Voyager.glb`).

Las herramientas de las etapas 12–16 son las mismas. Cambia dónde están, cómo se llega a ellas y qué estados muestran.

En `src/lab/` no cambia ningún cálculo. Lo que cambia:

- **Presentación:** `ProbeAssemblyView.js` añade el esquema técnico y `MissionExecutionView.js` avisa del modelo cargado.
- **Dos módulos nuevos:** `FleetDocuments.js`, con los documentos y su procedencia, y `ExperimentalAssembly.js`, con el ensamblaje experimental.
- **`designSignature`:** ahora distingue un ensamblaje experimental de la sonda histórica de la que parte (sección 6). Es la identidad del vehículo que sirve para invalidar cálculos, no un cálculo. Las firmas de las configuraciones históricas no cambian.

No se añaden aterrizajes, exploración de superficie ni vehículos tripulados.

## 1. Estructura: panel de etapas y pestañas

`src/ui/LabStages.js` (nuevo, sin DOM) define las tres etapas y sus pestañas. Lo usan `ExperimentalLaboratory.js`, la misión guiada, el menú de áreas y las pruebas.

| Etapa | Pestañas | Qué hay |
| --- | --- | --- |
| **1 · Elegir sonda** | Vista general · Arquitectura y componentes · Planos y documentación · Ingeniería | Flota histórica (Voyager, Cassini, Dawn, Juno) o ensamblaje experimental, modelo 3D, documentos oficiales y capacidades. |
| **2 · Planificar** | **Misión completa** (principal) · Ventanas interplanetarias · Tierra–Luna y empuje finito · Lanzamiento terrestre | El flujo principal y las herramientas. Cada pestaña dice si sus fases están conectadas («Fases conectadas en un solo cálculo») o si es una herramienta independiente. El lanzamiento indica además que no se encadena con «Misión completa». |
| **3 · Reproducir** | Reproducción · Cámaras · Telemetría · Trayectoria y maniobras · Eventos · Resultados | El Centro de Misión. Las pestañas son sus paneles (`MC_PANES`). |

**Panel lateral (`aside.lab-rail`):**

- Cada etapa muestra su número, su nombre y su estado (por ejemplo, «Misión completa · misión viable según el modelo»). El progreso se marca con `data-progress` = `todo`, `busy`, `ready` o `done`.
- Debajo están las acciones «Iniciar misión guiada», «Demostración científica» y «Glosario».
- El panel se pliega a una columna de iconos de 66 px. La preferencia se guarda en `simulador:panel-etapas` y el panel empieza abierto a partir de 1200 px.
- En 820 px o menos se convierte en una fila de tres pasos sobre el contenido. En 420 px o menos el número va encima del nombre, para que los tres pasos quepan completos incluso a 320 px.

**Navegación:**

- Solo se muestra el contenido de la etapa activa. Al volver a una etapa se recupera la última pestaña usada en ella.
- La sonda, los formularios y la misión preparada se conservan al cambiar de etapa o de pestaña, porque las herramientas no se vuelven a crear.
- Arriba hay una ruta «Laboratorio › n · Etapa › Pestaña», con el título y la descripción de la pestaña.
- En móvil, al elegir una pestaña de «Elegir sonda» o «Reproducir» la vista baja hasta su contenido, que queda debajo de la escena.

**Compatibilidad:**

- `lab:navigate` acepta `{ stage, tab }` y también los nombres antiguos `section` y `plannerMode`.
- `AppNavigator` añade `stage` y `tab` a cada área, con una entrada nueva, «Planos y documentación». «Hangar» pasa a llamarse «Elegir sonda».

## 2. Etapa 1 · Elegir sonda

**Vista general:**

- Tarjeta de bienvenida con «Iniciar misión guiada».
- Selector «Configuración histórica / Ensamblaje experimental».
- Lista de la flota y ficha histórica con la calidad y la fuente de cada cifra.

**Arquitectura y componentes:**

- Los subsistemas se agrupan por función según `ARCHITECTURE_GROUPS`: estructura, propulsión, depósitos, antenas, instrumentos científicos, energía, control de actitud y sistemas electrónicos.
- Hay dos vistas, «Modelo de NASA» y «Esquema técnico». El modelo oficial es una sola malla y no se trocea.
- Para localizar una pieza se cambia al esquema técnico, que es la reconstrucción procedimental de la etapa 15 con la pieza resaltada. Se rotula así: «Esquema técnico del simulador… No es un plano de NASA».

**Planos y documentación:**

- `src/lab/FleetDocuments.js` y `public/images/fleet/` contienen un diagrama rotulado y una fotografía oficial de NASA/JPL por sonda. Son 8 imágenes, cada una con su miniatura.
- Cada imagen muestra su tipo, título, descripción, crédito, fecha y enlace a la página de origen. Se amplía en un diálogo.
- Una tarjeta aparte, «Reconstrucción técnica del simulador», distingue el esquema 3D del material auténtico.
- `public/images/fleet/README.md` recoge la descarga, el procesado y el SHA-256 de cada original, además de las dudas de fecha o de crédito.
- Las rutas se construyen con `import.meta.env.BASE_URL`. No se incluyen planos de fabricación.

**Ingeniería:**

- Primero, un resumen de siete tarjetas: masa total, propelente, Δv disponible, propulsión, generación eléctrica, autonomía por batería y compatibilidad.
- Debajo, el veredicto y el detalle plegable: masas, propulsión y actitud, potencia, compatibilidades y calidad de los datos. Se conservan las calidades documentado, fuente secundaria, derivado, estimado y desconocido.
- Un dato que falta se muestra como «No disponible» y no se rellena.

**Ensamblaje experimental** (`src/lab/ExperimentalAssembly.js`, nuevo):

- Parte de la configuración histórica de una sonda (el «bus de partida») y permite cambiar cada punto de montaje por una pieza de herencia de otra sonda. No admite piezas ilustrativas, de aterrizaje, herramientas ni otro bus.
- Reutiliza las reglas de la etapa 15: herraje, envolvente, adaptador con masa estimada y propelente compatible. La ingeniería lo verifica con las mismas reglas que a la flota.
- Se marca siempre como hipotético:
  - un recuadro «Vehículo experimental»;
  - la lista de diferencias con la configuración histórica;
  - una advertencia en Ingeniería;
  - el esquema técnico en lugar del modelo de NASA, rotulado «no hay modelo oficial de esta combinación».
- Las configuraciones históricas no se pueden modificar.
- Se guarda en `simulador:ensamblaje-experimental` y solo se recupera si sigue siendo válido. El modo activo (histórico o experimental) se guarda en `simulador:vehiculo-activo`.

## 3. Etapa 2 · Planificar

**«Misión completa»** (`IntegratedMissionPlanner.js`) es el flujo principal. Muestra un recorrido de siete pasos (`#im-flow`): destino → fechas → tipo de misión → calcular trayectoria → maniobras → recursos y viabilidad → preparar la reproducción. Cada paso se marca hecho, actual, pendiente, en cálculo o fallido.

La información tiene tres niveles:

1. **Básico:** escenario, resultado esperado con la sonda activa, destino, satélite, salida (UTC), vuelo y tipo de misión.
2. **Avanzado:** «Configuración avanzada», plegable, con la oportunidad, la esfera de influencia, el periapsis y el apoapsis, el plano B y el satélite.
3. **Resultados técnicos:** «Resultados técnicos», plegable, con la cadena, las fases, las maniobras, la masa, la energía, la aproximación, la continuidad y la comparación.

El resultado principal (`#im-brief`) explica, en este orden:

- la misión;
- el vehículo;
- la trayectoria;
- la duración;
- las maniobras;
- los recursos;
- la viabilidad;
- las restricciones;
- si hay reproducción 3D.

**Herramientas:** Ventanas interplanetarias, Tierra–Luna con empuje finito y Lanzamiento siguen como herramientas independientes, con su rótulo. Una nota en «Misión completa» separa las fases conectadas de las que no lo están (el lanzamiento y la inyección C3).

**Cobertura:**

- Se muestra la ventana real de efemérides, y las fechas del formulario se limitan a ella.
- La nota explica que la fecha se escribe en UTC y se calcula en TDB, unos 69 s por delante.
- No se extrapola.

**Sin reproducción cuando no hay trayectoria ejecutable:**

- Algunas cadenas se calculan pero no se pueden reproducir. Por ejemplo, Dawn en Marte A1 y A2: la captura iónica alarga la cadena a ≈ 771 d y termina después de la ventana de efemérides cargada.
- En ese caso se conserva el resultado y se desactiva «Reproducir en el Centro de Misión».
- El mensaje y la fila «Reproducción 3D» dicen por qué.
- El paso 7 se marca fallido y el estado global dice «… · sin reproducción 3D disponible».
- El gráfico indica que no está disponible.

## 4. Etapa 3 · Reproducir

**Centro de Misión:**

- Se conservan las seis cámaras, los controles de tiempo, los eventos y la telemetría.
- La cámara local solo aparece en las misiones con escena local (lanzamiento o descenso). La regla es anterior a esta etapa y no cambia.
- Cada pestaña de la etapa abre el panel correspondiente del Centro mediante `center.setPane`.

**La sonda en la escena:**

- La tarjeta «Vehículo en la escena» dice qué sonda se reproduce y qué modelo se usa:
  - el oficial de NASA de esa sonda;
  - el respaldo procedimental, si no carga;
  - la reconstrucción técnica, si el vehículo es experimental.
- El HUD de la escena y la pestaña Telemetría leen el mismo estado muestreado.

**Paneles y vista inmersiva:**

- «Panel» oculta el panel lateral sin parar la reproducción.
- «Vista inmersiva» oculta también el panel de etapas, la cabecera del laboratorio y las pestañas. Se sale con Escape o con «Salir».

**Demostración científica:**

- Es la Sonda Experimental 01, ficticia, con DOPRI54. Sigue siendo independiente: no usa la sonda activa ni toca la misión preparada.
- Al volver al laboratorio se recupera el mismo estado.

## 5. Barra de resumen y estados

La barra «Sonda · Destino · Estado» está en la cabecera del laboratorio. Desde ella se cambia la sonda (las cuatro de la flota o «Experimental») y se ven la masa y el Δv. Se actualiza al cambiar de sonda, al calcular y durante la reproducción, con un sondeo de 500 ms y un aviso inmediato del planificador al empezar y terminar un cálculo.

| Estado | Texto |
| --- | --- |
| sin sonda | «Sin sonda seleccionada» |
| seleccionada | «Sonda seleccionada · lista para planificar» |
| calculando | «Calculando trayectoria…» |
| completada y viable | «Misión viable según el modelo · lista para enviar a Reproducir» |
| incompleta | «Calculada: objetivos no alcanzados» |
| no viable | «Misión no viable según el modelo» |
| sin reproducción | «… · sin reproducción 3D disponible» |
| lista | «Lista para reproducir» |
| en curso | «Reproducción en curso» |
| en pausa | «Reproducción en pausa» |
| finalizada | «Simulación finalizada» |
| interrumpida | «Reproducción interrumpida» |
| invalidada | «Resultado invalidado: recalcula» |
| error | «Error de carga o de cálculo» |

Sin una trayectoria ejecutable no se muestran los controles de reproducción. El Centro enseña un estado vacío con el motivo y el botón «Volver a «2 · Planificar»».

## 6. Invalidación: nunca se reproduce otro vehículo

La misión preparada y la reproducción quedan invalidadas cuando la firma del vehículo activo ya no coincide con la del vehículo calculado. Ocurre al cambiar de sonda, al cambiar una pieza del ensamblaje experimental y al pasar de histórico a experimental, o al revés.

Al invalidarse:

- el Centro se vacía;
- el motivo dice con qué vehículo se calculó: «Cambiaste de vehículo después de preparar la misión (calculada con X). Para no reproducir estados de otro vehículo, recalcula en «2 · Planificar».»;
- el estado pasa a «Resultado invalidado: recalcula».

Esto se aplica en tres niveles:

1. **El laboratorio** compara `designSignature` antes de pasar el nuevo diseño a los planificadores.
2. **Los planificadores** descartan su resultado si ya no es vigente.
3. **`createIntegratedExecution`** rechaza un resultado cuya firma no es la del diseño («El cálculo quedó obsoleto tras cambiar la sonda»).

`designSignature` añade `experimental: true` solo para los ensamblajes experimentales. Sin eso, un ensamblaje recién creado, con las mismas piezas que Cassini, se habría tomado por la Cassini histórica: se habría reproducido con su modelo de NASA y con su nombre.

## 7. Información y unidades

**Glosario** (`src/ui/LabGlossary.js`):

- 16 términos, entre ellos Δv, Isp, C3, v∞, periapsis, SOI, plano B, TDB/UTC, Lambert, DOPRI54, RTG, centro de masas y efemérides.
- Aparecen como ayuda contextual sobre las etiquetas que ya existen, al pasar el puntero, al enfocarlas o al tocarlas, y en un diálogo completo. Ningún texto ni cálculo cambia.

**Unidades y tiempo:**

- Las fechas de entrada se rotulan «(UTC)» y la cobertura explica la conversión a TDB.
- La telemetría conserva sus unidades: km, km/s, AU y kg.
- Los tres niveles de información son los de la sección 3. En la ficha de cada sonda se conserva la calidad de cada dato.

## 8. Unificación visual y responsive

`src/ui/lab-shell.css` (nuevo) se carga después de `theme.css`. Usa el lenguaje de 14.1:

- negro y grafito;
- Inter;
- dorado para misiones, para la etapa activa y para el subrayado de la pestaña;
- verde y ámbar siempre acompañados de texto.

La cabecera del laboratorio sigue el patrón de la del modo histórico: ruta, título y pestañas subrayadas.

Tamaños comprobados: 320 × 568, 375 × 667, 390 × 844, 768 × 1024, 1280 × 720, 1366 × 768 y 1920 × 1080.

Ajustes para móvil:

- los pasos del panel en columna;
- la descripción de la pestaña limitada a dos líneas;
- el selector de sonda con un ancho mínimo legible;
- el estado de la escena como texto compacto, para que no tape la barra de cámaras.

**Cabecera común** (`theme.css` e `index.html`), corregida al final de la etapa:

- **Entre 761 y 1100 px:** la caja del título medía 175 px y el texto, en una línea, 294 px. El sobrante quedaba oculto bajo las pestañas de modo: 113 px a 768 y 6 px a 900, medido en Chrome. Ahora el nombre ocupa dos líneas y no se solapa con nada en ninguna anchura.
- **Hasta 760 px:** el nombre ya no se corta con puntos suspensivos («SIMULADOR DE SONDAS ES…»). Ocupa dos líneas y la segunda solo se recortaría si aun así no cupiera. Por debajo de 420 px los iconos se separan 8 px en lugar de 18, y así el nombre completo cabe también a 320 px.
- **Icono de la marca:** es decorativo y se oculta a la accesibilidad (`aria-hidden`), porque el nombre ya lo da el título.

**Contraste:** sobre el fondo dorado de la tarjeta de la sonda activa y del vehículo en la escena, el texto gris terciario quedaba en 4,39:1. Pasa al gris secundario, que supera el 4,5:1 de WCAG AA.

## 9. Archivos

**Nuevos:**

- `src/ui/LabStages.js`, `src/ui/LabGlossary.js` y `src/ui/lab-shell.css`;
- `src/lab/FleetDocuments.js` y `src/lab/ExperimentalAssembly.js`;
- `public/images/fleet/`: 8 imágenes, 8 miniaturas y `README.md`;
- `tests/Stage17LabReorganization.test.mjs`, con 13 pruebas;
- `scripts/verify-stage17-browser.mjs` y `evidence/stage17/`.

**Modificados:**

- `src/ui/ExperimentalLaboratory.js`, reescrito: panel de etapas, pestañas, barra de resumen, documentos, ensamblaje experimental e invalidación;
- `src/ui/IntegratedMissionPlanner.js`: recorrido, niveles, resultado principal, cobertura y reproducción no disponible;
- `src/ui/MissionControlCenter.js`: paneles, vehículo en la escena, panel ocultable y vista inmersiva;
- `src/ui/LabGuidedMission.js`, `src/ui/AppNavigator.js`, `src/ui/MissionPlanner.js`, `src/ui/InterplanetaryPlanner.js` y `src/ui/LaunchPlanner.js`;
- `src/lab/ProbeAssemblyView.js` (opción `procedural` para el esquema técnico), `src/lab/MissionExecutionView.js` (aviso del modelo cargado) y `src/lab/MissionPlanStore.js` (firma de los ensamblajes experimentales);
- `src/main.js`, que importa `lab-shell.css`;
- `src/ui/theme.css`:
  - se retiran las reglas de la barra de la etapa 16, que ya no se genera;
  - la cabecera común pasa a dos líneas entre 761 y 1100 px y en móvil;
- `index.html`: el icono de la marca se marca como decorativo.

## 10. Verificación

**Pruebas y compilación:**

- `node --test tests/*.test.mjs`: **311/311**, las 298 anteriores más 13 nuevas. No se ha eliminado ni relajado ninguna prueba.
- Las pruebas nuevas cubren:
  - la estructura de etapas y pestañas;
  - el menú de áreas;
  - los cinco pasos de la guía con su objetivo dinámico;
  - los documentos y sus archivos (el SHA-256 de la copia sin recomprimir coincide con el del README);
  - los grupos de arquitectura y el glosario;
  - el ensamblaje experimental: la configuración histórica no cambia, el adaptador se tiene en cuenta, cambia la firma y se recupera solo si es válido;
  - que `createIntegratedExecution` rechaza un resultado calculado con otro vehículo, incluido un ensamblaje experimental idéntico a Cassini;
  - Dawn A1: el resultado es NO VIABLE y no hay reproducción («Efemérides no disponibles»), mientras que A3 sí se reproduce;
  - la presencia de los controles del planificador;
  - en el código fuente, la cabecera en dos líneas, el icono decorativo y el contraste de la tarjeta activa.
- `npm run build` y `GITHUB_PAGES=true npm run build`: correctos, con el mismo aviso de tamaño de bloque que antes.
- `git diff --check`: limpio. Los archivos nuevos no tienen espacios al final de línea.

**Navegador:**

- Guion: `scripts/verify-stage17-browser.mjs`.
- Entorno: Chrome sin interfaz con SwiftShader, una sola instancia, contra el servidor de desarrollo ya abierto.
- Evidencia: `evidence/stage17/`, con un JSON por parte del guion y las capturas.
- Resultado: ninguna parte terminó con errores de consola ni del guion, ni con desbordamiento horizontal.
- Todas las partes se repitieron al final, una tras otra, con el código definitivo (incluida la corrección de la cabecera).

**Accesibilidad automática** (parte `a11y`, a 1366 × 768): es una revisión automática y no sustituye a una prueba con lector de pantalla.

- Recorre 18 vistas:
  - las cuatro pestañas de «Elegir sonda» y el ensamblaje experimental;
  - el glosario y la ampliación de un documento;
  - las cuatro herramientas de «Planificar»;
  - las seis pestañas de «Reproducir» con Cassini A1 en curso.
- En cada vista comprueba:
  - el nombre accesible que calcula Chrome, leído del árbol de accesibilidad por CDP, para botones, enlaces, campos, pestañas, imágenes y diálogos;
  - referencias ARIA rotas e identificadores duplicados;
  - imágenes sin texto alternativo y controles enfocables dentro de zonas ocultas a la accesibilidad;
  - el contraste WCAG del texto sobre fondo sólido (los textos sobre imágenes, degradados o la escena 3D no se pueden calcular y se omiten).
- Además recorre cada etapa con el tabulador: 44 pulsaciones y entre 33 y 43 controles distintos. Comprueba que cada control enfocado está a la vista y muestra el anillo de foco.
- Con el código final:
  - **0** controles sin nombre;
  - **0** identificadores duplicados;
  - **0** referencias rotas;
  - **0** imágenes sin texto alternativo;
  - **0** textos por debajo de AA.
- Corregido por esta revisión: el icono de la marca, que se anunciaba como imagen sin nombre, y los tres textos de la tarjeta dorada (sección 8).
- Única excepción: un subcampo interno del selector de fecha nativo de Chrome no muestra el anillo del tema. Es la parte del calendario, dibujada por el navegador.

| # | Comprobación pedida | Resultado (archivo) |
| --- | --- | --- |
| 1 | Empieza solo en la etapa 1 | Sí, en las 7 resoluciones: `stage = probe`; solo `.lab-workspace` visible (`smoke`, `responsive-*`). |
| 2 | Las tres etapas funcionan | Sí. Cada etapa muestra solo sus contenedores (`flow`, `tools`). |
| 3 | Pestañas pertinentes | Sí. Las cuatro de «Elegir sonda», las cuatro de «Planificar» con su rótulo y las seis de «Reproducir»: cada una abre su panel (`tools`, `flow.panes`). |
| 4 | La sonda se conserva entre etapas | Sí. Cassini sigue activa tras recorrer las etapas, pasar por la demostración y volver (`flow.probePersisted`). |
| 5 | Los cinco pasos de la guía | Sí. Cada paso se marca hecho a mano. El paso 2 resalta primero «Planificar» en el panel y después la pestaña «Misión completa» (`flow.guide*`). |
| 6 | «Hazlo por mí» | Sí. Parte de Juno con C1 a 1280 × 720 y termina con Cassini, A1 calculada y reproducción en curso (`auto`). En el paso 1, con Cassini ya activa, el botón no aparece y se usa «Siguiente» (`responsive-*`). |
| 7 | Cada sonda usa su propio modelo | Sí. En la etapa 1 y en el Centro de Misión, Voyager, Cassini, Dawn y Juno cargan su modelo oficial de NASA (`fleet`). |
| 8 | Enviar una misión al Centro | Sí, con las cuatro sondas: A1 con Voyager (NO VIABLE pero ejecutable), Cassini y Juno, y A3 con Dawn (`fleet`). |
| 9 | El modelo reproducido es el del vehículo calculado | Sí. `center.vehicle` coincide con la sonda calculada. El ensamblaje experimental se reproduce como experimental, con el esquema técnico (`fleet`, `tools.custom`). |
| 10 | La telemetría y la escena muestran el mismo estado | Sí. Altitud, masa y distancia al Sol coinciden entre el HUD y la pestaña Telemetría en el mismo instante (`flow.sameState`). |
| 11 | La demostración está separada | Sí. Oculta el laboratorio, se rotula «Demostración científica» y al volver la misión sigue preparada (`flow.demo`, `flow.afterDemo`). |
| 12 | Cambiar de sonda invalida | Sí en los tres casos: de Cassini a Juno; de Cassini histórica a experimental sin cambios; de experimental a histórica. En los tres, el Centro se vacía, «Reproducir» se desactiva, la barra de tiempo se oculta y el estado pasa a «Resultado invalidado: recalcula» (`flow.invalidated`, `tools.unmodifiedSwitch`, `tools.custom.afterHistoric`). |
| 13 | No se pierde ninguna función | Las herramientas de Planificar, el lanzamiento («ÓRBITA TERRESTRE ALCANZADA SEGÚN EL MODELO»), las seis cámaras (la local solo cuando aplica), los eventos, el glosario, el menú de áreas y los modos Sistema Solar e Histórico se abrieron y funcionaron (`tools`, `modes`). |
| 14 | Controles accesibles en todas las resoluciones | En las 7, ningún control queda fuera de la ventana o recortado, y no hay desbordamiento horizontal. Los pasos son botones con `aria-current="step"`, la pestaña activa tiene `aria-current="page"` y el botón del panel tiene `aria-expanded`. La revisión automática de accesibilidad no encuentra controles sin nombre, referencias rotas ni textos con contraste bajo (`a11y`). Una revisión con lector de pantalla no se ha hecho. |
| 15 | Pruebas y compilación | 311/311 y ambas compilaciones correctas (véase arriba). |

**Capturas revisadas a mano:**

- las cuatro pestañas de la etapa 1, el esquema técnico con la pieza resaltada, los documentos y su ampliación, el glosario y el ensamblaje experimental (`t1600_*`);
- la reproducción de las cuatro sondas y Dawn A1 sin reproducción (`v1600_*`);
- las 7 resoluciones (`r*`);
- el panel plegado y los modos Sistema Solar e Histórico (`m1366_*`).

**Corregido tras revisar las capturas:**

- franja vacía sobre el panel de la etapa 1 (mensaje vacío);
- resumen de ingeniería después del veredicto;
- nombres de los pasos recortados a 320 px;
- selector de sonda recortado en móvil;
- estado de la escena encima de la barra de cámaras por debajo de 420 px;
- contenido de la pestaña fuera de la vista en móvil;
- tarjetas de la flota con el contenido centrado;
- nombre del simulador oculto bajo las pestañas de modo entre 761 y ~905 px, y cortado con puntos suspensivos en móvil.

## 11. Límites y pendientes

- **Auditoría y revisión:** falta la auditoría independiente de Gemini y la revisión con GPU real. La verificación del navegador usó SwiftShader.
- **Dawn A1 y A2 sin reproducción 3D:** la captura iónica dura ≈ 771 d y sale de la ventana de efemérides cargada para la misión. El resultado se muestra completo, pero no se reproduce: no se extrapola ni se recorta. Con Dawn, el escenario reproducible es A3 (sobrevuelo).
- **Modelo de NASA de una sola pieza:** el resaltado de subsistemas se hace en el esquema técnico del simulador, que no es un plano de NASA.
- **Documentación:** son diagramas rotulados y fotografías, no planos de fabricación. Las dudas de fecha (PIA13923) y de crédito (infografía de Juno) se anotan en `public/images/fleet/README.md`. El uso educativo con atribución sigue las pautas de NASA y no implica su respaldo.
- **Ensamblaje experimental:**
  - es un vehículo hipotético;
  - las masas de los adaptadores y los consumos sin fuente son estimaciones;
  - el Δv es ideal (Tsiolkovski);
  - un resultado «VIABLE SEGÚN EL MODELO» no equivale a que el vehículo pudiera construirse o volar.
- **Accesibilidad:**
  - la revisión automática (sección 10) no sustituye a una prueba real con NVDA, VoiceOver o TalkBack, que sigue pendiente;
  - el contraste solo se mide sobre fondos sólidos y a 1366 × 768.
- **Publicación:** los commits van a la rama de trabajo `revision/modo-historico-voyager`. `main` no se toca, y por tanto GitHub Pages tampoco, porque solo despliega al publicar en `main`.

## 12. Puntos para la auditoría independiente

Lista orientativa para Gemini, según [GEMINI.md](../GEMINI.md). No sustituye a su propio alcance.

1. **Identidad del vehículo.** La firma de `designSignature` debe:
   - invalidar la misión preparada al cambiar de sonda;
   - invalidar al pasar de configuración histórica a ensamblaje experimental, aunque este aún no tenga cambios;
   - no alterar la firma de las cuatro configuraciones históricas.

   Comprobar que la reproducción usa los estados del vehículo calculado (`createIntegratedExecution`, `tools.unmodifiedSwitch`).
2. **Dawn A1/A2.** Recalcular por su cuenta la duración de la cadena con captura iónica (≈ 771 d) y confirmar que sale de la ventana de efemérides cargada. La interfaz no debe extrapolar ni ofrecer «Reproducir».
3. **Procedencia de los documentos.**
   - Contrastar los créditos, fechas y enlaces de `public/images/fleet/README.md` con las páginas de NASA/JPL.
   - Verificar el SHA-256 de la copia sin recomprimir.
   - Revisar las dos dudas anotadas: la fecha de PIA13923 y el crédito de la infografía de Juno.
4. **Ensamblaje experimental.** Confirmar que las masas de los adaptadores y los consumos sin fuente se presentan como estimaciones, y que nada experimental aparece como histórico.
5. **Escalas de tiempo.** Comprobar que las entradas se rotulan en UTC, que la cobertura explica la conversión a TDB y que la telemetría conserva sus unidades.
6. **Navegador.**
   - El flujo de tres etapas, «Hazlo por mí» y la invalidación.
   - Los anchos 320, 768 y escritorio, incluida la cabecera común.
   - La parte `a11y` del guion.
   - De ser posible, con GPU real y un lector de pantalla.
7. **No regresión.** Los modos Exploración e Histórico, y las herramientas de 12–16 desde «Planificar».
