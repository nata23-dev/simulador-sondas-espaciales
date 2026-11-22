# Etapa 22 · Crucero realista (n cuerpos)

«Misión completa» calcula el crucero con cónicas parcheadas: en el viaje solo actúa el Sol. Esta etapa añade, **en paralelo y sin cambiar la misión**, una propagación de n cuerpos del mismo crucero. Usa el Sol y los ocho planetas de las efemérides de Horizons, integrados con DOPRI54. Da tres resultados:
1. su diferencia con la cónica;
2. el efecto de cada aproximación de las esferas de influencia;
3. la corrección de trayectoria (TCM-1) que haría falta.

Estado: implementada, con pruebas locales y revisión en Chrome con la GPU real. Auditoría de Claude, que también la implementó: [STAGE22_AUDIT_CLAUDE.md](STAGE22_AUDIT_CLAUDE.md). **Pendientes:**
- revisión independiente, necesaria porque añade dinámica;
- revisión visual por una persona;
- prueba con un lector de pantalla real.

## Modelo

- **Ecuación del movimiento** en el marco heliocéntrico de las efemérides (eclíptica J2000, centro del Sol), con el término indirecto porque el Sol no es un marco inercial:
  a = −μ☉ r/|r|³ + Σ_k μ_k [ (r_k − r)/|r_k − r|³ − r_k/|r_k|³ ]
- **Perturbadores y GM**, del catálogo del proyecto (NASA/JPL SSD):

  | Cuerpo | Posición | GM |
  | --- | --- | --- |
  | Mercurio, Venus | Centro del planeta (199, 299) | Del planeta |
  | Tierra | Centro de la Tierra (399) | **GM de la Tierra + GM de la Luna**: la Luna no está en estas efemérides heliocéntricas; aproximación declarada (ver Límites) |
  | Marte | Centro del planeta (499) | Del sistema |
  | Júpiter, Saturno, Urano, Neptuno | **Baricentro del sistema** (5–8), como los destinos de la etapa 13 | Del sistema |

- **Integrador:** DOPRI54 (el de 12B y la inserción), con tolerancia relativa 10⁻¹² y absoluta 10⁻⁹. Las posiciones de los planetas se interpolan con Hermite sobre los nodos de Horizons, igual que en el resto del simulador; no se extrapola. Si falta un estado, el resultado es «sin efemérides».
- **Referencia:** la cónica del tramo `cruise` de la misión, desde el mismo estado inicial, comparada en el instante de entrada en la SOI del destino (coincide exactamente con el final del tramo de la cadena).
- **Qué se incluye y qué se mide aparte:**
  - **Sin «Empezar en la plataforma»:** el crucero empieza en el centro de la Tierra, así que la Tierra se **excluye**, porque su potencial es singular ahí.
  - **Con la plataforma (21):** el crucero empieza en la frontera de la SOI terrestre y la Tierra se incluye.
  - El **destino fuera de su SOI** y, con la plataforma, la **Tierra fuera de la suya** se miden aparte: se repite la propagación sin ellos. Son la aproximación de las cónicas parcheadas, que tratan la frontera de la SOI como si la gravedad del planeta acabara allí. Una misión real no los «corregiría»: los incluiría desde el diseño.
  - **«Solo los otros planetas»** (sin los cuerpos aislados) es la perturbación del crucero propiamente dicha.
- **TCM-1**, a los 10 días de crucero:
  - es el Δv que lleva la nave, con la perturbación de los otros planetas, al punto de llegada de la cónica en el mismo instante;
  - método cuasi-Newton: jacobiano de la cónica (Kepler, por diferencias finitas) y residuo de n cuerpos, con tolerancia de 0,1 km;
  - propelente por la ecuación del cohete con el motor de la sonda y la masa del crucero, **no descontado de la cadena**.
- **Bajo demanda.** Se calcula al pulsar «Comparar con n cuerpos» (0,2–0,7 s), no en cada «Calcular misión». La misión, sus tramos y su versión del modelo no cambian.

Código: [`src/lab/NBodyCruise.js`](../src/lab/NBodyCruise.js) (sin DOM): `heliocentricAcceleration`, `propagateNBody`, `compareNBodyCruise` y `compareMissionCruise`.

## Resultados

