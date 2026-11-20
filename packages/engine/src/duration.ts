/**
 * Upper limits on transition duration, per motion role (PRD decision 7).
 * Both motion themes stay under these. The values are starting values and are
 * expected to be tuned once the v0 components exist.
 */
export const DURATION_CAPS_MS = {
  press: 200,
  highlight: 200,
  'small-overlay': 300,
  dialog: 400,
  sheet: 450,
  layout: 450,
} as const satisfies Record<string, number>

export type MotionRole = keyof typeof DURATION_CAPS_MS

/**
 * Clamps a duration to the range 0 to the role's cap. A value that is not a
 * finite number returns 0, so a bad token produces no animation rather than an
 * unbounded one.
 */
export function capDuration(role: MotionRole, ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return 0
  return Math.min(ms, DURATION_CAPS_MS[role])
}
