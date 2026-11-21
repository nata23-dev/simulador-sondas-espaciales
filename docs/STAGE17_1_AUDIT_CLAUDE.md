# Auditoría de la etapa 17.1 — Claude

| | |
| --- | --- |
| **Auditor** | Claude (Opus 5.5), según el procedimiento de [GEMINI.md](../GEMINI.md) y la regla del 20-11-2026 de [CLAUDE.md](../CLAUDE.md) |
| **Fecha** | 20-11-2026 |
| **Base** | Rama `revision/modo-historico-voyager`, commit `059c420` más los cambios locales sin commit de 17.1 y de sus correcciones del 20-11-2026 |
| **Estado al auditar** | 322/322 pruebas; `npm run build` y `GITHUB_PAGES=true npm run build` correctos; `git diff --check` limpio |
| **Dictamen** | **Aprobado con observaciones**: un defecto menor (D-01) que conviene corregir, y siete observaciones |

> **Declaración de independencia.** Claude **implementó** la etapa 17.1 y sus correcciones. Por tanto, esta auditoría **no es independiente del implementador**. Para reducir ese sesgo, se aplicaron las condiciones de [CLAUDE.md](../CLAUDE.md):
>
> - métodos distintos de los de la implementación y de su verificación;
> - una referencia externa (NASA/JPL Horizons en línea);
> - un integrador propio;
> - pruebas adversarias en el navegador;
> - ningún cambio en código de producción durante la auditoría.
>
> 17.1 no cambia física, constantes, marcos, integrador ni datos, de modo que la regla vigente permite que esta auditoría dictamine la etapa. Una revisión de Gemini sigue siendo posible y bienvenida.

## 1. Alcance

- Reproducción de las misiones heliocéntricas del laboratorio en el Sistema Solar principal:
  - planetas en la época TDB de cada instante;
  - sonda;
  - trayectoria;
  - cámaras;
  - recorte y encuadre;
  - restauración al salir.
- Rechazo sin cobertura.
- Retirada de la Sonda Experimental 01 de la interfaz.
- Correcciones del 20-11-2026:
  - fases;
  - final de la línea de tiempo;
  - texto de la órbita resultante;
  - cámara de destino;
  - reencuadre;
  - lector de pantalla;
  - limpieza de código.

Fuera del alcance:

- la física de las etapas 12G y 13, que 17.1 no cambia (sí se usa como entrada y se recalcula una parte de forma independiente);
- las misiones que siguen en la escena local.

## 2. Método

### 2.1 Qué se hizo distinto de la verificación del implementador

| Verificación del implementador | Esta auditoría |
| --- | --- |
| Efemérides frente a los elementos aproximados de Standish (error de 20″ a 500″) | Frente a **Horizons en línea** (API 1.2, mismos parámetros que declara la adquisición), en nodos y fuera de ellos |
| Coherencia de la captura: ecuación del cohete aplicada a los números del propio cálculo | **Encendido reintegrado** con un RK4 propio (pasos de 2, 1 y 0,5 s) desde el estado de entrada en la esfera de influencia, con el modelo declarado |
| Escena = proveedor del proyecto, en pruebas con una escena doble | Lo que **dibuja Chrome con GPU real**, convertido a km y comparado con Horizons; la sonda, comprobada con el **método de Gibbs** sobre sus propias posiciones dibujadas |
| Restauración con la escala por defecto | Restauración de la **escala exploratoria** elegida por el usuario, también pasando por el modo histórico |
| Recorridos felices | **Carrera** (salir mientras cargan las efemérides con la red retrasada 6 s), **fugas** (ciclos y recálculos con métricas del motor de Chrome), **teclado real**, **320 y 375 px**, **invalidación** al cambiar de sonda, **frontera exacta** de cobertura |
| Pruebas escritas a la vez que el código | Revisión de esas pruebas en busca de oráculos circulares o pruebas solo de texto |

### 2.2 Herramientas

Todas están en [`evidence/stage17_1/auditoria-claude/`](../evidence/stage17_1/auditoria-claude/).

| Guion | Qué hace |
| --- | --- |
| [`ciencia.mjs`](../evidence/stage17_1/auditoria-claude/ciencia.mjs) | Integridad (SHA-256 y Git), Horizons, RK4 de la captura, conservación, cobertura, determinismo y capacidad de la línea |
| [`navegador.mjs`](../evidence/stage17_1/auditoria-claude/navegador.mjs) y [`navegador-detalle.mjs`](../evidence/stage17_1/auditoria-claude/navegador-detalle.mjs) | Chrome sin interfaz con la GPU AMD (D3D11). Copian el arnés de clic real de `verify-stage17-browser.mjs`; las comprobaciones son nuevas |
| [`comparar-escena.mjs`](../evidence/stage17_1/auditoria-claude/comparar-escena.mjs) | Lo que dibujó Chrome frente a Horizons, y Gibbs + RK4 |

