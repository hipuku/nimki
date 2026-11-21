import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // The CLI is a thin wrapper over generate(), which the tests call directly.
      exclude: ['src/**/*.test.ts', 'src/cli.ts'],
      // Under 100 for statements and branches only: the rest are guards on states
      // the parser already refuses, such as a tween role turning into a spring.
      thresholds: { lines: 100, functions: 100, branches: 95, statements: 99 },
    },
  },
})
