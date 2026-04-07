import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: [
      'app/**/*.test.ts',
      'src/**/*.test.ts',
      'functions/**/*.test.ts',
      'packages/connectors/**/*.test.ts',
      'packages/utils/**/*.test.ts',
      'packages/types/**/*.test.ts',
    ],
  },
});
