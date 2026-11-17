import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // トップ（アプリ一覧）と「アプリを作る」の2ページ
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        create: resolve(import.meta.dirname, 'create/index.html'),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
