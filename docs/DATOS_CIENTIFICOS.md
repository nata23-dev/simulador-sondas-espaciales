# Datos científicos e integridad

**Todo lo necesario para ejecutar, probar y compilar el simulador está en el repositorio**; no hay descargas adicionales. El archivo rastreado más grande pesa ≈19 MB (límite de GitHub: 100 MB por archivo), por lo que no se usa Git LFS.

| Contenido | Ubicación | Uso |
| --- | --- | --- |
| Efemérides planetarias diarias, catálogos, Hipparcos | `public/data/` | Ejecución y pruebas |
| Lunas, encuentros y tramos históricos Voyager | `public/data/historical/`, `public/data/*-v1.json` | Modo histórico |
| Texturas, fotografías NASA, `Voyager.glb` | `public/textures`, `public/images`, `public/models` | Presentación (créditos en sus README) |
| Modelos 3D de NASA de la flota (Cassini, Dawn, Juno) y decodificador Draco (15.1) | `public/models/nasa` (decodificador Draco: el de `three`, desde la etapa 18) | Presentación, archivos originales sin modificar; procedencia, commits y SHA-256 en sus README |
| Solicitudes Horizons y manifiestos con hash | `evidence/voyager-*`, `evidence/stage*` | Auditorías reproducibles sin red |
| Kernels SPK originales y alternativos (09B) | `evidence/voyager-reference-reconciliation/Kernels`, `evidence/voyager-stage9b/Kernels` | Diagnóstico; no son la trayectoria activa |

**Integridad.** `.gitattributes` fija LF en los datos (los SHA-256 dependen de ello). Verificaciones: `npm run audit:voyager` (49 conjuntos y 10 SPK, comparación sin red; puede actualizar la marca de tiempo de `evidence/voyager-stage8/audit.json`) y `py -3 scripts/verify-stage9b-kernels.py` (tamaño, SHA-256 y procedencia de los 11 kernels de 09B). No se comprimen ni modifican datos para publicarlos.

**Procedencia.** Efemérides de NASA/JPL Horizons y kernels SPK de NAIF; detalle por conjunto en los documentos de etapa ([índice](README.md)). Las condiciones de redistribución son las de las fuentes originales; este repositorio no las amplía ni añade una licencia.
