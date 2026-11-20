# Etapa 14 — Renovación visual integral e inventario de capacidades para el tercer avance

**Estado:** implementada y verificada localmente el 18-11-2026 (pruebas automáticas, build y recorrido en Chrome sin interfaz con SwiftShader; la última ejecución del guion quedó **incompleta**, ver §6). **Pendiente:** revisión visual humana en un navegador con GPU y documentación visual independiente de Gemini. La etapa es **solo de presentación**: no cambia modelos físicos, efemérides, kernels, datos Voyager, pruebas científicas ni resultados de 12G o 13.

Leer con [sistema visual](UI_DESIGN_SYSTEM.md), [arquitectura](ARCHITECTURE_MAP.md) y [hoja de ruta](DEVELOPMENT_ROADMAP.md).

## 1. Qué cambió

| Ámbito | Cambio | Archivos |
|---|---|---|
| Capa visual común | Tokens de espacio, paneles, líneas, texto, oro, azul y estados; radios, sombras, curvas y duraciones. Paneles translúcidos, botones, campos, tablas, métricas y foco coherentes. Se importa al final, sin reescribir hojas anteriores; las reglas base usan `:where()` (especificidad cero) para no ganar a reglas existentes. | `src/ui/theme.css` (nuevo), `src/main.js` |
| Navegación unificada | Botón «Áreas» en la cabecera con el mapa de las 12 áreas en cuatro grupos (Explorar; Laboratorio · Diseñar / Planificar / Ejecutar). Marca el área actual (`aria-current`), se cierra con Escape o clic exterior y reutiliza los botones de modo y el evento `lab:navigate`. El modo «Experimental» se rotula «Laboratorio». | `src/ui/AppNavigator.js` (nuevo), `index.html` |
| Cabecera del laboratorio | Ruta (Laboratorio › paso › herramienta), título y descripción de la herramienta, banda de contexto con **Sonda activa** (masa húmeda y Δv ideal ya calculados por Ingeniería) y **Centro de Misión** (misión preparada), botón «Abrir Centro de Misión». Navegación en tres pasos numerados: 1 Diseñar, 2 Planificar, 3 Ejecutar. | `src/ui/ExperimentalLaboratory.js` |
| Centro de Misión | HUD superpuesto (tipo de misión, fase con pulso al cambiar, época, tiempo transcurrido y hasta cuatro métricas ya calculadas); barra de reproducción en la escena (evento anterior, retroceso, reproducir/pausar, evento siguiente, pista con marcas de eventos pulsables y tiempo restante); interruptores Control / Telemetría / Vista amplia. El HUD **lee** los valores que ya muestra la telemetría; no recalcula nada. | `src/ui/MissionControlCenter.js`, `src/ui/theme.css` |
| Sistema Solar | Órbitas de referencia algo más legibles (opacidad 0,088/0,125 → 0,14/0,20; geometría sin cambios). Ficha del cuerpo con cifra principal dorada y números tabulares, procedencia destacada, pestañas del inspector con transición. Etiquetas planetarias en píldora con estado de selección. | `src/graphics/SolarSystem.js`, `src/ui/theme.css` |
| Voyager | Paneles, línea temporal, dock e inspector con el mismo vidrio y tokens; sin cambios de datos, fotos, modelo ni cámaras. | `src/ui/theme.css` |
| Estados de proceso | Botones «Calcular misión» (13) y «Buscar ventanas» (12G) muestran un indicador giratorio mientras calculan (`aria-busy`). Paneles de resultados vacíos de Lanzamiento y Descenso explican qué acción los llena. Veredictos largos se ajustan sin desbordar. | `src/ui/IntegratedMissionPlanner.js`, `src/ui/InterplanetaryPlanner.js`, `src/ui/theme.css` |
| Animaciones | Entrada breve de secciones (`ui-enter`), panel de áreas (`ui-pop`), cambio de fase del HUD (`hud-phase`), transiciones de botones y pestañas. Con `prefers-reduced-motion: reduce` todas quedan a 1 ms. Ninguna retrasa acciones. | `src/ui/theme.css` |
| Responsive | Cortes a 1280, 1180, 1100, 820, 760, 560 y 420 px. En ≤760 px el botón «Áreas» pasa a icono en la primera fila de la cabecera; en ≤560 px la cabecera del laboratorio se compacta (acciones en una fila, contexto en dos columnas, pasos sin rótulo); en ≤820 px el Centro oculta interruptores de panel y métricas del HUD; en ≤420 px el HUD se oculta y la barra de reproducción se compacta. | `src/ui/theme.css` |
| Verificación | Guion Playwright en Chrome para todas las áreas y seis resoluciones. | `scripts/verify-stage14-browser.mjs` (nuevo) |

