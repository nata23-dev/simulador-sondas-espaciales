# Guía de desarrollo

## Requisitos e instalación

Git y Node.js ≥ 22 (`engines` en `package.json`; CI prueba 22 y 24). `npm ci` instala exactamente lo de `package-lock.json`. Dependencias: `three` (ejecución) y `vite` (desarrollo). No se necesita Python para la aplicación, las pruebas ni el build.

## Comandos (de `package.json`)

| Comando | Acción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo de Vite. |
| `npm test` | `node --test "tests/*.test.mjs"`. |
| `npm run build` | Build de producción en `dist/` (ruta `/`). |
| `GITHUB_PAGES=true npm run build` | Build con base `/simulador-sondas-espaciales/` (PowerShell: `$env:GITHUB_PAGES='true'; npm run build`). |
| `npm run preview` | Sirve `dist/`. |
| `npm run audit:voyager` | Auditoría de los conjuntos Voyager; **puede reescribir `evidence/voyager-stage8/audit.json`** (si todo coincide, solo cambia `generatedAtUtc`). |

## Arquitectura y flujo de datos

Mapa completo: [ARCHITECTURE_MAP.md](ARCHITECTURE_MAP.md). Principio: `science/` (puro) → `integration/` (adaptador a escena) → `graphics/` (Three.js) → `ui/` (controles); `main.js` coordina los modos `exploracion`, `historico` y `experimental`. El laboratorio (`src/lab/`) separa diseño, ingeniería, trayectoria, lanzamiento, descenso, reproducción y telemetría; el Centro de Misión (`src/ui/MissionControlCenter.js`) reproduce ejecuciones según su `kind`.

## Cómo añadir un cuerpo celeste

1. Datos: efemérides en `public/data/` con manifiesto y hash (ver [DATOS_CIENTIFICOS.md](DATOS_CIENTIFICOS.md)); no inventes valores.
2. Parámetros físicos (GM, radio) en los catálogos existentes; el registro `src/lab/CelestialBodyMissionRegistry.js` los lee y declara qué falta.
3. Presentación en `src/graphics/` y texturas con créditos en `public/textures/README.md`.
4. Actualiza la [matriz de capacidades](MULTIBODY_MISSION_CAPABILITY_MATRIX.md) y añade pruebas.

## Cómo añadir una funcionalidad científica

Contrato primero (unidades, marco, tiempo, límites) en `docs/`; módulo puro en `src/science/` o `src/lab/`; pruebas con referencia independiente; adaptador visual aparte; documento de etapa; auditoría independiente.

## Pruebas

Archivos `tests/*.test.mjs` con el ejecutor nativo `node:test`. Usa tolerancias con justificación física. Una prueba nueva no debe depender de rutas absolutas ni de red.

## Auditorías

Procedimiento en [GEMINI.md](../GEMINI.md). Informes en `docs/STAGE*_INDEPENDENT_AUDIT.md`; evidencias en [evidence/README.md](../evidence/README.md). Scripts de auditoría de 12E: `evidence/stage12e/audit-scripts/` (ejecutar con `node` desde la raíz).

## Continuar desde otra computadora

Clona, `npm ci`, `npm test`. Los datos científicos están en el repositorio. Lee [PROJECT_CONTEXT](PROJECT_CONTEXT.md) y el [roadmap](DEVELOPMENT_ROADMAP.md); [MIGRACION_OTRA_LAPTOP.md](MIGRACION_OTRA_LAPTOP.md) conserva el procedimiento histórico para Windows.

## Problemas frecuentes

- **`npm ci` falla o faltan módulos:** borra `node_modules`, comprueba `node -v` ≥ 22 y repite `npm ci`.
- **Versión de Node incorrecta:** Vite 8 exige un Node moderno; usa nvm o fnm.
- **Recursos 404 en Pages:** construye rutas con `import.meta.env.BASE_URL`; compila con `GITHUB_PAGES=true` para probar la base.
- **Probar la base de Pages en local:** compila con `GITHUB_PAGES=true` y ejecuta `npm run preview`; sirve bajo `/simulador-sondas-espaciales/`.
- **Dataset ausente o hash distinto:** no regeneres; restaura desde Git (`git checkout -- <archivo>`) y revisa `.gitattributes` (los datos exigen LF).
- **GitHub Pages sin actualizar:** Settings → Pages → Source: GitHub Actions; el despliegue ocurre al enviar a `main`.
