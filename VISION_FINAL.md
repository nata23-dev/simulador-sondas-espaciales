# VISIÓN FINAL DEL PROYECTO
## Simulador de Sondas Espaciales

### 1. Concepto general

Desarrollaremos una aplicación web tridimensional de simulación espacial, científicamente fundamentada, interactiva, visualmente inmersiva y accesible desde diferentes dispositivos.

El simulador permitirá explorar el Sistema Solar, observar las posiciones y movimientos de los cuerpos celestes, estudiar misiones históricas y diseñar nuevas misiones espaciales utilizando sondas no tripuladas.

Su característica principal será un sistema de construcción modular basado en sondas reales que han existido, como Voyager, Dawn, Cassini, Juno y otras misiones de NASA y agencias espaciales.

El usuario podrá utilizar configuraciones históricas o crear sondas personalizadas combinando componentes de diferentes vehículos reales, siempre bajo restricciones de ingeniería verificables.

Posteriormente, podrá seleccionar un destino, calcular una trayectoria, evaluar la viabilidad de la misión y ejecutarla en un entorno tridimensional con posiciones astronómicas y modelos físicos fundamentados.

**La meta es reunir un constructor de sondas, un planificador astrodinámico, un simulador orbital y un centro de control de misiones dentro de una sola plataforma profesional.**

---

### 2. Exploración tridimensional del Sistema Solar

El simulador representará el Sol, los ocho planetas y sus satélites naturales compatibles, ampliando progresivamente el catálogo conforme existan datos adecuados.

El usuario podrá:

- Explorar libremente el Sistema Solar.
- Seleccionar planetas y lunas.
- Consultar posiciones astronómicas correspondientes a una fecha.
- Observar órbitas y movimientos relativos.
- Consultar distancias, velocidades y características de los cuerpos.
- Cambiar entre escalas y modos de visualización.
- Acercarse a objetos y seguir sus movimientos.
- Controlar el tiempo de la simulación.
- Seleccionar diferentes cámaras y perspectivas.
- Observar sondas reales o simuladas durante sus recorridos.

Las posiciones y trayectorias deberán utilizar datos confiables, principalmente NASA/JPL Horizons y kernels SPICE cuando corresponda.

La aplicación diferenciará claramente las posiciones científicas de los ajustes gráficos necesarios para facilitar su visualización.

### 3. Biblioteca histórica de sondas espaciales

Crearemos una biblioteca de diseños basada en sondas que realmente existieron.

Las primeras arquitecturas de referencia serán:

**Voyager 1 y 2:** sondas para misiones de sobrevuelo y exploración del espacio profundo, con antenas de alta ganancia, generadores RTG y sistemas de orientación.

**Dawn:** sonda con propulsión iónica, grandes paneles solares y capacidad de efectuar cambios orbitales durante largos períodos.

**Cassini:** orbitador de gran tamaño con propulsión química, generadores RTG y sistemas para operar alrededor de Saturno.

**Juno:** orbitador de Júpiter con paneles solares de gran superficie y una arquitectura adaptada a las condiciones del sistema joviano.

Posteriormente podremos incorporar Galileo, New Horizons, Europa Clipper, Parker Solar Probe y otras sondas de interés.

Cada diseño histórico deberá contar con su modelo 3D y una ficha de ingeniería que incluya las especificaciones reales disponibles.

Distinguiremos los datos históricos confirmados, las reconstrucciones aproximadas y los valores desconocidos.

### 4. Hangar de construcción modular de sondas

**Este será uno de los sistemas principales del simulador.**

El Hangar permitirá construir sondas mediante componentes procedentes de las arquitecturas históricas.

Tendrá dos modos:

**Modo histórico:** permitirá visualizar y estudiar una configuración que reproduzca una sonda real, con sus componentes, capacidades y limitaciones documentadas.

**Modo personalizado:** permitirá seleccionar una arquitectura base y reemplazar, añadir o combinar componentes procedentes de diferentes sondas.

Por ejemplo, será posible experimentar con una estructura basada en Cassini, un sistema de propulsión inspirado en Dawn, paneles solares derivados de Juno y sistemas de comunicación semejantes a los de Voyager.

