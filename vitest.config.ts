import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    setupFiles: './vitest-setup.ts',
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', '**/e2e/**'],
    coverage: {
      provider: 'v8',
    },
    environmentMatchGlobs: [
      ['tests/**/*.test.tsx', 'jsdom'],
      ['tests/**/*.test.ts', 'node'],
    ],
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
});
