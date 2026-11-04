# Etapa 04 — cinco lunas en Exploración general

Fecha de entrega: 1 de noviembre de 2026. La Etapa 03.1 permanece aprobada. Esta etapa añade exclusivamente Luna, Europa, Titán, Titania y Tritón a la exploración planetaria general. No cambia los vectores, velocidades ni cámaras históricas Voyager. La discrepancia SPK Voyager documentada en Etapa 02.3 permanece pendiente.

## Datos y método

Los identificadores NAIF, centros y radios medios proceden de [JPL SSD: parámetros físicos de satélites](https://ssd.jpl.nasa.gov/sats/phys_par/) y el [manual de Horizons](https://ssd.jpl.nasa.gov/horizons/manual.html). Las posiciones y velocidades provienen de consultas **directas luna–centro planetario** a [NASA/JPL Horizons](https://ssd.jpl.nasa.gov/horizons/). El catálogo `public/data/moons-2026-10.json` conserva por cuerpo el URL, los parámetros, los encabezados de identidad y centro, el SHA-256 y la ruta de la respuesta original JSON en `evidence/stage4/Horizons-original/`.

| Luna | NAIF | Centro | Radio medio (km) | Distancia centro–centro en cobertura (km) | Solución indicada por Horizons |
|---|---:|---:|---:|---:|---|
| Luna | 301 | Tierra 399 | 1737,4 | 364 406,9–404 642,7 | DE441 |
| Europa | 502 | Júpiter 599 | 1560,8 | 664 843,7–677 293,8 | jup365_merged |
| Titán | 606 | Saturno 699 | 2574,76 | 1 186 751,5–1 256 976,2 | sat441l |
| Titania | 703 | Urano 799 | 788,9 | 435 169,2–437 383,4 | ura184_merged |
| Tritón | 801 | Neptuno 899 | 1352,6 | 354 713,9–354 803,8 | nep098_merged |

Los parámetros son `EPHEM_TYPE=VECTORS`, `CENTER=500@399/599/699/799/899` según el cuerpo, `REF_SYSTEM=ICRF`, `REF_PLANE=ECLIPTIC`, `TIME_TYPE=TDB`, `OUT_UNITS=KM-S`, `VEC_CORR=NONE`. Se solicitó **2026-10-01 00:00 TDB a 2026-11-01 00:00 TDB**, cada hora: 745 estados por luna. La interfaz de fechas usa etiquetas de medianoche TDB; los textos ISO solo localizan el registro diario, no se tratan como una conversión UTC→TDB. Las posiciones intermedias usan Hermite cúbica con posición y velocidad de los nodos horarios; fuera de ese intervalo no se extrapola ni se muestra la luna. Si falla la validación de una serie, las otras cuatro permanecen disponibles.

La geometría local se suma al **centro planetario visual existente**, tras convertir kilómetros a unidades de escena y transformar ejes `(x,y,z) → (x,z,−y)` como los planetas. La distancia informada se calcula directamente de la norma del vector luna–centro planetario, sin restar dos vectores heliocéntricos separados. El modo de escala no cambia esa distancia. En escala exploratoria, al seleccionar una luna su planeta central se presenta temporalmente con radio físico 1:1 para que la malla ilustrativa del planeta no envuelva artificialmente la órbita lunar. El resto de la escala exploratoria conserva su comportamiento previo.

## Comparación independiente y tolerancias

Se retuvo una consulta Horizons **fuera de la malla** en 2026-10-15 03:30 TDB para cada luna. En esa muestra, los residuos de interpolación fueron:

| Luna | Posición (km) | Velocidad (km/s) |
|---|---:|---:|
| Luna | 0,000041 | 1,089×10⁻⁸ |
| Europa | 0,054852 | 3,934×10⁻⁷ |
| Titán | 0,000367 | 6,442×10⁻⁸ |
| Titania | 0,000943 | 4,233×10⁻⁸ |
| Tritón | 0,003642 | 5,816×10⁻⁸ |

Las pruebas exigen menos de **0,1 km y 10⁻⁶ km/s** para estas cinco muestras retenidas. Europa determinó la cadencia horaria: una prueba preliminar a seis horas dio un residuo de ~70,9 km. El resultado de una sola fecha no demuestra que 0,1 km sea la cota máxima en todos los intervalos; queda documentado como límite de la validación externa realizada.

En 2026-10-10 00:00 TDB se hicieron además consultas heliocéntricas separadas para cada luna y su planeta central. La resta de esos vectores coincide con el vector relativo directo y con la colocación absoluta construida sobre los planetas locales en los cinco casos, con residuo máximo inferior a **10⁻⁶ km** por redondeo numérico. Los parámetros, respuestas y residuos están en `absolute-frame-audit.json`; esas consultas son una cadena independiente de la consulta relativa, pero proceden del mismo servicio Horizons. No se descargaron kernels lunares NAIF para una comparación de solución externa ni se afirma una precisión orbital global basada en esta muestra.

## Visualización y navegación

Las cinco mallas usan radios físicos en unidades de escena y un material neutro, sin mapas superficiales no verificados. El sombreado representa fase según la dirección al Sol en el origen de la escena, con brillo normalizado para poder distinguir las lunas exteriores. Es **una representación visual simplificada**: no reproduce albedo, irradiancia absoluta, eclipses, sombras de anillos, orientación de superficie CK/IAU ni textura cartográfica. La esfera no gira con orientación cartográfica documentada.

Las lunas aparecen agrupadas bajo su planeta en el selector existente y en la búsqueda del explorador. Se pueden seleccionar mediante clic en la esfera o mediante el selector; se reutilizan la cámara exterior, OrbitControls, el botón Explorar y la vista general. La ficha muestra planeta, NAIF, radio documentado, distancia calculada, estado exacto/interpolado y fuentes. Se puede volver al planeta principal o a la vista general. En móvil, cerrar el panel permite observar el disco completo tras adaptar la distancia de cámara al ancho disponible. No se añadieron sobrevuelos históricos de lunas.

## Verificación

- `tests-full.txt`: 99/99 pruebas automatizadas aprobadas. Incluye 5 pruebas nuevas para identidad/centro/SHAs, muestra retenida, continuidad y límites temporales, aislamiento de una serie inválida y cierre heliocéntrico.
- `browser-stage4.txt` y `Despues/manifest.json`: 32 comprobaciones en Chrome, 5 capturas auténticas de escritorio y móvil, 0 errores JavaScript/HTTP. Incluyen cinco selecciones y focos, clic directo, órbita de cámara, retorno al planeta y vista general, cambio de fecha, cambio de escala, panel móvil y escena despejada.
- `browser-regression-stage3-1.txt`: 21 comprobaciones, 0 errores; recorrido histórico, cámara desde Voyager, comparador y navegación previa. Sus capturas se guardaron fuera del ZIP para no duplicar evidencias aprobadas.
- `historical-preservation.txt`: 68 archivos de datos y código histórico idénticos por SHA-256 frente al ZIP aprobado de Etapa 03.1.
- `build.txt`: Vite compiló 77 módulos. Persiste el aviso previo del bloque JavaScript superior a 500 kB.
- `zip-validation.txt`: rutas POSIX, CRC, extracciones con Python, `unzip` y Windows .NET, hashes SHA-256; instalación, pruebas y compilación desde una copia extraída. El equipo no dispone de Linux/WSL, por lo que la extracción Linux nativa permanece sin ejecutar.

**Pendientes científicos:** validación externa de error de interpolación a más fechas y con kernels NAIF independientes; orientación CK/IAU, cartografía y fotometría física de las cinco lunas. No se resuelve ni modifica la discrepancia Voyager/SPK. No se hizo commit, push ni despliegue.
