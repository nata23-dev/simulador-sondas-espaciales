import { defineConfig } from 'vite';

// GitHub Pages sirve el proyecto bajo el nombre del repositorio; en local usa la raíz.
export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/simulador-sondas-espaciales/' : '/'
});
