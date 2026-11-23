# Evidencia científica de referencia

Esta carpeta conserva únicamente las consultas originales de NASA/JPL Horizons, los kernels SPK de referencia y los manifiestos con sumas SHA-256 que verifican la integridad de los datos astronómicos utilizados por el simulador y por su batería de pruebas automatizadas (`npm test` y `npm run audit:voyager`).

## Contenido conservado

- `stage2-2/ConsultasOriginales/`: consultas originales a NASA/JPL Horizons para los seis encuentros planetarios de Voyager 1 y Voyager 2 (Júpiter, Saturno, Urano y Neptuno) con sus archivos `.request.json` y hashes SHA-256.
- `stage2-3/ConsultasOriginales/` y `stage2-3/Kernels/`: consultas originales y kernels SPK oficiales de NASA/NAIF que documentan los empalmes de trayectoria de Voyager 1 y 2.
- `stage4/Horizons-original/` y `stage4/absolute-frame-audit.json`: consultas Horizons originales y auditoría de marco absoluto para Luna, Europa, Titán, Titania y Tritón.
- `stage6/Horizons-original/`: consultas Horizons originales para Ío, Ganímedes, Calisto, Encélado y Miranda.
- `voyager-reference-reconciliation/`: inventarios verificados (`input-inventory.json`, `global-continuity.json`, `encounters.json`, `spk-audit.json`) y kernels de referencia `vgr1.x2100.bsp` / `vgr2.x2100.bsp`.
- `voyager-stage8/audit.json`: resultado reproducible de `npm run audit:voyager`.

Los archivos de esta carpeta son evidencia científica de entrada para las pruebas automatizadas y no deben alterarse manualmente.
