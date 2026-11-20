# Etapa 15 — Biblioteca histórica, Hangar modular de herencia e ingeniería conectada a la misión

Encargo: `VISION_FINAL.md` («finalizar el simulador»), recibido el 19-11-2026. Esta etapa se implementó con Claude y **pasó pruebas locales**. La **auditoría independiente de Gemini está pendiente**, y también la revisión con GPU real. El registro de trabajo está en [STAGE15_RECOVERY_LOG.md](STAGE15_RECOVERY_LOG.md).

> **Actualización 15.1 (19-11-2026), por decisión del usuario:** el Hangar ya no permite cambiar piezas. La interfaz ofrece solo las cuatro sondas históricas, con sus modelos 3D oficiales de NASA, para usarlas en cualquier misión. El modo «Personalizado», los adaptadores y el catálogo de piezas desaparecen de la interfaz. Sus funciones de motor (`applyPartChange`, adaptadores, envolventes) se conservan con sus pruebas, porque la configuración histórica se construye con el mismo modelo de puntos y piezas. Los escenarios con variantes de esta etapa siguen siendo pruebas del motor, no del flujo de usuario. Detalle en [STAGE15_1_NASA_FLEET.md](STAGE15_1_NASA_FLEET.md).

## 1. Qué cambia

| Área | Antes (14.1) | Ahora (15) |
| --- | --- | --- |
| Hangar | Solo piezas ilustrativas (ficticias) | Además, biblioteca de herencia (Voyager, Cassini, Dawn y Juno) con modo histórico y personalizado. |
| Montaje | Un punto acepta una categoría | Un punto acepta varias categorías, con herraje mecánico, envolvente dimensional, normal de montaje y adaptador estructural explícito. |
| Ingeniería | Masa, Δv ideal y balance a 1 AU | Además: masa estructural, adaptadores e hidracina de actitud; centro de masas; desalineación del empuje; potencia según la distancia al Sol y el tiempo (solar y RTG); propulsión eléctrica limitada por la potencia; compatibilidades por tipo; veredicto; calidad de los datos y fuentes. |
| Misión completa (13) | Energía «no evaluada» | Fase de energía con la generación real de la sonda en cada punto. El empuje eléctrico se reduce con la potencia en el destino. Nuevo objetivo de **sobrevuelo** de un satélite, escenarios C1 y C2, y comparación de misiones. El Centro de Misión muestra la energía en cada instante. |
| 3D | Geometría ilustrativa | Reconstrucciones procedimentales con las dimensiones publicadas, orientadas según el punto de montaje, con encuadre automático y marcadores de centro de masas y puntos libres. |
| Rendimiento | Relación de píxeles fija (≤ 2) | Perfiles de calidad Automática, Alta, Media y Baja para todas las vistas WebGL. El modo automático baja un escalón si la escena sostiene menos de 30 FPS. |

## 2. Modelos y fórmulas (todas en `src/lab/` y `src/graphics/QualityProfile.js`)

- **Calidad de cada cifra** (`DATA_QUALITY`): `documentado` (fuente primaria NASA, ESA, JPL o fabricante), `secundario` (fuente secundaria citada), `derivado` (calculado a partir de cifras con fuente), `estimado` (supuesto del simulador) y `desconocido`. Cada pieza de herencia declara la calidad y la fuente de sus campos. Las pruebas exigen que todo dato `documentado` tenga una fuente existente.
- **Masa del bus por cierre**: masa seca documentada − Σ masas estimadas de las piezas. La masa seca total coincide exactamente con la documentada; el reparto entre bus y piezas es estimado.
  - Dawn: 747,1 kg secos, 1217,7 kg al lanzamiento.
  - Juno: 3625 kg al lanzamiento.
  - Cassini: 2125 kg de orbitador + 349 kg de Huygens + 3132 kg de propelente. La diferencia con 5712 kg es el adaptador de lanzamiento, que no viaja.
  - Voyager: 825,5 kg (fuente secundaria).
