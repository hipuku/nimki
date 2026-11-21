import { DURATION_CAPS_MS, MOTION_TOKENS, type MotionMode, type MotionRole } from '@hipuku/nimki'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, waitFor } from 'storybook/test'
import { roleTimingProblems } from '../motion'

const roles = Object.keys(DURATION_CAPS_MS) as MotionRole[]

/**
 * One box per motion role, each fading on the role's own duration and easing.
 * Its play function starts every transition and compares what the browser
 * runs with the generated tokens, so the motion tests are proven before any
 * component uses them.
 */
function RoleSpecimen({ mode }: { mode: MotionMode }) {
  const [on, setOn] = useState(false)
  const attrs = mode === 'reduced' ? { 'data-motion-reduce': '' } : { 'data-motion': mode }
  return (
    <div {...attrs}>
      <button
        type="button"
        onClick={() => setOn(value => !value)}
        className="mb-4 rounded-md border border-input px-3 py-1.5 text-sm"
      >
        Play
      </button>
      <ul className="grid grid-cols-2 gap-3 text-sm">
        {roles.map(role => (
          <li key={role} className="flex items-center gap-3">
            <span
              data-role={role}
              aria-hidden="true"
              className="size-6 rounded-md bg-foreground"
              style={{
                opacity: on ? 0.2 : 1,
                transition: `opacity var(--nk-${role}-duration) var(--nk-${role}-easing)`,
              }}
            />
            <code>{role}</code>
          </li>
        ))}
      </ul>
    </div>
  )
}

const meta = {
  title: 'Foundations/Motion',
  component: RoleSpecimen,
  args: { mode: 'subtle' },
} satisfies Meta<typeof RoleSpecimen>

export default meta
type Story = StoryObj<typeof meta>

const checkEveryRole: Story['play'] = async ({ canvas, canvasElement, args, userEvent }) => {
  const box = (role: MotionRole) => canvasElement.querySelector(`[data-role="${role}"]`) as Element
  await userEvent.click(canvas.getByRole('button', { name: 'Play' }))
  // Wait until every transition that should run is running, then check once,
  // while they are still running, so a failure names the real difference.
  await waitFor(() => {
    const started = roles.every(
      role =>
        MOTION_TOKENS[args.mode][role].durationMs === 0 || box(role).getAnimations().length > 0,
    )
    if (!started) throw new Error('Not every transition has started yet')
  })
  const problems = roles.flatMap(role => roleTimingProblems(box(role), 'opacity', role, args.mode))
  await expect(problems).toEqual([])
}

export const Subtle: Story = { args: { mode: 'subtle' }, play: checkEveryRole }
export const Expressive: Story = { args: { mode: 'expressive' }, play: checkEveryRole }
export const Reduced: Story = { args: { mode: 'reduced' }, play: checkEveryRole }
