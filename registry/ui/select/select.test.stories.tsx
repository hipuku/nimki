import type { Meta, StoryObj } from '@storybook/react-vite'
import * as React from 'react'
import { useState } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { roleTimingProblems } from '../../../apps/storybook/src/motion'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './select'

/**
 * Select's behaviour, each story a browser test: the play functions drive the
 * real component with the keyboard and pointer, and axe checks every story
 * (PRD NFR-1). The list renders in a portal, so the tests read the page.
 *
 * Tagged !dev: they run in CI and in Storybook's test runner, but stay out of
 * the sidebar, where a play function replays its clicks each time the story
 * opens. select.stories.tsx holds the stories to look at.
 */
const meta = {
  title: 'Components/Select/Tests',
  component: Select,
  tags: ['!dev'],
  args: { onValueChange: fn(), onOpenChange: fn() },
} satisfies Meta<typeof Select>

export default meta
type Story = StoryObj<typeof meta>

const page = (element: HTMLElement) => within(element.ownerDocument.body)

function Fruit(props: React.ComponentProps<typeof Select>) {
  return (
    <Select {...props}>
      <SelectTrigger className="w-60" aria-label="Fruit">
        <SelectValue placeholder="Select a fruit" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Fruit</SelectLabel>
          <SelectItem value="apple">Apple</SelectItem>
          <SelectItem value="banana">Banana</SelectItem>
          <SelectItem value="blueberry">Blueberry</SelectItem>
          <SelectItem value="grapes" disabled>
            Grapes
          </SelectItem>
          <SelectItem value="pineapple">Pineapple</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Vegetables</SelectLabel>
          <SelectItem value="carrot">Carrot</SelectItem>
          <SelectItem value="leek">Leek</SelectItem>
        </SelectGroup>
        {/* An empty group shows nothing, its label included. */}
        <SelectGroup>
          <SelectLabel>Herbs</SelectLabel>
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

/** Chooses with the pointer: the trigger shows the item's text, and onValueChange gets the value alone. */
export const Default: Story = {
  render: args => <Fruit {...args} />,
  play: async ({ canvas, canvasElement, args }) => {
    const trigger = canvas.getByRole('combobox', { name: 'Fruit' })
    await expect(trigger).toHaveTextContent('Select a fruit')
    await expect(trigger).toHaveAttribute('data-state', 'closed')
    await expect(trigger).toHaveAttribute('data-placeholder')
    await userEvent.click(trigger)
    const list = await page(canvasElement).findByRole('listbox')
    await expect(trigger).toHaveAttribute('data-state', 'open')
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(true)
    // The empty group's label is not shown.
    await expect(within(list).queryByText('Herbs')).not.toBeVisible()
    await userEvent.click(within(list).getByRole('option', { name: 'Banana' }))
    await waitFor(() => expect(trigger).toHaveTextContent('Banana'))
    await expect(args.onValueChange).toHaveBeenCalledWith('banana')
    // Radix's single argument, not Base UI's value and event details.
    await expect((args.onValueChange as ReturnType<typeof fn>).mock.calls[0]).toHaveLength(1)
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(false)
    await expect(trigger).not.toHaveAttribute('data-placeholder')
  },
}

/**
 * The keyboard follows the select-only combobox pattern (FR-S9, FR-S10):
 * arrows move through every option, a disabled one included but not
 * choosable, Home and End reach the ends, a letter jumps, Enter chooses, and
 * Escape closes without choosing and keeps focus on the trigger.
 */
export const Keyboard: Story = {
  render: args => <Fruit {...args} />,
  play: async ({ canvas, canvasElement, args }) => {
    const trigger = canvas.getByRole('combobox', { name: 'Fruit' })
    trigger.focus()
    await userEvent.keyboard('{Enter}')
    const list = await page(canvasElement).findByRole('listbox')
    const highlighted = () => list.querySelector('[data-highlighted]')
    // Opening from the keyboard highlights the first option and moves focus into the list.
    await waitFor(() => expect(highlighted()).toHaveTextContent('Apple'))
    const popup = list.closest('[data-slot=select-content]') as HTMLElement
    await waitFor(() => expect(popup.contains(document.activeElement)).toBe(true))
    await userEvent.keyboard('{End}')
    await waitFor(() => expect(highlighted()).toHaveTextContent('Leek'))
    await userEvent.keyboard('{Home}')
    await waitFor(() => expect(highlighted()).toHaveTextContent('Apple'))
    // A disabled option can be highlighted, so a screen reader announces it, but
    // not chosen (WAI-ARIA Authoring Practices; Radix skips it instead).
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}')
    await waitFor(() => expect(highlighted()).toHaveTextContent('Grapes'))
    await userEvent.keyboard('{Enter}')
    await expect(list).toBeVisible()
    await userEvent.keyboard('{ArrowDown}')
    await waitFor(() => expect(highlighted()).toHaveTextContent('Pineapple'))
    await userEvent.keyboard('c')
    await waitFor(() => expect(highlighted()).toHaveTextContent('Carrot'))
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(trigger).toHaveAttribute('data-state', 'closed'))
    // Focus comes back to the trigger once the list has finished leaving.
    await waitFor(() => expect(trigger).toHaveFocus())
    await expect(args.onValueChange).not.toHaveBeenCalled()
    await userEvent.keyboard('{ArrowDown}')
    await page(canvasElement).findByRole('listbox')
    await userEvent.keyboard('b{Enter}')
    await waitFor(() => expect(trigger).toHaveTextContent('Banana'))
    await waitFor(() => expect(trigger).toHaveFocus())
    // Arrow up opens it too.
    await userEvent.keyboard('{ArrowUp}')
    await page(canvasElement).findByRole('listbox')
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(true)
    await userEvent.keyboard('{Escape}')
  },
}

