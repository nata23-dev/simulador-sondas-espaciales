# Auditoría de la etapa 21 · Lanzamiento → inyección

- **Auditor:** Claude (Opus 5.5). **Claude también implementó la etapa.** Por eso esta auditoría usa métodos distintos de los de la implementación:
  - un integrador RK4 propio, de paso fijo, para el encendido y el escape (la implementación usa DOPRI54 y Kepler);
  - otra formulación de la precesión (IAU 2006) y del tiempo sidéreo (ángulo de rotación de la Tierra, IERS 2010);
  - fórmulas propias de dos cuerpos, WGS84 y la ecuación del cohete sobre los vectores de estado;
  - barrido de toda la flota en todos los escenarios;
  - casos límite y sintéticos.
- **Fecha:** 21-11-2026.
- **Alcance:** añade dinámica (ascenso, aparcamiento, inyección y escape encadenados) y un marco nuevo (orientación de la Tierra: tiempo sidéreo y precesión). No cambia constantes, efemérides, datos, DOPRI54 ni el lanzamiento de 12E. Por el criterio de [CLAUDE.md](../CLAUDE.md), **necesita la revisión de alguien que no la implementó** (Gemini u otra sesión de Claude sin este contexto). Esta auditoría no la sustituye.
- **Veredicto:** **aprobada con observaciones, pendiente de revisión independiente.**

## Comprobaciones

