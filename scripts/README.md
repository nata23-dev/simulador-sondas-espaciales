# Scripts de adquisición y verificación científica

Esta carpeta reúne únicamente los scripts activos de adquisición de efemérides/imágenes desde NASA/JPL y verificación offline de integridad científica.

## Scripts conservados

| Script | Propósito |
| --- | --- |
| `HorizonsAcquisition.mjs` | Utilidad compartida para consultar NASA/JPL Horizons, validar encabezados y calcular sumas SHA-256 (importada por las pruebas científicas). |
| `efemerides-2026-profile.json` | Perfil de adquisición de las efemérides planetarias de octubre de 2026. |
| `descargar-efemerides.mjs` | Descarga las efemérides heliocéntricas planetarias (`public/data/efemerides-2026.json`). |
| `adquirir-efemerides-historicas.mjs` | Descarga y empaqueta el catálogo histórico de Voyager 1 y Voyager 2 (1977–2026). |
| `acquire-moons-stage4.mjs` | Adquisición de efemérides planetocéntricas para Luna, Europa, Titán, Titania y Tritón. |
| `acquire-stage6-moons.mjs` | Adquisición de efemérides planetocéntricas para Ío, Ganímedes, Calisto, Encélado y Miranda. |
| `acquire-stage6-voyager-photos.mjs` | Adquisición de las fotografías oficiales NASA/JPL del modo histórico Voyager. |
| `acquire-stage12g-interplanetary.mjs` | Adquisición de efemérides interplanetarias de cobertura amplia (`2026-11-18` → `2046-01-01`). |
| `acquire-stage13-encounters.mjs` | Adquisición de ventanas de encuentro para satélites galileanos. |
| `audit-voyager-stage8.mjs` | Auditoría offline reproducible de los 49 conjuntos de datos históricos y 10 kernels SPK (`npm run audit:voyager`). |
| `voyager-reference-utils.mjs` | Funciones auxiliares compartidas por `audit-voyager-stage8.mjs`. |
