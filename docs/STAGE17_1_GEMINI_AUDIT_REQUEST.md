# Encargo de auditoría independiente — etapa 17.1

**Para:** el auditor: Gemini o, desde el 20-11-2026, Claude (procedimiento de [GEMINI.md](../GEMINI.md)). **De:** implementación (Claude). **Rama:** `revision/modo-historico-voyager`.

> **Estado:** Claude la auditó el 20-11-2026 declarando que también la implementó: [STAGE17_1_AUDIT_CLAUDE.md](STAGE17_1_AUDIT_CLAUDE.md), dictamen «aprobado con observaciones». Este encargo sigue valiendo para una segunda revisión de Gemini.

Audita, no implementes. Las comprobaciones y conclusiones de [STAGE17_1_MAIN_SCENE_PLAYBACK.md](STAGE17_1_MAIN_SCENE_PLAYBACK.md) y de [ANALISIS_INTEGRAL_Y_PLAN_DE_MEJORA.md](ANALISIS_INTEGRAL_Y_PLAN_DE_MEJORA.md) son del implementador: no las tomes como evidencia propia.

## Alcance

1. **Reproducción en el Sistema Solar principal** de las misiones heliocéntricas del laboratorio («Misión completa» A1–A3 y ventanas de Lambert): planetas en la época TDB de cada instante con las mismas efemérides del cálculo, sin extrapolar; sonda igual a la muestra heliocéntrica; restauración de la exploración al salir.
2. **Retirada de la Sonda Experimental 01 de la interfaz**, con `ExperimentalProbe01.js`, DOPRI54 y sus pruebas conservados.
3. **Correcciones del 20-11-2026:**
   - etiqueta de fase repetida (`arrival` frente a `arrival-helio`);
   - final exacto de la línea de tiempo;
   - texto de la órbita resultante en las capturas y nuevo rótulo de A1;
   - cámara de destino recalculada en cada fotograma;
   - reencuadre al cambiar el tamaño de la escena;
   - `aria-valuetext` y anuncio de fases;
   - código y CSS sin uso retirados.

## Comprobaciones pedidas

| # | Qué | Cómo (independiente) |
| --- | --- | --- |
| 1 | Misión A1 (Cassini → Marte): Lambert, C3, tramos keplerianos, hipérbola, esfera de influencia, ecuación del cohete, órbita final 315,5 × 100 000 km | Recalcula con tu propio código. El implementador dejó [`scripts/audit-stage17_1-independent-science.mjs`](../scripts/audit-stage17_1-independent-science.mjs) como referencia: revísalo, pero no lo uses como único oráculo |
| 2 | Efemérides 2026–2046 frente a una referencia externa (Horizons en línea, SPICE o Standish) | Marco ICRF eclíptico J2000, centro del Sol, TDB, km |
| 3 | Que la escena principal dibuje exactamente esos estados (ejes `(x,y,z) → (x,z,−y)`, 32 u/AU) | `window.__SIMULADOR_DIAGNOSTICO__.obtenerDiagnosticoEscena()` y `obtenerEstadoMisionEscenaPrincipal()` en el navegador |
| 4 | Rechazo sin cobertura (no extrapolar) | Prueba 17.1 de Neptuno o una ventana fuera de 2026–2046 |
| 5 | Interfaz en 320, 390, 768, 1366 y 1920 px; sin errores de consola; flujo guiado completo | `npm run dev` |
| 6 | Accesibilidad | Teclado; lector de pantalla real (NVDA o Narrador): la revisión del implementador fue solo automática |
| 7 | No regresión | Exploración, histórico Voyager y el resto del laboratorio |

## Comandos

```bash
npm ci
node --test tests/*.test.mjs          # 323/323 tras 17.1.1
npm run build && GITHUB_PAGES=true npm run build
node scripts/audit-stage17_1-independent-science.mjs   # 31/31 según el implementador
node scripts/verify-stage17-browser.mjs scene          # GPU=1 para la GPU real; EVIDENCE_DIR para otra carpeta
```

## Entrega

Informe en `docs/STAGE17_1_INDEPENDENT_AUDIT.md` (Gemini) o `docs/STAGE17_1_AUDIT_CLAUDE.md` (Claude) y evidencias en `evidence/stage17_1/auditoria/`, con defectos numerados, gravedad, reproducción y dictamen: aprobada, aprobada con observaciones o rechazada.
