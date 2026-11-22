# Auditoría de la etapa 23 · Satélites en la escena principal

- **Auditor:** Claude (Opus 5.5). **Claude también implementó la etapa.** Por eso la auditoría usa métodos distintos de los de la implementación:
  - interpolación de Hermite propia sobre las filas crudas de Horizons;
  - matriz de rotación explícita;
  - comparación con el centro de Júpiter (599) de otro conjunto de efemérides;
  - barrido de la distancia nave–Europa a lo largo del sobrevuelo;
  - revisión adversaria del código de cámara (satélite que desaparece estando seleccionado);
  - recorrido en Chrome con la GPU.
- **Fecha:** 21-11-2026.
- **Alcance:** presentación de datos existentes (la ventana galileana de Horizons que ya usa el cálculo de C1/C2) en la escena principal. No cambia física, constantes, marcos, integrador ni datos, así que el criterio de [CLAUDE.md](../CLAUDE.md) no exige revisión independiente.
- **Veredicto:** **aprobada con observaciones.**

## Comprobaciones

| # | Método | Resultado |
| --- | --- | --- |
| 1 | Hermite cúbico propio sobre las filas crudas, 500 instantes aleatorios por satélite, frente a `moonSceneStates` | Diferencia máxima 1,2·10⁻¹⁰ km (Ío), 1,3·10⁻¹⁰ (Europa), 2,4·10⁻¹⁰ (Ganímedes) y 3,3·10⁻¹⁰ (Calisto) |
| 2 | Matriz (x,y,z) → (x,z,−y) a 32 u/AU escrita aparte, frente a la colocación de MoonVisuals | Diferencia 0; módulo del desplazamiento 676 653,651 km en ambos |
| 3 | Centro de Júpiter (599, catálogo interplanetario) frente al baricentro (5, catálogo de encuentros) durante la ventana | 1,4–247,9 km, frente a un radio de Júpiter de 71 492 km. Los satélites van referidos al baricentro, igual que el cálculo |
| 4 | Distancia nave–Europa en la escena frente al radio del tramo calculado, en 201 instantes del sobrevuelo | Máximo 0,0000 km (7,9·10⁻¹¹ relativo); mínima 1 660,80 km, es decir, 100,00 km de altitud |
| 5 | Resolución Float32 de la línea de trayectoria a 166 u (5,2 AU) | Paso de 1,53·10⁻⁵ u ≈ 71 km (observación O-2) |
| 6 | Otros escenarios con satélite: C2 (Cassini) y C1 (Juno) | Ambos con contextos helio, planeta y satélite, y aceptados por la escena principal |
| 7 | Coste de `moonSceneStates` (4 satélites) | 2,2 µs por llamada |
| 8 | Pruebas de la etapa (7) y suite completa | 394/394 |
| 9 | Chrome con GPU (C1 completa, salto fuera de la ventana, 390 px, regresión A1, salida a exploración) | Ver [STAGE23_MAIN_SCENE_MOONS.md](STAGE23_MAIN_SCENE_MOONS.md#verificación-en-el-navegador). Sin errores ni avisos tras las correcciones |

## Defectos (todos corregidos)

- **D-01 · Defecto latente de la 17.1: las misiones a Júpiter no podían usar la escena principal.** `prepare()` buscaba la cobertura del baricentro 5 en el proveedor de la escena, que solo tiene centros de planetas. Ahora:
  - solo comprueba en ese proveedor los planetas que se cargan de él;
  - la Tierra y el destino se comprueban con la ventana del cálculo, que ya se consultaba en los extremos.

  Prueba: el proveedor de la escena no tiene el 5, C1 se prepara, y una ventana recortada se rechaza con «no se extrapola».
- **D-02 · Fallo al ocultarse el satélite seleccionado.** Apareció en Chrome como «Cannot read properties of null (reading 'clone')» al soltar la escena con Europa encuadrada. `alActualizarLuna` usaba el centro de un satélite ya oculto, y `alCambiarTamano` habría fallado igual. El defecto ya existía y también podía darse en exploración cuando el satélite seleccionado salía de la cobertura. Ahora:
  - si el satélite seleccionado deja de dibujarse, la cámara pasa a su planeta;
  - `alActualizarLuna` tiene una protección.

  Verificado en Chrome con un salto desde Europa encuadrada hasta 2030.
- **D-03 · Ficha del satélite con datos de otra época.** Al encuadrar Europa en 2032, la ficha se rellenaba con el estado de exploración de 2026. Ahora usa el de la ventana de la misión en ese instante, con su rótulo, o nada fuera de la ventana.
- **D-04 · Baliza mayor que el satélite.** El mínimo fijo de 0,004 u (18 700 km) habría cubierto Europa doce veces. El mínimo sigue ahora al factor de escala de la nave. Cerca de Marte (17.1, factor 0,1) baja a 0,0004 u. La captura de regresión de A1 no muestra problemas.

## Observaciones

- **O-1 · Júpiter en el baricentro.** Decisión de la 17.1, coherente con el cálculo. El centro real está a ≤ 248 km. La geometría nave–satélite es exacta; la distancia satélite–esfera de Júpiter difiere hasta en esa cantidad.
- **O-2 · Línea de trayectoria en Float32.** Con ≈ 71 km de resolución a 5,2 AU, la línea puede rozar el disco de Europa en el sobrevuelo a 100 km, aunque la nave no lo haga. Una línea referida al destino lo evitaría (fuera de alcance).
- **O-3 · Nave ampliada en el seguimiento exterior:** ≈ 350 km de radio, frente a 1 561 km de Europa. Declarado en el pie («nave ampliada»).
- **O-4 · Solo satélites galileanos y solo en 2031-08-01 → 2032-06-01.** Otras misiones o épocas no tienen efemérides de satélites, y no se inventan.
- **O-5 · Pendiente:** revisión visual por una persona y prueba con lector de pantalla. Solo cambian textos (pie y descripción de la cámara de destino).
