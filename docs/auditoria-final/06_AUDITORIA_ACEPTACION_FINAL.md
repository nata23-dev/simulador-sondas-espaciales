# Auditoría Final de Aceptación Integral (`06_AUDITORIA_ACEPTACION_FINAL.md`)

- **Proyecto:** Simulador de Sondas Espaciales (`Vite` + `Three.js` r186 + WebGL 2)
- **Fecha de ejecución:** 22-11-2026
- **Versión exacta auditada:** Rama local `revision/modo-historico-voyager`, commit base `b199f076ab773b6d6a7e34bbc2a16dbe4b3073d4` (*«Documentación: estado del proyecto tras las etapas 27–29»*) **más el árbol de trabajo local sin commit** que reúne las correcciones de las Fases 1 a 5 (`32` archivos rastreados modificados y nuevos módulos/pruebas/evidencias).
- **Compilación auditada:** Build de producción con `GITHUB_PAGES=true npm run build` (`dist/` servido en `/simulador-sondas-espaciales/`).
- **Declaración de procedimiento e independencia:** Durante esta auditoría **no se modificó ningún archivo de código de producción** (`src/`, `public/`, `tests/`, `scripts/`, `README.md`), ni se sobrescribieron evidencias anteriores. Como transparencia metodológica, el mismo entorno de agente participó en la verificación final de fases previas; por ello, todos los resultados de este informe se obtuvieron mediante **guiones nuevos e independientes** en [`evidencias/aceptacion/`](evidencias/aceptacion/), referencias matemáticas analíticas/RK4 calculadas desde cero, ejecución fresca sobre la compilación de producción en **Google Chrome 157** (GPU y Software SwiftShader) y **Microsoft Edge 158**, e inspección directa de la versión publicada en GitHub Pages.

---

## 1. Inspección inicial y alcance auditado

Se verificaron `AGENTS.md`, `CLAUDE.md`, `README.md`, `VISION_FINAL.md`, `docs/DEVELOPMENT_ROADMAP.md`, los informes originales `01`–`05` y los informes `FASE_1_RESULTADOS.md` a `FASE_5_RESULTADOS.md`.

### Validación técnica base (Sección 9)

Ejecutada de nuevo al inicio de la aceptación:

| Comprobación | Resultado | Detalle |
| --- | :---: | --- |
| `npm run lint` | **APROBADO** | ESLint sin errores ni advertencias. |
| `npm test` | **APROBADO** | **`485 / 485`** pruebas superadas (`0` fallidas, `0` omitidas, `0` canceladas, `6,86 s`). Coincide exactamente con la línea base documentada de 485 pruebas. |
| `GITHUB_PAGES=true npm run build` | **APROBADO** | Vite 8.3.4, `167` módulos transformados en `836 ms` (`dist/assets/index-DHoafUra.js`, `IntegratedMissionWorker-D7ZIeyPQ.js`, `WebGLUnavailableNotice-BBKRgWhb.js`, `VoyagerLaunchDirector-B5okGAJ1.js`). |
| `git diff --check` | **APROBADO** | `0` errores de formato ni marcas de conflicto. |

---

## 2. Verificación independiente de los 11 hallazgos

Cada uno de los 11 hallazgos de `04_PLAN_CORRECCIONES.md` fue comprobado directamente en código, pruebas automatizadas y reproducción fresca sobre la compilación de producción (`evidencias/aceptacion/`):

