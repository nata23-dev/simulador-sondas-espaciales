# Simulador de Sondas Espaciales

Simulador interactivo del sistema solar desarrollado con Three.js y Vite. Permite consultar las posiciones planetarias por fecha, seleccionar un planeta y viajar hasta él con la cámara.

## Ponerlo en marcha

Necesitas Node.js y npm. En la raíz del proyecto:

```bash
npm install
npm run dev
```

Abre la dirección local que muestre Vite. Para generar la versión de producción y ejecutar las pruebas:

```bash
npm run build
node --test tests/*.test.mjs
```

## Datos y representación

Las efemérides locales están en `public/data/efemerides-2026.json`. Las posiciones en la escena conservan sus proporciones heliocéntricas; los tamaños visibles de los cuerpos se amplían para facilitar la exploración. Las órbitas dibujadas y algunos efectos de presentación son ilustrativos. La metodología gráfica se describe en [`src/graphics/README.md`](src/graphics/README.md).

Las texturas y sus créditos se documentan en [`public/textures/README.md`](public/textures/README.md).
