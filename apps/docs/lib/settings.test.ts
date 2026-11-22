import { describe, expect, it } from 'vitest'
import {
  applySettings,
  BOOT_SCRIPT,
  defaultSettings,
  parseSettings,
  SETTING_OPTIONS,
  SETTINGS_KEY,
} from './settings'
import { curvePath, sampleEasing } from './curves'

describe('parseSettings', () => {
  it('uses the defaults, with mode from the system, when nothing is saved', () => {
    expect(parseSettings(null, true)).toEqual(defaultSettings(true))
    expect(parseSettings(null, false).mode).toBe('light')
  })

  it('keeps saved values it knows and replaces the rest', () => {
    const saved = JSON.stringify({ mode: 'dark', motion: 'bouncy', density: 'compact', x: 1 })
    expect(parseSettings(saved, false)).toEqual({
      mode: 'dark',
      motion: 'subtle',
      density: 'compact',
      reduced: 'off',
    })
  })

  it('falls back to the defaults on text that is not a settings object', () => {
    expect(parseSettings('{', false)).toEqual(defaultSettings(false))
    expect(parseSettings('3', false)).toEqual(defaultSettings(false))
  })
})

describe('BOOT_SCRIPT', () => {
  /** A stand-in for <html>: the parts applySettings and the script touch. */
  function fakeRoot() {
    const classes = new Set<string>()
    return {
      classList: {
        toggle: (name: string, on: boolean) => void (on ? classes.add(name) : classes.delete(name)),
      },
      style: {} as { colorScheme?: string },
      dataset: {} as Record<string, string>,
      state() {
        return { dark: classes.has('dark'), style: { ...this.style }, dataset: { ...this.dataset } }
      },
    }
  }

  /** Runs the exact string that ships, with a saved value and a system preference. */
  function boot(saved: string | null, prefersDark: boolean, storageThrows = false) {
    const root = fakeRoot()
    const localStorage = {
      getItem(key: string) {
        if (storageThrows) throw new Error('storage blocked')
        return key === SETTINGS_KEY ? saved : null
      },
    }
    const matchMedia = () => ({ matches: prefersDark })
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- the point is to run the shipped string
    const run = new Function('localStorage', 'matchMedia', 'document', BOOT_SCRIPT) as (
      storage: typeof localStorage,
      media: typeof matchMedia,
      doc: { documentElement: typeof root },
    ) => void
    run(localStorage, matchMedia, { documentElement: root })
    return root.state()
  }

  function expected(saved: string | null, prefersDark: boolean) {
    const root = fakeRoot()
    applySettings(root as unknown as HTMLElement, parseSettings(saved, prefersDark))
    return root.state()
  }

  it('agrees with parseSettings and applySettings for every saved combination', () => {
    const values = Object.fromEntries(
      Object.entries(SETTING_OPTIONS).map(([name, options]) => [
        name,
        [...options, undefined, 'x'],
      ]),
    ) as Record<string, unknown[]>
    for (const mode of values.mode ?? [])
      for (const motion of values.motion ?? [])
        for (const density of values.density ?? [])
          for (const reduced of values.reduced ?? [])
            for (const prefersDark of [true, false]) {
              const saved = JSON.stringify({ mode, motion, density, reduced })
              expect(boot(saved, prefersDark)).toEqual(expected(saved, prefersDark))
            }
  })

  it('falls back to the defaults on anything that is not a settings object', () => {
    for (const saved of [null, '', '{', '3', 'null', '"dark"', '[]']) {
      expect(boot(saved, true)).toEqual(expected(saved, true))
      expect(boot(saved, false)).toEqual(expected(saved, false))
    }
  })

  it('still applies the defaults when storage is blocked', () => {
    expect(boot(null, true, true)).toEqual(expected(null, true))
  })
})

describe('sampleEasing', () => {
  it('draws a cubic-bezier through its ends', () => {
    const points = sampleEasing('cubic-bezier(0.16, 1, 0.3, 1)', 10)
    expect(points[0]?.x).toBe(0)
    expect(points[0]?.y).toBeCloseTo(0, 6)
    expect(points[10]?.y).toBeCloseTo(1, 3)
    expect(points[5]?.y).toBeGreaterThan(0.9)
  })

  it('spaces linear() values evenly and keeps an overshoot', () => {
    const points = sampleEasing('linear(0, 0.5, 1.1, 1)', 6)
    expect(points.map(p => Number(p.y.toFixed(3)))).toEqual([0, 0.25, 0.5, 0.8, 1.1, 1.05, 1])
  })

  it('draws anything else as a straight line', () => {
    expect(sampleEasing('ease', 2).map(p => p.y)).toEqual([0, 0.5, 1])
    expect(sampleEasing('linear(1)', 2).map(p => p.y)).toEqual([0, 0.5, 1])
    expect(sampleEasing('linear()', 2).map(p => p.y)).toEqual([0, 0.5, 1])
  })
})

describe('curvePath', () => {
  it('maps 0 and 1 inside the padding, y up', () => {
    expect(
      curvePath(
        [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
        100,
        130,
      ),
    ).toBe('M0.00 115.00 L100.00 15.00')
  })
})