Defectos encontrados y corregidos durante la revisión en navegador:

1. Botones de ejecución sin estilo y veredicto de 13 desbordado en el planificador integrado.
2. Panel de áreas dibujado **detrás** de la escena del laboratorio en móvil: la cabecera creaba un contexto de apilamiento. El panel se mueve a `#app` y la cabecera deja de usar `backdrop-filter`.
3. Botón «Áreas» superpuesto al selector de modos a 768 px: pasa a icono por debajo de 1180 px.
4. Cabecera del laboratorio de casi media pantalla en 390 px: compactada.
5. Barra de reproducción del Centro sobre el pie de escala en móvil: desplazada y pie recortado.

## 2. Mapa de áreas y acceso

Todas las áreas se abren desde **Áreas** (cabecera). Las tres primeras también desde el selector de modos.

| # | Área | Acceso directo | Destino | Estado científico |
|---|---|---|---|---|
| 1 | Sistema Solar | Áreas › Sistema Solar, o «Sistema Solar» | modo `exploracion` | Efemérides NASA/JPL Horizons validadas (etapas 1–9) |
| 2 | Voyager | Áreas › Misiones históricas Voyager, o «Misiones históricas» | modo `historico` | Datos SPK/Horizons; trayectoria global 1977–2026 **no certificada como continua** (cortes SPK documentados) |
| 3 | Laboratorio (simulación orbital) | Áreas › Simulación orbital experimental | escena de la Sonda Experimental 01 | DOPRI54, experimental |
| 4 | Hangar | Áreas › Hangar | sección `hangar` | Piezas ilustrativas |
| 5 | Ingeniería | Áreas › Ingeniería | sección `engineering` | Ecuación de Tsiolkovsky, parámetros ilustrativos |
| 6 | Tierra–Luna | Áreas › Planificación Tierra–Luna | Planificador, modalidad `lunar` | 12B/12B.1 |
| 7 | Propulsión y maniobras | Áreas › Propulsión y maniobras | Planificador `lunar`, desplazado a los controles de empuje finito | 12D/12D.1 |
| 8 | Lanzamiento | Áreas › Lanzamiento terrestre | sección `launch` | 12E aprobada con observaciones, corregidas en 12E.1 |
| 9 | Descenso y aterrizaje | Áreas › Descenso y aterrizaje | sección `landing` | 12F aprobada; observaciones corregidas en 12F.1 |
| 10 | Interplanetarias | Áreas › Misiones interplanetarias | Planificador `interplanetary` | 12G aprobada por Gemini |
| 11 | Misión completa | Áreas › Misión completa | Planificador `integrated` | **13 pendiente de auditoría de Gemini** |
| 12 | Centro de Misión | Áreas › Centro de Misión, o «Abrir Centro de Misión» | sección `center` | Reproduce el resultado de la herramienta que lo envía |

## 3. Inventario de capturas para Gemini

Convenciones: «Evidencia» apunta a `evidence/stage14/`. Los nombres marcados con † **no existen todavía**: la última ejecución se interrumpió antes de generarlos (§6) y deben regenerarse (generada por `node scripts/verify-stage14-browser.mjs`, prefijo `d1920_` = 1920×1080, `d1600_`, `l1366_`, `t768_`, `m390_`, `m320_`). Los resultados esperados se toman de los documentos de cada etapa; esta etapa no produce resultados nuevos. Las capturas de la verificación son con SwiftShader: la iluminación y el suavizado pueden diferir de una GPU real.

### 3.1 Sistema Solar

| Qué fotografiar | Acceso | Parámetros | Acción | Resultado esperado | Evidencia |
|---|---|---|---|---|---|
| Vista general | Carga inicial | Fecha por defecto | — | Sol iluminando, planetas con texturas, órbitas legibles, campo estelar, línea temporal inferior | `d1920_01_solar_overview.png` |
| Mapa de áreas | Botón «Áreas» | — | Abrir | 12 entradas en 4 grupos, área actual marcada | `d1920_02_area_map.png`, `m390_02_area_map.png` |
| Selección de un planeta | Buscar destino › Júpiter | — | Seleccionar | Cámara encuadra Júpiter; ficha con distancia heliocéntrica en AU y km, rapidez, coordenadas y procedencia Horizons | `d1920_03_solar_jupiter_selected.png` |
| Escala, seguimiento, reencuadre, zoom | Dock derecho | — | Reencuadrar / modo de escala | Centros sin cambio; radios exploratorios o científicos rotulados | Captura manual pendiente |
| Lunas | Seleccionar Tierra, Júpiter o Saturno y acercar | — | — | Satélites con su ficha | Captura manual pendiente |

