import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 開発時: `npm run dev:worker` (Worker :8787) と `npm run dev` (Vite) を並行起動する。
// /api は Worker へプロキシされる。
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:8787' },
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
});
