# Auditoría de la etapa 20 · Captura apuntada

- **Auditor:** Claude (Opus 5.5). **Claude también implementó la etapa.** Por eso esta auditoría usa métodos distintos de los de la implementación:
  - otro método numérico (bisección) para la misma raíz;
  - barrido completo del intervalo para comprobar la monotonía;
  - fórmulas propias de dos cuerpos sobre los vectores de estado;
  - medida independiente del giro de la línea de ápsides;
  - casos de toda la flota.
- **Fecha:** 21-11-2026.
- **Alcance:** cambia el resultado de la misión completa (la condición de llegada), no la física: no toca constantes, marcos, integrador, efemérides, datos ni el motor de inserción. Aun así, por el criterio de [CLAUDE.md](../CLAUDE.md), **hace falta la revisión de alguien que no la implementó** (Gemini u otra sesión de Claude sin este contexto). Esta auditoría no la sustituye.
- **Veredicto:** **aprobada con observaciones, pendiente de revisión independiente.**

## Comprobaciones

| # | Método | Resultado |
| --- | --- | --- |
| 1 | **Bisección independiente** sobre la API pública, con la compensación desactivada, entre el periapsis pedido y 3 veces ese valor + 2 000 km (33–34 pasos, hasta 1 µm) | A1: 5 833,660659 km frente a 5 833,660671 km de la secante del módulo (diferencia de 1,2·10⁻⁵ km). C1: 4 665,850372 frente a 4 665,850371 km (7·10⁻⁷ km) |
| 2 | Barrido de 25 puntos en ese intervalo | Periapsis final monótono en el apuntado. Pendiente de 0,89 a 1,05 en A1 y de 0,999 en C1: la secante es adecuada y el umbral de 0,2 para declarar «no monótona» queda lejos |
| 3 | Fórmulas propias h²/(μ(1+e)) sobre el estado final (tras la espera de 2 días) y sobre el de la entrada en la esfera de influencia | Final: 3 000 km ± 0,05. La hipérbola de llegada pasa por el periapsis apuntado (± 0,1 km). Confirma también que la espera en órbita no altera el periapsis medido en la prueba sin espera |
| 4 | Giro de la línea de ápsides (vectores de excentricidad antes y después) | 25,4° en A1 y 0,27° en C1. No se corrige y se declara como límite |
| 5 | Flota completa en A1, A2 y C1 | Cassini y Juno se compensan. Voyager: «falta Δv o empuje». Dawn y A2 con Cassini: «relación no monótona». El resultado esperado por sonda (16) no cambia |
| 6 | Caso que antes lanzaba excepción: periapsis de 0 km, que la interfaz admite | «NO VIABLE» con el motivo; sin `ReferenceError` |
| 7 | Modelos sintéticos de la búsqueda: lineal, innecesaria, desactivada, no monótona, apuntado fallido, fuera de la SOI, captura parcial, impacto evitable | Cada caso termina con el estado y el motivo esperados. El apuntado devuelto es siempre el de la última prueba aceptada, o el original |
| 8 | Coste de la compensación | A1 con Cassini: +37,8 kg de propelente y +35,7 m/s. Se muestra en la fase de captura; no se oculta |
| 9 | Regresión | Suite 366/366. Las pruebas de 17.1 y 24 sobre los 315,5 km piden el modo sin compensar y lo siguen comprobando |
| 10 | Navegador con GPU (A1, planificador → Centro de Misión → planificador sin compensar) | Ver [STAGE20_AIMED_CAPTURE.md](STAGE20_AIMED_CAPTURE.md#verificación-en-el-navegador): sin errores ni avisos |

## Defectos

- **D-01 (corregido durante la implementación, heredado de la etapa 13).** Un apuntado fallido terminaba en `ReferenceError` (`approachInfo` usado antes de declararse) en lugar de en «NO VIABLE» con su motivo.
- **D-02 (corregido durante la implementación).** La primera versión intentaba compensar también cuando la sonda no tenía Δv para capturar (Voyager) y daba un motivo engañoso («con el periapsis compensado este vehículo no alcanza la órbita objetivo», cuando tampoco la alcanzaba sin compensar). Ahora no lo intenta y dice que falta Δv o empuje.

## Observaciones

- **O-1.** La captura en el satélite no se compensa. Con la flota actual no tiene efecto, porque ninguna sonda completa la captura en Europa.
- **O-2.** Cada prueba de la búsqueda repite el apuntado y la inserción completa (entre 4 y 10 ms en Node, según la escena), y A1 hace 5 pruebas. En el navegador, A1 con la compensación se calcula en 24 ms («Cálculo en 24 ms» en la [captura del planificador](../evidence/stage20/01_planificador_encuentro.png)).
- **O-3.** La compensación cambia el resultado por defecto. Quien quiera reproducir un resultado de 17.1 debe desmarcar la casilla. La versión del modelo cambió para que ningún resultado antiguo se reproduzca como si fuera del modelo nuevo.
- **O-4.** Revisión independiente pendiente. Puntos sugeridos para quien revise:
  - que la condición de llegada elegida sea una elección de apuntado legítima y no un ajuste del resultado;
  - la tolerancia de 10 m;
  - el criterio de pendiente mínima;
  - la decisión de no compensar cuando falta Δv.