Las respuestas de Horizons están en [`horizons/`](../evidence/stage17_1/auditoria-claude/horizons/), con la URL de cada consulta. La auditoría solo leyó datos públicos de JPL y no modificó ningún archivo de datos.

## 3. Resultados por requisito

| # | Requisito | Resultado | Evidencia |
| --- | --- | --- | --- |
| 1 | Datos intactos | Los 6 archivos de efemérides coinciden con el SHA-256 de su metadato. En `public/` solo cambia la retirada de `icons.svg`. Sin cambios en `public/data`, `public/models` ni en la física de `src/science` | [ciencia.json](../evidence/stage17_1/auditoria-claude/ciencia.json) (grupo A) |
| 2 | Datos = Horizons | En los nodos, los 12 cuerpos coinciden con Horizons hoy: diferencia 0,000 km y 0 km/s. Soluciones: DE441, mar099, jup365, sat441l, ura184, nep098 | grupo B |
| 3 | Interpolación fuera de nodos | En 7 instantes, entre ellos la salida y la llegada de A1: Mercurio 17,3 km; Venus 0,16; Tierra 0,058; Marte 0,0068; baricentros < 4 m. Centros de los planetas exteriores: Júpiter 98,5, Saturno 7,1, Urano 18,4, Neptuno 46,2 km, entre 0,98 y 1,08 veces el error declarado (véase O-01) | grupo B |
| 4 | Encendido de captura (RK4 propio) | Duración, propelente, Δv, periapsis (315,548 km) y apoapsis (100 000 km) coinciden con el cálculo DOPRI54 por debajo de 10⁻⁵ en cada magnitud. Convergencia del RK4: 3×10⁻¹¹ km. Pérdida gravitatoria: 397,2 m/s | grupo C |
| 5 | Conservación en los tramos balísticos | Energía y momento angular constantes a 2×10⁻¹⁴ (crucero y órbita final), con 201 muestras de lo que reproduce la escena | grupo D |
| 6 | No extrapolar | Una misión que acaba 1 día después de la cobertura, o que empieza 2 días antes, se rechaza con «no extrapola» y sin tocar la escena. Una que acaba justo en el último nodo se admite | grupo E |
| 7 | Determinismo | A1 calculada dos veces en Node: idéntica. En Chrome, idéntica en las 4 resoluciones de la regresión con GPU. Entre motores: véase O-02 | grupo F |
| 8 | La escena dibuja planetas reales | Lo dibujado por Chrome en 5 instantes (crucero, mitad del encendido, órbita final), comparado con Horizons en esa misma época TDB: los 8 planetas, dentro de 1,3 veces el error declarado (Marte, 7,8 m) | [escena.json](../evidence/stage17_1/auditoria-claude/escena.json) |
| 9 | La escena dibuja la sonda calculada | Las 3 posiciones de crucero dibujadas son coplanarias con el Sol (8×10⁻¹⁸). Gibbs + RK4 desde la intermedia reproduce las otras dos (−100 d y +150 d) a 0,1 mm y 5 µm. Junto a Marte, la diferencia con la réplica de Node es la prevista por el desfase de 0,221 s (O-02): 0,905 km frente a 0,906 km previstos | escena.json |
| 10 | Escala del usuario | Escala exploratoria → científica durante la reproducción → exploratoria al salir, incluso pasando por el modo histórico. Rótulo y botón coherentes | [navegador.json](../evidence/stage17_1/auditoria-claude/navegador.json) |
| 11 | Cambio de modo desde «3 · Reproducir» | Al modo histórico: sin misión, sin recorte, sin sonda. Vuelta al Centro: la misión se recupera en su época. A exploración: planetas idénticos (diferencia 0), 10 lunas | navegador.json |
| 12 | Carrera durante la carga | Salir mientras cargan las efemérides (retrasadas 6 s): la exploración queda limpia (diferencia 0, sin recorte, 10 lunas). Al volver, la misión se reproduce | navegador.json |
| 13 | Fugas | 8 ciclos «Planificar ↔ Reproducir» y 8 recálculos: 580 escuchadores de eventos constantes; el *heap* pasa de 44,5 a 45,4 MB. Los nodos crecen 20 por cálculo hasta 6 cálculos: es la tabla de comparación, limitada a 6 filas (`history.splice(6)`). No es una fuga | navegador.json, navegador-detalle-antes.json |
| 14 | Invalidación | Al cambiar de sonda se libera la escena principal (sin misión, sin recorte) y se explica por qué | navegador.json |
| 15 | Teclado | Con Tab real, los 12 controles del transporte y de la línea de tiempo muestran `:focus-visible` con anillo. Fin → «Simulación finalizada» y «0 d restantes»; Inicio → 0 | navegador.json, navegador-detalle-antes.json |
| 16 | 390 × 844 y mayores | Zona libre de 125 px, con recorte aplicado | [navegador-detalle-antes.json](../evidence/stage17_1/auditoria-claude/navegador-detalle-antes.json) |
| 17 | **320 × 568 y 375 × 667** | **Zona libre de 24 px**: véase D-01 | navegador-detalle-antes.json, [captura 320](../evidence/stage17_1/auditoria-claude/aud320_05_320.png) |
| 18 | Consola | 0 errores en las 6 sesiones de navegador | navegador*.json |

