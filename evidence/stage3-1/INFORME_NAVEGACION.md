# Etapa 03.1 — cierre de navegación

Fecha: 1 de noviembre de 2026. Alcance: ajustes puntuales de acceso móvil, panel, ayudas de cámara y empaquetado. Se conservaron las pantallas, el HUD oscuro y las capacidades de la Etapa 03. No se cambiaron efemérides, trayectorias, velocidades, distancias ni cálculos de FOV. La discrepancia SPK documentada en la Etapa 02.3 sigue pendiente.

## Correcciones

1. **Inicio móvil evidente.** El único botón existente `#hist-start-tour-btn` aparece como «Iniciar recorrido» junto a la escena cuando el panel histórico está cerrado en móvil. Tras comenzar, el mismo botón vuelve a Explorar dentro del panel; si se cierra, reaparece como «Continuar recorrido». No hay duplicado DOM. El botón se aparta del comparador, bienvenida, menú y lanzamiento. Al pasar a escritorio vuelve a su lugar original.
2. **Panel móvil.** «Ampliar panel» cambia a «Contraer panel» junto con su icono y estado accesible; ambos tamaños preservan el paso del recorrido. En Datos se eliminan encabezados repetidos en móvil, mientras el estado de la muestra y las distancias principales aparecen primero. Las fichas completas y la información técnica siguen disponibles al desplazarse. El panel permanece separado de la línea temporal; se puede cerrar para ver Neptuno sin superposición.
3. **Controles de cámara.** Los iconos del borde derecho tienen etiquetas accesibles y ayuda breve al recibir foco táctil o de teclado. «Reencuadrar objetivo actual» recentra la vista desde Voyager sin salir de primera persona ni cambiar FOV; en vista exterior reencuadra el objetivo seleccionado. «Exterior» sale de la posición de la nave; «Vista general» encuadra el sistema completo. Son acciones distintas y se comprobaron en navegador.
4. **ZIP portable.** `scripts/package-portable-zip.py` crea entradas con `/` explícito, metadatos POSIX de archivo regular, rutas relativas y un manifiesto SHA-256. El código fuente y las evidencias de etapas anteriores se incluyen sin `node_modules`, `dist` ni perfiles de navegador.

## Evidencias mínimas

`Antes/` contiene tres capturas auténticas de la Etapa 03: entrada móvil, Datos y Neptuno. `Despues/` contiene siete capturas nuevas: entrada con acceso, recorrido, Datos compactos, Neptuno con escena despejada, comparador restaurado y comprobaciones de escritorio 1366×768 y 1920×1080. `Despues/manifest.json` registra estado de cámara, paso, pestaña, panel, geometría de sus límites y dimensiones para cada captura. La vista de Neptuno conserva la trayectoria local; la comparación visual no afirma corrección científica.

## Verificación

| Comprobación | Resultado | Archivo |
|---|---|---|
| Siete escenarios solicitados, incluidos 390×844, 1366×768 y 1920×1080 | 21 comprobaciones, 7 capturas, 0 errores JavaScript/HTTP | `Resultados/browser-stage3-1.txt` |
| Regresión de Etapa 03 | 30 comprobaciones, 0 errores JavaScript/HTTP; sus capturas se guardaron fuera del paquete para evitar duplicaciones | `Resultados/browser-regression-stage3.txt` |
| Pruebas automatizadas | 94/94 aprobadas | `Resultados/automated-tests.txt` |
| Compilación Vite | Correcta, 74 módulos; persiste advertencia conocida de bloque >500 kB | `Resultados/production-build.txt` |
| Comparación con ZIP de Etapa 03 | 123 archivos de `src/science`, `public` y geometría/FOV idénticos por SHA-256 | `Resultados/science-hash-compare.txt` |

La extracción portable se verificó con rutas POSIX, integridad ZIP y hashes; el detalle está en `Resultados/zip-validation.txt`. Desde una copia extraída con Windows también se ejecutaron `npm ci`, los 94 tests y la compilación. El entorno de trabajo no tiene WSL ni una distribución Linux instalada. La comprobación tipo Unix utiliza `unzip` de Git para Windows y un lector POSIX estricto; no se presenta como una ejecución en un sistema Linux nativo.

**Pendiente científico real:** los vectores locales Voyager y Horizons directo no se han reconciliado en toda la trayectoria. La geometría de Neptuno sigue afectada y no permite avanzar a lunas. No se hizo commit, push ni despliegue.
