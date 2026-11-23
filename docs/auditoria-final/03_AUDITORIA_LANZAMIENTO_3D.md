# Lanzamiento 3D de Voyager 2

## Dictamen

El plano general de LC-41 a T−8 s necesita **44,82 ms por fotograma con SwiftShader** aun a 480 × 270 internos. El mismo plano en la Radeon RX 6650 XT ocupa 5,56 ms entre envíos al renderer a 1600 × 900. La cifra de 7–10 FPS **no se reprodujo como promedio** de las ventanas observadas. Sí hubo un intervalo equivalente a 9,29 FPS durante la aproximación por software. El promedio oculta diferencias importantes entre plataforma, despegue y seguimiento. Estas observaciones corresponden a Voyager 2 en producción. La reconstrucción cinematográfica del Titan IIIE y el cálculo de lanzamiento terrestre del laboratorio tienen rutas de código y objetivos diferentes.

## Procedimiento y límites de atribución

Chrome headless 157.0.8103.79, Windows 10.0.26200, Ryzen 5 5600, 15,92 GiB, viewport CSS 1600 × 900, DPR del dispositivo 1, perfil automático, velocidad de presentación 1. Dos contextos independientes con caché de navegador nueva. El JSON registra el adaptador que WebGL realmente devolvió, versión, fecha, flags y relación de píxeles efectiva. La muestra inicial física entró por Histórico → Voyager 2 → Lanzamiento 3D. Para repetir por software se abrió Histórico y se invocó el mismo director mediante el diagnóstico de la aplicación. Los saltos de inspección dejan el reloj en pausa, aunque siguen renderizándose cielo, llamas y sombras. El último tramo por software reanudó el reloj en T+0 y llegó a +5,52 s. Se excluye el tiempo de preparación de los FPS. La primera ejecución física quedó interrumpida después del primer control de plataforma.

Ejecutar desde la raíz, con Playwright en la ubicación externa indicada por el script o en PLAYWRIGHT_PATH. Levantar una única vista previa con GITHUB_PAGES=true tanto al construir como al servir. Para repetir las mediciones, usar una copia de la carpeta de evidencias y reservar el equipo para cada navegador en secuencia.

~~~powershell
$env:GITHUB_PAGES='true'
npm.cmd run build
npm.cmd run preview -- --host 127.0.0.1 --port 4299 --strictPort
# En otra terminal
node docs/auditoria-final/evidencias/medir-lanzamiento.mjs gpu http://127.0.0.1:4299/simulador-sondas-espaciales/
node docs/auditoria-final/evidencias/medir-lanzamiento.mjs software http://127.0.0.1:4299/simulador-sondas-espaciales/
~~~

