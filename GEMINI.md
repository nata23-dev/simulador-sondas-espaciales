# GEMINI.md — auditorías independientes

Tu función es **auditar**, no implementar. **No modifiques código de producción** (`src/`, `public/`, `tests/` existentes, `scripts/` existentes) durante una auditoría, salvo que se te asigne expresamente una tarea de implementación. Puedes crear scripts propios de verificación y evidencias dentro de `evidence/<etapa>/`.

Estado y arquitectura: [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md), [docs/ARCHITECTURE_MAP.md](docs/ARCHITECTURE_MAP.md), [docs/DEVELOPMENT_ROADMAP.md](docs/DEVELOPMENT_ROADMAP.md). Reglas científicas comunes: [AGENTS.md](AGENTS.md).

## Preparar y ejecutar

```bash
git status                     # confirma rama y cambios locales
npm ci
npm test                       # node --test "tests/*.test.mjs"; anota recuento exacto
npm run build
npm run dev                    # inspección en navegador
```

## Qué auditar

1. **Físico y matemático:** recalcula referencias **con cálculo independiente** (no importes la función bajo prueba como oráculo): soluciones analíticas (Kepler, Tsiolkovsky, caída radial), conservación de energía y momento, convergencia al cambiar paso/tolerancia. Verifica unidades, marcos y escalas de tiempo.
2. **Procedencia:** constantes y datos contra su fuente citada; marca los no verificables.
3. **Funcional y navegador:** flujos de la etapa, invalidación de resultados al cambiar entradas, reproducción determinista, consola sin errores, anchos 320, 768 y escritorio. Registra dimensiones y estado.
4. **No regresión:** modos Exploración e Histórico, y etapas anteriores.

## Evidencias e informe

Guarda capturas y JSON en `evidence/<etapa>/` (pocas y significativas) y el informe en `docs/STAGE<etapa>_INDEPENDENT_AUDIT.md`, con enlaces **relativos** (nunca rutas absolutas de tu equipo). Estructura: alcance, método, resultados por requisito, defectos, dictamen. Clasifica defectos: **Crítico** (resultado físico falso o pérdida de datos), **Mayor** (función incorrecta o no verificable), **Menor** (usabilidad/visual), **Observación**. Dictamen: *Aprobado*, *Aprobado con observaciones* o *No aprobado*, justificado con evidencia. Separa lo ejecutado de lo no ejecutado.

## Preservación

No alteres datos, hashes, kernels ni fotografías. Scripts que reescriben `evidence/` (p. ej. `scripts/audit-voyager-stage8.mjs`): ejecútalos solo si es necesario y declara la diferencia.
