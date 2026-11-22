'use client'

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@registry/ui/select/select'

/** The live examples on the Select page: the registry's code, under the global controls. */

function Fruit({ size = 'default' }: { size?: 'default' | 'sm' }) {
  return (
    <Select>
      <SelectTrigger size={size} className="w-56" aria-label="Fruit">
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
      </SelectContent>
    </Select>
  )
}

export function SelectDemo() {
  return <Fruit />
}

export function SelectSizes() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Fruit />
      <Fruit size="sm" />
    </div>
  )
}

export function SelectInvalid() {
  return (
    <Select>
      <SelectTrigger className="w-56" aria-label="Fruit, required" aria-invalid>
        <SelectValue placeholder="Choose one" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="apple">Apple</SelectItem>
        <SelectItem value="banana">Banana</SelectItem>
      </SelectContent>
    </Select>
  )
}

export function SelectDisabled() {
  return (
    <Select disabled defaultValue="apple">
      <SelectTrigger className="w-56" aria-label="Fruit, disabled">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="apple">Apple</SelectItem>
      </SelectContent>
    </Select>
  )
}

export function SelectLongList() {
  return (
    <Select>
      <SelectTrigger className="w-56" aria-label="Number">
        <SelectValue placeholder="Pick a number" />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {Array.from({ length: 40 }, (_, i) => (
          <SelectItem key={i} value={String(i + 1)}>
            Number {i + 1}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
