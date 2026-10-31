/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: 'out' },
  resolve: { alias: { '@registry': path.resolve(__dirname, 'packages/rates-registry/src/index.ts') } },
  test: { include: ['tests/unit/**/*.test.ts'] },
} as never);
