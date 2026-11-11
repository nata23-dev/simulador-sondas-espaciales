# Recuperar el Simulador de Sondas Espaciales en otra laptop Windows

El respaldo de las Etapas 08–11B está en la rama `revision/modo-historico-voyager` del repositorio `https://github.com/nata23-dev/simulador-sondas-espaciales.git`. Esa rama conserva los dos cortes SPK científicos; no es necesario descargar kernels para iniciar el simulador.

## Instalación limpia

Instala **Git** y **Node.js 24** (con npm). En PowerShell:

```powershell
git clone --branch revision/modo-historico-voyager --single-branch https://github.com/nata23-dev/simulador-sondas-espaciales.git
cd simulador-sondas-espaciales
npm ci
node --test tests/*.test.mjs
node scripts/audit-voyager-stage8.mjs
npm run build
npm run dev
```

Abre la URL local que muestre Vite. `npm ci` usa `package-lock.json`; `node_modules/` y `dist/` se generan localmente y no forman parte del respaldo. El proyecto funciona sin Python para la aplicación, las pruebas JavaScript y la compilación.

La auditoría de Etapa 08 comprueba los **49 conjuntos de efemérides** y los **10 SPK originales**. Puede actualizar `evidence/voyager-stage8/audit.json` al ejecutarse; si Git indica una diferencia tras la verificación, revisa el resultado antes de continuar trabajando. Los **11 kernels alternativos** archivados en la Etapa 09B se comprueban sin red con Python 3:

```powershell
py -3 scripts/verify-stage9b-kernels.py
```

El script verifica el tamaño, SHA-256, nombre y procedencia del manifiesto `evidence/voyager-stage9b/kernel-manifest.csv`. Los binarios están guardados con sus nombres originales en `evidence/voyager-stage9b/Kernels/`; no forman parte de la trayectoria activa del simulador.

## Diagnósticos científicos opcionales

Para repetir las comparaciones CSPICE de las Etapas 09 y 09B, instala Python 3 y SpiceyPy en un entorno local, sin añadirlo al repositorio:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install spiceypy==8.3.0
.\.venv\Scripts\python.exe scripts/diagnose-voyager-stage9.py
.\.venv\Scripts\python.exe scripts/compare-voyager-stage9b.py
```

Los scripts de adquisición `scripts/audit-voyager-stage9b-alternatives.py` sólo son necesarios para volver a consultar el archivo NAIF. Los kernels ya están incluidos y pueden validarse sin descargas con `verify-stage9b-kernels.py`.

Las capturas reproducibles de Chrome de Etapas 08–11B requieren Google Chrome y Playwright 1.56.1. Los scripts de 11/11B buscan Playwright en `%LOCALAPPDATA%\CodexScientificTools\voyager-e2e\node_modules\playwright`; puede instalarse allí de forma opcional con `npm install --prefix "$env:LOCALAPPDATA\CodexScientificTools\voyager-e2e" playwright@1.56.1`. Chrome debe estar en su ruta estándar de Windows. Estas herramientas son de verificación visual y no son necesarias para usar el simulador.

## Informes y datos

- Etapa 08: `docs/VOYAGER_STAGE08_VISUAL_CLOSEOUT.md` y `evidence/voyager-stage8/`.
- Etapa 09: `docs/VOYAGER_STAGE09_SPK_ROOT_CAUSE.md` y `evidence/voyager-stage9/`.
- Etapa 09B: `docs/VOYAGER_STAGE09B_ALTERNATIVE_KERNELS.md` y `evidence/voyager-stage9b/`.
- Etapa 10: `docs/VOYAGER_STAGE10_VISUAL_PHOTOMETRY.md` y `evidence/voyager-stage10/`.
- Etapa 11: `docs/VOYAGER_STAGE11_VISUAL_UX_REFINEMENT.md` y `evidence/voyager-stage11/`.
- Etapa 11B: `docs/VOYAGER_STAGE11B_FINAL_REFINEMENT.md` y `evidence/voyager-stage11b/`.

El código está en `src/`, los tests en `tests/`, las herramientas en `scripts/` y los recursos utilizados por la aplicación en `public/` y `assets/`. Las fotografías NASA/JPL, texturas y modelos 3D se conservan en esas rutas con sus referencias documentadas. `public/` contiene las efemérides que carga la aplicación. Los informes científicos distinguen los datos certificados de los efectos de presentación.