### 3.2 Voyager

| Qué fotografiar | Acceso | Parámetros | Acción | Resultado esperado | Evidencia |
|---|---|---|---|---|---|
| Bienvenida | «Misiones históricas» | — | — | Diálogo para recorrido guiado o exploración libre | `d1920_04_voyager_welcome.png` |
| Exploración | «Explorar libremente» | 20-08-1977 | — | Voyager 2 · paso 1 de 12, buscador, línea temporal 1977–2026 con UTC y TDB | `d1920_05_voyager_explore.png`, `t768_03_voyager.png`, `m390_03_voyager.png` |
| Datos, Historia, Fotos, Cámaras | Pestañas del inspector | — | Cambiar pestaña | Telemetría con procedencia, 14 acontecimientos, fotografías NASA con crédito, cámaras exterior/sonda | `d1920_06…09_voyager_*.png` |
| Recorrido guiado y comparador foto/3D | «Iniciar recorrido», paso con fotografía | Encuentros de V1 y V2 | Avanzar pasos | Tarjeta A (foto NASA) y B (render con aviso de fidelidad) | Captura manual pendiente |
| Corte SPK | Fecha dentro de un empalme documentado | Ver [cortes](VOYAGER_STAGE08_VISUAL_CLOSEOUT.md) | — | «No disponible» explícito, sin interpolar | Captura manual pendiente |

### 3.3 Laboratorio: diseño

| Qué fotografiar | Acceso | Parámetros | Acción | Resultado esperado | Evidencia |
|---|---|---|---|---|---|
| Hangar | Áreas › Hangar | Configuración «Exploración interplanetaria» | — | Catálogo, nave 3D (11 piezas), «Ensamblaje válido», banda de contexto «561 kg · Δv ideal 1,26 km/s» | `d1920_11_lab_hangar.png`, `d1600_02_hangar.png`, `l1366_02_hangar.png`, `m390_04_hangar.png`, `m320_04_hangar.png` |
| Ingeniería | Áreas › Ingeniería | Igual | — | Masas, propelente, motores, Δv ideal | `d1920_12_lab_engineering.png` |
| Simulación orbital | Áreas › Simulación orbital experimental | — | — | Sonda Experimental 01 en el Sistema Solar | `d1920_10_lab_orbital_simulation.png` |

### 3.4 Laboratorio: planificación y ejecución

| Qué fotografiar | Acceso | Parámetros | Acción | Resultado esperado | Evidencia |
|---|---|---|---|---|---|
| Lanzamiento, estado vacío | Áreas › Lanzamiento terrestre | Valores por defecto | — | Panel de resultados con indicación de la acción | `d1920_13_launch_empty.png`, `m390_05_launch.png` |
| Lanzamiento, resultados | Igual | Valores por defecto | «Calcular lanzamiento» | Fases, eventos, órbita resultante según [12E](STAGE12E_EARTH_LAUNCH.md) | `d1920_14_launch_results.png` |
| Lanzamiento en el Centro | Botón de ejecución | — | Pausa y tercer evento | HUD «Lanzamiento terrestre» con altitud, velocidad, masa | `d1920_15_center_launch.png` |
| Descenso en la Luna | Áreas › Descenso y aterrizaje | Destino Luna, órbita y guiado por defecto, época 2026-10-10 12:00 | «Calcular descenso» | ATERRIZAJE SUAVE SEGÚN EL MODELO (T+3958 s; [12F](STAGE12F_MULTIBODY_LANDING.md)) | `d1920_16_landing_results.png` |
| Contacto con cámara local | Ejecutar › evento «Contacto» › «Cámara local» | — | — | Módulo sobre la superficie, HUD de descenso | `d1920_17_center_landing_contact_local.png` |
| Tierra–Luna | Áreas › Planificación Tierra–Luna | Valores por defecto | «Calcular transferencia» y ejecutar | Trayectoria translunar calculada y veredicto; reproducción en el Centro | `d1920_18_lunar_planner_result.png`, `d1920_19_center_lunar.png` † |
| Propulsión finita | Áreas › Propulsión y maniobras | — | — | Controles de empuje finito y masa variable | `d1920_20_finite_thrust_controls.png` † |
| Ventanas interplanetarias | Áreas › Misiones interplanetarias | Tierra → Marte, rango por defecto | «Buscar ventanas» | Diagrama porkchop y mejor ventana 2028-11-30 → 2029-10-12, 316 d, C3 8,996 km²/s² ([12G](STAGE12G_INTERPLANETARY_PLANNING.md)) | `d1920_21_interplanetary_windows.png` †, `m390_08_interplanetary.png` |
| Misión completa A1 | Áreas › Misión completa | Escenario A1 (Marte, apoapsis 33 000 km) | «Calcular misión» | Órbita objetivo alcanzada; inserción 1184,5 m/s ([13](STAGE13_INTEGRATED_MISSIONS.md) §5.1) | `d1920_22_integrated_A1_mars.png` † |
| Misión completa B2 | Igual | B2 (50 000 kg) | «Calcular misión» | SIN CAPTURA · SOBREVUELO HIPERBÓLICO; NO VIABLE para el escenario | `d1920_23_integrated_B2_not_viable.png` † |
| Misión completa B1 | Igual | B1 (Júpiter → Europa → descenso) | «Calcular misión» | Cadena completa según el modelo, 13 tramos | `d1920_24_integrated_B1_europa.png` †, `d1600_03_integrated_B1.png`, `m390_09/10_integrated_*.png` |