| ID | Hallazgo | Estado verificado | Evidencia reproducible de aceptación |
| --- | --- | :---: | --- |
| **`GEN-02`** | Carrera asíncrona en `IntegratedMissionPlanner.compute()` | **CERRADO** | Reproducido `A1 → Calcular → C1` a los `10 ms` en Chrome sobre `dist/`: escenario final `C1`, `#im-execute` deshabilitado (`true`), aviso de descarte visible; `9/9` pruebas en `AuditoriaFinalGEN02.test.mjs`. |
| **`STAB-01`** | Excepción síncrona sin contexto WebGL 2 | **CERRADO** | Bloqueado `getContext('webgl2'/'webgl')` en Chrome sobre `dist/`: `0` `pageerror`, `#webgl-unavailable[role="alertdialog"]` visible y enfocado, `#app` inerte (`acc-sin-webgl2.png`); `9/9` pruebas en `AuditoriaFinalSTAB01.test.mjs`. |
| **`SCI-01`** | Precisión float64 y validación de segundos intercalares `:60` | **CERRADO** | Recalculado en `auditoria-ciencia.mjs` (`ciencia-aceptacion.json`): `23:59:59 → 23:59:60 → 00:00:00` separados `0,999995 s`, `TAI−UTC` `36 → 36 → 37`, etiquetas inversas `23:59:60 UTC`, `2020-03-03 12:34:60` rechazado; `6/6` pruebas en `AuditoriaFinalSCI01.test.mjs`. |
| **`PERF-01`** | Renderizado oculto de `#solar-system` tras el Laboratorio | **CERRADO** | En `rendimiento-gpu.json` y `rendimiento-software.json`: en `Hangar Cassini` (`62,51 FPS` en software vs `46,44` base) y `Planificación` (`177,81 FPS` en software vs `132,56` base), `solar-system` registra **`0` renders** (`renderPausado: true`, `rafActivo: false`, `motivos: ["laboratorio"]`), reactivándose al entrar en `Centro en reproducción` y al volver a `Sistema Solar`. |
| **`LAN-01`** | Sobrecoste por píxel en plataforma LC-41 en software | **CERRADO CON OBSERVACIÓN** | En GPU: `179,99–180,01 FPS` con `88` draw calls y `41 256` triángulos (`−46 %` calls, `−73 %` tris). En SwiftShader: al saltar en frío a `T−8 s` sin el calentamiento de entrada (ratio `0,35`), marca `26,88 FPS`, pero en cuanto el escalado adaptativo baja a `0,30` (`T−2 s` en adelante) alcanza **`51,48–86,33 FPS`** (`57,42 FPS` en ascenso en movimiento, `52,5–54,4 FPS` en `T−8 s` a ratio `0,30` en Fase 3). |
| **`PERF-02`** | Reproducción histórica y de misión en software `< 30 FPS` | **CERRADO** | En SwiftShader (`rendimiento-software.json`): `Reloj histórico` **`31,28 FPS`** (`25 360` tris, vs `29,56 FPS` / `66 560` tris base), `Centro en reproducción` **`33,87 FPS`** (`29 660` tris, vs `27,65 FPS` / `62 978` tris base), `Centro seguimiento` **`34,12 FPS`** (vs `25,63 FPS` base). En GPU: `171,24–180,00 FPS` con el `100 %` del detalle alto intacto. |
| **`PERF-03`** | Bloqueos síncronos (`305–362 ms`) del hilo principal al calcular | **CERRADO** | En `funcional-ux-estabilidad.json`, `rendimiento-gpu.json` y `rendimiento-software.json`: cálculo completo `A1` desde plataforma LC-41 en Web Worker completa en `167–298 ms` con **`0` Long Tasks (`longTasks: []`)**. Equivalencia bit a bit cubierta por `AuditoriaFinalPERF03.test.mjs`. |
| **`UX-01`** | Pérdida de foco (`Tab`), `Escape` roto y grupos vacíos en `Buscar` | **CERRADO** | Verificado en Chrome (7 resoluciones, ratón, teclado y táctil) y Microsoft Edge (`/` + `Escape`): `Tab` contenido, `Escape` cierra siempre, sin cabeceras vacías, ARIA coherente y limpieza de listeners en `dispose()`. |
| **`UX-02`** | Intercepción de cabecera por bienvenida histórica y reapertura | **CERRADO** | Verificado en Chrome (7 resoluciones) y Edge: cabecera accesible con la bienvenida abierta (`z-index 41 > 40`), tarjeta entera debajo de la cabecera incluso a `320×568`, cierre por `Escape`/fondo/cabecera y reapertura fiable mediante `#hist-welcome-open-btn` tras cambiar de modo. |
| **`LAN-02`** | Retención acumulativa de renderizadores WebGL en Lanzamiento 3D | **CERRADO** | Verificado en `dist/` con 5 ciclos completos alternando Voyager 2 y Voyager 1 + cierre temprano (`160 ms`): **`0/5` renderizadores retenidos**, **`1` contexto WebGL2**, heap estable (`29,40 → 30,73 MB`), sumado a la prueba de 10 ciclos + coexistencia Hangar de Fase 5 (`0/11` retenidos, `0` errores GL). |
| **`GEN-01`** | Desfase documental en `README.md` | **CERRADO** | `README.md` describe con exactitud el modelo de cónicas parcheadas, la cobertura `2026-11-18 → 2046-01-01`, los límites y el estado pendiente de validación final, respaldado por `4/4` pruebas en `AuditoriaFinalGEN01.test.mjs`. |

---

## 3. Auditoría funcional de los tres módulos

Evidencia: [`evidencias/aceptacion/funcional-ux-estabilidad.json`](evidencias/aceptacion/funcional-ux-estabilidad.json) y capturas `acc-*.png`.

