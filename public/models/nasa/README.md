# Modelos 3D oficiales de NASA (etapa 15.1)

Modelos de presentación de la flota del laboratorio: Voyager, Cassini, Dawn y Juno. Los archivos se sirven **sin modificar**: ni reexportados, ni recomprimidos, ni reescalados. Ningún cálculo usa la malla. Masas, potencia, propulsión y centro de masas salen de `src/lab/HeritageCatalog.js`.

**Origen:** [NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources). Su README dice: «These assets are free and without copyright». Se aplican las [pautas de uso de imágenes y medios de NASA](https://www.nasa.gov/nasa-brand-center/images-and-media). El uso de estos recursos no implica respaldo de NASA. Descarga: 19-11-2026.

| Sonda | Archivo servido | Origen (ruta en el repositorio) | Commit | Bytes | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| Cassini-Huygens | `models/nasa/cassini/Cassini-Huygens-A.glb` | `3D Models/Cassini-Huygens (A)/Cassini-Huygens (A).glb` | `828fd0fb0bf18605c37aa0972cb898881b33d6c2` | 1660492 | `f8bc110e23821021e99b88634843449cc8e98d86d0d8561c612c1cf0404e64e7` |
| Dawn | `models/nasa/dawn/Dawn.glb` | `3D Models/Dawn/Dawn.glb` | `02cdb6ecf6eeceb419a82a9ebfc19e27df5a60df` | 927020 | `411249aed791994b6a2014894ad6bd7ca0445dbcf6d5342af9edc5df988f04b7` |
| Juno | `models/nasa/juno/Juno-A.glb` | `3D Models/Juno (A)/Juno (A).glb` | `27a613152c4ef68d1ca4d04cb92e48fc85f8bd19` | 8999028 | `13f6bd48ff830a1890b21ef6e0182bb1043926feebb77af9733e7374b050367a` |
| Voyager | `models/voyager/Voyager.glb` (anterior a esta etapa) | [science.nasa.gov/resource/voyager-3d-model](https://science.nasa.gov/resource/voyager-3d-model/) | — | 3128204 | `5338241f2e89e9cfe3ebb82f519b4cad64c97e66883cccba6fdda98667aec731` |

## Criterios de selección

- **Cassini:** variante (A), con texturas y la sonda Huygens acoplada. Se descartaron «Cassini Assembly» (sin texturas) y la variante (B), que tiene 306 materiales y otra escala.
- **Juno:** variante (A), con texturas. Pesa 9 MB y solo se descarga al elegir Juno. Se descartó la variante (B): no tiene texturas y su escala no es métrica (unos 23 m frente a unos 18,5 m).
- **Voyager:** se reutiliza el GLB que ya usa el modo histórico. No se descargó otra versión ni se modificó el archivo.

## Medidas comprobadas

Comprobaciones en `tests/NasaProbeModels.test.mjs`, aplicando las transformaciones de los nodos:

- **Dawn:** envergadura de 19,70 m, igual que la documentada.
- **Cassini:** antena de alta ganancia de 4,01 m (4 m documentados).
- **Juno:** antena de 2,38 m. El catálogo no tiene un diámetro contrastado, así que solo se comprueba que la escala es métrica.
- **Voyager:** extensión máxima de 16,9 m, con la pértiga de 13 m.

En los cuatro modelos el eje +Y es el de la antena de alta ganancia. Esa es la convención con la que el Centro de Misión orienta la nave.

## Detalles técnicos

- **Compresión:** Cassini, Dawn y Juno exigen `KHR_draco_mesh_compression` e incluyen texturas WebP con alternativa PNG (`EXT_texture_webp`). Desde la etapa 18 el decodificador Draco es el que incluye `three@0.186.1` (`examples/jsm/libs/draco/gltf/`, Draco de Google, licencia Apache 2.0), referenciado con `DRACO_GLTF_CONFIG`; Vite lo publica una sola vez en `assets/`. La copia que había en `public/libs/draco/` (idéntica) se retiró. No se añadió ninguna dependencia.
- **Cubo auxiliar:** Cassini y Dawn traen un cubo de exportación de Blender de 1 m (nodo `_root`, sin material). Es el padre de toda la nave, así que se oculta su material y no el nodo, igual que se hacía ya con `Voyager.glb`.
- **Respaldo:** si un modelo no se puede descargar, el Hangar y el Centro de Misión muestran la reconstrucción procedimental de la etapa 15 y lo indican.
