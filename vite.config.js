import { defineConfig } from 'vite';

// GitHub Pages sirve el proyecto bajo el nombre del repositorio; en local usa la raíz.
export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/simulador-sondas-espaciales/' : '/',
  build: {
    rolldownOptions: {
      output: {
        // 18: three.js en su propio archivo. No cambia lo que se descarga al arrancar, pero ese archivo apenas cambia entre
        // publicaciones y el navegador lo conserva en caché cuando solo cambia el código del simulador.
        codeSplitting: { groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }] }
      }
    }
  }
});