### 3.1 Sistema Solar (`APROBADO`)
- Arranque en producción sin errores: `8` planetas y `10` lunas visibles, `renderPausado: false`, `rafActivo: true`.
- Selección de Saturno (`9.431304 AU`, `1,410,903,057 km`, `9.754 km/s`), alternancia de escala (`cientifica` ↔ `exploratoria`), avance temporal a `4×` (`2026-10-10 → 2026-10-12 TDB`) y restablecimiento de cámara operativos (`acc-solar-1600.png`).
- En GPU dedicada conserva `38` draw calls y `73 364` triángulos (`ratio = 1`, geometría de máximo detalle); las optimizaciones de Fases 2 y 4 no ocultan ningún elemento ni reducen la calidad en hardware potente.

### 3.2 Misiones Históricas Voyager 1 y Voyager 2 (`APROBADO`)
- Modelos oficiales NASA `Voyager.glb` cargados para ambas sondas (`voyager-1` y `voyager-2`, `errorCargaVoyager: null`).
- Navegación al evento `Voyager 1 · disco de Europa` (`1979-03-04 · 18:00:00 UTC`), apertura del comparador NASA A/B (`PIA00016`) con imagen auténtica cargada (`imgCargada: true`) y separación explícita frente a la vista 3D: **`B · RECREACIÓN TRIDIMENSIONAL WEBGL (NO ES FOTOGRAFÍA)`**, huella cuadrada `ISS-NAC 0,424°` y telemetría geométrica (`2,089,333 km`, diámetro angular `0,09°`) (`acc-historico-comparador.png`).
- Los cortes SPK de 1981 y 1989 y las discrepancias con Horizons permanecen declarados y cubiertos por la suite automatizada.

### 3.3 Laboratorio de Misiones (`APROBADO`)
Se completaron **dos recorridos distintos con dos sondas y dos destinos diferentes** sobre la compilación de producción:
1. **Recorrido 1 — Cassini → Marte (`A1`, con lanzamiento opcional desde LC-41):** Catálogo → Hangar 3D (`renderPausado: true`, `rafActivo: false`) → Ingeniería → Planificar (`Misión completa`, `#im-launch-pad` activado) → Cálculo en Web Worker (`187 ms`, **`0` Long Tasks**) → Veredicto explícito (`CADENA CALCULADA COMPLETA SEGÚN EL MODELO (cónicas parcheadas). Viabilidad operativa: no verificada.`) → Reproducir en Centro de Misión (`dataset.scene === "main"`, `renderPausado: false`, `probeName: "Cassini"`, `acc-lab-centro-cassini.png`).
2. **Recorrido 2 — Juno → Júpiter / Europa (`C1`):** Selección de `Juno` en la cabecera → prueba de carrera `GEN-02` (`A1 → C1` durante cálculo descarta el resultado obsoleto y bloquea `#im-execute`) → cálculo limpio de `C1` con `Juno` → ejecución en Centro de Misión confirmando `probeName: "Juno"`, `model: "nasa"`, `destination: "Jupiter"`, `moon: "Europa"`, `981` puntos de trayectoria y cobertura lunar `2463079.5 → 2463384.5 JD TDB`.

**Nota de alcance respecto a `VISION_FINAL.md`:** Por decisión explícita documentada en Etapa 15.1 (`docs/DEVELOPMENT_ROADMAP.md`), la flota del Laboratorio es fija (Voyager, Cassini, Dawn y Juno con modelos NASA oficiales y ensamblaje experimental separado; sin construcción libre sin restricciones, sin asistencias gravitatorias ni aterrizajes activos en la UI). No es un defecto, sino un recorte de alcance deliberado y documentado.

---

## 4. Auditoría del Lanzamiento 3D (`APROBADO`)

Verificado en compilación de producción (`funcional-ux-estabilidad.json`, `rendimiento-gpu.json`, `rendimiento-software.json`) y visualmente (`acc-lanzamiento-voyager.png`, además de las capturas de Fase 5 `fase5-lan02-plataforma-c1.png` y `fase5-lan02-voyager-c1/c10.png`):