Barrido de la [auditoría](STAGE22_AUDIT_CLAUDE.md), con la sonda que tiene salida viable en cada escenario:

| Escenario | Salida | Diferencia en la llegada (modelo completo) | Solo los otros planetas | TCM-1 |
| --- | --- | --- | --- | --- |
| A1 · Cassini → Marte | Centro de la Tierra | 43 258 km · 26,0 m/s | 29 354 km · 3,6 m/s | 0,88 m/s · 1,61 kg |
| A1 · Cassini → Marte | Plataforma | 13 195 813 km · 1 506 m/s | 31 187 km · 3,8 m/s | 0,86 m/s · 1,58 kg |
| A2 · Juno → Marte | Centro / plataforma | 43 242 / 13 195 169 km | 29 356 / 31 189 km | 0,88 / 0,86 m/s |
| A3 · Dawn → Marte | Centro / plataforma | 43 242 / 13 194 931 km | 29 356 / 31 189 km | 0,88 / 0,86 m/s (0,035 kg: motor iónico) |
| C1 · Voyager → Júpiter | Centro de la Tierra | 5 783 285 km · 450 m/s | 75 559 km · 2,1 m/s | 0,95 m/s · 0,36 kg |
| C1 · Voyager → Júpiter | Plataforma | 14 197 248 km | 75 991 km · 2,1 m/s | 0,88 m/s · 0,34 kg |
| C2 · Dawn → Júpiter | Centro / plataforma | 5 783 285 / 14 197 249 km | 75 559 / 75 991 km | 0,95 / 0,88 m/s |

Lectura:

- **Los otros planetas** apartan el crucero entre 29 000 y 76 000 km. Corregirlo a los 10 días cuesta menos de 1 m/s.
- **Marte fuera de su SOI** añade unos 14 000 km. **Júpiter fuera de su SOI** añade millones de km y ≈ 0,45 km/s en la velocidad de llegada. Esa ganancia de energía coincide con 2μ/R_SOI (5,29 frente a 5,26 km²/s², [auditoría](STAGE22_AUDIT_CLAUDE.md)): es la energía que la cónica parcheada no cuenta al entrar en la SOI.
- **La Tierra fuera de su SOI**, con la plataforma, aparta 13,2 millones de km la llegada a Marte. Mide la observación O-1 de la [auditoría de la etapa 21](STAGE21_AUDIT_CLAUDE.md): el empalme continuo en la SOI deja a la nave con ≈ 0,86 km²/s² menos de C3. Fuera de la SOI la Tierra la sigue frenando, y llega ≈ 1,5 km/s más lenta respecto al punto de la cónica. **Con la plataforma, el C3 de la etapa 21 es demasiado bajo para el sistema solar real.** Lo recoge la tabla de límites.
- El resultado no depende de la tolerancia del integrador: con 10⁻¹³ cambia 0,1 m.

## Interfaz

- **«Resultados técnicos → Crucero de n cuerpos (comparación)»** (`#im-nbody-box`):
  - explicación breve y botón «Comparar con n cuerpos» (`#im-nbody`), desactivado sin misión calculada;
  - estado (`#im-nbody-status`, `role="status"`);
  - filas: modelo, cuerpo excluido, diferencia en la llegada, «Sin …» para cada efecto aislado, «Solo los otros planetas», TCM-1 y tiempo de cálculo.
- Cambiar cualquier condición o recalcular invalida la comparación. El botón usa el estilo secundario del laboratorio.
- **Glosario:** «Crucero de n cuerpos» y «Corrección de trayectoria (TCM)».
- **Límites de la misión:** la línea de las correcciones en crucero remite a la comparación.

## Pruebas

[`tests/Stage22NBodyCruise.test.mjs`](../tests/Stage22NBodyCruise.test.mjs), 8 pruebas:

- **Aceleración:** término directo e indirecto calculados aparte; el indirecto cambia el resultado en más de 10⁻¹⁰ km/s².
- **GM:** del catálogo; sistemas en los gigantes y la Luna sumada a la Tierra.
- **Límite de dos cuerpos:** sin perturbadores, la propagación coincide con Kepler en 312 días (< 10 m).
- **RK4 propio:** de paso fijo (2 400 pasos), con siete planetas; coincide con DOPRI54 a menos de 1 km.
- **A1 sin plataforma:**
  - la Tierra excluida y el efecto de Marte aislado;
  - la TCM-1 se **re-propaga de forma independiente** y llega al punto de la cónica con menos de 0,1 km de error;
  - propelente por la ecuación del cohete;
  - la misión no cambia.