- **Potencia solar**: P(r) = P₁·r^(−k). El exponente k se ajusta a dos puntos documentados; sin ajuste, k = 2.
  - Dawn: 10,3 kW a 1 AU y 1,3 kW a 3 AU → k ≈ 1,885.
  - Juno: 14 kW a 1 AU y ≈ 400 W en Júpiter (≈ 5,4 AU) → k ≈ 2,108.
- **RTG**: P(t) = P₀·e^(−λt). λ se ajusta a puntos documentados; sin ajuste, se usa la semivida del Pu-238 (87,7 años).
  - Voyager: 470 W → 335 W en 19,3 años.
  - Cassini: 885 W → 633 W en 11 años.
- **Propulsión eléctrica**: T = 2ηP/(g₀·Isp), con P limitado a [P_mín, P_máx] e Isp constante. NSTAR (Dawn): 92 mN a 2,6 kW e Isp 3100 s; η derivado ≈ 0,538; no enciende por debajo de 500 W.
- **Adaptador estructural** (estimación del simulador): máx(2 kg; 8 % de la masa seca de la pieza). Es obligatorio cuando los herrajes difieren y no se permite si no hace falta.
- **Centro de masas**: Σ mᵢ·rᵢ / Σ mᵢ. Una pieza externa tiene su centroide a media longitud a lo largo de la normal (unitaria) del punto; una interna, en el punto. Se incluyen el propelente cargado y la hidracina de actitud.
- **Desalineación del empuje**: distancia lateral del centro de masas al eje del motor. El límite orientativo es 0,10 m para motor fijo y 0,25 m con cardán.
- **Energía de la misión**: 480 muestras a lo largo de la cadena con la distancia heliocéntrica calculada (en los tramos planetocéntricos se usa la del planeta). Se suma el consumo de los encendidos de la sonda. El déficit acumulado se compara con la batería, sin recarga (criterio conservador). No se modelan eclipses, orientación de paneles ni degradación de las células.

## 3. Biblioteca de herencia: qué es dato y qué es estimación

| Sonda | Cifras documentadas (fuente) | Estimado o desconocido |
| --- | --- | --- |
| Voyager 1/2 | Bus decagonal 0,47 × 1,78 m; antena de 3,66 m; 470 W → 335 W; pértiga de 13 m (NSSDCA). Masa 825,5 kg, ≈ 100 kg de hidracina y propulsores (secundaria). | Reparto de masas por pieza; Isp de los propulsores TCM (220 s); consumos por subsistema. |
| Cassini | 2125 kg secos; 5712 kg al lanzamiento; 2 × 445 N; 16 × 0,5 N; 885 W → 633 W; antena de 4 m; 6,7 × 4 m (ESA); 3132 kg de propelente (JPL); SOI de 626 m/s (NASA). Isp ≈ 311 s (fabricante). | División 3000 kg bipropelente + 132 kg de hidracina; masas por pieza; la pértiga del magnetómetro (11 m) se marca como desconocida. |
| Dawn | 747,1 kg secos; 425 kg de xenón; 45,6 kg de hidracina; alas de 10,3 kW → 1,3 kW; NSTAR de 92 mN a 2,6 kW; antena de 1,52 m; batería de 35 Ah; 19,7 m de envergadura (NSSDCA). | Masas por pieza; consumos de los instrumentos. |
| Juno | 3625 kg al lanzamiento; 1280 + 752 kg de propelente; alas de 14 kW a 1 AU y ≈ 400 W en Júpiter (JPL); LEROS-1b de 645 N (NASA); Isp 318 s (secundaria). | Número y empuje de los propulsores de actitud (desconocidos); diámetro de la antena (desconocido); batería de 3080 Wh (estimada). |

Los enlaces de las 11 fuentes están en `HERITAGE_SOURCES` (`src/lab/HeritageCatalog.js`) y se muestran en la interfaz.

## 4. Escenario de referencia hacia Europa (VISION_FINAL §15)

