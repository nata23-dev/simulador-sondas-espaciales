# Etapa 28 · Salida desde la plataforma: empalme por la asíntota y la Tierra fuera de su SOI

Estado: **implementada y probada localmente (22-11-2026)**. Auditoría: Claude, que también la implementó ([informe](STAGE28_AUDIT_CLAUDE.md)). **Cambia la física del empalme entre el lanzamiento desde LC-41 (etapa 21) y el crucero**. Por la regla del proyecto, necesita además la **revisión de alguien que no la implementó** (Gemini u otra sesión de Claude sin este contexto): **pendiente**. No cambia DOPRI54, las constantes, los marcos, las efemérides ni los datos. Las misiones que salen desde el centro de la Tierra (sin «Empezar en la plataforma») no cambian.

## Petición

> «Quiero que corrijas los puntos que puedas; si son necesarios cambios en la física o las matemáticas para que los cálculos sean precisos y fundamentados, hazlos. Cambia esa limitación.»

La limitación es la que dejaron abierta las etapas 21 y 22: con la plataforma, el C3 quedaba ≈ 0,86 km²/s² por debajo del convencional y, con la gravedad real de la Tierra, la nave llegaba a Marte 13,2 millones de km lejos del punto de la cónica.

## Problema

La etapa 21 empalmaba la hipérbola de escape con el crucero igualando la **velocidad** en la frontera de la esfera de influencia (SOI, R ≈ 924 000 km): `V⊕ + v(R) = v_req`. La trayectoria dibujada era continua, pero el crucero de cónicas ignora la Tierra fuera de la SOI. La nave real sigue frenada por la Tierra después de la frontera. Su energía hiperbólica es `|v(R)|² − 2μ⊕/R`, así que el C3 resultaba menor en 2μ⊕/R = 0,863 km²/s²:

- A1: 8,117 frente a 8,993 desde el centro;
- C1: 74,846 frente a 75,733.

La [etapa 22](STAGE22_NBODY_CRUISE.md) lo midió: en n cuerpos, la llegada de A1 se apartaba 13 195 813 km y ≈ 1,5 km/s.

## Modelo

### 1 · Empalme convencional por la asíntota (`EarthDeparture.js`)

Es el de las cónicas parcheadas de radio de SOI nulo, el usado en el diseño de misiones reales. **Se iguala la velocidad de exceso hiperbólico**, no la velocidad en la frontera: `V⊕(t_SOI) + v∞ = v_req`.

- `hyperbolicExcessVelocity(r, v, μ)` devuelve el vector de la asíntota de salida. Con el vector de excentricidad ê, el momento angular ĥ y e > 1, su dirección es ŝ = (−ê + √(e²−1)·(ĥ × ê)) / e y su módulo √C3, con C3 = v² − 2μ/r. Si la órbita no es hiperbólica devuelve `null`.
- La salida se resuelve en las mismas rondas de la etapa 21 (acimut, hora de despegue, inyección), ahora apuntando la asíntota. El C3 vuelve al valor convencional.
- `designEarthDeparture({ …, patch })` acepta `'asymptote'` (por defecto) o `'velocity'` (el empalme de la etapa 21, para comparar y para las pruebas de regresión). Un valor desconocido lanza `RangeError`. `DEPARTURE_PATCH_MODELS` describe los dos.

### 2 · La Tierra fuera de su SOI (`earthBeyondSoiCorrection`)

Igualar la asíntota recupera la energía, pero la Tierra sigue curvando la trayectoria después de la frontera. Solo con el punto 1, A1 llega a 527 392 km del punto previsto. Por eso:

- El **estado real** de la nave en la frontera se propaga hasta el instante de llegada **con el Sol y la Tierra**:
  - la posición de la frontera;
  - la velocidad V⊕ + v(R), la de la hipérbola, no la del crucero;
  - integrador DOPRI54 y `propagateNBody` de la etapa 22;
  - la masa de la Luna va en el GM de la Tierra, como en la etapa 22.
