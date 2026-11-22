import type { Oklch } from './dtcg.ts'

/**
 * OKLCH to linear sRGB, by Björn Ottosson's published OKLab matrices. Used to
 * check that a colour fits in sRGB and to measure WCAG contrast (PRD FR-V9).
 * The source defines colours in OKLCH; nothing here converts the other way.
 */
export function toLinearSrgb({ l, c, h }: Oklch): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180)
  const b = c * Math.sin((h * Math.PI) / 180)
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ]
}

/** Whether the colour can be shown in sRGB without the browser mapping it. */
export function inSrgb(colour: Oklch): boolean {
  return toLinearSrgb(colour).every(channel => channel >= -1e-4 && channel <= 1 + 1e-4)
}

/** WCAG 2 relative luminance. The channels are already linear, so no transfer curve. */
export function luminance(colour: Oklch): number {
  const [r, g, b] = toLinearSrgb(colour).map(channel => Math.min(1, Math.max(0, channel))) as [
    number,
    number,
    number,
  ]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2 contrast ratio, 1 to 21. Both colours must be opaque. */
export function contrast(a: Oklch, b: Oklch): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** A CSS oklch() for a resolved colour, with alpha only when it is not 1. */
export function oklchCss({ l, c, h, alpha }: Oklch): string {
  const n = (value: number) => String(Number(value.toFixed(4)))
  return `oklch(${n(l)} ${n(c)} ${n(h)}${alpha === 1 ? '' : ` / ${n(alpha * 100)}%`})`
}

/** Gamma-encoded sRGB, 0 to 1 per channel and clamped, as Figma's COLOR variables take it. */
export function toSrgb(colour: Oklch): { r: number; g: number; b: number; a: number } {
  const encode = (linear: number) => {
    const x = Math.min(1, Math.max(0, linear))
    const v = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
    return Number(v.toFixed(4))
  }
  const [r, g, b] = toLinearSrgb(colour).map(encode) as [number, number, number]
  return { r, g, b, a: colour.alpha }
}

/**
 * Gamma-encoded sRGB (0 to 1 per channel) back to OKLCH, the inverse of
 * toSrgb, for reading a colour changed in Figma back into the source. An
 * achromatic colour has no hue; it comes back as 0.
 */
export function fromSrgb(r: number, g: number, b: number, alpha = 1): Oklch {
  const decode = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  const [lr, lg, lb] = [decode(r), decode(g), decode(b)]
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const c = Math.sqrt(A * A + B * B)
  const h = c < 1e-4 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360
  return { l: L, c, h, alpha }
}
