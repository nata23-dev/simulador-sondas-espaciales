// Aquí configuro Vite para desarrollo local y publicación en GitHub Pages.
import { defineConfig } from 'vite';

// Cuando publico en GitHub Pages sirvo el proyecto bajo el nombre del repositorio; en local uso la raíz.
export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/simulador-sondas-espaciales/' : '/',
  build: {
    rolldownOptions: {
      output: {
        // Separo three.js en su propio paquete para que el navegador lo conserve en caché entre actualizaciones del simulador.
        codeSplitting: { groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }] }
      }
    }
  }
});
