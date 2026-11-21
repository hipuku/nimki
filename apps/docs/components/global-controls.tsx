'use client'

import { useId } from 'react'
import { SETTING_LABELS, SETTING_OPTIONS, type SettingName } from '../lib/settings'
import { useSettings } from './settings-provider'

const OPTION_LABELS: Record<string, string> = {
  light: 'Light',
  dark: 'Dark',
  subtle: 'Subtle',
  expressive: 'Expressive',
  comfortable: 'Comfortable',
  compact: 'Compact',
  off: 'Off',
  on: 'On',
}

/**
 * The four switches every page carries (PRD FR-D1). Each is a radio group
 * drawn as a segmented control. They become nimki's own components as those
 * ship; until then they are native inputs, which keep the keyboard and screen
 * reader behaviour for free.
 */
export function GlobalControls({ layout = 'row' }: { layout?: 'row' | 'stack' }) {
  const { settings, set } = useSettings()
  const id = useId()
  return (
    <div
      className={layout === 'row' ? 'flex flex-wrap items-center gap-x-4 gap-y-2' : 'grid gap-3'}
    >
      {(Object.keys(SETTING_OPTIONS) as SettingName[]).map(name => (
        <fieldset
          key={name}
          className={layout === 'row' ? 'flex items-center gap-2' : 'grid gap-1.5'}
        >
          <legend
            className={
              layout === 'row' ? 'sr-only' : 'mb-1 text-xs font-medium text-muted-foreground'
            }
          >
            {SETTING_LABELS[name]}
          </legend>
          <div
            className="inline-flex rounded-md border border-border bg-muted p-0.5"
            title={SETTING_LABELS[name]}
          >
            {SETTING_OPTIONS[name].map(option => {
              const inputId = `${id}-${name}-${option}`
              return (
                <span key={option} className="relative">
                  <input
                    id={inputId}
                    type="radio"
                    name={`${id}-${name}`}
                    value={option}
                    checked={settings[name] === option}
                    onChange={() => set(name, option)}
                    className="peer absolute inset-0 m-0 cursor-pointer opacity-0"
                  />
                  <label
                    htmlFor={inputId}
                    className="pointer-events-none block rounded-sm px-2 py-1 text-xs whitespace-nowrap text-muted-foreground peer-checked:bg-background peer-checked:text-foreground peer-checked:shadow-[var(--nk-elevation-1)] peer-focus-visible:outline-2 peer-focus-visible:outline-ring"
                  >
                    {name === 'reduced' ? `${SETTING_LABELS[name]}: ` : ''}
                    {OPTION_LABELS[option]}
                  </label>
                </span>
              )
            })}
          </div>
        </fieldset>
      ))}
    </div>
  )
}
