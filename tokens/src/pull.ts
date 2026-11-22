/* eslint-disable @typescript-eslint/no-unsafe-member-access --
   pull edits the raw DTCG source documents in place, which have no static type. */
/**
 * figma:pull (master plan step 1.4c): a deliberate change made in Figma,
 * written back into tokens/source, so code stays the record and the token
 * rules check it. Values set directly in the source are written; values the
 * source works out (state colours, success and warning, motion roles) are
 * reported with the setting to change instead.
 */
import { fromSrgb } from './colour.ts'
import { close, type Snapshot } from './figma.ts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>

export type SourceFile = 'colour' | 'motion' | 'density'

type Kind =
  | 'duration'
  | 'easing'
  | 'springDuration'
  | 'springBounce'
  | 'dimension'
  | 'number'
  | 'amount'
  | 'font'
  | 'colour'

interface Location {
  file: SourceFile
  path: string[]
  kind: Kind
}

/** Where a Figma variable lives in tokens/source, or null for one the source derives. */
export function locate(name: string, collection: string): Location | null {
  const parts = name.split('/')
  const [first, second, third] = parts
  if (collection === 'nimki/primitives') {
    if (first === 'duration' && second)
      return { file: 'motion', path: ['duration', second], kind: 'duration' }
    if (first === 'ease' && second)
      return { file: 'motion', path: ['ease', second], kind: 'easing' }
    if (first === 'spring' && second && third === 'duration') {
      return { file: 'motion', path: ['spring', second], kind: 'springDuration' }
    }
    if (first === 'spring' && second && third === 'easing') {
      return { file: 'motion', path: ['spring', second], kind: 'springBounce' }
    }
    if (first === 'offset' && second)
      return { file: 'motion', path: ['offset', second], kind: 'dimension' }
    if (first === 'scale' && second)
      return { file: 'motion', path: ['scale', second], kind: 'number' }
    if (first === 'stagger' && second && third) {
      return { file: 'motion', path: ['stagger', second, third], kind: 'duration' }
    }
    return null
  }
  if (collection === 'nimki/density')
    return { file: 'density', path: ['density', name], kind: 'dimension' }
  if (collection === 'nimki/colour') {
    if (first === 'ramp') return { file: 'colour', path: parts, kind: 'colour' }
    if (first === 'nk')
      return { file: 'colour', path: ['nk', parts.slice(1).join('/')], kind: 'colour' }
    return { file: 'colour', path: ['color', name], kind: 'colour' }
  }
  if (collection === 'nimki/theme') {
    if (name === 'radius') return { file: 'colour', path: ['radius'], kind: 'dimension' }
    if (first === 'font' && second) return { file: 'colour', path: ['font', second], kind: 'font' }
    if (first === 'nk' && second) return { file: 'colour', path: ['nk', second], kind: 'amount' }
  }
  return null
}

/** The mode's key in the source: null for the token's own value, else its extension mode. */
const MODE_KEYS: Record<string, string | null> = {
  Value: null,
  Linear: null,
  Light: null,
  Comfortable: null,
  Dark: 'dark',
  Compact: 'compact',
}

const round = (n: number, places: number) => Number(n.toFixed(places))

function tokenAt(source: Json, path: string[]): Json | undefined {
  let node: Json | undefined = source
  for (const key of path) node = node?.[key] as Json | undefined
  return node && typeof node === 'object' && '$value' in node ? node : undefined
}

const ext = (token: Json): Json => (token.$extensions?.['dev.hipuku.nimki'] ?? {}) as Json

function colourValue(value: unknown): Json | null {
  if (!Array.isArray(value) || value.length !== 4) return null
  const [r, g, b, a] = value as number[]
  const o = fromSrgb(r as number, g as number, b as number, a)
  return {
    colorSpace: 'oklch',
    components: [round(o.l, 3), round(o.c, 3), round(o.h, 1)],
    ...(a === 1 ? {} : { alpha: round(a as number, 3) }),
  }
}

/** A variable's Figma name back to its token name, for aliases. */
function tokenName(figmaName: string, collection: string): string | null {
  const at = locate(figmaName, collection)
  return at ? at.path.join('.') : null
}

export interface PullPlan {
  /** What was written, one line each. */
  written: string[]
  /** What could not be written, with the setting to change. */
  manual: string[]
}

/**
 * Writes every value Figma holds that differs from code into the source
 * documents, in place, and says what it did. `expected` is code's snapshot
 * (from the generated file), `actual` Figma's.
 */