## 4. Defectos y observaciones

### D-01 · Menor (usabilidad) · Escena casi invisible en teléfonos de 320–375 px de ancho

- **Reproducción:** 320×568 o 375×667, misión guiada Cassini → Marte, «3 · Reproducir».
- **Qué pasa:**
  - La ventana de la escena mide 255 px (`38dvh`, mínimo 255 px).
  - La barra de cámaras pasa a dos filas (67 px) y la de reproducción (44 px) está anclada abajo, así que entre ambas quedan **24 px** libres.
  - El proveedor de zona del Centro de Misión devuelve esa zona, `SolarSystem` la descarta por ser menor de 80 px, y con ella descarta también el **recorte**.
  - Resultado: la vista general se encuadra como si la escena ocupara toda la página, y el lienzo principal no queda limitado a la ventana.
  - A 390×844 la zona es de 125 px y funciona.
  - Remedio actual: la vista inmersiva.
- **Por qué no lo detectaron las verificaciones anteriores:**
  - la comprobación de escena se hizo a 390 px;
  - la de adaptación mide controles fuera de pantalla, no el espacio libre de la escena.
- **Corrección recomendada (localizada):**
  1. Mantener el recorte aunque la zona sea pequeña.
  2. Si entre las barras no queda sitio, encuadrar en toda la ventana.
  3. A ≤ 420 px, dar a la ventana de la escena principal una altura mínima que deje más de 80 px libres.

### Observaciones

| # | Observación | Efecto |
| --- | --- | --- |
| O-01 | En los centros de los planetas exteriores, el «error medido» declarado (`MEASURED_INTERPOLATION_ERROR`) es el máximo de una muestra, no una cota. En otra muestra se supera hasta un 8 % (Urano 18,4 frente a 16,97 km), dentro del margen del 30 % de la prueba del proyecto. Causa ya conocida: el bamboleo del centro por los satélites (OBS-12G-02) | Ninguno en 17.1: 100 km son 2×10⁻⁵ unidades de escena, y los cálculos usan baricentros |
| O-02 | El refinamiento de la salida (Nelder–Mead, tolerancia 10⁻⁶ d ≈ 0,09 s) converge en Chrome 0,070 s después que en Node; la llegada se desplaza 0,221 s. Cada motor es determinista | Ninguno físico (C3 igual a 10⁻¹⁰). Las pruebas que comparen navegador y Node deben admitir unos ±0,1 s |
| O-03 | Cinco pruebas de 17.1 comprueban **texto del código** con expresiones regulares, no comportamiento: final de la línea de tiempo, anunciador, cámara de destino, reencuadre y escuchador de tamaño. El comportamiento se comprobó en el navegador (esta auditoría y la regresión), pero una refactorización podría romperlo sin que fallen | Riesgo de mantenimiento |
| O-04 | La «réplica del navegador» de las pruebas de 17.1 no es idéntica bit a bit al cálculo de Chrome (véase O-02) | Ninguno; conviene documentarlo |
| O-05 | La aplicación muestra textos de validación desfasados: «12G … pendiente de auditoría independiente (Gemini)» (`InterplanetaryPlayback.js`), pese a que 12G está aprobada; y «13 … (Gemini)» (`IntegratedMissionPlayback.js`, `IntegratedMissionPlanner.js`), que con la nueva regla debería decir «pendiente de auditoría» | Información incorrecta para el usuario (no afecta a cálculos) |
| O-06 | A 320–375 px la escena **local** (Tierra–Luna, lanzamiento) tiene la misma disposición de barras desde la etapa 17 | Fuera del alcance de 17.1; misma mejora aplicable |
| O-07 | Mi prueba de píxeles («¿asoma el lienzo fuera de la ventana?») resultó **no concluyente**: la franja comparada contiene elementos animados. D-01 se basa en la geometría medida, no en esa prueba | Límite del método |