Para reproducirlo: Hangar → «Sondas históricas» → Cassini → «Crear variante personalizada» → piezas de otros programas → Ingeniería → Planificador «Misión completa» → escenarios C1 y C2. Las cifras siguientes salen del modelo y las cubren las pruebas de `tests/HeritageHangar.test.mjs`. La oportunidad se refina desde el 26-12-2028 con 1090 días de vuelo (C3 ≈ 75,7 km²/s², inyección externa no modelada).

| Variante | Hangar | Misión |
| --- | --- | --- |
| Cassini + motor iónico de Dawn (con RTG) | REQUIERE MODIFICACIONES: el motor necesita ≥ 500 W y solo quedan ≈ 188 W tras el servicio. | La captura en Júpiter no puede encenderse (potencia en el destino). |
| + alas de Juno (con adaptadores) | Coherente con advertencias a 1 AU (92 mN a plena potencia). | Captura bloqueada en Júpiter; la fase de energía falla (déficit de MWh frente a 0 Wh de batería). |
| **Corrección**: motor químico de Cassini con RTG y antena de Voyager | Coherente. | JOI de ≈ 574 m/s (finita; 495 m/s impulsiva) en órbita tipo Juno (periapsis 4200 km, apoapsis 8·10⁶ km); transferencia a Europa ≈ 199 m/s. |
| — C1, sobrevuelo de Europa a 100 km | | **Cadena completa según el modelo**: 18,26 km/s de v∞ y giro de 0,66°. Energía suficiente (margen ≈ 147 W a 5,19 AU). |
| — C2, captura en órbita de Europa | | **NO VIABLE**: propelente agotado; la v∞ de 18 km/s exige ≈ 17 km/s de captura ideal. |
| Juno histórica | Coherente. | C1 completa; margen eléctrico mínimo ≈ 78 W en Júpiter. |

La continuidad entre tramos queda por debajo de 0,01 km en posición y 10⁻⁹ km/s en velocidad, sin saltos de masa no declarados.

**Conclusión física**: con la v∞ de llegada de esta transferencia, una sonda de herencia sin módulo auxiliar alcanza Júpiter y sobrevuela Europa. Una órbita de Europa requiere asistencias de otros satélites (no implementadas) o mucho más propelente. El simulador lo declara así en lugar de forzar el resultado.

## 5. Cambio de criterio que afecta a la etapa 13

La sonda ilustrativa de 12A («interplanetary»: 1460 W a 1 AU, 98 W de servicio, sin RTG) **no tiene energía suficiente en Júpiter** (≈ 54 W a 5,2 AU). Desde la etapa 15, el escenario B1 termina en «NO VIABLE … Energía eléctrica». La trayectoria, las maniobras y la continuidad no cambian; las pruebas de la etapa 13 no afirmaban el veredicto de B1 y siguen pasando. Su rótulo ahora dice «con módulo ilustrativo de 80 t».

## 6. Matriz de requisitos de VISION_FINAL

Estados: **Implementado y verificado** (código, pruebas locales y, cuando hay interfaz, revisión en navegador con SwiftShader), **Parcial**, **No implementado**, **Excluido**. Ninguna fila sustituye la auditoría independiente pendiente.