/** A default value shows its item's text on the first render, before the list has ever opened. */
export const WithValue: Story = {
  args: { defaultValue: 'blueberry' },
  render: args => <Fruit {...args} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('combobox', { name: 'Fruit' })).toHaveTextContent('Blueberry')
  },
}

function Controlled() {
  const [value, setValue] = useState('apple')
  return (
    <div className="flex items-center gap-4">
      <Fruit value={value} onValueChange={setValue} />
      <button type="button" onClick={() => setValue('leek')} className="text-sm underline">
        Choose leek
      </button>
      <button type="button" onClick={() => setValue('')} className="text-sm underline">
        Clear
      </button>
      <output className="text-sm">{value || 'none'}</output>
    </div>
  )
}

/** Controlled: the value follows the state, and Radix's empty string clears it to the placeholder. */
export const ControlledValue: Story = {
  render: () => <Controlled />,
  play: async ({ canvas, canvasElement }) => {
    const trigger = canvas.getByRole('combobox', { name: 'Fruit' })
    await expect(trigger).toHaveTextContent('Apple')
    await userEvent.click(canvas.getByRole('button', { name: 'Choose leek' }))
    await expect(trigger).toHaveTextContent('Leek')
    await userEvent.click(trigger)
    const list = await page(canvasElement).findByRole('listbox')
    await userEvent.click(within(list).getByRole('option', { name: 'Carrot' }))
    await waitFor(() => expect(canvas.getByText('carrot')).toBeInTheDocument())
    await userEvent.click(canvas.getByRole('button', { name: 'Clear' }))
    await expect(trigger).toHaveTextContent('Select a fruit')
  },
}

function InForm({ onSubmit }: { onSubmit: (data: Record<string, unknown>) => void }) {
  return (
    <form
      onSubmit={event => {
        event.preventDefault()
        onSubmit(Object.fromEntries(new FormData(event.currentTarget)))
      }}
      className="flex items-center gap-4"
    >
      <Fruit name="fruit" defaultValue="carrot" />
      <button type="submit" className="text-sm underline">
        Send
      </button>
    </form>
  )
}

const submitted = fn()

/** A name submits the value with the form (FR-S16). */
export const Form: Story = {
  render: () => <InForm onSubmit={submitted} />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Send' }))
    await expect(submitted).toHaveBeenCalledWith({ fruit: 'carrot' })
  },
}