### 3.5 Centro de Misión (misión B1)

| Qué fotografiar | Acción | Resultado esperado | Evidencia |
|---|---|---|---|
| Entrada en la SOI de Júpiter | Ejecutar B1, pausar, evento correspondiente | HUD «Misión completa», fase y época; marcas de eventos en la pista | `d1920_25_center_B1_jupiter_soi.png` † |
| Inserción en órbita de Júpiter | Evento «Inserción en órbita de Júpiter · inicio» | Fase y métricas de la inserción | `d1920_26_center_B1_joi.png` †, `m390_11_center_stage.png` |
| Vista amplia | «Vista amplia» | Control y telemetría ocultos; escena a todo el ancho | `d1920_27_center_wide_view.png` † |
| Barra de reproducción | Evento siguiente ×2, reproducir, pausar | La fase avanza; estado REPRODUCIENDO/PAUSADA | `d1920_28_center_wide_transport.png` † |
| Transferencia a Europa | Evento «Encendido de transferencia hacia Europa · inicio» | Arco planetocéntrico | `d1600_04_center_transfer.png`, `l1366_04_center_transfer.png` |
| SOI de Europa | Evento correspondiente | Cambio de contexto al satélite | `d1920_29_center_B1_europa_soi.png` † |
| Contacto en Europa | Evento «Contacto», «Cámara local» | Módulo en la superficie; descenso 12F | `d1920_30_center_B1_touchdown_local.png` † |
| Telemetría en móvil | Desplazarse a la telemetría | Valores con unidades y procedencia | `m390_12_center_telemetry.png`, `m320_12_center_telemetry.png` † |

Cámaras disponibles en el Centro: vista general, seguimiento exterior, desde la sonda, cámara de destino, cinematográfica y cámara local (descensos). Ritmo temporal automático por fase o fijo (Sol, Planeta, Satélite, Descenso).

## 4. Escenarios de demostración reproducibles

Ejecutar `npm ci` y `npm run dev`, y abrir la URL indicada. Todos usan valores por defecto salvo lo indicado.

1. **Sistema Solar.** Buscar destino › Júpiter. Repetir con Saturno.
2. **Voyager.** Misiones históricas › Explorar libremente › pestañas Datos, Historia, Fotos y Cámaras. Recorrido guiado para el comparador.
3. **Diseño.** Hangar con «Exploración interplanetaria»; Ingeniería.
4. **Lanzamiento.** Calcular lanzamiento › ejecutar › pausar › saltar por eventos.
5. **Descenso.** Luna y Europa con valores por defecto › Calcular descenso › ejecutar › Contacto › Cámara local.
6. **Tierra–Luna.** Calcular transferencia › ejecutar. Con «Propulsión y maniobras», activar el empuje finito.
7. **Interplanetaria (12G).** Tierra → Marte por defecto; Júpiter con rango 2028-01-01 y «Sugerir rango». Ejecutar en el Centro.
8. **Misión completa (13).** A1, A2, A3, B1 y B2 en el selector de escenario › Calcular misión. B1 › ejecutar › recorrer eventos con la barra de la escena › Vista amplia › Contacto › Cámara local.