- **A1 desde la plataforma:** el efecto de la Tierra fuera de la SOI supera el millón de km; sin ella, vuelve a decenas de miles.
- **Sin efemérides** en parte del crucero: «sin efemérides», con «no se extrapola».
- **Glosario.**

Suite completa **387/387**; `npm run build` correcto; `git diff --check` limpio.

## Verificación en el navegador

Chrome sin interfaz con la GPU real (AMD, Direct3D 11), [`scripts/verify-stage22-browser.mjs`](../scripts/verify-stage22-browser.mjs) ([registro](../evidence/stage22/verify-stage22-gpu.json), 3 capturas). El recorrido usa los controles del usuario.

| Comprobación | Resultado |
| --- | --- |
| Antes de calcular | Botón desactivado, «Calcula una misión para comparar su crucero.» |
| A1 calculada, sin comparar | Botón activo, «Sin comparar todavía.» |
| Comparación (A1) | «Comparación calculada en 235 ms. La misión no cambia…»; filas con 43 258 km, «Sin Marte» 29 354 km, «Solo los otros planetas» y TCM-1 de 0,88 m/s · 1,61 kg ([captura](../evidence/stage22/01_crucero_n_cuerpos_A1.png)) |
| Cambiar una condición (marcar la plataforma) | La comparación se invalida y el botón se desactiva hasta recalcular |
| Con la plataforma | 13 195 813 km; «Sin Tierra + Luna» 45 159 km; TCM-1 0,86 m/s ([captura](../evidence/stage22/02_crucero_n_cuerpos_A1_plataforma.png)) |
| Glosario | Marca «Crucero de n cuerpos», «Solo los otros planetas» y «Corrección de trayectoria» |
| 390 px | Sin desbordamiento horizontal ([captura](../evidence/stage22/03_movil_crucero_n_cuerpos.png)) |
| Errores y avisos de la página | Ninguno |

## Límites

- **Comparación, no misión.** La misión, la reproducción y el propelente de la cadena siguen siendo los de las cónicas parcheadas. La TCM no se descuenta ni se reproduce.
- **Qué falta en el modelo de n cuerpos:**
  - la Luna como cuerpo separado: su GM va en el centro de la Tierra, lo que mueve la llegada 165 000 km de 13,2 millones con la plataforma;
  - presión de radiación, relatividad, asteroides y empujes residuales;
  - la gravedad del Sol y de otros planetas **dentro** de las SOI de salida y llegada, que siguen siendo cónicas.
- **TCM-1.** Corrige solo la perturbación de los otros planetas, en una fecha fija (día 10) y apuntando a la posición de llegada, no al plano B ni a la velocidad: tras corregir, la velocidad de llegada difiere en ≈ 1 m/s. El coste depende de la fecha (0,92 m/s el día 5 y 0,55 m/s el día 60 en A1). No es una optimización ni incluye errores de inyección o de navegación, que en una misión real dominan las correcciones.
- **Efectos de las SOI.** Se dan como diferencias de modelo. Corregirlos de verdad exige diseñar la salida y la llegada en n cuerpos (salida y captura apuntadas con el modelo completo), y queda fuera de esta etapa. Con la plataforma, lo más importante es que el C3 de la etapa 21 queda corto.
  - **Actualización (etapa 28, 22-11-2026):** la salida desde la plataforma ya se apunta con la Tierra fuera de su SOI ([etapa 28](STAGE28_DEPARTURE_PATCH.md)). Con ella, la Tierra no se aísla en esta comparación: el desvío de A1 baja de 13 195 813 a 45 029 km y el de C1 de 14 197 248 a 5 785 057 km. Lo que queda en C1 es Júpiter fuera de su SOI, del lado de la llegada, que sigue sin corregir. Las filas «Plataforma» de la tabla de resultados son las del empalme de la etapa 21.
- **Pendientes:** revisión independiente (Gemini u otra sesión de Claude sin este contexto), revisión visual por una persona y prueba con un lector de pantalla real.
