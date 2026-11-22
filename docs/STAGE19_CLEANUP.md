# Etapa 19 · Limpieza

Estado: **implementada y probada localmente (21-11-2026)**. Auditoría: Claude, que también la implementó (ver al final). No cambia física, constantes, marcos, datos, hashes, kernels, fotografías ni modelos: solo retira código y reglas que nada usa, mueve originales que la aplicación no carga y añade índices.

## Decisiones

| Punto del plan (§5) | Decisión | Motivo |
| --- | --- | --- |
| Motor de descenso y aterrizaje 12F y `LandingPlanner.js` | **Se conservan** | Está probado y aprobado por Gemini, `IntegratedMission` lo usa (con `landing.enabled: false`) y la regla del proyecto es no borrar funcionalidades. La interfaz sigue sin ofrecerlo, por la decisión del usuario en 15.1. `LandingPlanner.js` lo comprueba una prueba de 12F.1 |
| Exportaciones sin uso | **Se retiran 8 funciones muertas**: `sampleInsertionSegment`, `saveDesign`, `powerBalance`, `jdTdbToCalendarDate`, `elapsedSecondsToJdTdb`, `getHistoricalMissionByNaifId`, `hasBodyProfile`, `landingDestinations` | Ningún archivo de `src/`, `tests/` ni `scripts/` las usa, ni dentro de su propio módulo. Se conservan las constantes declarativas sin uso (versiones de modelo, `FRAME_CONTRACTS`, `SCENE_AXES`, `TIME_SCALE_NOTE`, `VOYAGER_ISS_WAC_FOV_DEG`…), porque documentan contratos de marcos, escalas y versiones |
| CSS heredado | **Retiradas las reglas sin destino**: `.welcome-features-grid`, `.welcome-feature-item`, `#main-mode-links` (también dentro de selectores compuestos) y `.hist-more-jumps` | Ningún HTML ni JS genera esas clases o ids. El CSS compilado pasa de 216,62 a 215,69 kB |
| 92 `!important` y capas sobrescritas | **No se consolidan en esta etapa** | Tocan todas las pantallas. Consolidarlos sin una revisión visual completa contradice la regla de corregir de forma localizada; se dejan para la etapa 24, con la regresión del navegador como control |
| Originales de texturas de lunas (3,3 MB) | **Movidos sin modificar** de `public/textures/moons/` a [`source-assets/textures/moons/`](../source-assets/textures/moons/README.md) con `git mv`, con su SHA-256 y un aviso en el README de procedencia | La aplicación no los carga y se publicaban. Los guiones de auditoría de las etapas 10 y 11 y `derive-io-seam-texture.py` leen ahora desde la nueva ruta |
| Guiones | **Índice en [`scripts/README.md`](../scripts/README.md)**, sin moverlos: 8 vigentes, 24 de auditoría científica, 13 de adquisición, 7 de derivación, 39 de verificación visual de etapas cerradas y 4 de respaldo | Los documentos e informes los citan por su ruta y muchos calculan rutas relativas a `scripts/`; moverlos rompería esa trazabilidad |
| `evidence/` (2 644 archivos y unos 66 MB en Git) | **No se borra nada ya versionado**. Las evidencias nuevas se aligeran: la regresión de la etapa 18 conserva su registro JSON y 8 capturas de 102 (20 → 1,9 MB) | Quitar evidencias versionadas no reduce `.git`, porque el historial las conserva, y sacarlas a adjuntos de *release* es una acción externa que requiere tu decisión sobre qué etapas y dónde |

## Pruebas

- Suite completa: **330/330** tras retirar el código. Ningún archivo importaba lo retirado y la comprobación de importaciones huérfanas en los módulos tocados no encuentra ninguna.
- `npm run build` correcto; el CSS compilado ya no contiene los selectores retirados.
- `git diff --check` limpio.

## Pendiente de tu decisión

- Sacar evidencias de etapas cerradas del repositorio (por ejemplo `voyager-stage9b`, unos 50 MB, y `tercer_avance`) a adjuntos de *release* o a un almacenamiento externo.
- Retirar `LandingPlanner.js` y la prueba de 12F.1 que lo lee, si se descarta definitivamente volver a ofrecer el aterrizaje.

## Auditoría (Claude, implementador)

Método distinto de la implementación: detector automático de exportaciones sin uso (busca el nombre en todo `src/`, `tests/` y `scripts/`), detector de importaciones huérfanas tras retirar código, comparación del CSS compilado y suite completa. **Aprobada.** Observación: la consolidación del CSS queda abierta.
