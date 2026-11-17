import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // トップ（アプリ一覧）、「アプリを作る」、管理画面の3ページ
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        create: resolve(import.meta.dirname, 'create/index.html'),
        // 管理画面（管理者ロールだけが開ける。プログラムも assets/admin-*.js として管理者だけに配信）
        admin: resolve(import.meta.dirname, 'admin/index.html'),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