export function pull(
  expected: Snapshot,
  actual: Snapshot,
  sources: Record<SourceFile, Json>,
): PullPlan {
  const written: string[] = []
  const manual: string[] = []
  for (const [name, figma] of Object.entries(actual.variables)) {
    const want = expected.variables[name]
    if (!want) {
      manual.push(
        `${name}: in Figma but not in code. Add it to tokens/source, or remove it from Figma with figma:sync --apply`,
      )
      continue
    }
    const modes = Object.keys(figma.values).filter(
      mode => !close(figma.values[mode], want.values[mode]),
    )
    if (modes.length === 0) continue
    const at = locate(name, figma.collection)
    if (!at) {
      manual.push(
        `${name} (${modes.join(', ')}): a motion role, set per theme under role in tokens/source/motion.tokens.json`,
      )
      continue
    }
    const source = sources[at.file]
    const token = tokenAt(source, at.path)
    if (!token) {
      manual.push(
        `${name}: no token at ${at.path.join('.')} in tokens/source/${at.file}.tokens.json`,
      )
      continue
    }
    const where = `tokens/source/${at.file}.tokens.json ${at.path.join('.')}`
    if (at.kind === 'colour') {
      if (ext(token).relative || ext(token).mix) {
        manual.push(
          `${name}: derived from another colour in code (a recipe in ${where}); change the recipe or its base, not the result`,
        )
        continue
      }
      const light = figma.values.Light
      const dark = figma.values.Dark
      const isAlias = (v: unknown): v is { alias: string } =>
        !!v && typeof v === 'object' && 'alias' in v
      if (isAlias(light) && isAlias(dark) && light.alias === dark.alias) {
        const target = tokenName(light.alias, figma.collection)
        token.$value = `{${target}}`
        delete token.$extensions?.['dev.hipuku.nimki']?.modes
        written.push(`${where}: now {${target}}`)
        continue
      }
      if (typeof token.$value === 'string') {
        manual.push(
          `${name}: points at ${token.$value} in code but holds a value in Figma; change that variable instead, or point ${name} at another one`,
        )
        continue
      }
      const l = colourValue(light)
      const d = colourValue(dark)
      if (!l || !d) {
        manual.push(
          `${name}: Light and Dark point at different variables, or one is an alias; the source takes one alias for both modes or a value per mode`,
        )
        continue
      }
      token.$value = l
      token.$extensions ??= {}
      token.$extensions['dev.hipuku.nimki'] ??= {}
      token.$extensions['dev.hipuku.nimki'].modes = { dark: d }
      written.push(
        `${where}: light ${JSON.stringify(l.components)}, dark ${JSON.stringify(d.components)}`,
      )
      continue
    }
    for (const mode of modes) {
      const key = MODE_KEYS[mode]
      if (key === undefined) {
        manual.push(`${name} (${mode}): a mode the source does not have`)
        continue
      }
      const value = figma.values[mode]
      let next: unknown
      if (at.kind === 'duration' || at.kind === 'springDuration')
        next = { value: Math.round((value as number) * 1000), unit: 'ms' }
      else if (at.kind === 'dimension') next = { value: round(value as number, 3), unit: 'px' }
      else if (at.kind === 'number') next = round(value as number, 3)
      else if (at.kind === 'amount') next = round((value as number) / 100, 4)
      else if (at.kind === 'font') next = [value as string, ...(token.$value as string[]).slice(1)]
      else if (at.kind === 'easing') {
        const curve = (value as Json | null)?.easingFunctionCubicBezier as Json | undefined
        if (!curve) {
          manual.push(
            `${name}: not a cubic Bézier in Figma; the source takes [x1, y1, x2, y2] at ${where}`,
          )
          continue
        }
        next = [curve.x1, curve.y1, curve.x2, curve.y2].map(n => round(n as number, 3))
      } else {
        const bounce = (value as Json | null)?.easingFunctionSpring?.bounce as number | undefined
        if (bounce === undefined) {
          manual.push(`${name}: not a spring in Figma; set the bounce at ${where}`)
          continue
        }
        token.$extensions ??= {}
        token.$extensions['dev.hipuku.nimki'] ??= {}
        token.$extensions['dev.hipuku.nimki'].bounce = round(bounce, 3)
        written.push(`${where}: bounce ${round(bounce, 3)}`)
        continue
      }
      if (key === null) token.$value = next
      else {
        const modesNode = ext(token).modes as Json | undefined
        if (!modesNode) {
          manual.push(`${name} (${mode}): ${where} has no ${key} mode to write`)
          continue
        }
        modesNode[key] = next
      }
      written.push(`${where}${key ? ` (${key})` : ''}: ${JSON.stringify(next)}`)
    }
  }
  for (const name of Object.keys(expected.variables)) {
    if (!actual.variables[name]) {
      manual.push(
        `${name}: in code but missing from Figma. Run figma:sync --apply, or remove it from tokens/source`,
      )
    }
  }
  for (const [name, layers] of Object.entries(actual.effectStyles)) {
    if (!close(layers, expected.effectStyles[name])) {
      manual.push(
        `effect style ${name}: differs from code; shadows are set in nk.elevation-1 and -2 in tokens/source/colour.tokens.json`,
      )
    }
  }
  return { written, manual }
}