## 5. Estado por capacidad

| Capacidad | Estado |
|---|---|
| Sistema Solar con efemérides Horizons | VALIDADO (etapas anteriores) |
| Voyager 1977–2026 | VALIDADO por tramos; continuidad global **no certificada**; cortes SPK señalados |
| Hangar e Ingeniería | EXPERIMENTAL (parámetros ilustrativos) |
| Tierra–Luna (12B/12B.1), empuje finito (12D) | EXPERIMENTAL; auditado |
| Lanzamiento (12E/12E.1) | EXPERIMENTAL; aprobado con observaciones corregidas |
| Descenso multicuerpo (12F/12F.1) | EXPERIMENTAL; Luna y Europa operativos según el modelo |
| Interplanetarias (12G) | EXPERIMENTAL; aprobado por Gemini |
| Misión completa (13) | **PENDIENTE de auditoría de Gemini** |
| Centro de Misión (12C) | Implementado; aprobación independiente de 12C pendiente |
| Renovación visual (14) | Verificada localmente con SwiftShader; **pendiente** revisión humana con GPU y documentación de Gemini |

«VIABLE SEGÚN EL MODELO» no equivale a éxito operativo.

## 6. Verificación

- `node --test tests/*.test.mjs`: 259 pruebas, 259 superadas (sin cambios en las pruebas).
- `npm run build`: correcto.
- `git diff --check`: sin incidencias.
- Chrome sin interfaz (SwiftShader): `node scripts/verify-stage14-browser.mjs desktop|laptop|mobile`. Cada parte escribe `evidence/stage14/browser-verification-<parte>.json` con capturas, desbordamiento horizontal por captura, errores de consola y comprobaciones (rutas de las 12 áreas, cierre con Escape, marcas de eventos, vista amplia, barra de reproducción, movimiento reducido). La ejecución completa (`all`) supera 10 minutos.

Resultado de la última ejecución (18-11-2026), **incompleta**:

| Parte | Capturas | Resultado |
|---|---|---|
| `desktop` (1920×1080) | 18 (01–18) | Las **12 rutas del mapa de áreas** llegan a su destino; el panel se cierra con Escape; sin desbordamiento horizontal ni errores de consola. El guion se detuvo en la reproducción Tierra–Luna (el diseño por defecto da INSUFICIENTE y el botón de pausa no estaba disponible). El guion ya no se bloquea en ese paso, pero las capturas 19–30 **no se regeneraron**. |
| `laptop` (1600×900, 1366×768) | 8 | Completa, sin errores ni desbordamiento. |
| `mobile` (768×1024, 390×844, 320×568) | 28 (12 + 12 + 4) | 768 y 390 completas. El sistema detuvo el proceso por falta de memoria durante 320×568; no se escribió su registro JSON. Una ejecución previa solo de 390×844 terminó sin errores. |

El servidor de desarrollo y las tres partes fueron detenidos por el sistema por falta de memoria y no se relanzaron. El Centro de Misión B1 (inserción en Júpiter, vista amplia, barra de reproducción, contacto con cámara local) sí se ejercitó en Chrome a 1600×900 y 390/768 px durante la revisión con capturas de trabajo no incorporadas al repositorio. Para completar la evidencia: `node scripts/verify-stage14-browser.mjs desktop` y `… mobile` con memoria suficiente.

## 7. Límites y pendientes

- Sin revisión humana en GPU real; SwiftShader no reproduce la iluminación final.
- Las transiciones de cámara siguen siendo las existentes de Three.js; no se añadió interpolación nueva entre cámaras del Centro para no alterar el encuadre que usan las pruebas de 12C–13.
- El HUD toma la fase del resultado vigente; en la frontera exacta de un evento puede mostrar la fase anterior, que es la lógica existente de 13.
- Algunas cadenas largas (sonda activa) se recortan con puntos suspensivos y conservan el texto completo en el título emergente.
- Los recorridos guiados de Voyager, el comparador y los cortes SPK no forman parte del guion automático: requieren captura manual.
- `experimental-laboratory.css`, `workspace-layout.css` y `style.css` no se reescribieron; la capa nueva se superpone. Una consolidación futura de hojas requiere autorización propia.
- El HUD muestra solo magnitudes escalares; si la telemetría de una misión solo ofrece un vector de velocidad (lanzamiento), el HUD omite la velocidad y la telemetría la conserva completa.
- Sin commit, push, despliegue ni ZIP.
