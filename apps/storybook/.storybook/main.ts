import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import type { StorybookConfig } from '@storybook/react-vite'
import type { Alias, AliasOptions } from 'vite'

// Registry components import shadcn's cn helper as '@/lib/utils', which the
// shadcn CLI rewrites to the project's own on install.
const utils = fileURLToPath(new URL('../../../registry/lib/utils.ts', import.meta.url))

// Stories sit beside each component in registry/ui (PRD repository layout);
// the foundations stories that exercise the tokens on their own live here.
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.tsx', '../../../registry/ui/**/*.stories.tsx'],
  framework: '@storybook/react-vite',
  addons: ['@storybook/addon-a11y', '@storybook/addon-vitest'],
  core: { disableTelemetry: true },
  viteFinal: config => {
    // Vite takes aliases as an object or a list; keep Storybook's in list form.
    const existing: AliasOptions = config.resolve?.alias ?? []
    const aliases: Alias[] = Array.isArray(existing)
      ? (existing as Alias[])
      : Object.entries(existing as Record<string, string>).map(([find, replacement]) => ({
          find,
          replacement,
        }))
    return {
      ...config,
      plugins: [...(config.plugins ?? []), tailwindcss()],
      resolve: {
        ...config.resolve,
        alias: [...aliases, { find: '@/lib/utils', replacement: utils }],
      },
    }
  },
}

export default config
