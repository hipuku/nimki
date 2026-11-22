'use client'

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import {
  SETTINGS_KEY,
  applySettings,
  defaultSettings,
  parseSettings,
  type SettingName,
  type Settings,
} from '../lib/settings'

interface SettingsContext {
  settings: Settings
  /** False on the server and during hydration, when the defaults show. */
  ready: boolean
  /** Reduced motion is on, by the control or by the operating system. */
  reducedMotion: boolean
  set: <K extends SettingName>(name: K, value: Settings[K]) => void
}

const Context = createContext<SettingsContext | null>(null)

const DARK_QUERY = '(prefers-color-scheme: dark)'
const REDUCE_QUERY = '(prefers-reduced-motion: reduce)'
const SERVER_SETTINGS = defaultSettings(false)

const listeners = new Set<() => void>()

// Used when storage is blocked, so a choice still holds until the page reloads.
let memorySaved: string | null = null

function readSaved(): string | null {
  try {
    return localStorage.getItem(SETTINGS_KEY) ?? memorySaved
  } catch {
    return memorySaved
  }
}

function subscribeSettings(listener: () => void) {
  listeners.add(listener)
  const query = matchMedia(DARK_QUERY)
  // A change in another tab, or in the system's mode while none is chosen.
  const refresh = () => {
    applySettings(document.documentElement, getSettings())
    listener()
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key === SETTINGS_KEY) refresh()
  }
  query.addEventListener('change', refresh)
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    query.removeEventListener('change', refresh)
    window.removeEventListener('storage', onStorage)
  }
}

// One object per saved value, so React sees a stable snapshot between changes.
let cacheKey = ''
let cached = SERVER_SETTINGS
function getSettings(): Settings {
  const saved = readSaved()
  const dark = matchMedia(DARK_QUERY).matches
  const key = `${saved ?? ''}|${dark}`
  if (key !== cacheKey) {
    cacheKey = key
    cached = parseSettings(saved, dark)
  }
  return cached
}

function subscribeReduced(listener: () => void) {
  const query = matchMedia(REDUCE_QUERY)
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}

const noSubscription = () => () => {}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const settings = useSyncExternalStore(subscribeSettings, getSettings, () => SERVER_SETTINGS)
  const systemReduced = useSyncExternalStore(
    subscribeReduced,
    () => matchMedia(REDUCE_QUERY).matches,
    () => false,
  )
  const ready = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  )

  const set = useCallback(<K extends SettingName>(name: K, value: Settings[K]) => {
    const next = { ...getSettings(), [name]: value }
    memorySaved = JSON.stringify(next)
    try {
      localStorage.setItem(SETTINGS_KEY, memorySaved)
    } catch {
      // Storage can be blocked; memorySaved keeps the choice for this page.
    }
    applySettings(document.documentElement, next)
    for (const listener of listeners) listener()
  }, [])

  const value = useMemo(
    () => ({ settings, ready, set, reducedMotion: settings.reduced === 'on' || systemReduced }),
    [settings, ready, set, systemReduced],
  )
  return <Context value={value}>{children}</Context>
}

export function useSettings(): SettingsContext {
  const context = useContext(Context)
  if (!context) throw new Error('useSettings needs a SettingsProvider above it')
  return context
}
