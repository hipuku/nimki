import { springToLinear } from '@hipuku/nimki'
import { EXTENSION, TokenError, type CubicBezier, type TokenSet } from './dtcg.ts'

/** The default mode of the role tokens is Subtle; the others are named in the source. */
export const MOTION_MODES = ['subtle', 'expressive', 'reduced'] as const
export type MotionMode = (typeof MOTION_MODES)[number]

export const DENSITY_MODES = ['comfortable', 'compact'] as const
export type DensityMode = (typeof DENSITY_MODES)[number]

/** A CSS value, either a reference to a primitive's custom property or a literal. */
export interface CssValue {
  css: string
}

export interface SpringValue {
  /** The spring primitive, as "spring.snappy". */
  primitive: string
  visualDurationMs: number
  bounce: number
  /** How long the generated linear() easing runs. */
  settleMs: number
  linear: string
}

export type RoleValue =
  | {
      kind: 'tween'
      durationMs: number
      duration: CssValue
      easing: CubicBezier
      easingCss: CssValue
      /** The easing primitive, as "ease.exit". */
      easingPrimitive: string | null
      /** The duration primitive, as "duration.base". */
      durationPrimitive: string | null
      offsetPx?: number
      offset?: CssValue
      scale?: number
      scaleCss?: CssValue
    }
  | { kind: 'spring'; spring: SpringValue; duration: CssValue; easing: CssValue }
  /** A spring role under reduced motion: it jumps to the end state. */
  | { kind: 'jump'; durationMs: number }

export interface Motion {
  primitives: {
    durations: { name: string; ms: number }[]
    easings: { name: string; value: CubicBezier }[]
    springs: SpringValue[]
    offsets: { name: string; px: number }[]
    scales: { name: string; value: number }[]
    staggers: { name: string; ms: number }[]
  }
  /** Role names in source order, stagger excluded. */
  roles: string[]
  modes: Record<
    MotionMode,
    {
      roles: Record<string, RoleValue>
      stagger: { step: CssValue & { ms: number }; max: CssValue & { ms: number } }
    }
  >
  caps: Record<string, number>
  limits: { bounceMax: number; offsetMaxPx: number; scaleMin: number; reducedDurationMaxMs: number }
}

export interface Density {
  tokens: { name: string; description?: string; px: Record<DensityMode, number> }[]
  hitMinPx: number
}

/** "duration.fast" to "--nk-duration-fast". */
export function cssVar(name: string, suffix?: string): string {
  return `--nk-${name.split('.').join('-')}${suffix ? `-${suffix}` : ''}`
}

export function cubicBezierCss([x1, y1, x2, y2]: CubicBezier): string {
  return `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`
}

function numberOf(set: TokenSet, name: string, mode?: string): number {
  const { literal } = set.resolve(name, mode)
  if (typeof literal !== 'number') throw new TokenError(`${name} must resolve to a number`)
  return literal
}

function bezierOf(set: TokenSet, name: string, mode?: string): CubicBezier {
  const { literal } = set.resolve(name, mode)
  if (!Array.isArray(literal) || typeof literal[0] !== 'number') {
    throw new TokenError(`${name} must resolve to a cubic bezier`)
  }
  return literal as CubicBezier
}

function bounceOf(set: TokenSet, name: string): number | undefined {
  const bounce = set.get(name).extension.bounce
  if (bounce === undefined) return undefined
  if (typeof bounce !== 'number' || !Number.isFinite(bounce)) {
    throw new TokenError(`${name}: $extensions["${EXTENSION}"].bounce must be a number`)
  }
  return bounce
}

function springValue(set: TokenSet, name: string): SpringValue {
  const visualDurationMs = numberOf(set, name)
  const bounce = bounceOf(set, name) ?? 0
  const { durationMs, easing } = springToLinear({ visualDuration: visualDurationMs / 1000, bounce })
  return { primitive: name, visualDurationMs, bounce, settleMs: durationMs, linear: easing }
}

/** The first alias a role token follows in a mode, or null for a literal. */
function firstAlias(set: TokenSet, name: string, mode: MotionMode): string | null {
  const token = set.get(name)
  const entry = (mode === 'subtle' ? undefined : token.modes[mode]) ?? token.value
  return 'alias' in entry ? entry.alias : null
}

function cssFor(set: TokenSet, name: string, mode: MotionMode, literal: () => string): CssValue {
  const alias = firstAlias(set, name, mode)
  return { css: alias ? `var(${cssVar(alias)})` : literal() }
}

