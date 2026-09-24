import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      '@/src': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: true,
    css: false,
    // Heavy jsdom screens (the admin Knowledge screen, the lazy App smoke)
    // exceed the 5 s default when 80+ files run in parallel on a laptop.
    testTimeout: 15_000,
    // Two projects because the environments are incompatible: the app tests
    // need jsdom + the DOM shims in src/tests/setup.ts (which touches
    // `window` at load and would throw under node), while the Netlify
    // Function tests run against the Fetch `Request`/`Response` globals in a
    // plain node environment with no DOM setup file.
    projects: [
      {
        extends: true,
        test: {
          name: 'app',
          environment: 'jsdom',
          setupFiles: ['./src/tests/setup.ts'],
          // The admin dashboard is a second entry of this repo (admin/src/**);
          // its colocated tests were previously invisible to the runner.
          include: ['src/**/*.{test,spec}.{ts,tsx}', 'admin/src/**/*.{test,spec}.{ts,tsx}'],
        },
      },
      {
        extends: true,
        test: {
          name: 'functions',
          environment: 'node',
          include: ['netlify/functions/**/*.{test,spec}.ts'],
        },
      },
    ],
    coverage: {
      reporter: ['text', 'html'],
      include: [
        'src/lib/**/*.ts',
        'src/features/**/*.{ts,tsx}',
        'src/services/**/*.ts',
        'src/data/**/*.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