- **Secuencia y fidelidad visual:** Plataforma LC-41, Titan IIIE-Centaur (`TC-7` Voyager 2 y `TC-6` Voyager 1), humo y penachos, sombras PCF 4096 en GPU, revelación correcta de etapas internas al abrir la cofia (`T+275 s`, `cofiaAbierta: true`), despliegue del modelo NASA `Voyager.glb` (`T+4450 s`, `nasaOk: true`), controles temporales (`pausar`, `reanudar`, saltos y salida `#launch-skip-btn`).
- **Ciclo de vida y memoria (`LAN-02`):** En 5 ciclos completos sobre `dist/` + 1 cierre temprano a `160 ms`, tras GC permanecen **`0` renderizadores de lanzamiento vivos**, **`1` contexto WebGL2**, **`1` canvas en DOM** y heap estable (`29,40 → 30,73 MB`). Sin pérdida progresiva de FPS ni defectos visuales tras las Fases 3 y 5.

---

## 5. Auditoría científica independiente (`APROBADO CON OBSERVACIONES`)

Evidencia: [`evidencias/aceptacion/auditoria-ciencia.mjs`](evidencias/aceptacion/auditoria-ciencia.mjs) → [`evidencias/aceptacion/ciencia-aceptacion.json`](evidencias/aceptacion/ciencia-aceptacion.json).

### 5.1 Resultados de verificación independiente

| Área verificada | Referencia independiente | Resultado medido | Valoración |
| --- | --- | --- | --- |
| **UTC/TAI/TT/TDB y segundos intercalares (`SCI-01`)** | Tabla IERS + aritmética exacta de días julianos + envolvente `|TDB−TT| < 1,7 ms` | `Δt(59→60) = 0,999995 s`, `Δt(60→00) = 0,999995 s`, `TAI−UTC = 36/37`, etiqueta inversa `23:59:60 UTC`, `TDB−TT = −1,6541 ms`, `:60` inválido rechazado. | **Correcto** |
| **DOPRI54 · Órbita Kepleriana excéntrica ($e=0,6$, 5 órbitas)** | Retorno analítico exacto al periapsis, energía $\varepsilon$ y momento angular $|\mathbf{h}|$ | Convergencia de orden 5: `posErr`: `0,111 km` (`1e-7`) → `1,17 m` (`1e-10`) → **`1,08 cm`** (`1e-12`); `relEnergyErr = 1,006e-11`; `relAngMomErr = 3,36e-12`. | **Correcto** |
| **Caída radial libre** | Solución analítica cerrada $t(r_0 \to r_1)$ | `errPos = 4,90e-8 km` (**0,049 mm**), `errVel = 1,91e-11 km/s`. | **Correcto** |
| **Empuje finito con masa variable (`12D`)** | Ecuación de Tsiolkovsky cerrada | `errMass = 4,55e-13 kg`, `errΔv = 3,37e-11 m/s` (precisión de máquina). | **Correcto** |
| **Solucionador de Lambert (`12G`)** | RK4 independiente (4 000 pasos) + referencia Hohmann | Error de cierre RK4: **`0,0000 km`** (`4,17e-13 km/s`); caso `178°`: `32,7286 km/s` vs `32,7294 km/s` Hohmann. | **Correcto** |
| **Efemérides sin extrapolación + Misiones integradas + N-cuerpos (`13`, `20`, `21`, `22`, `28`)** | Catálogos Horizons + verificación de continuidad y residuos | Fuera de cobertura (`JD 2450000.5`): `status: "unavailable"`. `A1`: `C3 = 8,9930 km²/s²`, continuidad `1,11 mm`, `TCM-1 = 0,88 m/s` (residuo `0,000 km`). `A1` LC-41 (Etapa 28): `C3 = 8,9315 km²/s²` (desplazamiento intencional `−0,0615 km²/s²` por compensación gravitatoria terrestre fuera de SOI), error N-cuerpos sin corregir `45 028,9 km`. `C1` Juno: completada (`m_f = 2 890,84 kg`). | **Correcto dentro del modelo** |

### 5.2 Clasificación científica obligatoria (separación de niveles)

