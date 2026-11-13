import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// 公開時のパス（/部署コード/アプリ名/）はビルド時に自動で指定されるので、ここでは設定しない
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
  },
});
