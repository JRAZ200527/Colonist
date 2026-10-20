import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Las pruebas usan el código fuente del motor directamente, sin compilarlo antes.
    alias: {
      '@colonist/motor-compartido': fileURLToPath(
        new URL('./packages/motor-compartido/src/index.ts', import.meta.url),
      ),
      '@colonist/bots': fileURLToPath(new URL('./packages/bots/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['packages/*/pruebas/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**'],
    },
  },
});
