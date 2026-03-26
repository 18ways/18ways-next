import { defineConfig, defineProject } from 'vitest/config';
import react from '@vitejs/plugin-react';

const resolve = {
  dedupe: ['react', 'react-dom'],
};

const coverage = {
  provider: 'v8' as const,
};

const sharedTestConfig = {
  exclude: ['node_modules/**', '**/e2e/**'],
  coverage,
};

export default defineConfig({
  plugins: [react()],
  resolve,
  test: {
    ...sharedTestConfig,
    projects: [
      defineProject({
        resolve,
        test: {
          ...sharedTestConfig,
          name: 'node',
          environment: 'node',
          globals: true,
          include: ['tests/**/*.test.ts'],
          exclude: ['tests/driver-listeners.test.ts'],
          setupFiles: ['./vitest-setup.ts'],
        },
      }),
      defineProject({
        resolve,
        test: {
          ...sharedTestConfig,
          name: 'jsdom',
          environment: 'jsdom',
          globals: true,
          include: ['tests/**/*.test.tsx', 'tests/driver-listeners.test.ts'],
          setupFiles: ['./vitest-setup.ts'],
        },
      }),
    ],
  },
});
