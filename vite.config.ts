import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // 依存が react / react-dom だけなので分割は不要。1ファイルのほうが初期表示が速い。
    target: 'es2020',

    // トップページとSEO用ページをそれぞれHTMLとしてビルドする
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        howTo: resolve(__dirname, 'how-to/index.html'),
      },
    },
  },
  test: {
    // 計算ロジックは DOM に依存しない純粋関数のみをテストするため node 環境で十分。
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});