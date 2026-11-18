# Etapa 12C — Centro de misión

## Arquitectura y flujo

El Laboratorio Experimental conserva Hangar, Ingeniería y Planificador, y habilita el Centro de misión. El botón **Ejecutar misión planificada** exige un resultado vigente cuya evaluación sea `VIABLE SEGÚN EL MODELO`, abre el Centro e inicia la reproducción. Al entrar se conserva la sonda del Hangar y se construye una ejecución inmutable a partir del resultado del Planificador. Cambiar la sonda, el propelente o las condiciones del plan invalida el resultado y retira la ejecución anterior. Los planes locales de la Etapa 12B conservan su formato; al recuperarlos deben recalcularse.

Las responsabilidades están separadas:

- `MissionPhysics.js`: trayectoria integrada DOPRI54, efeméride lunar, marco y dinámica ya existentes. Ahora cada nudo lleva su tiempo transcurrido en segundos; no cambia la integración.
- `MissionEngineering.js`: evaluación de maniobra, propelente y energía ya existente.
- `MissionPlayback.js`: valida el plan, fija eventos respaldados por estados calculados, interpola y controla el reloj de reproducción. No integra ni consume combustible de nuevo.
- `MissionTelemetry.js`: deriva distancias y presenta recursos y potencia nominal sin mutar el estado.
- `MissionExecutionView.js`: escena Three.js, trayectoria y cámaras. Convierte kilómetros a unidades gráficas en una sola frontera.
- `MissionControlCenter.js`: controles, estado de reproducción, fases y telemetría.
- `ProbeAssemblyView.js`: exporta una instancia del mismo ensamblaje procedural usado en el Hangar, con recursos gráficos propios para el Centro.

La integración de navegación y el diseño responsive están en `ExperimentalLaboratory.js` y `experimental-laboratory.css`. `MissionPlanner.js` entrega el resultado vigente y la acción de ejecución. Las regresiones nuevas están en `tests/MissionControlCenter.test.mjs`.

## Modelo temporal y maniobra

El estado de la nave se almacena como posición geocéntrica en km y velocidad geocéntrica en km/s. El tiempo interno de reproducción es el número de segundos transcurridos desde la salida TDB. La consulta lunar usa el mismo JD TDB del instante de la nave. Se rechaza cualquier instante fuera de la trayectoria o de la cobertura lunar.

Entre nudos consecutivos de DOPRI54 se usa Hermite cúbico: posición y velocidad en ambos extremos definen una curva local cuya derivada proporciona la velocidad mostrada. En los nudos se devuelven exactamente los estados integrados. Se contrastaron puntos medios con una integración RK4 independiente, también cerca de la aproximación lunar, con errores exigidos menores de 0,2 km y 0,0001 km/s. El intervalo inicial de la transferencia comienza **después** de la inyección, por lo que no se interpola a través del salto de velocidad.

En el mismo instante `t = 0` se distinguen dos lados: antes, velocidad circular y masa húmeda; después, velocidad de transferencia y masa posterior de `MissionEngineering`. El consumo ideal de Tsiolkovsky es una función del lado e instante seleccionados. Pausar, retroceder, repetir y saltar no vuelven a descontar combustible. La duración de encendido calculada por el Planificador solo sirve para evaluar la validez de la aproximación impulsiva; no se representa como combustión de empuje finito.

El reloj admite reproducción, pausa, reanudación, velocidad de 60 a 86 400 segundos simulados por segundo real, retroceso, búsqueda, salto a eventos y reinicio. La velocidad visual nunca altera los estados físicos almacenados. El final detiene la reproducción y muestra el resultado geométrico disponible, sin convertirlo en una declaración de éxito de misión completa.

## Visualización y cámaras

La escena muestra Tierra, Luna, trayectoria DOPRI54 completa, tramo recorrido y pendiente, marcador de salida, llegada nominal, distancia mínima muestreada cuando existe y dirección local de movimiento. La Luna procede de la efeméride local en cada época. La nave usa los componentes, geometrías y conexiones del diseño del Hangar; no se sustituye por un modelo genérico.

Las cinco cámaras son vista general orbital, seguimiento exterior, vista desde la posición de la sonda, cámara del destino lunar y encuadre cinematográfico. La orientación visible de la nave se alinea con su velocidad solo para presentación; **no es una actitud simulada**. La vista desde la sonda permite mirar a Luna, Tierra o dirección de movimiento. El FOV se mantiene en 46°; las transiciones afectan únicamente a la cámara.

Los centros Tierra, Luna y nave se dibujan con **1 unidad gráfica = 10 000 km**. Los marcadores tienen tamaño ilustrativo. El modelo de nave se amplía a **0,25 unidades por metro** para poder inspeccionarlo en vistas próximas; esa escala ilustrativa no entra en posición, velocidad, distancias ni maniobras. El control táctil de órbita se activa intencionalmente y se libera al abandonar la vista. La interfaz se apila en tabletas y móviles para mantener la escena visible.

## Telemetría y estados

El Centro separa posición, velocidad y época propagadas; distancias, altitudes y velocidad lunar relativa derivadas; masa, combustible y delta-v del presupuesto impulsivo; y potencia nominal del diseño. Muestra tiempo transcurrido y restante, fase y estado de maniobra. La potencia nominal supone 1 AU e iluminación directa, como en el catálogo. No se propaga distancia al Sol, sombras, orientación de paneles ni estado de carga de batería; este último aparece como **No disponible**. Tampoco se afirma que el viaje haya cumplido objetivos de una misión completa.

Los estados de interfaz son preparada, en reproducción, en reproducción inversa, pausada, finalizada e interrumpida por ausencia de datos. Los eventos se limitan a órbita inicial, inyección, primera muestra propagada del crucero, aproximación nominal, distancia mínima lunar muestreada para sobrevuelo y fin de la trayectoria. La planificación no admite impactos; un cálculo que intercepta Tierra o Luna se rechaza antes de poder ejecutarse. La coincidencia con la geometría del objetivo se informa como **objetivo geométrico alcanzado según el modelo**, independiente de éxito operacional.

## Alcance científico y pendientes

La dinámica sigue siendo el problema Tierra–Luna restringido con efeméride lunar geocéntrica y término indirecto, según `STAGE12B_MISSION_PLANNER.md` y `STAGE12B1_NUMERICAL_RECONCILIATION.md`. El Centro no cambia constantes, SPK, efemérides, DOPRI54 ni Voyager. Solo son ejecutables las aproximaciones y sobrevuelos lunares que el Planificador certifique como maniobra impulsiva viable. No hay inserción lunar, control de actitud, empuje finito, batería temporal, lanzamiento, aterrizaje ni misión a otros destinos.

La visualización y la disposición responsive requieren la auditoría independiente de Gemini en navegador. El contraste RK4 es una prueba local de desarrollo y no sustituye validación astronómica externa.

## Comprobaciones locales

- `node --test tests/MissionControlCenter.test.mjs`: 8/8. Comprueba ambos lados de la inyección, reloj reversible, consumo único, nudos y error de interpolación frente a RK4 en crucero y cerca de la Luna, telemetría, cámaras sin mutación del estado, eventos, invalidación y cobertura.
- `node --test tests/*.test.mjs`: 142/142.
- `npm.cmd run build`: correcto. Vite conserva el aviso informativo de tamaño de bundle.
- `git diff --check`: sin errores.

No se hicieron capturas ni auditoría visual masiva. No se realizó commit, push ni despliegue.