| # | Método | Resultado |
| --- | --- | --- |
| 1 | Precesión IAU 1976 (implementación) frente a IAU 2006 / P03, de cuatro rotaciones, en 1977–2050 | Diferencia ≤ 0,152″ (prueba: < 0,5″). Deriva del equinoccio de 46,12″/año. Matriz ortonormal |
| 2 | Sitio en el despegue de A1 con un GMST propio (ángulo de rotación de la Tierra, IERS 2010 ec. 5.15, más el polinomio de 5.32), la precesión IAU 2006 y WGS84 | Ascensión recta del sitio < 0,002°; z y ρ < 50 m; velocidad en la plataforma = ω·ρ (< 1 mm/s) |
| 3 | Ascenso girado frente a ascenso recalculado con otro ángulo inicial (123,4°) | 0,23 m y 2,5·10⁻⁷ km/s; 5·10⁻⁵ s en el corte de la circularización. Es error de integración. El comentario del código decía «exacto» y se corrigió (D-04) |
| 4 | **Encendido de inyección re-integrado con RK4 propio** (4 000 pasos fijos, empuje progrado, masa variable), desde el estado del tramo al inicio | 16 combinaciones con salida: ≤ 1,3·10⁻⁸ km, ≤ 5,5·10⁻¹¹ km/s y ≤ 3·10⁻⁹ kg frente al tramo del módulo |
| 5 | **Escape re-integrado con RK4 propio** (60 000 pasos) durante la duración del tramo | ≤ 2,3·10⁻⁸ km y ≤ 1,2·10⁻¹³ km/s frente a Kepler. El radio final es la SOI: 923 910 km (Marte) y 924 282 km (Júpiter) |
| 6 | Δv impulsivo equivalente con vis-viva propio, desde el estado al inicio del encendido | Igual que el del módulo a 0,1 m/s en los 16 casos |
| 7 | C3 propio al final del encendido, energía hasta la SOI, radio de Laplace propio, balance de masas y ecuación del cohete | En las pruebas: C3 a 10⁻⁹ km²/s²; radio de la SOI a < 50 km del calculado aquí; Isp·g0·ln(m0/mf) a 10⁻⁶ km/s |
| 8 | Barrido flota × escenarios (A1, A2, A3, C1 y C2 con Voyager, Cassini, Dawn y Juno) | **Veredicto igual con y sin plataforma en los 20 casos.** Empalme ≤ 7,4·10⁻⁹ km/s; ningún salto de masa no declarado; ≤ 172 ms por misión. A Júpiter, Cassini y Juno: «sin Δv en la etapa de inyección», con el motivo |
| 9 | Casos límite |  |
|  | · Carga 1 t por encima de la capacidad | «sin órbita de aparcamiento», con el motivo de 12E |
|  | · Carga de 500 kg | Apuntada; quedan 4 638 kg |
|  | · Sin efemérides de la Tierra | «apuntado del crucero fallido», sin extrapolar |
|  | · A1 con la salida prevista al inicio de la cobertura | Con Cassini, «declinación inalcanzable» (δ = 42,6°), ahora con el motivo correcto (D-02). Con Voyager y Dawn, despegue entre 5,3 y 7,4 h después del inicio de la cobertura y reproducción correcta desde t = 0 |
| 10 | Despegue sintético cuya ventana más cercana cae antes de la cobertura de la Tierra | Sin la protección, despegue 0,16 h antes del primer estado disponible. Con ella (D-03), se usa la otra ventana: 1,81 h después |
| 11 | Origen de la diferencia de C3 (8,117 con plataforma frente a 8,993 desde el centro de la Tierra) | 2μ⊕/R_SOI = 0,863 km²/s² explica 0,863 de 0,876 en A1 y de 0,888 en C1. La velocidad en la SOI al cuadrado (8,980 y 75,708) coincide con el C3 desde el centro salvo 0,013 y 0,025, que son el efecto del cambio de punto e instante del Lambert. Ver O-1 |
| 12 | Regresión | Sin la opción, el resultado es el de la etapa 20 (llegada a 5 833,66 km). Suite completa 379/379 |
| 13 | Navegador con GPU | Ver [STAGE21_LAUNCH_INJECTION.md](STAGE21_LAUNCH_INJECTION.md#verificación-en-el-navegador): sin errores ni avisos; 7 capturas |

## Defectos

- **D-01 (corregido).** La telemetría daba la altitud sobre una esfera de radio ecuatorial, y en la plataforma LC-41 mostraba **−4,86 km**. Ahora, en los tramos terrestres, la altitud es geodésica sobre WGS84 en el ecuador de la fecha, con la misma precesión del cálculo, y la fila se rotula «Altitud WGS84». En la plataforma da 0 km. Además, el formateador del Centro de Misión ya no muestra «-0».
- **D-02 (corregido).** Cuando la inclinación necesaria superaba la máxima que alcanza el lanzador con esa carga (acimut ≈ 47° con Cassini, i ≈ 42,4°), el fallo solo decía que la órbita «no contiene» la declinación. Ahora añade que es la inclinación máxima con esa carga y por qué.
- **D-03 (corregido).** No había ninguna comprobación de que el **despegue** estuviera dentro de la cobertura de efemérides de la Tierra. Solo se comprobaba la salida de la SOI, y el despegue puede adelantarse hasta 12 h. Los tramos terrestres habrían quedado sin conversión al Sol en los primeros instantes. No ocurría en los escenarios reales, pero sí en uno sintético. Ahora el apuntado rechaza esa ventana.
- **D-04 (corregido).** El comentario de `EarthDeparture.js` llamaba «exacta» a la rotación del ascenso. Lo es en el modelo, pero no a precisión de máquina: el paso adaptativo cambia con el redondeo. Se sustituyó por los valores medidos, y la prueba compara con esa tolerancia.
- **Corregidos durante la implementación:**
  - una declaración de variable usada antes de existir en el caso de lanzamiento fallido;
  - una tolerancia de 10⁻⁹ km/s que quedaba en el ruido numérico y hacía saltar a la segunda ventana;
  - una nota del acimut que decía «no alcanza» cuando la inclinación sí superaba la declinación.

## Observaciones

- **O-1 · C3 más bajo que el convencional.** El empalme iguala la velocidad en la SOI para que la trayectoria sea continua. Fuera de la SOI se ignora la gravedad terrestre, así que la Centaur necesita ≈ 0,86 km²/s² menos de C3 que con la asíntota del Lambert desde el centro de la Tierra: ≈ 39 m/s de Δv impulsivo en A1 y ≈ 32 m/s en C1. Es un límite del modelo de cónicas parcheadas, declarado en la documentación y en la interfaz («C3 de salida» frente al resumen sin plataforma). Para quien revise: decidir si la continuidad debe primar sobre el C3 convencional. La etapa 22 (crucero de n cuerpos) permitiría medirlo.
- **O-2 · Escena.** En el Sistema Solar principal, el despegue se ve a escala del Sistema Solar. El contexto local «Tierra» del Centro de Misión solo aparece cuando no se usa la escena principal, y no se ejercitó en el navegador, solo en las pruebas.
- **O-3 · Lanzador ilustrativo.** El ×9 del demostrativo tiene la capacidad medida (24,6 t). No es un cohete real y no se presenta como tal: lo dicen la interfaz, el resumen y los límites.
- **O-4 · Orientación terrestre.** La nutación, el movimiento del polo y UT1 − UTC se ignoran. Su efecto en el sitio es del orden de 0,5 km, 15 m y 0,4 km respectivamente; el apuntado lo absorbe cambiando unos segundos el despegue. No se midió frente a una solución con esos términos.
- **O-5 · Revisión independiente pendiente.** Puntos sugeridos:
  - la composición M = E·Pᵀ·R3(−GMST) y el uso de GMST con UTC como UT1;
  - la condición de empalme (O-1);
  - el criterio del acimut (|δ| + 1° y margen de 0,5°);
  - las tolerancias del Newton y la elección de la ventana más cercana;
  - el rediseño de la llegada en vueltas;
  - que el lanzador ilustrativo no se confunda con el histórico.