- La diferencia con el punto de llegada de la cónica se corrige en la velocidad pedida al lanzamiento: Δ = −(∂r/∂v)⁻¹ · desvío.
  - La sensibilidad ∂r/∂v se obtiene por diferencias finitas con Kepler heliocéntrico (paso 10⁻⁵ km/s).
  - La corrección se acumula en las rondas del lanzamiento hasta que el desvío baja de **1 km** (`EARTH_BEYOND_SOI`: tolerancia 1 km, máximo 8 rondas).
- Si no hay efemérides o el integrador falla, la salida queda con el punto 1 y un aviso. No se extrapola.
- `profile.launch.earthBeyondSoi` (verdadero por defecto) permite desactivarla.

### 3 · Salto de velocidad declarado en la frontera

El crucero dibujado sigue siendo la cónica de Lambert. La nave real tiene la velocidad de la hipérbola. En la frontera hay, por tanto, una diferencia de velocidad: 134 m/s en A1 y 49 m/s en C1. Su origen está en dos términos:

- v(R) − v∞ ≈ μ⊕/(R·v∞), que mide 141 m/s en A1;
- la corrección del punto 2, de 20 m/s en A1.

**No es un encendido**:

- se declara como empalme en la fase de escape («no es un encendido»), en el resultado (`launch.soiVelocityJumpKmS`) y en la lista `patches` de la misión;
- la comprobación de continuidad lo excluye del error máximo de velocidad y lo lista aparte (`declaredPatches`);
- **la posición es continua** (0 km).

## Resultados

Medidos con [`scripts/stage28-departure-figures.mjs`](../scripts/stage28-departure-figures.mjs) ([resultado](../evidence/stage28/comparacion-salidas.json)). Columna «Desvío n cuerpos»: llegada de la nave real con el Sol, los ocho planetas y la Luna en la Tierra, sin la TCM. Columna «Otros planetas»: perturbación que corrige la TCM-1.

| Misión | Salida | C3 (km²/s²) | Desvío n cuerpos | Otros planetas | TCM-1 |
| --- | --- | --- | --- | --- | --- |
| A1 · Cassini → Marte | Centro de la Tierra | 8,993 | 43 258 km | 29 354 km | 0,88 m/s |
| A1 | Plataforma, empalme de la 21 | 8,117 | **13 195 813 km** | 31 187 km | 0,86 m/s |
| A1 | Plataforma, solo asíntota | 8,983 | 527 392 km | — | — |
| A1 | **Plataforma, etapa 28** | **8,932** | **45 029 km** | 31 046 km | 0,86 m/s |
| A2 · Juno → Marte | Centro / 21 / **28** | 8,994 / 8,118 / **8,933** | 43 242 / 13 195 169 / **45 013 km** | 29 356 / 31 189 / 31 049 km | 0,88 / 0,86 / 0,86 m/s |
| C1 · Voyager → Júpiter | Centro / 21 / **28** | 75,733 / 74,846 / **75,756** | 5 783 285 / 14 197 249 / **5 785 057 km** | 75 559 / 75 991 / 76 231 km | 0,95 / 0,88 / 0,90 m/s |

Lectura:

- **Con la plataforma, la nave real llega ahora donde llegaba la misión desde el centro de la Tierra.**
  - En A1 y A2, el desvío restante (≈ 45 000 km) es el de los otros planetas y Marte fuera de su SOI; la TCM-1 lo corrige con menos de 1 m/s.
  - En C1, los 5,79 millones de km restantes son Júpiter fuera de su SOI, del lado de la llegada (ya medido en la etapa 22). La salida ya no añade nada.
- **El C3 de A1 vuelve al valor convencional.** Queda 0,06 km²/s² por debajo del calculado desde el centro: es la parte de la salida que ahora diseña la Tierra fuera de la SOI.
- **Inyección de la Centaur** (medida en el resultado de la misión):
  - **A1:** 3,601 km/s frente a 3,554 km/s (+47 m/s) y 11 869 kg de propelente frente a 11 769 kg (+100 kg).
  - **C1:** baja de 6,349 a 6,183 km/s (−148 kg) aunque el C3 sube. Las rondas encuentran una inyección más cercana al perigeo de la órbita de aparcamiento: tras 1 483 s de espera, frente a 4 399 s.
  - **Comprobación a mano para C1:** el mínimo impulsivo en el perigeo de esa órbita (165 × 569 km) es 6,136 km/s. La etapa 28 queda 46 m/s por encima, de los que 34 son pérdidas por gravedad; la etapa 21 quedaba 213 m/s por encima.
  - La fase de la inyección no se optimiza en ninguna de las dos etapas.
