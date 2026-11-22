import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['lib/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // The logic the pages run on. Components are checked in a browser by
      // check:pages, which coverage here cannot see.
      include: ['lib/**/*.ts'],
      exclude: ['lib/**/*.test.ts', 'lib/source.ts'],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
})