/** The list grows from the trigger on the popover-enter role, and leaves on popover-exit (FR-S18). */
export const Motion: Story = {
  render: args => <Fruit {...args} />,
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole('combobox', { name: 'Fruit' }))
    const list = await page(canvasElement).findByRole('listbox')
    const popup = list.closest('[data-slot=select-content]') as HTMLElement
    await expect(popup).toHaveAttribute('data-side', 'bottom')
    await waitFor(() =>
      expect(roleTimingProblems(popup, 'opacity', 'popover-enter', 'subtle')).toEqual([]),
    )
    // Closing mid-enter reverses the transition from where it is, on a shorter
    // run (FR-S22), so the full exit is measured once the enter has finished.
    await Promise.all(popup.getAnimations().map(animation => animation.finished))
    // The exit is short, so its timing is read the moment it starts.
    const exit = new Promise<string[]>(resolve => {
      popup.addEventListener('transitionrun', function read(event) {
        if (event.target !== popup || event.propertyName !== 'opacity') return
        popup.removeEventListener('transitionrun', read)
        resolve(roleTimingProblems(popup, 'opacity', 'popover-exit', 'subtle'))
      })
    })
    await userEvent.keyboard('{Escape}')
    await expect(await exit).toEqual([])
  },
}

/** Both sizes, a disabled select, and an invalid one, as in the Figma file. */
export const States: Story = {
  render: () => (
    <div className="grid gap-4">
      {(['default', 'sm'] as const).map(size => (
        <div key={size} className="flex flex-wrap items-center gap-3">
          <Select defaultValue="apple">
            <SelectTrigger size={size} className="w-48" aria-label={`Size ${size}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="apple">Apple</SelectItem>
            </SelectContent>
          </Select>
          <Select disabled>
            <SelectTrigger size={size} className="w-48" aria-label={`Disabled ${size}`}>
              <SelectValue placeholder="Disabled" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="apple">Apple</SelectItem>
            </SelectContent>
          </Select>
          <Select>
            <SelectTrigger size={size} className="w-48" aria-label={`Invalid ${size}`} aria-invalid>
              <SelectValue placeholder="Invalid" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="apple">Apple</SelectItem>
            </SelectContent>
          </Select>
          <Select defaultValue="long">
            <SelectTrigger size={size} className="w-48" aria-label={`Long ${size}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="long">
                A very long option label that does not fit the trigger
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    const height = (name: string) =>
      canvas.getByRole('combobox', { name }).getBoundingClientRect().height
    // Comfortable density: control-md is 36 px, control-sm 32 px.
    await expect(height('Size default')).toBe(36)
    await expect(height('Size sm')).toBe(32)
    await expect(canvas.getByRole('combobox', { name: 'Disabled default' })).toBeDisabled()
    const value = canvas
      .getByRole('combobox', { name: 'Long default' })
      .querySelector('[data-slot=select-value]') as HTMLElement
    // A long value truncates to one line.
    await expect(value.scrollWidth).toBeGreaterThan(value.clientWidth)
  },
}

/** A long list scrolls, with the scroll button at the end that has more. */
export const LongList: Story = {
  render: () => (
    <Select>
      <SelectTrigger className="w-60" aria-label="Number">
        <SelectValue placeholder="Pick a number" />
      </SelectTrigger>
      <SelectContent className="max-h-64">
        {Array.from({ length: 40 }, (_, i) => (
          <SelectItem key={i} value={String(i + 1)}>
            Number {i + 1}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ),
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole('combobox', { name: 'Number' }))
    await page(canvasElement).findByRole('listbox')
    const body = canvasElement.ownerDocument.body
    await waitFor(() =>
      expect(body.querySelector('[data-slot=select-scroll-down-button]')).toBeVisible(),
    )
    await userEvent.keyboard('{Escape}')
  },
}

/**
 * shadcn's Radix props still work: textValue names a rich item, item-aligned
 * lays the chosen item over the trigger, and preventing onEscapeKeyDown keeps
 * the list open (FR-C7, FR-C8).
 */
export const RadixApi: Story = {
  render: () => (
    <Select defaultValue="sun">
      <SelectTrigger className="w-60" aria-label="Weather">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="item-aligned" onEscapeKeyDown={event => event.preventDefault()}>
        <SelectItem value="sun" textValue="Sunny">
          <span aria-hidden="true">☀</span> Sunny
        </SelectItem>
        <SelectItem value="rain" textValue="Rainy">
          <span aria-hidden="true">☂</span> Rainy
        </SelectItem>
      </SelectContent>
    </Select>
  ),
  play: async ({ canvas, canvasElement }) => {
    const trigger = canvas.getByRole('combobox', { name: 'Weather' })
    await expect(trigger).toHaveTextContent('Sunny')
    await userEvent.click(trigger)
    const list = await page(canvasElement).findByRole('listbox')
    const popup = list.closest('[data-slot=select-content]') as HTMLElement
    await expect(popup).toHaveAttribute('data-side', 'none')
    await userEvent.keyboard('{Escape}')
    await expect(trigger).toHaveAttribute('data-state', 'open')
    await userEvent.click(within(list).getByRole('option', { name: /Rainy/ }))
    await waitFor(() => expect(trigger).toHaveTextContent('Rainy'))
  },
}

/**
 * Right to left: the chevron sits on the trigger's left, and the list, which
 * renders in a portal outside the page's dir, is right to left too, with each
 * option's check on its left.
 */
export const RightToLeft: Story = {
  render: () => (
    <div dir="rtl">
      <Fruit dir="rtl" defaultValue="apple" />
    </div>
  ),
  play: async ({ canvas, canvasElement }) => {
    const trigger = canvas.getByRole('combobox', { name: 'Fruit' })
    const chevron = trigger.querySelector('svg') as SVGElement
    await expect(chevron.getBoundingClientRect().left).toBeLessThan(
      trigger.getBoundingClientRect().left + 40,
    )
    await userEvent.click(trigger)
    const list = await page(canvasElement).findByRole('listbox')
    await expect(getComputedStyle(list).direction).toBe('rtl')
    const apple = within(list).getByRole('option', { name: 'Apple' })
    const check = apple.querySelector('svg') as SVGElement
    await expect(check.getBoundingClientRect().left).toBeLessThan(
      apple.getBoundingClientRect().left + 40,
    )
  },
}

/** Items rendered by a component of the project's own: found once they mount. */
function OwnItems() {
  return (
    <>
      <SelectItem value="mint">Mint</SelectItem>
      <SelectItem value="sage">Sage</SelectItem>
    </>
  )
}

const kept = fn()

/**
 * The rest of shadcn's Radix surface: asChild on every part that takes it,
 * onPointerDownOutside and onCloseAutoFocus prevented, the collision props,
 * and items from a component of the project's own (FR-C7, FR-C8).
 */
export const RadixSurface: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Select defaultValue="mint">
        <SelectTrigger asChild aria-label="Herb">
          <button type="button" className="h-9 rounded-lg border border-input px-3 text-sm">
            <SelectValue asChild>
              <span className="font-medium">Herb</span>
            </SelectValue>
          </button>
        </SelectTrigger>
        <SelectContent
          avoidCollisions={false}
          collisionBoundary={null}
          collisionPadding={8}
          sticky="always"
          hideWhenDetached
          onPointerDownOutside={event => {
            // Radix's shape: the pointer event is the detail's originalEvent.
            if (event.detail.originalEvent.button === 0) event.preventDefault()
          }}
          onCloseAutoFocus={event => {
            kept()
            event.preventDefault()
          }}
        >
          <SelectGroup asChild>
            <div>
              <SelectLabel asChild>
                <div>Herbs</div>
              </SelectLabel>
              <OwnItems />
              <SelectItem value="basil" asChild>
                <div>Basil</div>
              </SelectItem>
            </div>
          </SelectGroup>
          <SelectSeparator asChild>
            <div />
          </SelectSeparator>
        </SelectContent>
      </Select>
      <button type="button">Elsewhere</button>
    </div>
  ),
  play: async ({ canvas, canvasElement }) => {
    const trigger = canvas.getByRole('combobox', { name: 'Herb' })
    await expect(trigger.tagName).toBe('BUTTON')
    await expect(trigger).toHaveTextContent('Herb')
    await userEvent.click(trigger)
    const list = await page(canvasElement).findByRole('listbox')
    await expect(within(list).getByText('Herbs').tagName).toBe('DIV')
    // Wait for the list to finish appearing: toBeVisible reads opacity 0 as hidden.
    const popup = list.closest('[data-slot=select-content]') as HTMLElement
    await waitFor(() => expect(getComputedStyle(popup).opacity).toBe('1'))
    // An outside press is prevented, so the list stays open.
    await userEvent.click(canvas.getByRole('button', { name: 'Elsewhere' }))
    await expect(list).toBeVisible()
    await expect(trigger).toHaveAttribute('data-state', 'open')
    await userEvent.click(within(list).getByRole('option', { name: 'Sage' }))
    await waitFor(() => expect(trigger).toHaveAttribute('data-state', 'closed'))
    // onCloseAutoFocus was prevented, so focus did not go back to the trigger.
    await waitFor(() => expect(kept).toHaveBeenCalled())
    await expect(trigger).not.toHaveFocus()
  },
}

class Catch extends React.Component<{ children: React.ReactNode }, { message: string | null }> {
  override state = { message: null as string | null }
  static getDerivedStateFromError(error: Error) {
    return { message: error.message }
  }
  override render() {
    return this.state.message ? <p role="alert">{this.state.message}</p> : this.props.children
  }
}

/** A part outside a Select, or asChild without one element, says what is wrong. */
export const Misuse: Story = {
  render: () => (
    <div className="grid gap-2">
      <Catch>
        <SelectTrigger />
      </Catch>
      <Catch>
        <Select>
          <SelectGroup asChild>text</SelectGroup>
        </Select>
      </Catch>
    </div>
  ),
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas }) => {
    const alerts = canvas.getAllByRole('alert').map(alert => alert.textContent)
    await expect(alerts).toEqual([
      'SelectTrigger must be inside <Select>',
      'asChild needs exactly one React element as its child',
    ])
  },
}

function Removable() {
  const [withSage, setWithSage] = useState(true)
  return (
    <div className="flex items-center gap-4">
      <Select defaultValue="sage">
        <SelectTrigger className="w-48" aria-label="Herb">
          <SelectValue placeholder="Pick a herb" />
        </SelectTrigger>
        <SelectContent>
          <HerbItems withSage={withSage} />
        </SelectContent>
      </Select>
      <button type="button" onClick={() => setWithSage(false)} className="text-sm underline">
        Remove sage
      </button>
    </div>
  )
}

function HerbItems({ withSage }: { withSage: boolean }) {
  return (
    <>
      <SelectItem value="mint">Mint</SelectItem>
      {withSage && <SelectItem value="sage">Sage</SelectItem>}
    </>
  )
}

/**
 * Items rendered by a component of the project's own are read as they mount,
 * so the trigger shows their text; an item that leaves takes its text with it.
 */
export const ItemsFromOwnComponent: Story = {
  render: () => <Removable />,
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole('combobox', { name: 'Herb' })
    await waitFor(() => expect(trigger).toHaveTextContent('Sage'))
    await userEvent.click(canvas.getByRole('button', { name: 'Remove sage' }))
    await waitFor(() => expect(trigger).not.toHaveTextContent('Sage'))
  },
}

