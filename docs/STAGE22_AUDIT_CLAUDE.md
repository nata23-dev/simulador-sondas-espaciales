# Auditoría de la etapa 22 · Crucero realista (n cuerpos)

- **Auditor:** Claude (Opus 5.5). **Claude también implementó la etapa.** Por eso esta auditoría usa métodos distintos de los de la implementación:
  - un RK4 propio de paso fijo frente a DOPRI54;
  - el límite de dos cuerpos frente a Kepler;
  - la aceleración calculada aparte;
  - la TCM re-propagada de forma independiente;
  - una comprobación de energía en la llegada;
  - pruebas de sensibilidad (tolerancia, día de la TCM y aproximación de la Luna);
  - un barrido de escenarios.
- **Fecha:** 21-11-2026.
- **Alcance:** añade dinámica nueva (n cuerpos) en paralelo a la misión. No cambia la cadena, sus tramos, la versión del modelo, constantes, efemérides, datos ni DOPRI54. Por el criterio de [CLAUDE.md](../CLAUDE.md), **necesita la revisión de alguien que no la implementó**; esta auditoría no la sustituye.
- **Veredicto:** **aprobada con observaciones, pendiente de revisión independiente.**

## Comprobaciones

| # | Método | Resultado |
| --- | --- | --- |
| 1 | Aceleración con los términos directo e indirecto escritos aparte | Coincide con la del módulo a redondeo relativo de 10⁻¹⁴. Sin el término indirecto cambia más de 10⁻¹⁰ km/s², así que el término importa |
| 2 | Sin perturbadores, frente a Kepler (312 d) | < 10 m y < 10⁻⁹ km/s |
| 3 | **RK4 propio** de paso fijo (2 400 pasos de 3,1 h) con siete planetas y las mismas efemérides | < 1 km y < 10⁻⁷ km/s frente a DOPRI54 |
| 4 | Tolerancia relativa 10⁻¹² frente a 10⁻¹³ (319 frente a 506 pasos) | La diferencia en la llegada cambia 0,1 m; la TCM, menos de 10⁻⁵ m/s |
| 5 | **TCM re-propagada** desde el estado «otros planetas» del día 10, con el Δv del resultado | Llega al punto de la cónica con menos de 0,1 km de error (prueba) |
| 6 | La cónica de referencia frente al final del tramo `cruise` de la cadena (A1, C1) | Diferencia 0 km y 0 km/s |
| 7 | **Energía de llegada a Júpiter** (C1, Voyager): v_rel² con n cuerpos menos v_rel² de la cónica | 5,291 km²/s², frente a 2μ_J/R_SOI = 5,26 km²/s² con R_SOI = 48,2 millones de km. El efecto del destino fuera de su SOI es la energía que la cónica no cuenta |
| 8 | Barrido A1, A2, A3, C1 y C2, con y sin la plataforma | Los 10 casos se calculan en 233–735 ms. TCM de 0,86–0,95 m/s, 2 iteraciones, residuo de 0,2–0,3 m. «Solo los otros planetas»: 29–31 mil km (Marte) y 76 mil km (Júpiter) |
| 9 | Día de la TCM: 5, 10, 30 y 60 (A1) | 0,92 / 0,88 / 0,78 / 0,55 m/s. La perturbación se acumula sobre todo cerca de la llegada |
| 10 | Aproximación de la Luna (A1 con la plataforma): Tierra sola frente a Tierra + Luna | 165 205 km de diferencia en la llegada, frente a un efecto terrestre de 13,2 millones de km (≈ 1 %) |
| 11 | Efemérides que faltan a mitad del crucero | «sin efemérides … no se extrapola» |
| 12 | Regresión | La misión no cambia (tramos idénticos antes y después). Suite completa 387/387 |
| 13 | Navegador con GPU | Ver [STAGE22_NBODY_CRUISE.md](STAGE22_NBODY_CRUISE.md#verificación-en-el-navegador): sin errores ni avisos |

## Defectos

- **D-01 (corregido durante la implementación).** La primera versión de la TCM corregía **todo**, incluidos los efectos de la Tierra y del destino fuera de sus SOI, y daba 120–142 m/s. Esas cifras no son una corrección real: son la aproximación del modelo, que un diseño en n cuerpos evitaría. Ahora la TCM corrige solo la perturbación de los otros planetas, y los efectos de las SOI se dan aparte como diferencias de modelo.
- **D-02 (corregido durante la implementación).** El jacobiano por diferencias finitas sobre n cuerpos costaba 3 propagaciones por iteración (≈ 1 s). Se sustituyó por el de la cónica, que es barato, con el residuo de n cuerpos. Converge en 2 iteraciones en todos los casos del barrido.
- **D-03 (corregido).** En la interfaz, la fila «Sin …» decía «La diferencia es…» aunque otro cuerpo dominara la desviación. Ahora muestra el valor con ese cuerpo y sin él. El botón no tenía estilo y ahora usa el secundario del laboratorio.

## Observaciones

- **O-1 · El C3 de la etapa 21 es demasiado bajo para el sistema solar real.** Con la plataforma, la Tierra fuera de su SOI aparta 13,2 millones de km la llegada a Marte, y la nave llega ≈ 1,5 km/s más lenta respecto al punto de la cónica. Confirma la O-1 de la [auditoría de la etapa 21](STAGE21_AUDIT_CLAUDE.md). Resolverlo exige apuntar la salida con un modelo que incluya la Tierra fuera de la SOI (n cuerpos o un empalme con la asíntota). Es una decisión de modelo para quien revise, fuera de esta etapa.
- **O-2 · Júpiter fuera de su SOI** suma ≈ 0,45 km/s a la velocidad de llegada. La captura de la etapa 20, diseñada con la cónica, no la incluye. Mismo remedio que en O-1.
- **O-3 · La TCM es ilustrativa.** Fecha fija, objetivo en posición y sin errores de inyección ni de navegación. En una misión real estos errores dominan las correcciones.
- **O-4 · Revisión independiente pendiente.** Puntos sugeridos:
  - la ecuación heliocéntrica con término indirecto y los GM de sistema en los baricentros;
  - la Luna sumada a la Tierra;
  - excluir la Tierra cuando el crucero empieza en su centro;
  - la separación entre «perturbación» y «aproximación de las SOI»;
  - el método cuasi-Newton de la TCM.