| § | Requisito | Estado | Evidencia o motivo |
| --- | --- | --- | --- |
| 2 | Sol, 8 planetas y satélites; fechas; órbitas; escalas; cámaras; tiempo; sondas | Implementado y verificado (etapas 1–14.1) | Efemérides Horizons; `tests/*`; pendiente de revisión con GPU (14.1). |
| 3 | Voyager, Dawn, Cassini y Juno con ficha y calidad de datos | Implementado y verificado | `HeritageCatalog.js`; pruebas de catálogo y masas. |
| 3 | Modelo 3D de cada diseño histórico | Parcial | Reconstrucciones procedimentales con dimensiones publicadas. Los modelos oficiales de NASA no se incorporaron (licencia y peso por revisar; requiere autorización). `Voyager.glb` sigue en el modo histórico. |
| 3 | Galileo, New Horizons, Europa Clipper, Parker | No implementado | Previsto como ampliación («posteriormente»). |
| 4 | Modo histórico y modo personalizado | Implementado y verificado | Interfaz del Hangar; pruebas; capturas en `evidence/stage15/`. |
| 4 | Combinar piezas de varias sondas; adaptadores; incompatibilidades | Implementado y verificado | Herrajes, envolventes, adaptador obligatorio, conflictos de propelente, potencia del motor eléctrico. |
| 4 | Modelos 3D gratuitos u oficiales normalizados | Parcial | Normalización en metros, orientación y puntos de conexión hecha; geometría procedimental propia (sin problemas de licencia), no CAD oficial. |
| 4 | Masa total, centro de masas, recursos y capacidades | Implementado y verificado | `calculateEngineering`; centro de masas comprobado de forma independiente. |
| 5 | Masas, Δv, empuje, aceleración, consumo, relación de masas | Implementado y verificado | Panel de ingeniería; pruebas 12A y 15. |
| 5 | Impulsivo y empuje finito | Implementado y verificado | Encendidos finitos integrados (12B, 13) con referencia impulsiva. |
| 5 | Potencia y consumo; distancia al Sol; energía durante la misión; restricciones de motores | Implementado y verificado | `SpacecraftPower.js`; fase `power`; bloqueo de la propulsión eléctrica. |
| 5 | Explicar la adecuación o inadecuación | Implementado y verificado | Veredicto de ingeniería y fases de misión con su causa. |
| 6 | Oportunidades, Lambert, tiempos de vuelo, C3 y v∞, encuentros, sobrevuelos, captura, satélites | Implementado y verificado (12G, 13, 15) | Planificador interplanetario y misión completa. |
| 6 | Correcciones de trayectoria | No implementado | El crucero es balístico apuntado por Newton; no hay maniobras de corrección (TCM). |
| 6 | Asistencias gravitacionales | No implementado | Condicionado en el documento a «cuando estén implementadas y validadas». |
| 6 | Comparar oportunidades y trayectorias | Implementado y verificado | Cuadrícula de 12G y comparación de las últimas 6 misiones (15). |
| 7 | Salida, crucero, aproximación, SOI, sobrevuelo, inserción, satélites, captura con estados continuos | Implementado y verificado | Comprobación de continuidad en cada frontera. |
| 7 | Efectos gravitacionales relevantes | Parcial | Cónicas parcheadas con efemérides reales; sin perturbaciones de n cuerpos en el crucero. |
| 8 | Órbitas, hipérbolas, periapsis/apoapsis, período, captura, sobrevuelo de satélites | Implementado y verificado | 13 y 15. |
| 8 | Cambio de inclinación, mantenimiento, escape desde la órbita, evolución con perturbaciones | Parcial / No implementado | La inclinación de llegada se elige con el plano B; no hay maniobras de cambio de plano tras la captura, de mantenimiento ni de escape. |
| 9 | Centro de Misión: reproducción, pausa, velocidad, retroceso, eventos, cámaras, seguimiento, telemetría, fallos | Implementado y verificado (12C–13) | La reproducción es determinista a partir de los estados calculados. |
| 9 | Consultar energía en el Centro | Implementado y verificado | La telemetría de la misión completa da generación (solar o RTG), consumo (con el motor durante los encendidos), margen y veredicto energético en cada instante, con el mismo modelo que la fase de energía. |
| 9 | Comparar configuraciones | Parcial | Comparación en el planificador, no dentro del Centro. |
| 10 | Voyager histórico separado y con procedencia | Implementado y verificado (etapas previas) | Sin cambios en datos, kernels ni `Voyager.glb`. |
| 11 | Presentación tipo NASA Eyes | Parcial | 14 y 14.1 (pendientes de revisión con GPU); sin efectos de propulsión animados nuevos en 15. |
| 12 | Perfiles gráficos automáticos y configurables | Implementado y verificado (resolución interna) | `QualityProfile.js`; pruebas y capturas. LOD, texturas y sombras por perfil: no implementados. |
| 12 | 60 FPS y 30–60 FPS en móvil | No medido | SwiftShader no es representativo; requiere equipos reales con GPU. |
| 12 | Diseño responsivo (320–1920 px) | Implementado y verificado en las 7 resoluciones del encargo | Ver §7. |
| 13 | Auditorías independientes | Pendiente | Gemini (criterio del proyecto). |
| 14 | Sin aterrizaje, superficie ni tripulación nuevos | Respetado | Los módulos 12F se conservan sin ampliar. |

