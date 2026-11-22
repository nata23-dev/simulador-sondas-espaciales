# Auditoría de la etapa 28 · Empalme por la asíntota y la Tierra fuera de su SOI

- **Auditor:** Claude (Opus 5.5). **Claude también implementó la etapa**, así que esta auditoría usa métodos distintos de los de la implementación:
  - cálculo propio en la frontera de la SOI a partir del resultado (sin las funciones del módulo);
  - cálculo a mano del mínimo impulsivo desde la órbita de aparcamiento;
  - integrador RK4 de paso fijo escrito en la prueba, independiente de DOPRI54;
  - revisión adversaria del diff con un caso de fallo provocado;
  - regresión en Chrome de las misiones que no salen de la plataforma.
- **Fecha:** 22-11-2026.
- **Alcance:**
  - `src/lab/EarthDeparture.js`, `src/lab/IntegratedMission.js` y `src/lab/NBodyCruise.js`;
  - los textos de `src/ui/IntegratedMissionPlanner.js` y `src/ui/LabGlossary.js`.
  - **Cambia la física del empalme de salida**, aunque no toca DOPRI54, las constantes, los marcos ni los datos.
- **Veredicto:** **aprobada con observaciones** por este auditor. **No sustituye la revisión independiente** que exige el proyecto para un cambio de física (Gemini u otra sesión de Claude sin este contexto): **pendiente**.

## Comprobaciones

| # | Método | Resultado |
| --- | --- | --- |
| 1 | **Energía en la frontera, calculada aquí** a partir del estado heliocéntrico real de la nave en la frontera y de la Tierra de las efemérides en ese instante ([`auditoria-frontera-soi.jsonl`](../evidence/stage28/auditoria-frontera-soi.jsonl)) | C3 = v² − 2μ⊕/R coincide con \|v∞\|² hasta 9·10⁻¹⁵ relativo (A1: 8,931515 km²/s²; C1: 75,756066). El radio es el de la SOI (923 910 y 924 282 km) |
| 2 | **Continuidad de la posición** entre la nave real y el comienzo de la cónica | 0 km en A1 y C1 |
| 3 | **Descomposición del salto** de velocidad declarado | \|v(R)\| − \|v∞\| = 141,03 m/s en A1, mientras μ/(R·v∞) da 144,4 m/s (es la aproximación de primer orden). La dirección de v(R) difiere 0,035° de la asíntota. El salto informado (134,25 m/s) es \|crucero − nave real\|: difiere de 141 m/s en 6,8 m/s, menos que la corrección por la Tierra (20,1 m/s) que lo explica. En C1: 49,41, 49,55 y 49,16 m/s, con 2,9 m/s de corrección |
| 4 | **Mínimo impulsivo a mano** desde la órbita de aparcamiento (C1: 165,3 × 568,7 km; en el perigeo v = 7,921 km/s y la velocidad necesaria es √(C3 + 2μ/r) = 14,057 km/s) | Δv mínimo de 6,136 km/s. La etapa 28 inyecta con 6,183 km/s: 46 m/s por encima, de los que 34 son pérdidas por gravedad. La etapa 21 inyectaba con 6,349 km/s (213 m/s por encima). La bajada de C1 es una inyección más cercana al perigeo, no un error. En A1 la inyección sube 47 m/s y 100 kg ([`auditoria-inyeccion.txt`](../evidence/stage28/auditoria-inyeccion.txt)) |
| 5 | **RK4 propio** de paso fijo (1 h; Sol + Tierra con el término indirecto), escrito en [`Stage28DeparturePatch.test.mjs`](../tests/Stage28DeparturePatch.test.mjs) | La nave real llega a 0,12 km del punto de la cónica con el diseño de la etapa 28. Sin la Tierra se aparta 12 561 469 km. Coincide con la propagación DOPRI54 del módulo (desvío final < 0,2 km) |
| 6 | **Comparación de n cuerpos** (etapa 22) con el Sol, los 8 planetas y la Luna en la Tierra ([`comparacion-salidas.json`](../evidence/stage28/comparacion-salidas.json)) | Desde la plataforma, la llegada queda donde desde el centro: A1 a 45 029 frente a 43 258 km; A2 a 45 013 frente a 43 242 km; C1 a 5 785 057 frente a 5 783 285 km. Con el empalme de la etapa 21 eran 13,2 y 14,2 millones de km |
| 7 | **Regresión** en Chrome con la GPU real: [etapa 24](../evidence/stage29/regresion/verify-stage24-gpu.json) (A1 desde el centro de la Tierra en el Centro de Misión) | Duración de la misión de 27 377 353,742 s, idéntica a la regresión registrada en la etapa 26. La etapa 28 no cambia las misiones sin plataforma. Tampoco cambian las pruebas de 20, 21 (con `patch: 'velocity'`) ni 22 desde el centro |
| 8 | **Revisión adversaria del diff** de `IntegratedMission.js` (bucle de rondas, resumen y continuidad) | Una observación corregida (O-1, abajo); el resto sin defectos |
| 9 | **Caso de fallo provocado:** efemérides de la Tierra negadas lejos de la salida desde la segunda ronda | Antes de O-1, el resumen decía «no aplicada» sin indicar que la salida ya llevaba una corrección. Ahora lo declara (prueba nueva) |