Esta combinación no se considerará automáticamente viable. El simulador deberá evaluar las modificaciones necesarias y las restricciones físicas.

#### Componentes disponibles

La biblioteca modular comprenderá:

- Estructuras y cuerpos principales.
- Motores químicos.
- Motores iónicos y otros sistemas de propulsión eléctrica fundamentados.
- Depósitos de propelente.
- Propulsores de control de actitud.
- Paneles solares.
- Generadores termoeléctricos de radioisótopos (RTG).
- Baterías y sistemas eléctricos.
- Antenas y comunicaciones.
- Cámaras e instrumentos como carga útil.
- Computadoras y sistemas de control.
- Soportes, adaptadores, uniones y estructuras auxiliares.

Los componentes deberán utilizar modelos 3D gratuitos con licencias adecuadas. Siempre que sea posible, emplearemos modelos oficiales o reconstrucciones basadas en referencias técnicas.

Los modelos se normalizarán en dimensiones, orientación, escala y puntos de conexión para permitir su ensamblaje.

#### Validación científica del ensamblaje

Cada componente tendrá propiedades técnicas como:

- Masa y dimensiones.
- Potencia generada o consumida.
- Empuje e impulso específico, cuando aplique.
- Capacidad de almacenamiento.
- Requisitos de funcionamiento.
- Compatibilidad eléctrica y mecánica.
- Procedencia y referencias técnicas.

El Hangar deberá calcular la masa total, el centro de masas, los recursos disponibles y las capacidades generales de la sonda.

También identificará incompatibilidades, como motores sin suficiente potencia eléctrica, depósitos inadecuados o componentes que requieran adaptadores estructurales.

**El usuario tendrá libertad para experimentar, pero el simulador no permitirá presentar un ensamblaje arbitrario como una nave científicamente viable.**

Las variantes personalizadas serán diseños experimentales inspirados en tecnología real, no reconstrucciones históricas certificadas.

### 5. Sistema de ingeniería espacial

El simulador calculará el rendimiento de cada sonda a partir de su configuración.

Incluirá:

- Masa seca y masa de propelente.
- Presupuesto de delta-v.
- Empuje y aceleración.
- Consumo de propelente.
- Relación de masas.
- Propulsión impulsiva y de empuje finito.
- Potencia eléctrica disponible.
- Consumo de los subsistemas.
- Influencia de la distancia al Sol en la generación fotovoltaica.
- Capacidad energética durante la misión.
- Restricciones de funcionamiento de motores y componentes.

El sistema deberá explicar por qué una sonda es adecuada o inadecuada para una misión determinada.

Las estimaciones deberán declarar sus simplificaciones. No se afirmará que un diseño personalizado puede fabricarse o volar en una misión real sin validación de ingeniería más detallada.

### 6. Planificación científica de misiones

El usuario elegirá un origen, un destino y una fecha o intervalo para realizar una misión.

El planificador permitirá:

- Buscar oportunidades de lanzamiento.
- Calcular posiciones planetarias para fechas determinadas.
- Resolver transferencias interplanetarias.
- Consultar tiempos de vuelo.
- Calcular velocidades de salida y llegada.
- Estimar los requisitos de inyección.
- Evaluar encuentros planetarios.
- Calcular sobrevuelos.
- Diseñar maniobras de captura orbital.
- Planificar transferencias hacia satélites naturales.
- Considerar correcciones de trayectoria.
- Utilizar asistencias gravitacionales cuando estén implementadas y validadas.
- Comparar diferentes oportunidades y trayectorias.

La selección de una trayectoria no implicará automáticamente que la sonda pueda ejecutarla.

La aplicación deberá comprobar las capacidades del vehículo, sus recursos y las maniobras necesarias antes de declarar una misión viable.

### 7. Simulación de viajes interplanetarios

El usuario podrá ejecutar las misiones calculadas y observar el desplazamiento de su sonda por el Sistema Solar.

La simulación incluirá:

- Salida de la Tierra e inyección interplanetaria, mediante un modelo de lanzamiento o condiciones iniciales explícitas.
- Crucero heliocéntrico.
- Maniobras y correcciones de trayectoria.
- Efectos gravitacionales relevantes.
- Aproximaciones a planetas.
- Entrada en regiones de influencia gravitacional.
- Sobrevuelos y asistencias gravitacionales.
- Maniobras de inserción orbital.
- Navegación dentro de sistemas planetarios.
- Transferencias hacia lunas.
- Captura orbital alrededor del destino.