Intervalos reales entre comienzos de renderer.render de la escena de lanzamiento. No se cuenta el callback vacío de la escena principal. FPS = 1000/media de intervalos, mínimo = 1000/máximo intervalo. Bajo 1 % = inverso de la media del 1 % de intervalos más largos, solo para n ≥ 100. P95/P99 por rango más próximo. El tiempo JS en render incluye esperas síncronas del controlador y excluye cálculo previo, composición, DOM y cola de presentación. El temporizador WebGL cubre el trabajo enviado al backend cada ocho dibujos, descartando respuestas disjuntas y pendientes al finalizar. En SwiftShader ese backend corre en CPU. Los tiempos de JS y backend pueden solaparse. Se midieron llamadas y triángulos por dibujo e inventario de la lista visible cada 60 dibujos. Un programa enlazado puede incluir varios shaders. No se midieron VRAM en bytes, consumo eléctrico, fragmentos individuales, temperatura ni entrega de cada imagen al monitor físico. Long Tasks señala tareas del hilo principal de al menos 50 ms. Consultar los valores sin redondear y series completas en los JSON. [WebGLRenderer.info, Three.js](https://threejs.org/docs/pages/WebGLRenderer.html)

## Ventanas medidas

| Ventana | Backend | Ratio | n | FPS med | FPS mín | 1 % bajo | Frame med / P95 / P99 (ms) | JS render (ms) | Backend / GPU (ms) | Draw calls | Triángulos | Long tasks (n / máx ms) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Reproducción desde entrada | RX 6650 XT | 1,00 | 270 | 179,98 | 149,25 | 164,83 | 5,56 / 5,60 / 5,70 | 1,28 | 1,97 | 163 | 152.196 | 0 / 0 |
| Plataforma general (T−8 s) | RX 6650 XT | 1,00 | 216 | 180,00 | 163,93 | 168,07 | 5,56 / 5,60 / 5,70 | 1,27 | 1,88 | 164 | 152.196 | 0 / 0 |
| Plataforma base (T−2 s) | RX 6650 XT | 1,00 | 216 | 180,00 | 166,67 | 170,94 | 5,56 / 5,60 / 5,70 | 1,43 | 2,22 | 156 | 148.956 | 0 / 0 |
| Despegue suelo (T+5 s) | RX 6650 XT | 1,00 | 216 | 179,97 | 161,29 | 166,67 | 5,56 / 5,60 / 5,70 | 1,19 | 1,39 | 168 | 131.916 | 0 / 0 |
| Seguimiento ascenso (T+30 s) | RX 6650 XT | 1,00 | 216 | 180,00 | 169,49 | 170,94 | 5,56 / 5,60 / 5,70 | 0,79 | 0,85 | 63 | 123.772 | 0 / 0 |
| Separación SRB/etapa (T+130 s) | RX 6650 XT | 1,00 | 216 | 179,98 | 161,29 | 165,29 | 5,56 / 5,60 / 5,70 | 0,88 | 0,81 | 61 | 121.648 | 0 / 0 |
| Órbita de aparcamiento (T+1500 s) | RX 6650 XT | 1,00 | 216 | 179,80 | 149,25 | 153,85 | 5,56 / 5,60 / 5,70 | 0,44 | 0,29 | 24 | 125.824 | 0 / 0 |
| Reproducción desde entrada | SwiftShader | 0,50→0,35 | 65 | 43,13 | 9,29 | n<100 | 23,19 / 33,40 / 60,00 | 2,16 | 20,43 | 91 | 50.919 | 0 / 0 |
| Plataforma general (T−8 s) | SwiftShader | 0,30 | 27 | 22,31 | 12,58 | n<100 | 44,82 / 49,90 / 79,50 | 1,80 | 41,11 | 95 | 51.532 | 0 / 0 |
| Plataforma base (T−2 s) | SwiftShader | 0,30 | 33 | 27,45 | 23,20 | n<100 | 36,43 / 40,60 / 43,10 | 1,77 | 34,04 | 91 | 49.912 | 0 / 0 |
| Despegue suelo (T+5 s) | SwiftShader | 0,30 | 62 | 51,49 | 41,32 | n<100 | 19,42 / 22,80 / 24,20 | 2,23 | 14,76 | 97 | 41.392 | 0 / 0 |
| Ascenso en movimiento (T+0→5,5 s) | SwiftShader | 0,30 | 183 | 33,17 | 14,47 | 14,47 | 30,15 / 39,80 / 44,80 | 1,70 | 27,13 | 98,65 | 56.797 | 1 / 55,0 |
| Seguimiento ascenso (T+30 s) | SwiftShader | 0,30 | 86 | 71,60 | 52,91 | n<100 | 13,97 / 17,70 / 18,90 | 1,85 | 10,15 | 61 | 50.476 | 0 / 0 |
| Separación SRB/etapa (T+130 s) | SwiftShader | 0,30 | 90 | 75,06 | 55,56 | n<100 | 13,32 / 16,00 / 18,00 | 1,62 | 10,35 | 61 | 53.402 | 0 / 0 |
| Órbita de aparcamiento (T+1500 s) | SwiftShader | 0,30 | 81 | 67,32 | 31,95 | n<100 | 14,85 / 18,70 / 31,30 | 0,85 | 13,45 | 23 | 28.244 | 0 / 0 |

Escena a T−8. En GPU física hay 110 geometrías, 24 texturas, 27 programas, 39 materiales y 96 objetos en la última lista de render. En software hay 97 geometrías, 19 texturas y 20 programas para esos mismos 39 materiales y 96 objetos. La lista de escena no incluye pases de sombra adicionales. El heap observado en esa muestra fue de aproximadamente 40 y 34 MiB, respectivamente. No permite inferir una fuga. La apertura observada requirió aproximadamente 5,5 s en la primera medición física y 5,7 s mediante la entrada de diagnóstico por software, con distintos puntos de inicio del cronómetro. No son tiempos exclusivos de descarga o compilación. En la pasada software principal se confirmó la retirada del canvas al cerrar.

## Experimentos de atribución

| Plano T−8 s | Backend | Ratio | FPS | JS render ms | Trabajo backend ms | Draw calls |
|---|---|---:|---:|---:|---:|---:|
| Plataforma íntegra | RX 6650 XT | 1 | 180,0 | 1,41 | 1,91 | 164 |
| Ocultar LC-41 durante render | RX 6650 XT | 1 | 180,0 | 0,75 | 1,74 | 95 |
| Restaurar LC-41 | RX 6650 XT | 1 | 180,0 | 1,29 | 1,87 | 164 |
| Plataforma íntegra | Software | 0,30 | 22,31 | 1,80 | 41,11 | 95 |
| Ocultar LC-41 durante render | Software | 0,30 | 23,11 | 1,18 | 39,41 | 55 |
| Restaurar LC-41 | Software | 0,30 | 22,31 | 1,67 | 40,79 | 95 |
| Dividir ambas dimensiones por dos | Software | 0,15 | 54,24 | 1,19 | 13,72 | 95 |
| Restaurar resolución | Software | 0,30 | 22,88 | 2,06 | 39,79 | 95 |

En la segunda ejecución por software, también en T−8 y ratio 0,30, ocultar el cielo pasó de 22,61 a 23,95 FPS y restaurarlo dio 22,32. El backend pasó de 40,17 a 35,69 y 41,82 ms. La sonda experimental de visibilidad de la atmósfera externa encontró la capa ya desactivada, tal como prescribe el umbral de altitud. El harness registró el error de esa prueba después del control de retorno. Ese error pertenece al diagnóstico, no a la app.

**LAN-01 · ALTO · P1 rendimiento · VERIFICADO.** La plataforma supera el presupuesto de 33,33 ms por software. Reducir el número de píxeles por cuatro obtuvo una diferencia de 26,38 ms entre medias frente al control inmediato. Ocultar 40 llamadas dejó el intervalo medio en 43,28 ms. En este equipo y plano domina trabajo de rasterización dependiente de resolución. Resolver detalles de geometría por sí solo sería insuficiente. El experimento a ratio 0,15 dibuja a 240 × 135 antes de escalar a 1600 × 900. Es una prueba causal con pérdida visible potencial, no una calidad general aceptada. La sensibilidad de otros dispositivos requiere repetición.

## Revisión de implementación

- **Sombras e iluminación.** Fuente direccional más hemisférica, sombras PCF con 4096 o 2048 según calidad, actualizadas en las proximidades de la plataforma. La GPU física mantiene 180 FPS en el control con sombras activas. El perfil software ya las tiene deshabilitadas. PMREM prepara el entorno una vez y el nivel mínimo prescinde de él. No se encontró cadena de postproceso en el bucle del director.
- **Partículas.** LaunchEffects ya usa una InstancedBufferGeometry para el humo, buffers reutilizados, atributos dinámicos y un único índice ordenado por distancia. El trazo de la estela usa un draw range. Los máximos de humo son 2200/1600/900/600. Los penachos superponen capas transparentes. Hay coste potencial de blending y de ordenación, pero el plano lento existe antes de ignición y el tiempo CPU de render allí es bajo. Evitar reemplazar por miles de Sprite o plantear pooling como novedad. Las actualizaciones de amplitud/color y las subidas completas de atributos merecen perfil específico solo si un tramo con humo incumple su presupuesto.
- **Geometría.** LC41Pad1977 crea estructuras estáticas y brazos con pivote. Ya genera cierta celosía en una geometría. Los báculos y lámparas repiten formas y material. Separar agrupación por material, movilidad y participación en sombra evita perder pivotes y limita el aumento de geometría enviada fuera de cámara. El globo, la atmósfera y las nubes ya ajustan subdivisiones al detalle inicial. La malla estelar envolvente y partículas dinámicas usan frustumCulled=false. Activarlo sin reconstruir bounds fiables puede borrar efectos visibles. No se encontró reconstrucción sistemática de las geometrías grandes por frame.
- **CPU, reloj y UI.** VoyagerLaunchDirector.fotograma muestrea el perfil en el instante de misión, calcula posición de piezas, cámara y orientación, regenera instancias de humo cuando corresponde, dibuja y envía estado público cada 120 ms o cambio de evento. El muestreo del perfil cinematográfico no resuelve el integrador DOPRI54 del laboratorio en cada frame. El reloj de presentación limita dt a 0,1 s, de modo que una pausa larga de render ralentiza el avance visible. Los estados asociados a cada tiempo siguen el perfil. La escena principal retorna antes de actualizar o dibujar mientras está pausada. Persiste su callback de agenda. La medición no lo contabiliza como segundo renderer. No se justificó un Worker para esta escena.
- **Gestión de recursos.** El cierre cancela setAnimationLoop, desconecta el observador y quita la suscripción de detalle. Se separa el clon del modelo NASA antes de destruir recursos propios. El código conserva la textura devuelta por pmrem.fromScene(...).texture sin almacenar el WebGLRenderTarget devuelto. Conviene verificar framebuffer/renderbuffer al ciclar creación y destrucción, incluyendo el contexto completo del lanzamiento. Es una hipótesis de retención, sin crecimiento demostrado. Los shaders se precompilan durante la carga y hay fallback cuando no existe KHR_parallel_shader_compile (advertencia registrada en SwiftShader). El A/B detecta coste sostenido mucho después de compilar.
- **Fidelidad.** Una intervención en representación no debe cambiar tiempos de separación, matriz del marco, trayectoria, cámara ni la identidad del vehículo. Registrar estado público y fotogramas de V1 y V2 a los mismos tiempos en cada variante. Las capas del terreno, cielo de Voyager 2 y ortoimagen deben mantener las mismas referencias espaciales.

## Orden de ensayo y aceptación

1. **LAN-01, coste por píxel.** En LaunchWorld.js aislar parches Florida/Cabo/LC-41, sampler de terreno y shaders por material, misma cámara, ratio y estado. Medir primero el coste de cada variante con controles de retorno y color de referencia. Si una capa extensiva domina, ensayar muestreo filtrado o render a menor resolución de esa capa y componer al tamaño original conservando vehículos, textos y siluetas. Complejidad media/alta; riesgos de halos, aliasing, discontinuidad en horizonte y degradado del cielo. Mejorar P95 del plano, manteniendo composición y correspondencia a distintos ángulos. No extrapolar la ganancia del ocultamiento a un sustituto visual.
2. **LAN-02, granularidad de la plataforma, BAJO · P3 opcional · VERIFICADO.** Baseline 22,31 FPS/44,82 ms software y 180/5,56 ms GPU. El corte total de plataforma ahorra unos 0,62–0,65 ms en el envío CPU en los controles iniciales. Probar agrupar luminarias y estáticos del mismo material en LC41Pad1977.js en zonas; preservar partes animadas y culling. Dificultad baja/media. Confianza alta en reducir llamadas y baja en ganar FPS a igual escena. Riesgo bajo de pérdida visual si se comparan sombra, material y silueta antes/después. Aceptar únicamente al reducir el coste medido sin introducir rectángulos de culling excesivos ni distorsionar las sombras.
3. **Resolución dinámica selectiva.** Para QualityProfile.js y LaunchWorld.js comparar una intervención localizada contra la pérdida al bajar toda la escena a 240 × 135. El adaptador ya distingue software y tiene histéresis. Limitar una degradación adicional a los planos y perfiles que lo necesitan y recuperar resolución al superar el presupuesto. Complejidad media, riesgo visual alto al reducir globalmente. Verificar ratio por tiempo, P95, texto, legibilidad de piezas, estabilidad entre planos y transición salida de plataforma. Lanzamiento y HUD deben conservar el mismo estado con el mismo reloj.
4. **Puerta de salida.** En equipo acelerado conservar P95 ≤20 ms y medir P99 y máximo en secuencia continua. En el perfil limitado intentar P95 ≤33,33 ms en cada plano, incluido T−8. Usar tres pasadas alternadas A/B y registrar dispersión, tomas frías y calientes, ratio, clocks cuando estén disponibles y ciclos de apertura/cierre. Validar en GPU integrada y móvil físico. Registrar una reproducción completa sin saltos A/B con reloj continuo y llegada al estado final para ambas Voyager. El protocolo de ventanas y saltos aporta diagnóstico local, sin certificar toda la película. Revisar de forma independiente las capturas a resolución nativa, especialmente capas del Cabo, humo, sombras y horizonte.

[Ejecución y series crudas](evidencias/medir-lanzamiento.mjs) · [GPU física](evidencias/lanzamiento-gpu.json) · [Software](evidencias/lanzamiento-software.json) · [Aislamiento del cielo](evidencias/lanzamiento-software-capas.json).
