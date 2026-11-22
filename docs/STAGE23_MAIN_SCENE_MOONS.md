# Etapa 23 · Satélites en la escena principal

Desde la 17.1, «3 · Reproducir» dibuja las misiones heliocéntricas del laboratorio en el Sistema Solar principal. Las que incluían un satélite (C1 y C2: Júpiter y Europa) quedaban en la escena local del Centro de Misión, porque la escena principal no tenía satélites en la época de la misión. Esta etapa dibuja **Ío, Europa, Ganímedes y Calisto** en la escena principal con **la misma ventana de Horizons que usó el cálculo**, así que el sobrevuelo de Europa de C1 se reproduce en el Sistema Solar.

Estado: implementada, con pruebas locales y revisión en Chrome con la GPU real. Auditoría de Claude, que también la implementó: [STAGE23_AUDIT_CLAUDE.md](STAGE23_AUDIT_CLAUDE.md). No cambia física, constantes, marcos, integrador ni datos. **Pendientes:** revisión visual por una persona y prueba con un lector de pantalla real.

## Qué se dibuja y con qué datos

- **Fuente:** la ventana `data/interplanetary/galilean-moons-jsb-2031-2032.json` que carga el planificador para C1/C2:
  - NASA/JPL Horizons, ICRF eclíptico J2000, TDB;
  - centro: **baricentro del sistema de Júpiter (5)**;
  - cobertura 2031-08-01 → 2032-06-01 TDB;
  - cadencia de 1 h (Europa), 2 h (Ío) y 6 h (Ganímedes y Calisto).
  La escena principal usa el objeto `data.moons` de la propia misión: no carga otro archivo ni otra época.
- **Interpolación:** la de la ventana (Hermite cúbico con posición y velocidad de los nudos). **Fuera de la cobertura los satélites no se dibujan**: no se extrapola. En C1 la nave sale en 2028, y los satélites aparecen en 2031-08-01, antes de entrar en la SOI de Júpiter (2031-09-30).
- **Colocación:** posición de Júpiter en la escena + desplazamiento del satélite respecto al baricentro, convertido a los ejes (x,y,z) → (x,z,−y) y a 32 unidades/AU. Es la misma colocación que usa la exploración (`MoonVisuals`).
  - Desde la 17.1, Júpiter se dibuja en el baricentro, como en el cálculo. Por eso la geometría nave–satélite es la del cálculo: la distancia en la escena coincide con el tramo calculado a 8·10⁻¹¹ en relativo ([auditoría](STAGE23_AUDIT_CLAUDE.md)).
  - El centro real de Júpiter está a 1–248 km del baricentro durante la ventana.
- **Tamaños:** radios 1:1 (la escena principal ya usa la escala científica durante la reproducción). La nave sigue ampliada, y más reducida en la fase del satélite (`NEAR_MOON_PROBE_SCALE = 0.03`, frente a 0,1 cerca del planeta y 1 en crucero):
  - sin enfocar mide unos 84 km de radio y no atraviesa la superficie dibujada en el sobrevuelo a 100 km;
  - enfocada (seguimiento exterior) mide unos 350 km, por encima del plano cercano de la cámara.
- **Baliza de la nave:** su tamaño mínimo sigue al factor de escala de la nave, para que no tape el satélite. Con el mínimo anterior, 0,004 unidades, la baliza medía 18 700 km, doce veces el radio de Europa.
- **Lunas de exploración:** las de 2026 (Luna, Titán, Tritón…) siguen ocultas durante la reproducción, como en 17.1, y vuelven al salir.

## Cámaras

- **Cámara de destino:** encuadra **Europa durante su fase** (tramo centrado en el satélite) y **Júpiter** en el resto. El cambio se hace al cambiar de fase y también al saltar en la línea de tiempo.
- **Vista general y seguimiento exterior:** sin cambios.
- **Satélite seleccionado que deja de dibujarse** (fuera de la ventana, o al soltar la escena): la cámara pasa a su planeta. Antes, la escena fallaba con «Cannot read properties of null (reading 'clone')»; el fallo también podía darse en exploración.
- **Ficha del satélite:** si la cámara selecciona un satélite durante la misión, la ficha usa el estado de la ventana de la misión en esa época, rotulado «Horizons · ventana de la misión, distancia al baricentro del sistema de Júpiter (5)», y no el de exploración de 2026.

## Corrección de la 17.1 encontrada en esta etapa

`prepare()` comprobaba la cobertura de **todos** los planetas en el proveedor de efemérides de la escena, que solo tiene centros de planetas. En las misiones a Júpiter, el destino del cálculo es el baricentro 5, que ese proveedor no tiene, así que nunca podían usar la escena principal. Ahora:
- el proveedor de la escena solo comprueba los planetas que se cargan de él;
- la Tierra y el destino se comprueban con la ventana del propio cálculo en los dos extremos de la misión, que ya se hacía con `planetStates()`.

Si esa ventana no llega al final, la escena principal no se usa, con el motivo «no se extrapola» (prueba).

## Interfaz

- **Pie de la escena** (`mainSceneFoot`): con satélites, «… época TDB de cada instante, sin extrapolar · satélites galileanos de Horizons solo en su ventana (2031-08-01 → 2032-06-01 TDB) · nave ampliada, orientada a la Tierra» (224 caracteres, cabe sobre la barra de reproducción). Sin satélites, el de 17.1.
- **Descripción de la cámara de destino:** «Desde las cercanías del planeta de destino (o del satélite durante su fase), mirando hacia la nave…».
- **Escena local:** se siguen reproduciendo en ella las misiones geocéntricas, los descensos y las de un satélite sin la ventana galileana del cálculo.

