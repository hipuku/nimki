import tailwindcss from '@tailwindcss/vite'
import type { StorybookConfig } from '@storybook/react-vite'

// Stories sit beside each component in registry/ui (PRD repository layout);
// the foundations stories that exercise the tokens on their own live here.
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.tsx', '../../../registry/ui/**/*.stories.tsx'],
  framework: '@storybook/react-vite',
  addons: ['@storybook/addon-a11y', '@storybook/addon-vitest'],
  core: { disableTelemetry: true },
  viteFinal: config => ({ ...config, plugins: [...(config.plugins ?? []), tailwindcss()] }),
}

export default config
