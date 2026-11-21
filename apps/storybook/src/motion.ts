import { DURATION_CAPS_MS, MOTION_TOKENS, type MotionMode, type MotionRole } from '@hipuku/nimki'

/** A transition as the browser runs it: what a person sees, not what the CSS says. */
export interface Timing {
  durationMs: number
  easing: string
}

/**
 * The running CSS transition on an element for one property, read from
 * getAnimations(), or null if nothing is animating it. Chromatic pauses
 * animations, so this is how motion is tested (PRD NFR-20).
 */
export function runningTransition(element: Element, property: string): Timing | null {
  const transition = element
    .getAnimations()
    .find(
      (animation): animation is CSSTransition =>
        animation instanceof CSSTransition && animation.transitionProperty === property,
    )
  if (!transition?.effect) return null
  const { duration, easing } = transition.effect.getTiming()
  return { durationMs: Number(duration), easing: easing ?? 'linear' }
}

// The browser writes linear() with an input position after each point
// ("linear(0 0%, 0.0229 2.5%, ...)"); only the output values are the curve.
const numbers = (easing: string) =>
  (easing.replace(/-?\d*\.?\d+%/g, '').match(/-?\d*\.?\d+/g) ?? []).map(Number)

/**
 * Problems with an element's transition against a role's tokens in a mode:
 * the duration must match and stay under the role's cap (a spring is capped
 * by its visual duration, so its settle time may run past), and the easing
 * must be the role's curve. Reduced motion's jumps run no transition at all.
 */
export function roleTimingProblems(
  element: Element,
  property: string,
  role: MotionRole,
  mode: MotionMode,
): string[] {
  const token = MOTION_TOKENS[mode][role]
  const actual = runningTransition(element, property)
  const where = `${role} (${mode})`
  if (token.durationMs === 0) return actual ? [`${where}: jumps, but a transition ran`] : []
  if (!actual) return [`${where}: no transition ran on ${property}`]
  const problems: string[] = []
  if (Math.abs(actual.durationMs - token.durationMs) > 1) {
    problems.push(`${where}: ran ${actual.durationMs} ms, the token is ${token.durationMs} ms`)
  }
  const capped = token.visualDurationMs ?? actual.durationMs
  if (capped > DURATION_CAPS_MS[role]) {
    problems.push(`${where}: ${capped} ms is over the ${DURATION_CAPS_MS[role]} ms cap`)
  }
  const want = numbers(token.easing)
  const got = numbers(actual.easing)
  const sameCurve =
    actual.easing.split('(')[0] === token.easing.split('(')[0] &&
    want.length === got.length &&
    want.every((n, i) => Math.abs(n - (got[i] as number)) < 1e-3)
  if (!sameCurve) problems.push(`${where}: easing ${actual.easing}, the token is ${token.easing}`)
  return problems
}
