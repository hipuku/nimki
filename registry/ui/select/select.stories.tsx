import type { Meta, StoryObj } from '@storybook/react-vite'
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
 * Select as it looks: each story holds one state still, to compare with the
 * Figma file under the toolbar's Mode, Motion, Density and Reduced motion.
 * The behaviour tests are in select.test.stories.tsx.
 */
const meta = {
  title: 'Components/Select',
  component: Select,
} satisfies Meta<typeof Select>

export default meta
type Story = StoryObj<typeof meta>

function List() {
  return (
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
    </SelectContent>
  )
}

/** Closed, with a placeholder and with a value. Click either to open it. */
export const Default: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Select>
        <SelectTrigger className="w-60" aria-label="Fruit">
          <SelectValue placeholder="Select a fruit" />
        </SelectTrigger>
        <List />
      </Select>
      <Select defaultValue="blueberry">
        <SelectTrigger className="w-60" aria-label="Fruit, chosen">
          <SelectValue />
        </SelectTrigger>
        <List />
      </Select>
    </div>
  ),
}

/** Open, with a chosen option, groups, a separator and a disabled option. */
export const Open: Story = {
  render: () => (
    <div className="h-96">
      <Select defaultValue="banana" defaultOpen>
        <SelectTrigger className="w-60" aria-label="Fruit">
          <SelectValue />
        </SelectTrigger>
        <List />
      </Select>
    </div>
  ),
}

/** Both sizes, disabled, invalid, and a long value that truncates. */
export const States: Story = {
  render: () => (
    <div className="grid gap-4">
      {(['default', 'sm'] as const).map(size => (
        <div key={size} className="flex flex-wrap items-center gap-3">
          <Select defaultValue="apple">
            <SelectTrigger size={size} className="w-48" aria-label={`Size ${size}`}>
              <SelectValue />
            </SelectTrigger>
            <List />
          </Select>
          <Select disabled>
            <SelectTrigger size={size} className="w-48" aria-label={`Disabled, ${size}`}>
              <SelectValue placeholder="Disabled" />
            </SelectTrigger>
            <List />
          </Select>
          <Select>
            <SelectTrigger
              size={size}
              className="w-48"
              aria-label={`Invalid, ${size}`}
              aria-invalid
            >
              <SelectValue placeholder="Invalid" />
            </SelectTrigger>
            <List />
          </Select>
          <Select defaultValue="long">
            <SelectTrigger size={size} className="w-48" aria-label={`Long value, ${size}`}>
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
}

/** A long list, open, scrolled to its chosen option, with the scroll buttons at its ends. */
export const LongList: Story = {
  render: () => (
    <div className="h-80">
      <Select defaultValue="20" defaultOpen>
        <SelectTrigger className="w-60" aria-label="Number">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {Array.from({ length: 40 }, (_, i) => (
            <SelectItem key={i} value={String(i + 1)}>
              Number {i + 1}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  ),
}

/** Right to left: the chevron and the check sit on the start side. */
export const RightToLeft: Story = {
  render: () => (
    <div dir="rtl" className="h-96">
      <Select dir="rtl" defaultValue="banana" defaultOpen>
        <SelectTrigger className="w-60" aria-label="Fruit">
          <SelectValue />
        </SelectTrigger>
        <List />
      </Select>
    </div>
  ),
}
