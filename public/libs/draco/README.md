# Decodificador Draco (etapa 15.1)

`gltf/draco_decoder.js`, `gltf/draco_decoder.wasm` y `gltf/draco_wasm_wrapper.js` son copias literales de `node_modules/three/examples/jsm/libs/draco/gltf/` de **three 0.186.1**, la dependencia que ya tenía el proyecto. No se añadió ningún paquete. La prueba `tests/NasaProbeModels.test.mjs` comprueba que las tres copias siguen siendo idénticas a las de three.

- **Uso:** descomprimir la geometría `KHR_draco_mesh_compression` de los modelos 3D de NASA (Cassini, Dawn y Juno). `src/graphics/NasaProbeModels.js` la carga con `DRACOLoader.setDecoderPath(import.meta.env.BASE_URL + 'libs/draco/gltf/')`, de modo que funciona igual en desarrollo y en GitHub Pages (`/simulador-sondas-espaciales/`).
- **Licencias:** Draco es de Google, con licencia Apache 2.0 (https://github.com/google/draco). three.js tiene licencia MIT.
- **Nota de compilación:** `DRACOLoader` declara además sus rutas por omisión con `new URL(…, import.meta.url)`, así que Vite copia en `dist/assets/` otro juego de decodificadores (unos 1,3 MB) que la aplicación no solicita. Se mantiene la copia en `public/` porque esas rutas relativas no son fiables en desarrollo cuando Vite preempaqueta three.