Código:
- [`src/integration/SolarSystemMissionView.js`](../src/integration/SolarSystemMissionView.js): `mainSceneSupport`, `moonSceneStates`, `MAIN_SCENE_MOONS`, `NEAR_MOON_PROBE_SCALE`, foco de la cámara de destino, `moonInfoState` y la comprobación de cobertura;
- `CameraController.encuadrarDestinoConSonda` y `SolarSystem.encuadrarDestinoConSonda` (aceptan un satélite visible);
- `SolarSystem.actualizarLunas` y `CameraController.alActualizarLuna` (satélite que deja de dibujarse);
- `SpaceProbeVisual` (baliza);
- `MissionControlCenter.mainSceneFoot`;
- `main.js` (ficha del satélite).

## Pruebas

[`tests/Stage23MainSceneMoons.test.mjs`](../tests/Stage23MainSceneMoons.test.mjs), 7 pruebas, con la misión C1 real (Cassini) calculada como en el planificador:

- **Qué misiones usan la escena principal.** C1 y A1 sí. No la usan: sin ventana de satélites, con una ventana centrada en otro punto, con un satélite no galileano ni con un descenso.
- **Estados.** En un nudo, el desplazamiento es la fila de Horizons a 32 u/AU. Con la fórmula de MoonVisuals, la posición en la escena es el baricentro más la fila, convertido. Fuera de la ventana y en A1 no hay satélites.
- **Reproducción.** En la salida de 2028, ningún satélite y la nave a tamaño de crucero. En la máxima aproximación:
  - los cuatro satélites visibles;
  - distancia nave–Europa en la escena igual a la del tramo (< 10⁻³ relativo);
  - factor de la nave del satélite;
  - cámara de destino sobre Europa.
  Después del sobrevuelo, la cámara vuelve a Júpiter. Con otra cámara activa, el cambio de fase no la mueve. Al soltar la escena, los satélites se ocultan.
- **Ficha del satélite** en la época de la misión; sin datos fuera de la ventana.
- **Cobertura con la ventana del cálculo:** el proveedor de la escena no tiene el baricentro 5, y C1 se prepara. Si la ventana no llega al final, no se usa: «no se extrapola».
- **A1** sin satélites, como en 17.1.
- **Pie** con la ventana, «sin extrapolar» y ≤ 240 caracteres.

Suite completa **394/394**; `npm run build` y la compilación de GitHub Pages correctas; `git diff --check` limpio.

## Verificación en el navegador

Chrome sin interfaz con la GPU real (AMD, Direct3D 11), [`scripts/verify-stage23-browser.mjs`](../scripts/verify-stage23-browser.mjs) ([registro](../evidence/stage23/verify-stage23-gpu.json), 5 capturas). El recorrido usa los controles del usuario: C1 → Calcular → «Reproducir en el Centro de Misión».

| Momento | Resultado |
| --- | --- |
| Crucero (día 500, 2030) | Escena principal; ningún satélite (fuera de la ventana) |
| Órbita de Júpiter (día 1110), cámara de destino | Cuatro satélites visibles; Europa a 672 495 km de Júpiter; cámara sobre Júpiter ([captura](../evidence/stage23/01_jupiter_satelites_camara_destino.png)) |
| Máxima aproximación (2032-02-17 09:42 UTC), cámara de destino | Cámara sobre Europa; **nave–Europa 1 661 km en la escena** (100 km de altitud, igual que el cálculo); cámara a 6 572 km de Europa ([captura](../evidence/stage23/02_europa_maxima_aproximacion_camara_destino.png)) |
| Máxima aproximación, seguimiento exterior | Cassini (modelo de NASA) sobre el limbo de Europa ([captura](../evidence/stage23/03_europa_seguimiento_exterior.png)) |
| Tras el sobrevuelo (día 1149,5) | La cámara de destino vuelve a Júpiter |
| Salto desde Europa encuadrada al día 500 | Satélites ocultos, cámara sobre Júpiter, **sin errores** (antes: «reading 'clone'») |
| 390 px | Sin desbordamiento horizontal ([captura](../evidence/stage23/04_movil_europa.png)) |
| Regresión A1 (llegada a Marte, cámara de destino) | Sin satélites; Marte y la nave como en 17.1, con la baliza más pequeña ([captura](../evidence/stage23/05_regresion_a1_llegada_marte.png)) |
| Volver al Sistema Solar | Exploración con sus 10 lunas; la misión deja de ocupar la escena |
| Errores y avisos de la página | Ninguno |

## Límites

- **Solo los satélites galileanos de la ventana 2031-08-01 → 2032-06-01**, y solo en misiones con satélite (C1/C2). Las demás misiones a Júpiter, o fuera de esa ventana, no los dibujan: no hay efemérides de satélites para su época. Titán, Tritón y los demás siguen sin datos para la época de las misiones.
- **Júpiter en el baricentro.** El centro real está a 1–248 km; la relación nave–satélite es la del cálculo.
- **Línea de la trayectoria en Float32.** A 5,2 AU, su resolución es de ≈ 71 km, comparable con la altitud del sobrevuelo (100 km): la línea puede rozar el disco de Europa. La nave y los satélites usan posiciones de doble precisión.
- **Nave ampliada.** Con el seguimiento exterior, el modelo enfocado mide ≈ 350 km de radio, y Europa 1 561 km.
- **Ficha del satélite.** Se actualiza al seleccionarlo, no en cada fotograma, y lleva su época. En la disposición del laboratorio queda detrás de los paneles.
- **Pendientes:** revisión visual por una persona y prueba con un lector de pantalla real. La etapa no añade controles nuevos; cambian los textos del pie y de la cámara de destino.
