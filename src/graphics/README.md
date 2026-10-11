# Escala y encuadre del sistema solar

La capa astronómica entrega posiciones heliocéntricas en AU procedentes de
NASA/JPL Horizons. `SpatialScale.js` convierte cada posición a ejes de Three.js
y aplica **32 unidades de escena por AU** a los tres componentes. Es la única
escala de posiciones en ambas vistas. Las velocidades, fechas, conversiones y
cifras de la ficha científica no se alteran. Para dos cuerpos cualesquiera,
la distancia dibujada entre centros es 32 veces su separación en AU.

Hasta la etapa anterior, los centros seguían el radio ilustrativo
`12 + 18 × √distanciaAU`. Esa compresión se retiró: hacía parecer próximos a
Júpiter, Saturno, Urano y Neptuno. En la vista científica se encuadran el Sol y
los ocho planetas. Los planetas interiores se agrupan de manera natural al
mostrar también Neptuno. El usuario puede acercarse con OrbitControls.

Ejemplo para la muestra del 10 de octubre de 2026: el centro de la Tierra
pasó de 29,99 a 31,96 unidades del Sol; Neptuno pasó de 110,39 a 956,09.
Su relación de distancias con la Tierra es ahora ~29,91, la misma que en AU,
en lugar de ~3,68 con la antigua compresión. Los tamaños visuales no intervienen
en esta relación.

Los **tamaños** siguen ampliados para reconocer los planetas. Los radios de
`SolarSystem.js` y el disco solar de `Sun.js` son ilustrativos y no representan
la proporción física entre radios y distancias. Durante una observación cercana,
`SolarTransitGuard.js` amplía suavemente los discos hasta 2,5 veces en la vista
completa y reduce las mallas secundarias hasta aproximadamente el 18 % de
su radio gráfico, sin mover sus centros. También atenúa un cuerpo secundario
que, por su radio exagerado, produciría un tránsito solar engañoso. El planeta
seleccionado conserva su tamaño, material, atmósfera y, en Saturno, sus anillos.
La exposición de cámara se adapta gradualmente al primer plano de un planeta
exterior poco iluminado, para poder distinguir sus texturas. La intensidad de
la luz solar, el albedo de los materiales y los valores científicos no cambian.

La vista cinematográfica utiliza las mismas posiciones proporcionales y viaja
al planeta seleccionado, o a Saturno si no hay selección. La cámara encuadra
el planeta según FOV, aspecto y tamaño visual. Otros planetas pueden quedar
fuera del campo; no se traen al primer plano. Las órbitas parciales son
referencias ilustrativas que pasan por el centro gráfico de su planeta en cada
muestra y se atenúan al acercarse. **No** son trayectorias calculadas.

El catálogo Hipparcos mantiene sus direcciones inerciales; su esfera se
traslada con la cámara para dar una referencia distante sin paralaje artificial.
La cámara usa near=0,5 y far=10 000 unidades para acomodar el encuadre completo
y los primeros planos. El objetivo de 30 FPS requiere medición en el equipo de
demostración.
