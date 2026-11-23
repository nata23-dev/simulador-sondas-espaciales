# Dictamen Final de Aceptación (`08_DICTAMEN_FINAL.md`)

- **Dictamen sobre el código local auditado (`revision/modo-historico-voyager`, `b199f07` + Fases 1–5):** **APROBADO CON OBSERVACIONES MENORES**
- **Dictamen sobre la versión actualmente publicada en GitHub Pages:** **DESACTUALIZADA** (todavía sirve `b199f07`, sin las Fases 1–5; pendiente de commit, merge a `main` y despliegue cuando el usuario lo autorice).
- **Fecha:** 22-11-2026

---

## Respuestas Ejecutivas Directas

### 1. ¿El simulador funciona correctamente?
**Sí.** En la compilación de producción (`GITHUB_PAGES=true npm run build`) verificada sobre Google Chrome `157.0.8103.79` y Microsoft Edge `158.0.4370.33`, los tres módulos (**Sistema Solar**, **Misiones Históricas Voyager 1/2** y **Laboratorio de Misiones** con recorridos completos de Cassini → Marte y Juno → Júpiter/Europa) y el **Lanzamiento 3D** operan sin errores de página, sin errores de consola y sin peticiones HTTP fallidas, con recuperación limpia ante fallos simulados de WebGL 2 y de red (`HTTP 500`).

### 2. ¿Se cerraron los 11 hallazgos?
**Sí, los 11 hallazgos (`GEN-02`, `STAB-01`, `SCI-01`, `PERF-01`, `LAN-01`, `PERF-02`, `PERF-03`, `UX-01`, `UX-02`, `LAN-02` y `GEN-01`) están cerrados y verificados con evidencia reproducible.** Solo `LAN-01` conserva una observación menor (`OBS-ACC-03`): en renderizado por software puro (`SwiftShader`), saltar en frío a `T−8 s` antes de que el perfil adaptativo baje de `0,35` a `0,30` muestra brevemente `26,88 FPS`, subiendo inmediatamente a `51,48–86,33 FPS` en cuanto alcanza `ratio = 0,30`.

### 3. ¿Se conservaron la precisión científica y la calidad visual?
**Sí.**
- **Precisión científica:** Las **`485 / 485`** pruebas automatizadas y la verificación analítica independiente (`ciencia-aceptacion.json`) confirman la exactitud de UTC/TAI/TT/TDB y segundos intercalares (`SCI-01`), DOPRI54 (`1,08 cm` tras 5 órbitas excéntricas $e=0,6$, conservación energética `1,0e-11`), caída radial (`0,049 mm`), Tsiolkovsky en empuje finito (`4,5e-13 kg`), solucionador de Lambert (`0,0000 km` frente a RK4 independiente), continuidad de cónicas parcheadas (`1,11 mm`), salida desde plataforma LC-41 (`C3 = 8,9315 km²/s²`, error N-cuerpos `45 028,9 km`) y ausencia de extrapolación fuera de cobertura.
- **Calidad visual:** Inspeccionada directamente en capturas de producción en escritorio (`1920×1080`, `1600×900`, `1366×768`), tablet (`768×1024`) y móvil (`390×844`, `320×568`). En GPU dedicada se conserva el `100 %` del detalle geométrico, sombras 4096, anisotropía 16×, modelos oficiales NASA y paleta oscura con acento dorado.

### 4. ¿El rendimiento es satisfactorio?
**Sí.**
- **Hardware acelerado (`AMD Radeon RX 6650 XT`, monitor `180 Hz`, `1600×900`):** **`171,24 – 180,01 FPS`** en todos los escenarios (Sistema Solar, Histórico, Laboratorio y las 8 ventanas del Lanzamiento 3D), con `0` Long Tasks y carga de GPU de `0,07–2,97 ms/frame`.
- **Renderizado por software (`SwiftShader Vulkan`, `1600×900`):** mejoras consolidadas en todos los frentes (`Solar general` `97,04 FPS`, `Reloj histórico` `31,28 FPS`, `Centro en reproducción` `33,87 FPS`, `Hangar Cassini` `62,51 FPS` con `0` renders ocultos, `Planificación` `177,81 FPS` con `0` renders, `Lanzamiento 3D` `51,48–86,33 FPS` a ratio `0,30`, cálculo A1 en Web Worker con **`0` Long Tasks**).
- **Memoria WebGL (`LAN-02`):** `0` renderizadores retenidos y `1` contexto WebGL2 activo tras ciclos repetidos y cierres tempranos.

