import { describe, expect, it } from 'vitest'
import { BOOT_SCRIPT, defaultSettings, parseSettings, SETTINGS_KEY } from './settings'
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
      motion: 'expressive',
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
  it('calls the boot function with the storage key', () => {
    expect(BOOT_SCRIPT.endsWith(`(${JSON.stringify(SETTINGS_KEY)})`)).toBe(true)
    expect(BOOT_SCRIPT).not.toMatch(/\bimport\b|\brequire\(/)
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
