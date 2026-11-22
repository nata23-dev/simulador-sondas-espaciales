# Etapa 20 · Captura apuntada

Estado: **implementada y probada localmente (21-11-2026)**. Auditoría: Claude, que también la implementó ([informe](STAGE20_AUDIT_CLAUDE.md)). **Pendiente la revisión independiente** de alguien que no la implementó (Gemini u otra sesión de Claude sin este contexto), porque cambia el resultado de la misión completa.

## Problema

Un encendido de captura largo, centrado en el periapsis y retrógrado, baja la trayectoria mientras actúa. La órbita final tiene un periapsis menor que el apuntado en la llegada. La etapa 17.1 lo hizo visible, pero no lo compensaba ([análisis](ANALISIS_INTEGRAL_Y_PLAN_DE_MEJORA.md) §4.1):

| Escenario (Cassini) | Periapsis pedido | Final sin compensar | Encendido |
| --- | --- | --- | --- |
| A1 · Marte, 100 000 km de apoapsis | 3 000 km | 315,5 km | 4,5 h |
| C1/C2 · Júpiter, 8 000 000 km de apoapsis | 4 200 km | 3 734,5 km | — |

## Solución

Un planificador real apunta la llegada a otro periapsis. `compensateCapturePeriapsis` (`src/lab/IntegratedMission.js`) busca ese periapsis de llegada por el **método de la secante sobre la cadena completa**. Cada prueba:

1. repite el apuntado: Lambert a la esfera de influencia con el mismo plano B, con `aimEncounter`;
2. repite la inserción de empuje finito con el mismo vehículo, motor, propelente y encendidos (`simulateInsertion`), sin la espera posterior, que no cambia la órbita;
3. mide el periapsis de la órbita final.

La búsqueda termina cuando el periapsis final coincide con el pedido a **10 m** (`PERIAPSIS_COMPENSATION.toleranceKm = 0,01`), con 12 iteraciones como máximo.

**No cambia ningún modelo físico**: ni constantes, ni marcos, ni integrador, ni efemérides, ni el motor de inserción. Solo elige la condición de llegada que ya era un parámetro del cálculo.

### Cuándo no se compensa

Se conserva la llegada al periapsis pedido y el resultado lo dice («Captura apuntada no aplicada. …») si:

- **es innecesario**: el desplazamiento no llega a 10 m;
- **está desactivada**: opción del perfil `planet.periapsisCompensation: false`, o la casilla del planificador;
- **falta Δv o empuje**: la inserción sin compensar termina en captura parcial o en sobrevuelo. Apuntar la llegada no lo arregla. Un impacto sí puede evitarse subiendo la llegada, así que en ese caso se intenta;
- **la relación no es monótona**: subir el periapsis apuntado no sube el final (pendiente menor que 0,2). Es el caso de A2, circular baja, donde subir la llegada lo empeora;
- **el apuntado falla**, o el periapsis necesario queda bajo la superficie o fuera de la esfera de influencia;
- **no converge** en 12 iteraciones.

## Resultados (flota)

| Escenario | Sonda | Sin compensar | Llegada apuntada | Final | Iteraciones |
| --- | --- | --- | --- | --- | --- |
| A1 · Marte | Cassini | 315,55 km | 5 833,66 km | **3 000,000 km** | 4 |
| A1 · Marte | Juno | 2 175,58 km | 3 799,75 km | **3 000,000 km** | 3 |
| C1/C2 · Júpiter | Cassini | 3 734,5 km | 4 665,85 km | **4 200,000 km** | 2 |
| C1/C2 · Júpiter | Juno | 4 096,4 km | 4 303,58 km | **4 200,002 km** | 1 |
| A2 · Marte circular 400 km | Cassini | −604,8 km (impacto) | — | sin cambio | relación no monótona |
| A1, A2, C1 | Voyager | captura no alcanzada | — | sin cambio | falta Δv o empuje |
| A1, A2 | Dawn | impacto | — | sin cambio | relación no monótona |

Ninguna sonda cambia de «completa» a «no completa» ni al revés: las pruebas de 16 sobre el resultado esperado por sonda siguen pasando. El coste es real y se muestra: en A1 con Cassini, la captura pasa de 2 359,1 kg de propelente y 1 665,7 m/s a **2 396,9 kg y 1 701,4 m/s**, porque frenar más arriba cuesta más.

Con la ventana de satélites, C1 (Júpiter y sobrevuelo de Europa) se completa con la órbita joviana compensada. La captura en Europa (C2) sigue sin ser viable, como antes: le falta Δv. En el satélite el desplazamiento es pequeño (llegada a 101,2 km, final a 93 km mientras la órbita aún es hiperbólica) y **no se compensa** (límite declarado).

## Corrección incluida: apuntado fallido