1. **Datos científicos reales:** efemérides NASA/JPL Horizons y kernels SPK en `public/data/` (con SHA-256 en `evidence/`), constantes GM DE440, tabla IERS de segundos intercalares, catálogo estelar Hipparcos (`V ≤ 6,5`), ortoimágenes USGS/Blue Marble y 22 fotografías originales NASA/JPL ISS.
2. **Modelos físicos aproximados:** cónicas parcheadas con Lambert heliocéntrico de 0 revoluciones, gravedad central de masa puntual dentro de cada SOI (sin armónicos J2, sin presión de radiación solar, sin perturbación lunar en el encuentro planetario salvo ventana galileana), atmósfera terrestre US-1976 simplificada y crucero de *n* cuerpos (ocho planetas como masas puntuales) usado exclusivamente como comparador.
3. **Cálculos implementados y comprobados:** escalas temporales UTC↔TAI↔TT↔TDB, integrador DOPRI54, propagación de empuje finito con masa variable, solucionador de Lambert, plano B, captura apuntada, empalme de salida desde LC-41 con compensación gravitatoria terrestre fuera de SOI (Etapa 28), y comparador N-cuerpos con TCM-1.
4. **Representaciones ilustrativas:** radios visuales ampliados en escala exploratoria, órbitas planetarias dibujadas, orientación CK/IK no validada en primera persona, lanzador demostrativo 12E, ascenso/llamas/nubes del Lanzamiento 3D Voyager, piezas conceptuales del ensamblaje experimental y heliosfera ilustrativa.
5. **Capacidades deliberadamente no implementadas:** integración N-cuerpos continua extremo a extremo de toda la misión, asistencias gravitatorias, transferencias multi-revolución, descenso atmosférico/sondas de entrada, exploración de superficies y certificación de viabilidad operativa para vuelo espacial real.

**Observación científica (MEDIO / documental-metodológico):** Tal como indica `docs/DEVELOPMENT_ROADMAP.md`, las etapas científicas 20, 21, 22, 25 (perfil de ascenso) y 28 fueron comprobadas numéricamente con éxito aquí y en la suite de 485 pruebas, pero siguen sin haber sido auditadas por un equipo externo humano/independiente de ingeniería aeroespacial; y la consistencia dentro de cónicas parcheadas **no equivale a viabilidad de una misión espacial real**. El simulador declara esto de forma visible en la interfaz y en `README.md`.

---

## 6. Rendimiento final en compilación de producción (`APROBADO CON OBSERVACIONES`)

Medido sobre `dist/` (`1600×900`, `DPR 1`, Ryzen 5 5600, Chrome `157.0.8103.79`) en GPU dedicada (`AMD Radeon RX 6650 XT`, monitor `180 Hz`) y en renderizado por software puro (`SwiftShader Vulkan 1.3.0`). Evidencias: [`rendimiento-gpu.json`](evidencias/aceptacion/rendimiento-gpu.json) y [`rendimiento-software.json`](evidencias/aceptacion/rendimiento-software.json).

### 6.1 Tabla comparativa (Línea base de auditoría → Aceptación final)

