import { describe, expect, it } from 'vitest'
import { contrast, inSrgb, luminance, oklchCss, toSrgb } from './colour.ts'

const white = { l: 1, c: 0, h: 0, alpha: 1 }
const black = { l: 0, c: 0, h: 0, alpha: 1 }

describe('luminance and contrast', () => {
  it('puts white at 1 and black at 0', () => {
    expect(luminance(white)).toBeCloseTo(1, 4)
    expect(luminance(black)).toBeCloseTo(0, 6)
  })

  it('gives white on black 21:1, in either order', () => {
    expect(contrast(white, black)).toBeCloseTo(21, 2)
    expect(contrast(black, white)).toBeCloseTo(21, 2)
  })

  it('matches a known pair: sRGB #767676 on white is 4.54:1', () => {
    // #767676 is the lightest grey that passes 4.5:1 on white; in OKLCH it is L 0.5659, the cube root of its luminance, 0.1812.
    expect(contrast({ l: 0.5659, c: 0, h: 0, alpha: 1 }, white)).toBeCloseTo(4.54, 1)
  })
})

describe('inSrgb', () => {
  it('accepts neutrals and refuses a chroma sRGB cannot show', () => {
    expect(inSrgb({ l: 0.5, c: 0, h: 0, alpha: 1 })).toBe(true)
    // The first success value: green at L 0.58 with chroma 0.22 is far outside sRGB.
    expect(inSrgb({ l: 0.58, c: 0.22, h: 150, alpha: 1 })).toBe(false)
  })
})

describe('toSrgb', () => {
  it('encodes white, black and alpha as Figma expects', () => {
    expect(toSrgb(white)).toEqual({ r: 1, g: 1, b: 1, a: 1 })
    expect(toSrgb({ ...black, alpha: 0.5 })).toEqual({ r: 0, g: 0, b: 0, a: 0.5 })
  })

  it('uses the sRGB transfer curve, so mid grey is not 0.5', () => {
    const { r } = toSrgb({ l: 0.5, c: 0, h: 0, alpha: 1 })
    expect(r).toBeGreaterThan(0.38)
    expect(r).toBeLessThan(0.39)
  })
})

describe('oklchCss', () => {
  it('writes alpha as a percentage only when it is not 1', () => {
    expect(oklchCss({ l: 0.99, c: 0.002, h: 260, alpha: 1 })).toBe('oklch(0.99 0.002 260)')
    expect(oklchCss({ l: 1, c: 0, h: 0, alpha: 0.08 })).toBe('oklch(1 0 0 / 8%)')
  })
})