Si el apuntado de la llegada fallaba (periapsis bajo la superficie, Lambert sin convergencia o fecha sin cobertura), `computeIntegratedMission` lanzaba `ReferenceError: Cannot access 'approachInfo' before initialization`. Se podía llegar ahí desde la interfaz con un periapsis de 0 km, que `#im-rp` admite. Ahora devuelve «NO VIABLE» con el motivo («El periapsis pedido … está bajo la superficie»).

## Interfaz

- **Planificador:** casilla «Captura apuntada: compensar el desplazamiento del periapsis durante el encendido», marcada por defecto, dentro de «Configuración avanzada». Desmarcarla pasa el escenario a «Personalizado», y elegir otra vez un escenario la vuelve a marcar.
- **«Resultados técnicos → Encuentro»:** fila «Captura apuntada» con la llegada, la órbita conseguida, lo que habría quedado sin compensar y las iteraciones. «Periapsis apuntado / logrado» da ahora el de la llegada.
- **Fase de captura:** el texto explica la compensación o por qué no se aplicó.
- **«Resultados» del Centro de Misión:** la ficha «Órbita final» añade la llegada apuntada.
- **Glosario:** entrada «Captura apuntada». Hay además un límite nuevo en «Modelo, datos y límites».
- **Versión del modelo:** `INTEGRATED_MISSION_VERSION` pasa a `20-integrated-mission-2`. Los resultados calculados con la versión anterior dejan de valer para reproducir; los planes guardados se recalculan.

## Pruebas

- [`tests/Stage20AimedCapture.test.mjs`](../tests/Stage20AimedCapture.test.mjs), 9 pruebas:
  - A1 con Cassini: órbita final de 3 000 km ± 10 m, comprobada además con **fórmulas propias de dos cuerpos** (h²/μ(1+e)) sobre el vector de estado final y sobre el de la entrada en la esfera de influencia, cuya hipérbola pasa por el periapsis apuntado;
  - continuidad entre tramos (< 1 m, < 1 mm/s) y creación de la reproducción;
  - el modo sin compensar da exactamente el resultado de 17.1;
  - C1: 4 200 km;
  - A2 y Voyager conservan su resultado y dicen por qué;
  - el apuntado fallido ya no lanza excepción;
  - la búsqueda con modelos sintéticos: lineal, innecesaria, desactivada, no monótona, apuntado fallido, fuera de la esfera de influencia, captura parcial y un impacto que se evita apuntando más alto.
- Las pruebas de 17.1 y 24 que fijaban el periapsis de 315,5 km piden ahora **explícitamente** el modo sin compensar. Siguen comprobando ese comportamiento, que se conserva como opción. No se ha retirado ninguna prueba.
- Suite completa **366/366**; `npm run build` correcto; `git diff --check` limpio.

## Verificación en el navegador

Chrome sin interfaz con la GPU real (AMD, Direct3D 11), [`scripts/verify-stage20-browser.mjs`](../scripts/verify-stage20-browser.mjs) ([registro](../evidence/stage20/verify-stage20-gpu.json), 3 capturas). Recorrido: A1 con los controles del usuario, el Centro de Misión y la vuelta a «Planificar» sin la compensación.

| Comprobación | Resultado |
| --- | --- |
| Encuentro | «Periapsis apuntado / logrado: 5 833,66 / 5 833,6608 km»; «Captura apuntada: llegada a 5 833,7 km → órbita con 3 000 km (sin compensar: 315,5 km; 4 iteraciones)»; ambos rótulos enlazan al glosario |
| Fase de captura | «Órbita resultante: 3 000 × 100 000 km de altitud. Captura apuntada: la llegada se apuntó a 5 834 km…» |
| «Resultados» del Centro de Misión | Periapsis 3 000 / 3 000 km; apoapsis 100 000 / 100 000 km; nota de la llegada apuntada |
| Casilla desmarcada | Escenario «Personalizado»; resultado de 17.1 (316 × 100 000 km) con «No aplicada. Compensación desactivada…» |
| Volver a A1 | La casilla vuelve a estar marcada |
| Errores y avisos de la página | Ninguno |

## Límites

- Solo se compensa la captura en el planeta. La del satélite no.
- La compensación ajusta solo la altitud del periapsis de llegada. No ajusta el plano B ni el instante, ni optimiza el Δv. Con un encendido largo, la línea de ápsides también gira, y no se corrige: medido con los vectores de excentricidad de la hipérbola de llegada y de la órbita final, gira 25,4° en A1 (26,8° sin compensar) y 0,27° en C1.
- La tolerancia es de 10 m en el modelo de cónicas parcheadas. No indica la precisión de una misión real: errores de navegación, J2 y la gravedad del Sol dentro de la esfera de influencia quedan fuera del modelo, como antes.
- Pendiente: revisión independiente (Gemini u otra sesión de Claude) y revisión visual por una persona.