### Revisión del diff (comprobación 8)

- **Terminación del bucle.** Sale cuando el periapsis apuntado cambia menos de 1 m y el fallo con la Tierra baja de 1 km, o al cabo de 8 rondas. Si se agotan las rondas sin bajar de 1 km, `converged: false` y aparece un aviso.
- **La corrección guardada es la usada en el diseño.** Se copia antes de sumarle la nueva (`correctionAppliedKmS` conserva la referencia anterior; `add` crea otro vector).
- **El empalme de la etapa 21 (`'velocity'`)** no aplica la corrección por la Tierra ni declara saltos: se conserva tal cual para comparar.
- **Continuidad.** Solo se excluye del error máximo la frontera `earth-escape → cruise` con el mismo instante que el empalme declarado. Cualquier otro salto sigue contando. El salto declarado y el medido se devuelven juntos y coinciden.
- **Sin extrapolación.** Si las efemérides no cubren la propagación, `earthBeyondSoiCorrection` devuelve `ok: false` con el motivo de `NBodyDataError`. La misión sigue con el empalme por la asíntota y un aviso.

## Observaciones

- **O-1 (corregida):** si la propagación con la Tierra fallaba en una ronda posterior a la primera, el lanzamiento ya llevaba la corrección acumulada, pero el resumen solo decía «no aplicada». Ahora incluye `partialCorrectionMS` y el aviso dice «la salida lleva una corrección parcial de X m/s sin comprobar». La prueba nueva provoca el fallo en la segunda ronda.
- **O-2:** el coste del cálculo sube a 0,4 s en A1 y a 0,8 s en C1 (Node). Se paga una vez al pulsar «Calcular», en el hilo principal. Si se añadieran más misiones con plataforma, convendría moverlo a un worker.
- **O-3:** la corrección apunta a la posición de llegada, no al plano B ni a la velocidad. La velocidad de llegada difiere ≈ 27 m/s, como desde el centro. Lo resuelve la captura apuntada de la etapa 20 dentro de la SOI de destino, que sigue siendo de cónicas.
- **O-4:** el salto de 134 m/s en la frontera es la costura entre la nave real y la cónica dibujada. Está declarado en la fase, en el resultado y en la continuidad. Una persona que lea solo la tabla de continuidad lo verá como «empalme declarado».

## Pendiente

- **Revisión independiente de la física** (Gemini u otra sesión de Claude sin este contexto). Debe cubrir:
  - la fórmula de la asíntota;
  - el criterio del empalme convencional;
  - la corrección por la Tierra fuera de la SOI y su tolerancia;
  - las cifras de [`scripts/stage28-departure-figures.mjs`](../scripts/stage28-departure-figures.mjs).
- Revisión visual por una persona y prueba con un lector de pantalla real.