| Escenario (`1600×900`, producción) | GPU Aceptación (FPS / P95 / P99) | GPU Calls / Tris / GPU ms | Software Base (FPS) | **Software Aceptación (FPS / P95)** | Software Calls / Tris / Ratio | Long Tasks (GPU / SW) |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Solar general** | **179,68** (`5,6 / 5,7 ms`) | `38` / `73 364` / `0,78 ms` | `75,18` | **97,04** (`11,2 ms`) | `34` / `8 548` / `0,70` | `0 / 0` |
| **Tierra cercana** | **178,11** (`5,6 / 5,7 ms`) | `21` / `37 576` / `0,23 ms` | `31,84` | **32,13** (`44,4 ms`) | `19,7` / `13 112` / `0,50` | `0 / 1` |
| **Solar tiempo ×4** | **180,00** (`5,6 / 5,7 ms`) | `10` / `22 290` / `0,25 ms` | `36,29` | **34,49** (`38,8 ms`) | `9` / `11 350` / `0,30` | `0 / 1` |
| **Voyager ambas** | **179,99** (`5,6 / 5,7 ms`) | `26` / `40 228` / `0,13 ms` | `37,15` | **40,35** (`27,9 ms`) | `23` / `4 628` / `0,30` | `0 / 0` |
| **Reloj histórico (`PERF-02`)** | **171,24** (`11,0 / 11,2 ms`) | `35` / `63 584` / `0,15 ms` | `29,56` | **31,28** (`44,3 ms`) | `32` / `25 360` / `0,30` | `0 / 0` |
| **Hangar Cassini (`PERF-01`)** | **180,00** (`5,6 / 5,7 ms`) | `11` / `25 724` / `0,07 ms` (`0` ocultos) | `46,44` | **62,51** (`16,8 ms`) | `11` / `25 724` / `0,30` (`0` ocultos) | `0 / 0` |
| **Planificación (`PERF-01`)** | **179,38** (`5,6 / 5,7 ms`) | **`0 / 0`** (`rafCpu 0,01 ms`) | `132,56` | **177,81** (`5,6 ms`) | **`0 / 0`** (`rafCpu 0,01 ms`) | `0 / 0` |
| **Cálculo A1 plataforma (`PERF-03`)** | Worker `167 ms` | — | Síncrono `362 ms` (`1` LT) | Worker `298 ms` | — | **`0 / 0`** |
| **Centro en reproducción (`PERF-02`)** | **174,68** (`5,7 / 11,1 ms`) | `39,1` / `60 401` / `0,15 ms` | `27,65` | **33,87** (`44,5 ms`) | `36` / `29 660` / `0,30` | `0 / 0` |
| **Centro seguimiento y telemetría** | **172,51** (`5,7 / 11,2 ms`) | `26,1` / `38 337` / `0,15 ms` | `25,63` | **34,12** (`39,0 ms`) | `25` / `27 694` / `0,30` | `0 / 0` |
| **Sistema Solar tras regresar Lab** | **180,00** (`5,6 / 5,7 ms`) | `38` / `73 230` / `0,65 ms` | `75,18` | **125,63** (`11,2 ms`) | `34` / `8 539` / `0,30` | `0 / 0` |
| **Lanz. plataforma (`T−8 s`)** | **179,99** (`5,6 / 5,7 ms`) | `88` / `41 256` / `1,05 ms` | `22,31` (`0,30`) | **26,88\*** (`44,5 ms`, ratio `0,35` en frío) | `53` / `21 864` / `0,35` | `0 / 1` |
| **Lanz. base (`T−2 s`)** | **179,99** (`5,6 / 5,7 ms`) | `84` / `35 028` / `1,48 ms` | `27,45` | **51,48** (`22,3 ms`) | `49` / `19 092` / `0,30` | `0 / 1` |
| **Lanz. despegue (`T+5 s`)** | **179,99** (`5,6 / 5,7 ms`) | `95` / `47 816` / `1,59 ms` | `51,49` | **63,76** (`22,2 ms`) | `60` / `28 156` / `0,30` | `0 / 0` |
| **Lanz. ascenso en movimiento** | **180,00** (`5,6 / 5,7 ms`) | `95` / `47 590` / `2,97 ms` | `33,17` | **57,42** (`22,2 ms`) | `60` / `28 076` / `0,30` | `0 / 0` |
| **Lanz. seguimiento (`T+30 s`)** | **179,99** (`5,6 / 5,7 ms`) | `39` / `21 104` / `1,22 ms` | `71,60` | **83,46** (`16,7 ms`) | `39` / `19 656` / `0,30` | `0 / 0` |
| **Lanz. separación (`T+130 s`)** | **180,01** (`5,6 / 5,7 ms`) | `42` / `143 198` / `0,48 ms` | `75,06` | **79,40** (`16,7 ms`) | `41` / `40 982` / `0,30` | `0 / 0` |
| **Lanz. órbita (`T+1500 s`)** | **178,07** (`5,6 / 5,7 ms`) | `24` / `127 004` / `1,31 ms` | `67,32` | **66,19** (`22,2 ms`) | `23` / `28 244` / `0,30` | `0 / 0` |
| **Lanz. Voyager NASA (`T+4450 s`)** | **180,00** (`5,6 / 5,7 ms`) | `16` / `146 886` / `0,37 ms` | — | **86,33** (`16,7 ms`) | `15` / `44 670` / `0,30` | `0 / 0` |

*\*Explicación de la diferencia en `Lanz. plataforma (T−8 s)` bajo SwiftShader (`26,88 FPS` vs `52,5–54,4 FPS` en Fase 3):* En esta prueba de aceptación se pausó inmediatamente tras abrir y se saltó en frío a `T−8 s` sin reproducir los `8,5 s` de aproximación inicial; `QualityProfile` aún estaba reduciendo el pixel ratio de `0,50 → 0,35` durante la ventana (generando además un fotograma de ajuste de `116,7 ms`). En la ventana inmediatamente siguiente (`T−2 s`, ya estabilizado en `ratio = 0,30`, exactamente como llega el usuario tras el acercamiento normal) sube a **`51,48 FPS`** y mantiene **`57,4–86,3 FPS`** durante todo el resto del lanzamiento. Se registra como observación menor (BAJO) de tiempo de convergencia inicial del escalado adaptativo en software puro.

- **Interpretación hardware:** Los `~171–180 FPS` observados en la AMD RX 6650 XT corresponden a la sincronización con un monitor de `180 Hz` con amplio margen de GPU (`0,07–2,97 ms/frame`), lo cual confirma fluidez sobrada en cualquier monitor estándar de `60–180 Hz` con aceleración por hardware.

---

## 7. UX/UI, compatibilidad y diseño responsivo (`APROBADO CON OBSERVACIONES`)