## 7. Pruebas y revisión

- `tests/HeritageHangar.test.mjs` (20 pruebas): catálogo y fuentes; masas documentadas; ajustes de potencia; propulsión eléctrica; adaptadores y envolventes; centro de masas independiente; perfil de energía; firma e importación; geometría 3D; escenario Europa (captura fallida, sobrevuelo completo, motor iónico bloqueado, Juno); reproducción en el Centro.
- `tests/QualityProfile.test.mjs` (4 pruebas): tope de la relación de píxeles, tope inicial automático, monitor de FPS y aplicación a los renderizadores.
- Suite completa: **283/283**. `npm run build` correcto, también con `GITHUB_PAGES=true` (rutas con el prefijo `/simulador-sondas-espaciales/`). El aviso de bloques de más de 500 kB ya existía antes.
- Revisión en navegador con `scripts/verify-stage15-browser.mjs`: Chrome sin interfaz con SwiftShader, sin GPU, contra el servidor de desarrollo. Evidencia en `evidence/stage15/` (JSON y PNG).
  - **Flujo (1920×1080)**, 21 capturas, 0 errores de consola.
    - Las cuatro sondas históricas dan «COHERENTE SEGÚN EL MODELO»: Voyager 825,5 kg; Cassini 5606 kg; Dawn 1217,7 kg; Juno 3625 kg, con un punto libre.
    - Variante de Cassini con la antena de Voyager: coherente, 5551 kg.
    - El motor NSTAR solo se ofrece con adaptador (+5,6 kg) y pide resolver el conflicto de propelente. Una vez instalado, la variante queda «REQUIERE MODIFICACIONES»: 228 W disponibles frente a los 500 W mínimos.
    - Al volver al motor de Cassini el diseño es de nuevo coherente.
    - Escenario C1: cadena completa. C2: NO VIABLE en la captura en Europa. La tabla de comparación tiene dos filas.
    - Centro de Misión, máxima aproximación a Europa: 100 km, 18,37 km/s, 5,19 AU; energía 804 W de RTG frente a 657 W, margen +147 W.
    - Centro de Misión, encendido de inserción en Júpiter: 707 W «con encendido», margen +101 W.
  - **Calidad (900×700, densidad 2)**: el lienzo mide 900, 1350, 1800 y 1800 px de ancho con Baja, Media, Alta y Automática. La preferencia se guarda en `localStorage`. En densidad 1 todos los perfiles dan ×1, como es de esperar.
  - **Responsivo**: 320×568, 375×667, 390×844, 768×1024, 1280×720, 1366×768 y 1920×1080 (21 capturas, 0 errores): sin desbordamiento horizontal del documento ni de la tabla de energía, y ningún botón, insignia o enlace sale de la ficha, de las tarjetas ni del lateral.
  - Corrección hecha durante la revisión: a 1280×720, «Crear variante personalizada» sobresalía de la ficha histórica. Ahora la medida de elementos recortados forma parte del guion.
  - **No revisado**: GPU real, FPS y Safari/Firefox.

## 8. Límites

- Las variantes personalizadas son **experimentales**: «coherente según el modelo» no significa que puedan fabricarse ni volar.
- El adaptador, el reparto de masas por pieza, el límite de desalineación y los consumos sin fuente son supuestos del simulador.
- La potencia solar ignora la temperatura, la degradación de las células, los eclipses y la orientación; la batería no se recarga.
- La propulsión eléctrica solo se usa en la captura del destino, no en espirales de crucero de bajo empuje (no implementadas).
- La inyección interplanetaria es una condición inicial (C3); el lanzador de 12E no está acoplado.
