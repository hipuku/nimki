import type { Decorator, Preview } from '@storybook/react-vite'
import '../src/styles.css'

/**
 * The four switches every story runs under, as in the docs site (PRD FR-D1):
 * colour mode on shadcn's .dark class, the motion theme on data-motion,
 * density on data-density, and forced reduced motion on data-motion-reduce.
 */
const withTheme: Decorator = (Story, { globals }) => (
  <div
    className={globals.mode === 'dark' ? 'dark' : undefined}
    data-motion={globals.motion as string}
    data-density={globals.density as string}
    data-motion-reduce={globals.reduced === 'on' ? '' : undefined}
    style={{ background: 'var(--background)', color: 'var(--foreground)', padding: '1.5rem' }}
  >
    <Story />
  </div>
)

const preview: Preview = {
  decorators: [withTheme],
  initialGlobals: { mode: 'light', motion: 'subtle', density: 'comfortable', reduced: 'off' },
  globalTypes: {
    mode: { description: 'Colour mode', toolbar: { title: 'Mode', items: ['light', 'dark'] } },
    motion: {
      description: 'Motion theme',
      toolbar: { title: 'Motion', items: ['subtle', 'expressive'] },
    },
    density: {
      description: 'Density',
      toolbar: { title: 'Density', items: ['comfortable', 'compact'] },
    },
    reduced: {
      description: 'Force reduced motion',
      toolbar: { title: 'Reduced motion', items: ['off', 'on'] },
    },
  },
  // An axe violation fails the story's test, not only the panel (PRD NFR-1).
  // Base UI's focus guards are the one exclusion: while a list or dialog is
  // open it places two hidden, focusable spans around it so Tab stays inside,
  // which axe reads as focusable content inside aria-hidden. Radix does the same.
  parameters: { a11y: { test: 'error', context: { exclude: ['[data-base-ui-focus-guard]'] } } },
}

export default preview
