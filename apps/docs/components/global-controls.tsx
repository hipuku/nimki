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
 * The four switches (PRD FR-D1), each a labelled radio group drawn as a
 * two-part segmented control. They become nimki's own components as those
 * ship; until then they are native inputs, which keep the keyboard and screen
 * reader behaviour for free.
 */
export function GlobalControls() {
  const { settings, set } = useSettings()
  const id = useId()
  return (
    <div className="grid gap-3">
      {(Object.keys(SETTING_OPTIONS) as SettingName[]).map(name => (
        <fieldset key={name} className="grid grid-cols-[6.5rem_1fr] items-center gap-2">
          <legend className="float-left text-xs text-muted-foreground">
            {SETTING_LABELS[name]}
          </legend>
          <div className="grid grid-cols-2 rounded-md bg-muted p-0.5">
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
                    className="pointer-events-none block rounded-sm px-2 py-1 text-center text-xs text-muted-foreground peer-checked:bg-background peer-checked:text-foreground peer-checked:shadow-[var(--nk-elevation-1)] peer-focus-visible:outline-2 peer-focus-visible:outline-ring"
                  >
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
