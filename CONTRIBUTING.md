# Guía de contribución

Gracias por colaborar. Este proyecto prioriza la **integridad científica** sobre la rapidez.

## Preparar el entorno

Instala Git y Node.js ≥ 22. Después:

```bash
git clone https://github.com/nata23-dev/simulador-sondas-espaciales.git
cd simulador-sondas-espaciales
npm ci
npm test
npm run dev
```

Detalles y problemas frecuentes: [docs/DEVELOPMENT_GUIDE.md](docs/DEVELOPMENT_GUIDE.md). Antes de tocar nada, lee [PROJECT_CONTEXT](docs/PROJECT_CONTEXT.md), [ARCHITECTURE_MAP](docs/ARCHITECTURE_MAP.md) y [DEVELOPMENT_ROADMAP](docs/DEVELOPMENT_ROADMAP.md).

## Flujo de trabajo

1. Crea una rama desde la de desarrollo: `git checkout -b etapa/<nombre-corto>`.
2. Trabaja **una etapa o corrección a la vez**; no mezcles rediseños con ciencia.
3. Ejecuta `npm test`, `npm run build` y `git diff --check`. Si cambias interfaz, revísala en el navegador (320 px, tablet y escritorio).
4. Documenta la etapa (ver abajo) y presenta los cambios con: archivos, motivo, pruebas y resultado, límites y evidencia externa pendiente.
5. Una auditoría (Gemini o Claude, véase [CLAUDE.md](CLAUDE.md)) decide si la etapa queda aprobada; no te autoproclames «validado».

## Documentar una etapa

Crea `docs/STAGE<id>_<TEMA>.md` con alcance, modelo, constantes y procedencia, pruebas, limitaciones y estado. Actualiza [PROJECT_CONTEXT](docs/PROJECT_CONTEXT.md), [DEVELOPMENT_ROADMAP](docs/DEVELOPMENT_ROADMAP.md) y el [índice](docs/README.md). Guarda evidencias relevantes en `evidence/<etapa>/` y enlázalas desde [evidence/README.md](evidence/README.md). Usa enlaces relativos, nunca rutas absolutas de tu equipo.

## Convenciones de código

- JavaScript ES modules, sin dependencias nuevas sin justificación.
- `src/science/` y la lógica de `src/lab/` no dependen del DOM ni de Three.js.
- Unidades en el nombre o el contrato (km, km/s, s, kg, N). Rutas públicas con `import.meta.env.BASE_URL`.
- Cada módulo con física nueva lleva pruebas en `tests/*.test.mjs`, con al menos una comparación independiente cuando sea posible.

## Integridad científica

- No inventes datos, constantes ni resultados. Indica procedencia, marco, unidades y escala temporal.
- No modifiques efemérides, kernels, hashes ni fotografías para que algo coincida.
- No debilites pruebas para que pasen.
- No interpoles ni extrapoles en silencio fuera de la cobertura.

## Commits

Mensajes cortos, claros y **en español**: `Integrar aterrizajes multicuerpo`, `Actualizar guías de desarrollo`. Evita `Cambios varios`. No reescribas historial publicado ni uses `--force`. No subas secretos, `.env` ni archivos locales.
