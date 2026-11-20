import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      // The engine is plain functions, so every line is reachable from a test.
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
})
