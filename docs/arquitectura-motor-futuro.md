# Decisiones pendientes para el futuro motor gravitacional

Este documento define interfaces conceptuales; no implementa propagación, fuerzas ni maniobras.

## Marcos y orígenes

El proveedor actual entrega estados heliocéntricos eclípticos J2000/ICRF. Un integrador debe declarar marco inercial, origen, época y escala temporal de todos los estados iniciales. Para usar efemérides baricéntricas del Sistema Solar hacen falta estados del Sol respecto al baricentro y transformaciones de posición **y velocidad** entre orígenes. En formulación heliocéntrica de N cuerpos aparece la aceleración indirecta debida a la aceleración del Sol; omitirla cambia las ecuaciones. Cambiar una constante `origin` no efectúa esa transformación. Antes de integrar, definir y probar un servicio de transformaciones con procedencia y cobertura temporal.

## Tiempo

En JD alrededor de 2 461 340.5 (2026), `floor(log2(JD))=21`; la separación binaria64 es `2^(21-52)=4.656612873077393e-10` días. Multiplicada por 86 400 s/día equivale a `40.23313522338867 μs`. Un avance menor puede no cambiar un `Number` JD, y las diferencias de JD redondean a esa cuadrícula. El motor debería usar segundos relativos a una época de integración o un par día entero + fracción/segundos. La interfaz del proveedor debe aceptar conversiones explícitas y verificadas a/desde JD TDB para conservar compatibilidad; nunca interpretar una etiqueta UTC como TDB sin conversión de escala.

## Dinámica y verificación

El futuro catálogo físico deberá identificar cuerpo, `GM` con unidades y fuente, marco y condiciones iniciales con época y procedencia. Una interfaz conceptual sería `initialConditions(epoch, frame, bodies) -> states`, `acceleration(t, states, physicalCatalog) -> derivatives` e `integrate(initial, interval, tolerances) -> trajectory + diagnostics`. Las decisiones sobre integradores (simpléctico, Runge–Kutta adaptativo, etc.) deben basarse en horizontes y precisión requeridos. Medir convergencia al reducir el paso/tolerancias, energía y momento angular en casos conservativos y errores frente a referencias independientes. Especificar tratamiento de encuentros cercanos, efemérides forzantes, discontinuidades de maniobra y acumulación de error antes de escoger integrador. `Float64Array` puede servir a cálculos intensivos, con conversión en la frontera pública a estados inmutables. El cálculo debe ejecutarse aparte del ciclo WebGL; Three.js solo consume copias transformadas para visualización.

## Transición propuesta

1. Obtener y verificar fuentes de `GM`, efemérides baricéntricas y transformaciones de marco/origen.
2. Definir representación de tiempo relativa y pruebas de ida/vuelta con JD TDB.
3. Adquirir muestras independientes para cuantificar interpolación y condiciones iniciales.
4. Diseñar pruebas de dos cuerpos y N cuerpos con invariantes y convergencia antes de conectar el motor a la UI.