Cada fase deberá conectarse con la siguiente mediante estados físicos consistentes.

No utilizaremos teletransportaciones, saltos arbitrarios de velocidad ni trayectorias visuales que contradigan los cálculos.

Cuando una maniobra no pueda realizarse, la simulación mostrará el resultado físico previsto y la causa del fracaso.

### 8. Operaciones orbitales alrededor de planetas y lunas

**El objetivo final de las misiones será alcanzar una órbita determinada o completar un sobrevuelo, no aterrizar.**

El usuario podrá seleccionar parámetros orbitales y planificar maniobras para conseguir una órbita compatible con las capacidades de su sonda.

El sistema incluirá:

- Órbitas circulares y elípticas.
- Trayectorias hiperbólicas de aproximación y escape.
- Altitud de periapsis y apoapsis.
- Inclinación orbital.
- Período orbital.
- Maniobras de cambio de órbita.
- Ajustes de inclinación.
- Maniobras de mantenimiento cuando sean necesarias.
- Captura y escape gravitacional.
- Transferencias entre órbitas.
- Sobrevuelos de lunas.
- Evolución orbital bajo los modelos de perturbaciones implementados.

Estas operaciones estarán disponibles en los planetas y satélites para los que exista cobertura científica suficiente.

La simulación deberá permitir observar cómo las decisiones del usuario afectan la trayectoria y el combustible.

### 9. Centro de Misión unificado

El Centro de Misión será el espacio principal para ejecutar y supervisar las operaciones.

Integrará el Hangar, los cálculos de ingeniería, la planificación y la visualización tridimensional.

Permitirá:

- Iniciar una misión configurada.
- Observar la nave durante cada fase.
- Controlar la reproducción temporal.
- Pausar, acelerar y retroceder.
- Saltar entre eventos.
- Seleccionar diferentes cámaras.
- Seguir automáticamente la sonda.
- Consultar fecha y tiempo transcurrido.
- Visualizar distancias y velocidades.
- Consultar masa, propelente y energía.
- Observar maniobras y cambios orbitales.
- Revisar resultados y fallos.
- Comparar diferentes configuraciones de misión.

El visor tridimensional tendrá prioridad visual, mientras que la telemetría y los controles se organizarán en paneles accesibles y no invasivos.

### 10. Misiones históricas

Conservaremos y ampliaremos la capacidad de estudiar trayectorias históricas, especialmente Voyager 1 y Voyager 2.

El usuario podrá explorar acontecimientos, fechas, posiciones, distancias, sobrevuelos y perspectivas de las sondas.

Cuando existan fotografías oficiales, podrán compararse con la representación tridimensional correspondiente.

Los recorridos históricos deberán mantenerse separados de las misiones personalizadas y conservar su procedencia científica.

### 11. Diseño gráfico y experiencia visual

Buscamos una presentación comparable en ambición y calidad visual a NASA Eyes, sin reproducir literalmente su diseño.

El simulador tendrá:

- Modelos 3D detallados de sondas y componentes.
- Planetas y lunas con texturas de alta calidad.
- Iluminación espacial convincente.
- Atmósferas, nubes y anillos cuando corresponda.
- Fondos estelares.
- Órbitas y trayectorias diferenciadas.
- Efectos visuales de propulsión.
- Animaciones de componentes y maniobras.
- Transiciones cinematográficas de cámara.
- Encuadres automáticos.
- Seguimiento de sondas.
- Navegación intuitiva.
- Interfaces y paneles profesionales.
- Controles de tiempo consistentes.
- Información científica legible.

Las animaciones y los gráficos deberán estar vinculados a los estados de la simulación, sin sustituir el cálculo físico.

### 12. Optimización para todos los dispositivos compatibles

La estabilidad y el rendimiento serán requisitos fundamentales.

El simulador deberá funcionar en computadoras, laptops, tabletas y teléfonos móviles compatibles con las tecnologías web necesarias.

