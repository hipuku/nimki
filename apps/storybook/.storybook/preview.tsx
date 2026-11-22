import type { Decorator, Preview } from '@storybook/react-vite'
import { useLayoutEffect, type ReactNode } from 'react'
import '../src/styles.css'

interface Theme {
  mode: string
  motion: string
  density: string
  reduced: string
}

/**
 * Sets the switches on <html>, where the docs site and a project set them, so
 * parts that render in a portal on <body> (a Select's list, a dialog) follow
 * them too. Before paint, so a story never shows a frame in the wrong theme.
 */
function OnRoot({ theme, children }: { theme: Theme; children: ReactNode }) {
  useLayoutEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme.mode === 'dark')
    root.style.colorScheme = theme.mode === 'dark' ? 'dark' : 'light'
    root.dataset.motion = theme.motion
    root.dataset.density = theme.density
    if (theme.reduced === 'on') root.dataset.motionReduce = ''
    else delete root.dataset.motionReduce
  }, [theme.mode, theme.motion, theme.density, theme.reduced])
  return children
}

/**
 * The four switches every story runs under, as in the docs site (PRD FR-D1):
 * colour mode on shadcn's .dark class, the motion theme on data-motion,
 * density on data-density, and forced reduced motion on data-motion-reduce.
 */
const withTheme: Decorator = (Story, { globals }) => (
  <OnRoot theme={globals as unknown as Theme}>
    <div style={{ padding: '1.5rem' }}>
      <Story />
    </div>
  </OnRoot>
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
