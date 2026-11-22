# Tareas continuas del plan de mejora: ESLint y pruebas de comportamiento

El [plan de mejora](ANALISIS_INTEGRAL_Y_PLAN_DE_MEJORA.md) (§8, fila «Continuo») incluye cuatro tareas que no son etapas:
1. auditorías pendientes;
2. prueba real con NVDA o Narrador;
3. ESLint con solo reglas de errores en la CI;
4. sustituir las pruebas que solo comprueban el texto del código por pruebas de comportamiento (O-03 de la [auditoría de 17.1](STAGE17_1_AUDIT_CLAUDE.md)).

Este documento recoge las dos últimas, hechas el 21-11-2026 por Claude. Las dos primeras necesitan una persona u otro agente (ver «Pendiente»).

## ESLint con solo reglas de errores

- **Dependencias de desarrollo:** `eslint` 10.15.0 y `globals` 17.14.0 (versiones exactas; `npm audit`: 0 vulnerabilidades). No entran en la compilación.
- **Configuración** [`eslint.config.js`](../eslint.config.js): 37 reglas que detectan código que falla o hace algo distinto de lo escrito. Por ejemplo:
  - `no-undef`, `no-const-assign`, `no-dupe-keys`, `no-unreachable`, `use-isnan`;
  - `no-loss-of-precision`, `no-unsafe-optional-chaining`, `no-import-assign`, `valid-typeof`.

  **Sin reglas de estilo ni de formato**, y sin `no-unused-vars`.
- **Alcance:**
  - `src/`, `tests/`, `scripts/`, `vite.config.js` y la propia configuración;
  - se ignoran `dist/`, `public/`, `evidence/`, `source-assets/` y `docs/`.
- **Uso:** `npm run lint`. En la CI ([`ci.yml`](../.github/workflows/ci.yml)) corre después de `npm ci` y antes de las pruebas, en Node 22 y 24.
- **Hallazgos al activarlo: 2, los dos `no-loss-of-precision`.** La constante de rotación de la Tierra de la IERS, `1.00273781191135448`, tiene más dígitos de los que representa un double. Aparecía en `src/lab/EarthDeparture.js` y en `tests/Stage21LaunchInjection.test.mjs`. Se escribió como el double al que JavaScript ya la convertía, `1.0027378119113546`, comprobado **idéntico bit a bit**: el valor no cambia y la física tampoco. El comentario conserva el valor de la IERS.
- **Comprobación de que las reglas actúan:** un fragmento con una constante reasignada, una comparación con `NaN`, dos variables sin declarar, una clave duplicada y código inalcanzable da los 6 errores esperados.

## Pruebas de comportamiento (O-03)

La O-03 señalaba cinco pruebas de 17.1 que comprobaban **texto del código** con expresiones regulares:
1. final de la línea de tiempo;
2. anunciador;
3. cámara de destino;
4. reencuadre;
5. escuchador de tamaño.

Una refactorización podía romperlas sin que fallaran. Ahora:

| Antes (texto) | Ahora (comportamiento) |
| --- | --- |
| `clock.seek(max - value < 0.0015 ? max : value)` | `instanteLineaTiempo(valor, máximo)` (función pura en `MissionPlaybackAids.js`): a 1 ms del final salta al final exacto; a 2 ms, no |
| `setAttribute('aria-valuetext'` | `textoValorLineaTiempo(...)`: «X d transcurridos · Y d restantes · fase», sin separador colgante si no hay fase |
| `if (hudPhase && phase) … Fase:` | `anuncioCambioFase(anterior, fase)`: no anuncia la preparación inicial ni una fase repetida |
| Texto de `poseMiradaDestino` y `cancelarTransicionInteractiva` | **El controlador de cámara real** (`crearControladorCamara`) instanciado en Node con THREE, un lienzo que guarda sus escuchadores y controles mínimos. Se comprueba que la pose queda a unos 4 radios, detrás del cuerpo respecto a la sonda, del lado del Sol y con el objetivo sobre la línea cuerpo–sonda. También que se recalcula en el mismo fotograma si el planeta y la sonda se mueven, que **arrastrar más de 5 px o usar la rueda devuelve el control** (y un movimiento menor no) y, de la etapa 23, la pose sobre un satélite visible y el satélite oculto |
| Texto de `reframe()` | `SolarSystemMissionView` con una escena doble y la misión A1 real: solo la vista general se reencuadra; con las cámaras exterior y de destino no se toca nada |

Pruebas: [`tests/MissionCameraBehaviour.test.mjs`](../tests/MissionCameraBehaviour.test.mjs) (6).

**Comprobación por mutación.** Se rompió temporalmente el controlador de dos maneras (copia de seguridad y restauración verificadas byte a byte):
- quitando la cesión del control al arrastrar: falla la prueba de arrastre y rueda;
- quitando la protección del satélite oculto: falla la de la etapa 23.

En [`tests/Stage17_1MainScenePlayback.test.mjs`](../tests/Stage17_1MainScenePlayback.test.mjs) solo queda, rotulado como tal, el **cableado con el DOM**, que en Node no se puede ejercitar: el Centro de Misión llama a esas funciones, existe el anunciador `sr-only` y el `ResizeObserver` se crea y se desconecta. Ese cableado lo recorre el navegador: [verificación de la etapa 23](STAGE23_MAIN_SCENE_MOONS.md#verificación-en-el-navegador), donde la línea de tiempo anunció «1,148.266 d transcurridos · 2.006 d restantes · Sobrevuelo de Europa» y el anunciador, «Fase: Sobrevuelo de Europa».

## Resultado

Suite completa **399/399** (394 + 6 de comportamiento − 1 por fundir las dos pruebas de texto de 17.1 en una de cableado). `npm run lint` sin errores; `npm run build` y la compilación de GitHub Pages correctas; `git diff --check` limpio.

## Pendiente

- **Otras pruebas que leen texto** del código, del CSS o del HTML, en las etapas 12D.1, 12F.1, 15.1, 16, 17, 18 y 24. Casi todas comprueban reglas CSS, marcado o documentación, que sin navegador no tienen comportamiento que ejercitar; sus pantallas se recorren en las verificaciones con Chrome de cada etapa. Se pueden convertir caso por caso cuando se toque cada módulo.
- **Prueba real con NVDA o Narrador.** Necesita una persona: la verificación automática confirma los atributos y los textos anunciados, no cómo los lee un lector de pantalla.
- **Auditorías pendientes** (Gemini u otra sesión de Claude sin el contexto de la implementación): revisión independiente de las etapas de física 20, 21 y 22, y las auditorías externas pendientes de etapas anteriores ([estado](PROJECT_CONTEXT.md)).
