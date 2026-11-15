import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repositoryRoot, '');
  return {
    envDir: repositoryRoot,
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api': env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3002'
      }
    }
  };
});