/**
 * The trigger shows a press while the pointer or Space is held, and only then:
 * Base UI's data-pressed stays on while the list is open, so the press is its own.
 */
export const Press: Story = {
  render: args => <Fruit {...args} />,
  play: async ({ canvas, canvasElement }) => {
    const trigger = canvas.getByRole('combobox', { name: 'Fruit' })
    // The open list makes the page behind it pointer-events: none, and user-event
    // would then drop the release; a browser always sends it.
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    await user.pointer({ keys: '[MouseLeft>]', target: trigger })
    await expect(trigger).toHaveAttribute('data-nk-pressed')
    await user.pointer({ keys: '[/MouseLeft]', target: trigger })
    await waitFor(() => expect(trigger).not.toHaveAttribute('data-nk-pressed'))
    // Open, and not pressed.
    await page(canvasElement).findByRole('listbox')
    await expect(trigger).toHaveAttribute('data-state', 'open')
    await expect(trigger).not.toHaveAttribute('data-nk-pressed')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(trigger).toHaveFocus())
    // Space: pressed while held, released wherever its keyup lands.
    // One session, so the key held is the key released.
    await user.keyboard('[Space>]')
    await expect(trigger).toHaveAttribute('data-nk-pressed')
    await user.keyboard('[/Space]')
    await waitFor(() => expect(trigger).not.toHaveAttribute('data-nk-pressed'))
    await user.keyboard('{Escape}')
  },
}
