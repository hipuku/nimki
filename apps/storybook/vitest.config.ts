import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

// Every story runs as a test in a real browser: it renders, its play function
// runs, and axe checks it (PRD NFR-1, NFR-2, NFR-20). Chromium here; Firefox and
// WebKit join once components exist (NFR-12).
export default defineConfig({
  plugins: [storybookTest({ configDir: '.storybook' })],
  test: {
    name: 'storybook',
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
    // V8 coverage read from Chromium, over the motion-timing helpers the stories'
    // play functions call. The floors are where they stand today; the paths not
    // yet taken (a spring role, a missing transition) are exercised once a
    // component uses them, and the floors rise with it.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      thresholds: { lines: 90, functions: 100, branches: 70, statements: 85 },
    },
  },
})
