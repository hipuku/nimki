/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment --
   pull edits the raw DTCG source documents in place, which have no static type. */
/**
 * figma:pull (master plan step 1.4c): a deliberate change made in Figma,
 * written back into tokens/source, so code stays the record and the token
 * rules check it. Values set directly in the source are written; values the
 * source works out (state colours, success and warning, motion roles) are
 * reported with the setting to change instead.
 */
import { applyEdits, findNodeAtLocation, getNodeValue, modify, parseTree } from 'jsonc-parser'
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

/**
 * A colour read back from Figma, keeping the source's own chroma and hue where
 * the difference is rounding: Figma holds three decimals of sRGB, which at low
 * chroma moves the hue by a degree or two.
 */
function settle(next: Json | null, previous: Json | undefined): Json | null {
  if (!next || !previous || !Array.isArray(previous.components)) return next
  const [l, c, h] = next.components as [number, number, number]
  const [, c0, h0] = previous.components as [number, number, number]
  const turn = Math.abs(((h - h0 + 540) % 360) - 180)
  return {
    ...next,
    components: [l, Math.abs(c - c0) <= 0.002 ? c0 : c, turn <= 3 || c < 0.002 ? h0 : h],
  }
}

/** A variable's Figma name back to its token name, for aliases. */
function tokenName(figmaName: string, collection: string): string | null {
  const at = locate(figmaName, collection)
  return at ? at.path.join('.') : null
}

/** One change to a source file: the JSON path inside it and the new value (undefined removes it). */
export interface Edit {
  file: SourceFile
  path: string[]
  value: unknown
}

/**
 * Applies edits to a source file's text in place, so everything else in it
 * (layout, key order, hand-tidied one-line objects) stays exactly as it was.
 */
export function applyToText(text: string, edits: Edit[]): string {
  let out = text
  for (const edit of edits) {
    for (const [path, value] of leaves(out, edit.path, edit.value)) {
      out = applyEdits(
        out,
        modify(out, path, value, { formattingOptions: { insertSpaces: true, tabSize: 2 } }),
      )
    }
  }
  return out
}

/**
 * Splits a change to an object into changes to the keys that differ, so
 * writing { value: 420, unit: 'ms' } over { value: 400, unit: 'ms' } edits
 * one number and leaves a one-line object on one line.
 */
function leaves(text: string, path: string[], value: unknown): [string[], unknown][] {
  const root = parseTree(text)
  const node = root && findNodeAtLocation(root, path)
  const plain = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v)
  if (!node || node.type !== 'object' || !plain(value)) return [[path, value]]
  const current: unknown = getNodeValue(node)
  if (!plain(current)) return [[path, value]]
  const keys = new Set([...Object.keys(current), ...Object.keys(value)])
  return [...keys].flatMap(key =>
    JSON.stringify(current[key]) === JSON.stringify(value[key])
      ? []
      : leaves(text, [...path, key], value[key]),
  )
}

export interface PullPlan {
  /** What was written, one line each. */
  written: string[]
  /** What could not be written, with the setting to change. */
  manual: string[]
  /** The changes, for applyToText. */
  edits: Edit[]
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
  const edits: Edit[] = []
  const NK = 'dev.hipuku.nimki'
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
        edits.push({ file: at.file, path: [...at.path, '$value'], value: `{${target}}` })
        if (token.$extensions?.[NK]?.modes) {
          delete token.$extensions[NK].modes
          edits.push({
            file: at.file,
            path: [...at.path, '$extensions', NK, 'modes'],
            value: undefined,
          })
        }
        written.push(`${where}: now {${target}}`)
        continue
      }
      if (typeof token.$value === 'string') {
        manual.push(
          `${name}: points at ${token.$value} in code but holds a value in Figma; change that variable instead, or point ${name} at another one`,
        )
        continue
      }
      const darkModes = (ext(token).modes ?? {}) as Json
      // Only a mode Figma changed is rewritten, and it keeps the source's hue
      // and chroma when they moved less than Figma's 3-decimal sRGB can show.
      const l = modes.includes('Light')
        ? settle(colourValue(light), token.$value as Json)
        : token.$value
      const d = modes.includes('Dark')
        ? settle(colourValue(dark), darkModes.dark as Json)
        : darkModes.dark
      if (!l || !d) {
        manual.push(
          `${name}: Light and Dark point at different variables, or one is an alias; the source takes one alias for both modes or a value per mode`,
        )
        continue
      }
      if (modes.includes('Light')) {
        token.$value = l
        edits.push({ file: at.file, path: [...at.path, '$value'], value: l })
      }
      if (modes.includes('Dark')) {
        token.$extensions ??= {}
        token.$extensions[NK] ??= {}
        token.$extensions[NK].modes = { ...(token.$extensions[NK].modes ?? {}), dark: d }
        edits.push({
          file: at.file,
          path: [...at.path, '$extensions', NK, 'modes', 'dark'],
          value: d,
        })
      }
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
        edits.push({
          file: at.file,
          path: [...at.path, '$extensions', NK, 'bounce'],
          value: round(bounce, 3),
        })
        written.push(`${where}: bounce ${round(bounce, 3)}`)
        continue
      }
      if (key === null) {
        token.$value = next
        edits.push({ file: at.file, path: [...at.path, '$value'], value: next })
      } else {
        const modesNode = ext(token).modes as Json | undefined
        if (!modesNode) {
          manual.push(`${name} (${mode}): ${where} has no ${key} mode to write`)
          continue
        }
        modesNode[key] = next
        edits.push({
          file: at.file,
          path: [...at.path, '$extensions', NK, 'modes', key],
          value: next,
        })
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
  return { written, manual, edits }
}