## 5. No ejecutado

- Lector de pantalla real (NVDA o Narrador): solo hay revisión automática del árbol de accesibilidad.
- Revisión visual por una persona y navegador con interfaz.
- Firefox, Safari y dispositivos táctiles reales.
- Recalcular de forma independiente A2, A3, C1, C2 y las ventanas de Lambert (17.1 no cambia su física).
- Pruebas de rendimiento en equipos modestos.

## 6. Dictamen

**Aprobado con observaciones.** Los requisitos científicos y funcionales de 17.1 se cumplen y se comprobaron con referencias externas y métodos propios. La escena dibuja exactamente los planetas de Horizons (dentro del error declarado de interpolación) y la sonda calculada. No hay fugas, la reproducción es determinista y no se extrapola.

**D-01** es un defecto menor de usabilidad en teléfonos de 320–375 px, con remedio (vista inmersiva) y corrección localizada. **O-05** es un texto desfasado visible para el usuario. Ambos se recomiendan como corrección puntual.

## 7. Cómo reproducir

```bash
node --test tests/*.test.mjs
node evidence/stage17_1/auditoria-claude/ciencia.mjs            # 64/64; consulta Horizons (o usa horizons/ en caché)
GPU=1 node evidence/stage17_1/auditoria-claude/navegador.mjs    # sin GPU=1, SwiftShader
GPU=1 node evidence/stage17_1/auditoria-claude/navegador-detalle.mjs
node evidence/stage17_1/auditoria-claude/comparar-escena.mjs    # 18/18; requiere navegador.json
```

## 8. Corrección puntual posterior a la auditoría (17.1.1)

Hecha **después** de cerrar el dictamen anterior. La auditoría no tocó código de producción. La corrección es del implementador (Claude) y se volvió a verificar.

| Hallazgo | Cambio | Archivos |
| --- | --- | --- |
| D-01 | El cálculo de la zona libre pasa a la función pura `mainSceneFrameZone`: si entre las barras quedan menos de 96 px, encuadra en toda la ventana. `SolarSystem` conserva el recorte aunque descarte una zona pequeña. A ≤ 420 px, la ventana del Sistema Solar principal mide al menos 340 px | `src/ui/MissionControlCenter.js`, `src/graphics/SolarSystem.js`, `src/ui/experimental-laboratory.css` |
| O-05 | «12G aprobada en auditoría independiente (Gemini)»; «13 … pendiente de auditoría» | `src/lab/InterplanetaryPlayback.js`, `src/lab/IntegratedMissionPlayback.js`, `src/ui/IntegratedMissionPlanner.js` |
| O-03 (en parte) | Prueba de **comportamiento** de `mainSceneFrameZone` con los rectángulos medidos en Chrome (320 px antes y después, escritorio con ficha de fase) | `tests/Stage17_1MainScenePlayback.test.mjs` |
| — | La prueba W de 12G exigía «pendiente de auditoría», cierto cuando se escribió. Ahora exige el estado vigente, «aprobada» | `tests/InterplanetaryPlanning.test.mjs` |

**Nueva verificación, con el código corregido:**

- 323/323 pruebas; dos compilaciones correctas; `git diff --check` limpio.
- `ciencia.mjs` 64/64; guion científico del implementador 31/31; ESLint sin errores.
- Chrome con la GPU real ([navegador-detalle.json](../evidence/stage17_1/auditoria-claude/navegador-detalle.json), [captura 320](../evidence/stage17_1/auditoria-claude/det320_ventana.png)):
  - a 320×568 y 375×667, la ventana mide 340 px, con **109 px libres** (antes 24) y recorte aplicado;
  - a 390×844, 144 px libres;
  - 0 errores.
- Regresión `responsive`, `scene` y `flow` con `GPU=1`:
  - 7 resoluciones sin controles fuera de pantalla ni recortados;
  - en las 4 resoluciones de escena, todos los controles reciben el clic y la llegada es la misma (103 351,02 km);
  - misión guiada completa;
  - 0 errores.

Quedan abiertas O-01, O-02, O-04, O-06 y el resto de O-03 (otras pruebas solo de texto), propuestas en el [plan de mejora](ANALISIS_INTEGRAL_Y_PLAN_DE_MEJORA.md).