Implementaremos perfiles gráficos automáticos y configurables que adapten la carga de renderizado a las capacidades del dispositivo.

Se optimizarán:

- Resolución interna.
- Geometría y nivel de detalle.
- Texturas.
- Sombras e iluminación.
- Efectos gráficos.
- Memoria RAM y GPU.
- Carga diferida de modelos.
- Reutilización de recursos.
- Procesamiento de cálculos complejos.
- Navegación táctil.
- Diseño responsivo.

Como objetivos de rendimiento, buscaremos 60 FPS en equipos suficientemente potentes y entre 30 y 60 FPS en dispositivos móviles compatibles.

No podemos garantizar idéntico rendimiento visual en todos los equipos, pero sí diseñar una experiencia adaptable que preserve las funciones esenciales.

**La calidad científica de los cálculos será independiente de la calidad gráfica seleccionada.**

### 13. Validación científica y técnica

Antes de considerar terminada la aplicación, deberán completarse auditorías independientes y pruebas de:

- Integridad de efemérides.
- Conversión de escalas temporales.
- Marcos de referencia.
- Propagación orbital.
- Transferencias interplanetarias.
- Maniobras de propulsión.
- Presupuestos de masa, combustible y energía.
- Compatibilidad de componentes.
- Continuidad entre fases de misión.
- Resultados de sobrevuelos y capturas.
- Reproducción temporal.
- Rendimiento gráfico.
- Memoria y estabilidad.
- Navegación en escritorio y móvil.
- Compatibilidad entre navegadores.

Las conclusiones deberán basarse en pruebas verificables y no solamente en que una misión se vea correcta gráficamente.

### 14. Alcance excluido

No desarrollaremos como parte del producto final:

- Naves tripuladas.
- Estaciones espaciales.
- Rovers.
- Exploración de superficies.
- Recolección de muestras.
- Operaciones científicas sobre el terreno.
- Nuevos sistemas de entrada atmosférica o aterrizaje.
- Construcción libre de vehículos sin restricciones de ingeniería.

Los módulos experimentales de descenso ya existentes podrán conservarse sin continuar ampliándolos. No serán el propósito central del simulador.

---

## 15. Resultado final esperado

El resultado final será una aplicación web en la que el usuario pueda diseñar una sonda espacial utilizando componentes provenientes de vehículos históricos reales, configurar sus capacidades y utilizarla para desarrollar una misión científicamente fundamentada.

Por ejemplo, podrá seleccionar la arquitectura de Cassini, experimentar con un sistema de propulsión diferente, configurar depósitos y generación de energía, y comprobar las consecuencias de esas modificaciones.

Después podrá seleccionar Europa, una de las lunas de Júpiter, como destino.

El simulador buscará una oportunidad de lanzamiento, calculará una transferencia interplanetaria, determinará las maniobras necesarias para alcanzar Júpiter y planificará la trayectoria hacia Europa.

El usuario podrá analizar si su sonda dispone de los recursos suficientes para completar la misión y alcanzar la órbita seleccionada.

Durante la ejecución observará la nave en tres dimensiones, seguirá las maniobras, controlará el tiempo, cambiará de cámara y consultará la telemetría.

Si la misión resulta inviable, podrá regresar al Hangar, modificar el diseño y realizar nuevamente los cálculos.

**El propósito final es que construir una sonda, planificar una misión y comprobar sus resultados formen parte de una misma experiencia interactiva, coherente y científicamente fundamentada.**

El producto terminado deberá reunir cuatro características esenciales:

**Realismo científico:** modelos físicos documentados, datos astronómicos confiables y resultados verificables.

**Libertad de construcción:** combinaciones modulares de tecnologías históricas reales, sujetas a restricciones de ingeniería.

**Experiencia visual profesional:** exploración tridimensional inmersiva, cámaras cinematográficas, interfaces intuitivas y representaciones de alta calidad.

**Estabilidad y rendimiento:** funcionamiento optimizado y adaptable a distintas capacidades de hardware, sin comprometer la integridad científica.

**Nuestra meta definitiva es desarrollar un simulador web profesional de construcción de sondas y misiones orbitales, que permita experimentar con tecnología espacial real y explorar el Sistema Solar mediante misiones físicamente coherentes.**