/**
 * Turns a CSS easing (cubic-bezier() or linear()) into points to draw, for the
 * motion foundations page (PRD FR-D3). The tokens are the engine's, so the
 * curve drawn is the curve that runs.
 */

export interface Point {
  x: number
  y: number
}

const numbers = (text: string) => (text.match(/-?\d*\.?\d+/g) ?? []).map(Number)

/** A cubic Bézier's y at a given x, by bisection on the curve's parameter. */
function bezierY(x1: number, y1: number, x2: number, y2: number, x: number): number {
  const at = (a: number, b: number, t: number) =>
    3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3
  let low = 0
  let high = 1
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2
    if (at(x1, x2, mid) < x) low = mid
    else high = mid
  }
  return at(y1, y2, (low + high) / 2)
}

/**
 * Samples an easing at `steps + 1` evenly spaced points from 0 to 1. A
 * linear() easing without stop positions spaces its values evenly, as the
 * generated springs do.
 */
export function sampleEasing(easing: string, steps = 48): Point[] {
  const xs = Array.from({ length: steps + 1 }, (_, i) => i / steps)
  if (easing.startsWith('cubic-bezier(')) {
    const [x1 = 0, y1 = 0, x2 = 1, y2 = 1] = numbers(easing)
    return xs.map(x => ({ x, y: bezierY(x1, y1, x2, y2, x) }))
  }
  if (easing.startsWith('linear(')) {
    const values = numbers(easing)
    if (values.length < 2) return xs.map(x => ({ x, y: x }))
    const last = values.length - 1
    return xs.map(x => {
      const position = x * last
      const i = Math.min(Math.floor(position), last - 1)
      const a = values[i] as number
      const b = values[i + 1] as number
      return { x, y: a + (b - a) * (position - i) }
    })
  }
  return xs.map(x => ({ x, y: x }))
}

/** An SVG path for the points in a box, y up, with room for overshoot. */
export function curvePath(points: Point[], width: number, height: number, pad = 0.15): string {
  const span = 1 + 2 * pad
  return points
    .map(({ x, y }, i) => {
      const px = x * width
      const py = height - ((y + pad) / span) * height
      return `${i === 0 ? 'M' : 'L'}${px.toFixed(2)} ${py.toFixed(2)}`
    })
    .join(' ')
}
