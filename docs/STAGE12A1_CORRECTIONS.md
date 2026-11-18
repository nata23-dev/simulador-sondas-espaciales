# Etapa 12A.1 — Correcciones del Laboratorio Experimental 2.0

Base: auditoría independiente `docs/STAGE12A_INDEPENDENT_AUDIT.md` y capturas en `evidence/stage12a/`. Se preservaron los cambios existentes. No se modificaron datos científicos, DOPRI54, efemérides, SPK ni especificaciones físicas ficticias.

## Defectos corregidos

| Defecto | Cambio |
| --- | --- |
| DEF-01 Aterrizador | Puntales y almohadillas descienden hasta el plano de apoyo. La medida usa `THREE.Box3` tras aplicar las transformaciones reales de las mallas ensambladas: tobera `−1,959 m`, almohadillas `−2,080 m`, holgura positiva `0,121 m` en el Explorador Lunar. La rejilla decorativa quedó bajo los apoyos. No cambió ningún punto de conexión del motor ni de las patas. |
| DEF-02 Propulsión | `planPartChange` identifica pieza, ranura y propelente en conflicto. La interfaz ofrece reemplazar por una pieza compatible, retirar expresamente la incompatible o cancelar. `applyPartChange` construye una propuesta única, valida el resultado y solo entonces lo entrega; una falla no altera el diseño anterior. El tanque nuevo se anuncia como lleno y sus métricas se recalculan. También funciona el cambio inverso de tanque. |
| DEF-03 Tableta | Hasta 820 px se usa el diseño apilado con el visor de ancho completo; catálogo e ingeniería quedan debajo con scroll vertical. Los paneles no dependen de columnas de ~200 px. |
| DEF-04 Montaje | La cámara recibió un soporte hacia el casco. El tanque se desplazó hacia fuera y recibió un collar de montaje visible. Batería, almacenamiento y herramienta lateral también quedaron externos con soportes. Las separaciones de cuerpo y el alcance de soportes se midieron sobre mallas montadas para los tres buses. |
| DEF-05 Tacto | En puntero táctil, el visor empieza en modo de scroll vertical (`pan-y`) con OrbitControls desactivado. Un botón activa de forma intencional rotación y zoom; otro toque lo desactiva. Al salir del constructor se libera cualquier captura de puntero y se restablece el scroll. |
| DEF-06 Encabezado | Un `ResizeObserver` mide el borde inferior real del encabezado y de la navegación. El laboratorio y el botón de retorno usan esa medida, sin un `inset` fijo de 100 px. |
| DEF-07 Recursos | `dispose()` cancela RAF, desconecta el observador, libera capturas y listeners del canvas, OrbitControls, geometrías, materiales y texturas propias, listas y contexto WebGL; retira el canvas. Los cambios de modo reutilizan una sola vista, desconectan OrbitControls y detienen su bucle mientras está oculta. La interfaz expone su cierre para desmontaje/HMR. |
| DEF-08 Navegación | `HistoricalModeControls` sincroniza `aria-pressed` y activa el modo cuando `data-app-mode` cambia por otra ruta, además de los clics. Constructor y Simulación Orbital conservan Experimental como modo principal; Sistema Solar y Misiones Históricas resaltan su pestaña correspondiente. |

Las mediciones geométricas adicionales de cámara y tanque muestran cuerpos exteriores al cilindro del bus y soportes que alcanzan la pared. En los preajustes interplanetario, orbitador y lunar, el tanque deja respectivamente `5,8`, `4,1` y `7,85 cm` hasta el casco; el soporte lo alcanza y penetra en su punto de fijación. La cámara deja `8,3`, `8,4` y `9,45 cm` de separación del cuerpo, puenteados por su mástil. Estas cifras proceden de las transformaciones de las mallas, no de una corrección de cámara.

## Archivos

- Modificados: `src/lab/ComponentCatalog.js`, `src/lab/ProbeDesign.js`, `src/lab/ProbeAssemblyView.js`, `src/ui/ExperimentalLaboratory.js`, `src/ui/experimental-laboratory.css`, `src/ui/HistoricalModeControls.js` y `src/main.js`.
- Nuevos: `tests/ProbeLaboratoryCorrections.test.mjs` y este documento.
- Sin cambios: `src/lab/ProbeEngineering.js` y los módulos de Sistema Solar, trayectorias Voyager, efemérides y dinámica orbital.

## Verificación local y pendientes

`node --test tests/ProbeLaboratoryCorrections.test.mjs`: 6 pruebas aprobadas. Cubren sustitución/retirada atómicas, cancelación sin mutación, métricas tras reemplazo y medidas de geometría real. `npm.cmd run build`: compilación correcta; persiste el aviso de tamaño del paquete de Vite. La inspección integral en Chrome de 320 px, 768 px, gestos táctiles y conmutación entre los cuatro estados visibles corresponde a Gemini. No se generaron nuevas capturas ni evidencias masivas.
