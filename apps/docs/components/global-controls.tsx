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
    <div className="grid gap-3.5">
      {(Object.keys(SETTING_OPTIONS) as SettingName[]).map(name => {
        const selected = SETTING_OPTIONS[name].indexOf(settings[name] as never)
        return (
          <fieldset key={name} className="grid grid-cols-[7rem_1fr] items-center gap-3">
            <legend className="float-left text-[0.8125rem] text-muted-foreground">
              {SETTING_LABELS[name]}
            </legend>
            <div className="relative grid grid-cols-2 rounded-md bg-muted p-1">
              {/* One indicator slides to the chosen option, on the highlight role. */}
              <span
                aria-hidden="true"
                className="nk-slide absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-sm bg-background shadow-[var(--nk-elevation-1)]"
                style={{ translate: selected === 1 ? '100% 0' : '0 0' }}
              />
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
                      className="peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0"
                    />
                    <label
                      htmlFor={inputId}
                      className="pointer-events-none relative block rounded-sm px-3 py-1.5 text-center text-[0.8125rem] whitespace-nowrap text-muted-foreground transition-colors duration-[var(--nk-duration-fast)] peer-checked:text-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-ring"
                    >
                      {OPTION_LABELS[option]}
                    </label>
                  </span>
                )
              })}
            </div>
          </fieldset>
        )
      })}
    </div>
  )
}