### 5. ¿Existen problemas críticos o altos pendientes?
- **En el código local auditado:** **Ninguno** (`0` defectos críticos, `0` defectos altos).
- **En el despliegue público:** Existe únicamente un desfase operativo (`OBS-ACC-01`): GitHub Pages aún publica `b199f07` y no el código local de las Fases 1–5.

### 6. ¿Puede considerarse terminado?
**Sí, como versión final de entrega del alcance actualmente definido y documentado** (explorador del Sistema Solar, misiones históricas Voyager 1/2 con comparador NASA y Lanzamiento 3D, y Laboratorio de misiones con flota fija NASA y cónicas parcheadas). Las capacidades de `VISION_FINAL.md` deliberadamente fuera de esta entrega (asistencias gravitatorias, integración N-cuerpos continua de toda la misión, construcción libre sin flota fija, descenso atmosférico) están correctamente documentadas como no implementadas.

### 7. ¿Está listo para desplegar la versión final?
**El código local sí está listo para revisión de commits y despliegue.** Sin embargo, **la publicación todavía no se ha realizado** (por restricción explícita de no hacer commit, merge ni push en esta auditoría). Pasos recomendados tras tu autorización:
1. Revisar el estado de Git local y crear commits limpios por fase o consolidados en `revision/modo-historico-voyager`.
2. Integrar en `main` (o la rama configurada en `.github/workflows/deploy.yml`) y permitir que CI (`lint`, `test`, `build`) y GitHub Pages publiquen la compilación nueva.
3. Realizar una comprobación rápida de humo sobre `https://nata23-dev.github.io/simulador-sondas-espaciales/` verificando que sirva los nuevos bundles (`IntegratedMissionWorker-*.js`, `WebGLUnavailableNotice-*.js`).

### 8. ¿Qué limitaciones deben declararse al presentar el proyecto?
1. **Alcance del modelo físico:** Las misiones del Laboratorio usan **cónicas parcheadas** (Lambert 0 revoluciones, masa puntual en cada SOI, sin J2 ni presión solar) con un comparador N-cuerpos en paralelo; *«viable según el modelo» no certifica viabilidad operativa de una misión espacial real*.
2. **Cortes y fidelidad histórica:** Las trayectorias globales de Voyager 1 (1981) y Voyager 2 (1989) presentan cortes SPK documentados; las vistas en primera persona y comparaciones fotográficas usan apuntado geométrico sin kernels CK/IK y no son fotografías reales; el ascenso del Lanzamiento 3D es una reconstrucción ilustrativa calibrada.
3. **Auditoría externa de física avanzada:** Las etapas científicas 20, 21, 22, 25 (perfil) y 28 están probadas numéricamente con éxito (`485/485`), pero no han pasado revisión por un especialista aeroespacial externo.
4. **Cobertura de plataformas probadas:** Verificado en **Windows 11 + Google Chrome 157 (GPU y SwiftShader) y Microsoft Edge 158**, con emulación táctil de escritorio a `390×844` y `320×568`. No se probó en teléfonos físicos reales, Firefox, Safari (macOS/iOS), Linux ni lectores de pantalla reales (NVDA/Narrador/VoiceOver).
5. **Observaciones menores estéticas/transitorias:** Truncado menor de `5,606 kg · Δ...` a `320 px` (`OBS-ACC-04`) y ajuste inicial breve del pixel ratio si se salta en frío a `T−8 s` sin GPU (`OBS-ACC-03`).
