# Guía de Migración y Puesta en Marcha en Otra Laptop

**Proyecto:** Simulador de Sondas Espaciales (Sistema Solar y Misiones Voyager 1 y 2)  
**Fecha de Respaldo:** 3 de noviembre de 2026  
**Rama de Trabajo:** `revision/modo-historico-voyager`  
**Commit de Respaldo:** Último commit de la rama `revision/modo-historico-voyager` (`HEAD`)  
**URL del Repositorio:** `https://github.com/nata23-dev/simulador-sondas-espaciales.git`  
**Entorno de Referencia:** Windows 10/11 x64 · PowerShell 7 / Windows PowerShell 5.1 · Node.js v24.14.0 · npm 11.11.0 · Vite 8.3.4  

---

## 1. Requisitos Previos en la Nueva Computadora

Antes de clonar, asegúrate de tener instalado en tu nueva laptop:

1. **Git para Windows**: Versión 2.40+ ([git-scm.com](https://git-scm.com/)).
2. **Node.js**: Versión 22 LTS o superior (versión probada: `v24.14.0`). Se requiere soporte nativo de `node --test` y módulos ECMAScript (`"type": "module"`).
3. **NPM**: Versión 10+ (versión probada: `11.11.0`), incluida con Node.js.
4. **Git LFS (Opcional / Informativo)**: Todos los archivos del repositorio (incluidos los modelos 3D `.glb`, texturas 2K y kernels SPK `.bsp`) se conservan dentro de los límites estándar de GitHub (<20 MB por archivo, muy por debajo del límite de 100 MB). No es indispensable Git LFS para clonar este repositorio, pero si lo tienes instalado puedes ejecutar `git lfs pull`.

---

## 2. Comandos de Clonación y Configuración Inicial (PowerShell)

Abre una terminal de **PowerShell** en el directorio donde desees alojar tus proyectos (ejemplo: `C:\Proyectos` o tu carpeta de usuario) y ejecuta en orden:

```powershell
# 1. Clonar directamente la rama activa con todo el historial y recursos
git clone -b revision/modo-historico-voyager https://github.com/nata23-dev/simulador-sondas-espaciales.git

# 2. Entrar al directorio del proyecto
cd simulador-sondas-espaciales

# 3. Confirmar la rama activa y el último commit
git status
git log -1 --oneline
```

---

## 3. Instalación de Dependencias

El proyecto utiliza dependencias declaradas en `package.json` (`three` y `vite`):

```powershell
# Instalar exactamente las dependencias del package-lock.json
npm ci
```

*(Si por alguna razón `npm ci` reporta diferencias de entorno en Windows, puedes utilizar `npm install`).*

---

## 4. Verificación de Integridad de Datos Científicos

El simulador cuenta con un script de auditoría fuera de línea que valida las sumas de verificación **SHA-256** de los **49 conjuntos astronómicos de producción de NASA/JPL Horizons** y de los **10 kernels SPK oficiales de NAIF/SPICE**:

```powershell
# Ejecutar la auditoría de integridad de datos astronómicos y kernels SPK
node scripts/audit-voyager-stage8.mjs
```

**Resultado esperado:**
```text
voyager-1 11 sources 1 catalog gaps 4 overlap intervals 106 same-time references max 0.537151 km / 3.000e-4 km/s
voyager-2 14 sources 1 catalog gaps 7 overlap intervals 145 same-time references max 3.926287 km / 3.180e-4 km/s
Verified 49 production dataset and 10 SPK SHA-256 hashes; wrote evidence/voyager-stage8/audit.json
```

---

## 5. Ejecución de la Batería de Pruebas Automatizadas

El proyecto cuenta con **107 pruebas automatizadas** que validan:
- Dinámica orbital (RK4, DOPRI54, dos cuerpos, escape hiperbólico, término indirecto heliocéntrico).
- Efemérides Horizons, interpolación Hermite cúbica y marcos de referencia (ICRF/Eclíptica).
- Conversión precisa UTC $\leftrightarrow$ TDB con segundos intercalares IERS.
- Coberturas cronológicas, saltos SPK de 1981 y 1989 y discontinuidades de catálogo.
- Geometría de cámaras, encuadre angular, campo visual ISS (0,424°) y retorno exterior.
- Catálogo de fotos auténticas NASA/JPL con integridad SHA-256.
- Vectores directos de los 9 encuentros lunares (Ío, Europa, Ganímedes, Calisto, Titán, Miranda, Titania, Tritón).
- Modelo 3D de Voyager (`Voyager.glb`), fotometría solar inversa ($1/r^2$) y escala 1:1.

Ejecuta el conjunto completo de pruebas con:

```powershell
# Ejecutar todas las suites de prueba unitarias y de integración
node --test tests/*.test.mjs
```

**Resultado esperado:**
```text
ℹ tests 107
ℹ suites 0
ℹ pass 107
ℹ fail 0
```

---

## 6. Compilación de Producción

Para comprobar que el empaquetado de producción con Vite funciona limpiamente y sin errores de resolución de rutas o módulos:

```powershell
# Compilar bundle de producción
npm run build
```

**Resultado esperado:**
Generación exitosa de la carpeta `dist/` con `dist/index.html`, hojas de estilo CSS y chunks JavaScript minificados.

---

## 7. Iniciar el Simulador en Modo Desarrollo

Para trabajar interactivamente con el simulador y Three.js con recarga en caliente:

```powershell
# Iniciar servidor local de desarrollo
npm run dev
```

El servidor Vite mostrará la URL local:
```text
  VITE v8.3.x  ready in ... ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

Abre esa dirección en tu navegador (Google Chrome, Edge, Firefox con soporte WebGL2).

---

## 8. Verificación de Recursos Críticos

Comprueba que existan en tu clon los siguientes directorios y archivos indispensables:

| Recurso | Ruta | Propósito |
|---|---|---|
| **Modelo 3D** | `public/models/voyager/Voyager.glb` | Modelo oficial NASA VTAD de las sondas Voyager 1 y 2 |
| **Catálogo Estelar** | `public/data/hipparcos-vmag-6p5.tsv` | Catálogo Hipparcos con magnitudes hasta 6.5 |
| **Catálogo Efemérides** | `public/data/historical-ephemerides-catalog-v1.json` | Registro de los 49 conjuntos de efemérides Horizons |
| **Contextos Lunares** | `public/data/historical-encounter-contexts-v1.json` | Índices de los 9 encuentros lunares y 5 planetarios |
| **Vectores Relativos** | `public/data/historical/encounter-relative/` | Archivos JSON con series cinemáticas de aproximación lunar |
| **Lunas Históricas** | `public/data/historical/moons/` | Efemérides de satélites naturales en épocas de sobrevuelo |
| **Texturas Lunares** | `public/textures/moons/` | Mapas 2K y máscaras observacionales USGS/Galileo/Voyager |
| **Fotos Históricas** | `public/images/voyager/` | Fotografías auténticas NASA/JPL y miniaturas |
| **Kernels SPK** | `evidence/stage2-3/Kernels/` y `evidence/voyager-reference-reconciliation/Kernels/` | 10 archivos BSP auditados para verificación SPICE |
| **Documentación Etapas** | `docs/` | Informes técnicos de etapas 01 a 08 y reconciliación científica |
| **Auditoría Integral** | `AUDITORIA_INTEGRAL_SIMULADOR_VOYAGER/` | Informe completo con matriz, 72 evidencias y guía técnica |

---

## 9. Comandos Resumen para Mañana

```powershell
git clone -b revision/modo-historico-voyager https://github.com/nata23-dev/simulador-sondas-espaciales.git
cd simulador-sondas-espaciales
npm ci
node scripts/audit-voyager-stage8.mjs
node --test tests/*.test.mjs
npm run build
npm run dev
```