- **Corrección de la Tierra:** 20,1 m/s en A1 (4 rondas) y 2,9 m/s en C1 (6 rondas). En ambos casos el desvío final queda por debajo de 0,2 km.
- **Coste de cálculo** (Node, misma máquina): A1 ≈ 0,4 s y C1 ≈ 0,8 s, frente a 0,06–0,5 s antes. Se paga una vez al pulsar «Calcular».

## Interfaz

- En el resultado de «Misión completa» con la plataforma:
  - la fila «Empalme con el crucero» indica el modelo (asíntota), la corrección de la Tierra y el desvío final;
  - una fila nueva, «Salto de velocidad en la frontera», da su valor y explica que no es un encendido;
  - en el bloque de continuidad aparece la fila «Empalme declarado», y el error máximo se rotula «(sin el empalme declarado)».
- El glosario «Empalme con el crucero» se ha reescrito: asíntota, atracción terrestre fuera de su esfera de influencia, no es un encendido.
- En el crucero de n cuerpos, la Tierra ya no se aísla cuando la salida se diseñó con ella. Su efecto residual entra en los «otros cuerpos» que corrige la TCM-1.

## Pruebas

- [`tests/Stage28DeparturePatch.test.mjs`](../tests/Stage28DeparturePatch.test.mjs) (6 pruebas):
  - asíntota frente a Kepler a 10⁹ km, y `null` si la órbita es ligada;
  - caso sintético: la diferencia de C3 entre empalmes es 2μ/R, la energía en la frontera, el salto, el `RangeError` y los modelos declarados;
  - A1: C3 dentro del 1 % del valor desde el centro, |v∞|² = C3, un empalme declarado con salto entre 0,5 y 2 veces μ/(R√C3), ninguno con el empalme de la 21, y el texto «no es un encendido»;
  - **RK4 de paso fijo escrito en la prueba** (1 h, Sol + Tierra con el término indirecto, sin usar el integrador del proyecto). La nave real llega a 0,12 km del punto de la cónica; sin la Tierra se aparta 12 561 469 km;
  - glosario y nombre del perturbador;
  - fallo provocado de la propagación con la Tierra en la segunda ronda: el resumen declara la corrección parcial (observación O-1 de la [auditoría](STAGE28_AUDIT_CLAUDE.md)).
- [`tests/Stage22NBodyCruise.test.mjs`](../tests/Stage22NBodyCruise.test.mjs):
  - la prueba de la etapa 21 se conserva con `patch: 'velocity'`: sigue midiendo los más de 10⁶ km;
  - prueba nueva de la 28: menos de 10⁵ km, dentro del 15 % del valor desde el centro, solo Marte aislado y TCM-1 menor de 5 m/s.
- Total del proyecto al cerrar las etapas 27–29: **420 pruebas**, todas pasan.

## Límites

- **Sigue siendo una misión de cónicas parcheadas.** El crucero reproducido es la cónica de Lambert. La nave real solo se calcula para diseñar la salida y para la comparación de n cuerpos. El salto de 134 m/s en la frontera es la costura entre los dos modelos y se declara.
- **Dentro de la SOI** la salida sigue siendo de dos cuerpos: Tierra puntual, sin el Sol, sin la Luna y sin J2.
- **La Luna** no es un cuerpo separado: su GM va en el de la Tierra, como en la etapa 22.
- **La corrección apunta a la posición de llegada**, no al plano B ni a la velocidad de llegada. Esta última difiere ≈ 27 m/s de la cónica en A1, como desde el centro.
- **El lado de la llegada no se corrige.** El efecto de Júpiter fuera de su SOI en C1 queda como en la etapa 22: millones de km y ≈ 0,45 km/s. Corregirlo exigiría diseñar la llegada en n cuerpos.
- **Pendientes:**
  - revisión independiente de la física (Gemini u otra sesión de Claude sin este contexto);
  - revisión visual por una persona;
  - prueba con un lector de pantalla real.