function modeArg(mode: MotionMode): string | undefined {
  return mode === 'subtle' ? undefined : mode
}

function readRole(set: TokenSet, role: string, mode: MotionMode): RoleValue {
  const base = `role.${role}`
  const props = set.under(base).map(token => token.name.slice(base.length + 1))
  const m = modeArg(mode)

  if (props.includes('spring')) {
    const resolved = set.resolve(`${base}.spring`, m)
    if (resolved.source.name.startsWith('spring.')) {
      const spring = springValue(set, resolved.source.name)
      return {
        kind: 'spring',
        spring,
        duration: { css: `var(${cssVar(spring.primitive, 'duration')})` },
        easing: { css: `var(${cssVar(spring.primitive, 'easing')})` },
      }
    }
    return { kind: 'jump', durationMs: numberOf(set, `${base}.spring`, m) }
  }

  const durationMs = numberOf(set, `${base}.duration`, m)
  const easing = bezierOf(set, `${base}.easing`, m)
  const durationSource = set.resolve(`${base}.duration`, m).source.name
  const easingSource = set.resolve(`${base}.easing`, m).source.name
  const value: RoleValue = {
    kind: 'tween',
    durationMs,
    duration: cssFor(set, `${base}.duration`, mode, () => `${durationMs}ms`),
    easing,
    easingCss: cssFor(set, `${base}.easing`, mode, () => cubicBezierCss(easing)),
    durationPrimitive: durationSource.startsWith('duration.') ? durationSource : null,
    easingPrimitive: easingSource.startsWith('ease.') ? easingSource : null,
  }
  if (props.includes('offset')) {
    const px = numberOf(set, `${base}.offset`, m)
    value.offsetPx = px
    value.offset = cssFor(set, `${base}.offset`, mode, () => `${px}px`)
  }
  if (props.includes('scale')) {
    const scale = numberOf(set, `${base}.scale`, m)
    value.scale = scale
    value.scaleCss = cssFor(set, `${base}.scale`, mode, () => String(scale))
  }
  return value
}

function staggerPart(set: TokenSet, part: 'step' | 'max', mode: MotionMode) {
  const name = `role.stagger.${part}`
  const ms = numberOf(set, name, modeArg(mode))
  return { ms, ...cssFor(set, name, mode, () => `${ms}ms`) }
}

export function readMotion(set: TokenSet): Motion {
  const names = (group: string) => set.under(group).map(token => token.name)
  const roles = [...new Set(names('role').map(name => name.split('.')[1] as string))].filter(
    role => role !== 'stagger',
  )
  const modes = {} as Motion['modes']
  for (const mode of MOTION_MODES) {
    const byRole: Record<string, RoleValue> = {}
    for (const role of roles) byRole[role] = readRole(set, role, mode)
    modes[mode] = {
      roles: byRole,
      stagger: { step: staggerPart(set, 'step', mode), max: staggerPart(set, 'max', mode) },
    }
  }
  const caps: Record<string, number> = {}
  for (const name of names('limit.cap')) caps[name.slice('limit.cap.'.length)] = numberOf(set, name)

  return {
    primitives: {
      durations: names('duration').map(name => ({ name, ms: numberOf(set, name) })),
      easings: names('ease').map(name => ({ name, value: bezierOf(set, name) })),
      springs: names('spring').map(name => springValue(set, name)),
      offsets: names('offset').map(name => ({ name, px: numberOf(set, name) })),
      scales: names('scale').map(name => ({ name, value: numberOf(set, name) })),
      staggers: names('stagger').map(name => ({ name, ms: numberOf(set, name) })),
    },
    roles,
    modes,
    caps,
    limits: {
      bounceMax: numberOf(set, 'limit.bounce-max'),
      offsetMaxPx: numberOf(set, 'limit.offset-max'),
      scaleMin: numberOf(set, 'limit.scale-min'),
      reducedDurationMaxMs: numberOf(set, 'limit.reduced-duration-max'),
    },
  }
}

export function readDensity(set: TokenSet): Density {
  return {
    tokens: set.under('density').map(token => ({
      name: token.name,
      ...(token.description === undefined ? {} : { description: token.description }),
      px: {
        comfortable: numberOf(set, token.name),
        compact: numberOf(set, token.name, 'compact'),
      },
    })),
    hitMinPx: numberOf(set, 'limit.hit-min'),
  }
}