Evidencia: [`evidencias/aceptacion/funcional-ux-estabilidad.json`](evidencias/aceptacion/funcional-ux-estabilidad.json) y capturas `acc-ux-*.png`.

- **7 resoluciones probadas en Chrome (`1920×1080`, `1600×900`, `1366×768`, `1280×720`, `768×1024`, `390×844` con táctil emulado y `320×568` con táctil emulado):**
  - `0` desbordamientos horizontales (`scrollWidth <= innerWidth`) en Sistema Solar, Misiones Históricas y Laboratorio en todas las resoluciones.
  - Cabecera accesible en las 7 resoluciones tanto en Laboratorio como con la bienvenida histórica abierta (`cabeceraAccesibleEnBienvenida: true`).
  - Tarjeta de bienvenida completa por debajo de la cabecera en las 7 resoluciones (`cabe: true`, incluso a `320×568`: cabecera `96 px`, tarjeta `131–533 px`).
  - `UX-01` (`Tab` contenido + `Escape` cierra) verificado en las 7 resoluciones.
  - Inspección visual de `acc-ux-1920x1080-lab.png`, `acc-ux-768x1024-lab.png` (con protección táctil `Activar control 3D`), `acc-ux-320x568-bienvenida.png` y `acc-ux-320x568-lab.png`.
- **Compatibilidad cruzada en Microsoft Edge (`158.0.4370.33`):** arranque, `/` + `Escape`, bienvenida histórica, cambio de modo y reapertura mediante `#hist-welcome-open-btn`, Lanzamiento 3D y cálculo del Laboratorio en Web Worker superados con **`0` errores**.
- **Observación menor (BAJO) a `320×568`:** En `acc-ux-320x568-lab.png`, el resumen junto al selector de sonda (`5,606 kg · Δ...`) se trunca con puntos suspensivos y las etiquetas de los 3 modos en la fila inferior de la cabecera quedan muy juntas (sin desbordamiento ni solapamiento ni pérdida de clicabilidad).
- **Límite de prueba:** Las resoluciones móviles (`390×844` y `320×568`) se probaron mediante **emulación táctil de Chromium**, no en un teléfono físico real ni en Safari iOS / Firefox; tampoco se ejecutó una prueba con lector de pantalla real (NVDA/Narrador/VoiceOver).

---

## 8. Estabilidad y manejo de errores (`APROBADO`)

Evidencia: [`evidencias/aceptacion/funcional-ux-estabilidad.json`](evidencias/aceptacion/funcional-ux-estabilidad.json):

- **Arranque normal y cambios rápidos entre módulos (8 cambios consecutivos a intervalos de `220 ms`):** `0` `pageerror`, `0` errores de consola, `0` errores HTTP (`>= 400`), bucle de escena principal restaurado (`renderPausado: false`, `rafActivo: true`).
- **Ausencia total de WebGL 2 (`STAB-01`):** `0` `pageerror`, diálogo accesible `role="alertdialog"` (`acc-sin-webgl2.png`), `#data-status` actualizado y `#app` marcado `inert`.
- **Fallo HTTP 500 al cargar efemérides:** `0` `pageerror`, mensaje informativo en `#data-status`, botón `#retry-button` visible y **recuperación completa** al reintentar tras restablecer el servicio.
- **Cierre temprano de Lanzamiento 3D (`160 ms`) y sesión prolongada (10 ciclos en Fase 5 + 5 ciclos en aceptación):** `0` excepciones, `0` promesas rechazadas no manejadas, `0` renderizadores retenidos.

---

## 9. Revisión de la versión publicada en GitHub Pages (`RECHAZADO / DESACTUALIZADA RESPECTO AL ÁRBOL LOCAL`)

Comprobado directamente el `22-11-2026` frente a `https://nata23-dev.github.io/simulador-sondas-espaciales/` y la API de GitHub (`nata23-dev/simulador-sondas-espaciales`):

- **Sitio desplegado actualmente:** responde `HTTP 200`, `Last-Modified: Sun, 22 Nov 2026 17:37:24 GMT`, sirviendo `assets/index-DVCt8Ke0.js`, `assets/three-5g3hM5_C.js` y `assets/index-CLoQ4Xpk.css`.
- **Último commit publicado en GitHub:** `b199f076ab` (`2026-11-22T17:35:19Z`, *«Documentación: estado del proyecto tras las etapas 27–29»*).
- **Diferencia frente al código auditado localmente:** La compilación local actual produce `dist/assets/index-DHoafUra.js`, `IntegratedMissionWorker-D7ZIeyPQ.js` y `WebGLUnavailableNotice-BBKRgWhb.js`. Por tanto, **la versión publicada en GitHub Pages todavía NO contiene las correcciones de las Fases 1 a 5** (`GEN-02`, `STAB-01`, `SCI-01`, `PERF-01`, `LAN-01`, `PERF-02`, `PERF-03`, `UX-01`, `UX-02`, `LAN-02`, `GEN-01`), dado que siguen únicamente en el árbol de trabajo local sin commit ni despliegue (conforme a las restricciones del usuario).

