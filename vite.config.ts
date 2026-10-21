import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: true },
  build: { chunkSizeWarningLimit: 2000 }, // Phaser alone is ~1.4 MB
  test: { include: ['tests/**/*.test.ts'] },
});
