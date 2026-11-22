import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

// Every story runs as a test in a real browser: it renders, its play function
// runs, and axe checks it (PRD NFR-1, NFR-2, NFR-20), in Chromium, Firefox and
// WebKit (NFR-12).
export default defineConfig({
  plugins: [storybookTest({ configDir: '.storybook' })],
  test: {
    name: 'storybook',
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }, { browser: 'firefox' }, { browser: 'webkit' }],
    },
    // Istanbul coverage, which instruments the code and so works in every
    // browser (V8's reads Chromium only), over the components in registry/ui and
    // the motion-timing helpers the play functions call. The floors sit just
    // under where they stand, so a change that drops coverage fails.
    coverage: {
      provider: 'istanbul',
      // The components live in registry/, outside this app.
      allowExternal: true,
      include: ['src/**/*.ts', '../../registry/ui/**/*.tsx'],
      exclude: ['../../registry/ui/**/*.stories.tsx'],
      thresholds: { lines: 98, functions: 100, branches: 90, statements: 97 },
    },
  },
})