---

## 10. Defectos y observaciones residuales clasificados

No se encontraron defectos **Críticos** ni **Altos** en el código local auditado. Se registran las siguientes observaciones:

| ID | Clasificación | Descripción | Impacto | Recomendación (sin aplicar en esta auditoría) |
| --- | :---: | --- | --- | --- |
| **OBS-ACC-01** | **ALTO (solo despliegue, no código)** | La versión publicada en GitHub Pages sigue en el commit `b199f07` (previo a las Fases 1–5). | Los usuarios en la URL pública aún no reciben ninguna de las 11 correcciones ni el Web Worker. | Cuando el usuario lo autorice: revisar el diff, realizar commit en la rama, integrar en `main` y dejar que `.github/workflows/deploy.yml` publique y verificar luego la URL pública. |
| **OBS-ACC-02** | **MEDIO (alcance / auditoría externa)** | Las etapas científicas 20, 21, 22, 25 (perfil) y 28 carecen de revisión por un evaluador aeroespacial externo independiente al ciclo de desarrollo. | No impide entregar el simulador educativo/experimental con sus avisos actuales, pero impide presentarlo como herramienta validada de ingeniería espacial. | Mantener explícitas las advertencias de modelo simplificado en la UI y `README.md`. |
| **OBS-ACC-03** | **BAJO** | En SwiftShader puro, un salto inmediato en frío a `T−8 s` sin calentamiento de entrada opera brevemente a `ratio = 0,35` (`26,88 FPS`) antes de estabilizarse en `ratio = 0,30` (`51,48–86,33 FPS`). | Transitorio de `~2 s` solo si se salta en frío sin aceleración GPU; en flujo normal tras el acercamiento entra ya en `0,30`. | Opcional futuro: inicializar el ratio del lanzamiento en `0,30` cuando `isSoftwareRenderer === true`. |
| **OBS-ACC-04** | **BAJO** | A `320×568` en Laboratorio (`acc-ux-320x568-lab.png`), el resumen `5,606 kg · Δ...` junto al selector de sonda se trunca con elipsis y los botones de modo de la cabecera quedan con margen muy ajustado. | Estético en pantallas ultrapequeñas (`320 px`); sin desbordamiento ni controles bloqueados. | Opcional futuro: permitir salto de línea en el resumen de sonda bajo `360 px`. |
| **OBS-ACC-05** | **BAJO (verificación)** | No se probaron Firefox, Safari, Linux/macOS, teléfono físico real ni lector de pantalla real (NVDA/Narrador/VoiceOver). | Compatibilidad fuera de Windows + Chrome/Edge inferida por estándares web, no medida directamente. | Declarar explícitamente el entorno verificado al presentar la entrega. |

---

## 11. Evidencias reproducibles generadas en esta aceptación

Todas almacenadas en `docs/auditoria-final/evidencias/aceptacion/` sin alterar evidencias previas:

- **Guiones:** [`auditoria-ciencia.mjs`](evidencias/aceptacion/auditoria-ciencia.mjs), [`auditoria-funcional-ux-estabilidad.mjs`](evidencias/aceptacion/auditoria-funcional-ux-estabilidad.mjs), [`auditoria-rendimiento.mjs`](evidencias/aceptacion/auditoria-rendimiento.mjs).
- **Resultados JSON:** [`ciencia-aceptacion.json`](evidencias/aceptacion/ciencia-aceptacion.json), [`funcional-ux-estabilidad.json`](evidencias/aceptacion/funcional-ux-estabilidad.json), [`rendimiento-gpu.json`](evidencias/aceptacion/rendimiento-gpu.json), [`rendimiento-software.json`](evidencias/aceptacion/rendimiento-software.json).
- **Capturas de producción verificadas:** `acc-solar-1600.png`, `acc-historico-comparador.png`, `acc-lanzamiento-voyager.png`, `acc-lab-centro-cassini.png`, `acc-sin-webgl2.png`, `acc-ux-1920x1080-*.png`, `acc-ux-1366x768-*.png`, `acc-ux-768x1024-*.png`, `acc-ux-390x844-*.png`, `acc-ux-320x568-*.png`.
