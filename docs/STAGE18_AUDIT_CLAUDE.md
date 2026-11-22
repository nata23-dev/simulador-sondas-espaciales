# Auditoría de la etapa 18 · Carga rápida

- **Auditor:** Claude (Opus 5.5). **Claude también implementó la etapa**, así que esta auditoría usa métodos distintos de la implementación: pruebas de comportamiento escritas aparte, regresión completa en navegador con GPU real, inspección del CSS compilado y casos límite.
- **Fecha:** 21-11-2026. **Alcance:** solo presentación y entrega de archivos; no hay cambios de física, constantes, marcos, integrador ni datos, así que no hace falta la revisión adicional por otro agente que exige el proyecto para esos cambios.
- **Veredicto:** **aprobada con observaciones.**

## Comprobaciones

| # | Método | Resultado |
| --- | --- | --- |
| 1 | Cálculo propio del radio aparente: 1 unidad a 100 con 90° y 800 px → 4 px; zoom ×2 → 8 px; cámara dentro → ∞ | Coincide |
| 2 | Casos límite de la carga diferida: lejos (0,97 px), oculta y cerca, visible a 2,4 px, segundo registro de la misma clave | Se pide una vez, solo cuando procede |
| 3 | Precarga en reposo con temporizadores simulados: respeta el retardo, sigue el orden y omite lo ya pedido o inexistente | Correcto |
| 4 | Regresión completa en Chrome con GPU AMD real (flujo guiado, automático, flota, herramientas, 7 resoluciones, accesibilidad, escena y modos) | **Primera pasada: 7 fallos.** Causa: la hoja del laboratorio, al cargarse con su módulo, quedaba después de `theme.css` y `lab-shell.css` y pisaba sus reglas (paneles tapados, botones fuera de vista). Corregido importándola en su posición de siempre; el CSS compilado volvió a ser idéntico al anterior (mismo hash). El guion leía `#mc-canvas` antes de que existiera el laboratorio: corregido. **Segunda pasada: 0 errores** |
| 5 | Medida de descarga con la compilación de producción, antes y después | 20,13 → 3,87 MB al arrancar en escritorio y 20,08 → 3,11 MB en móvil |
| 6 | Fallo de red al cargar el laboratorio | Mensaje en la barra de estado y nuevo intento al volver a entrar |
| 7 | Procedencia de modelos | SHA-256 de los GLB sin cambios (pruebas de 15.1) y decodificador Draco idéntico al de three |

## Observaciones

- **O-1.** La primera regresión demuestra que mover una hoja de estilos a un módulo diferido cambia la cascada. Cualquier división futura del CSS debe comprobar el CSS compilado o repetir la regresión.
- **O-2.** Las medidas son de un solo equipo y en local. Falta medir en un móvil y una red reales.
- **O-3.** El modo histórico sigue en el archivo principal (límite declarado).
- **O-4.** Las pruebas de estructura de carga diferida (importación dinámica, `pendingNasa`) siguen siendo comprobaciones de texto del código. El comportamiento se ejercitó en el navegador, pero no hay prueba unitaria de él.
