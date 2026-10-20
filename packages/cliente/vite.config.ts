import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Usa el código fuente del motor para tener recarga en caliente sin compilarlo.
    alias: {
      '@colonist/motor-compartido': fileURLToPath(new URL('../motor-compartido/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
});
