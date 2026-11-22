/**
 * A parser for the part of DTCG 2025.10 that nimki's token source uses (PRD
 * FR-M5): groups, inherited $type, $value, $description, $extensions and
 * aliases written as "{group.token}". Anything else in the format is refused
 * by name rather than ignored, so a feature added to the source without parser
 * support fails the build instead of producing wrong output.
 *
 * Modes live in $extensions["dev.hipuku.nimki"].modes, keyed by mode name; the
 * token's $value is its default mode.
 */

export const EXTENSION = 'dev.hipuku.nimki'

export type TokenType =
  | 'duration'
  | 'cubicBezier'
  | 'number'
  | 'dimension'
  | 'color'
  | 'fontFamily'
  | 'shadow'
  | 'typography'
const TYPES: readonly TokenType[] = [
  'duration',
  'cubicBezier',
  'number',
  'dimension',
  'color',
  'fontFamily',
  'shadow',
  'typography',
]

export type CubicBezier = [number, number, number, number]

/** An OKLCH colour, the only colour space the source uses. */
export interface Oklch {
  l: number
  c: number
  h: number
  alpha: number
}

/**
 * A literal value after units are normalised: durations in ms, dimensions in
 * px, colours as OKLCH, font families as a list of names.
 */
export type Literal = number | CubicBezier | Oklch | string[] | ShadowLayer[] | Typography

/**
 * A text style, DTCG's typography composite: size and letter spacing in px,
 * line height as a multiple of the size. The family is an alias of a
 * fontFamily token or the names themselves.
 */
export interface Typography {
  fontFamily: { alias: string } | string[]
  fontWeight: number
  fontSize: number
  lineHeight: number
  letterSpacing: number
}

/** One layer of a shadow. Its colour is a value or an alias of a color token. */
export interface ShadowLayer {
  color: Oklch | { alias: string }
  x: number
  y: number
  blur: number
  spread: number
  inset: boolean
}

export interface Token {
  /** Dot path, as an alias writes it: "duration.fast". */
  name: string
  type: TokenType
  description?: string
  /** The $value: an alias name or a literal. */
  value: Entry
  /** Values for other modes, from the extension. */
  modes: Record<string, Entry>
  /** Everything in the extension except modes. */
  extension: Record<string, unknown>
  /** The source file, for error messages. */
  file: string
}

export type Entry = { alias: string } | { literal: Literal }

const SUPPORTED_KEYS = new Set(['$type', '$value', '$description', '$extensions'])
const SEGMENT = /^[a-z0-9]+(-[a-z0-9]+)*$/
const ALIAS = /^\{([a-z0-9-]+(?:\.[a-z0-9-]+)*)\}$/

export class TokenError extends Error {
  override name = 'TokenError'
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readEntry(raw: unknown, type: TokenType, where: string): Entry {
  // A font family may be written as one name; anything else in a string is an alias.
  if (typeof raw === 'string' && !(type === 'fontFamily' && !raw.startsWith('{'))) {
    const match = ALIAS.exec(raw)
    if (!match?.[1])
      throw new TokenError(`${where}: "${raw}" is not an alias of the form {group.token}`)
    return { alias: match[1] }
  }
  return { literal: readLiteral(raw, type, where) }
}

function readLiteral(raw: unknown, type: TokenType, where: string): Literal {
  switch (type) {
    case 'color': {
      if (
        isObject(raw) &&
        raw.colorSpace === 'oklch' &&
        Array.isArray(raw.components) &&
        raw.components.length === 3 &&
        raw.components.every(n => typeof n === 'number' && Number.isFinite(n)) &&
        (raw.alpha === undefined ||
          (typeof raw.alpha === 'number' && raw.alpha >= 0 && raw.alpha <= 1))
      ) {
        const [l, c, h] = raw.components as [number, number, number]
        if (l < 0 || l > 1 || c < 0)
          throw new TokenError(`${where}: OKLCH lightness is 0 to 1 and chroma is not negative`)
        return { l, c, h, alpha: raw.alpha ?? 1 }
      }
      throw new TokenError(
        `${where}: a color token needs { colorSpace: "oklch", components: [l, c, h], alpha? }`,
      )
    }
    case 'shadow': {
      const layers: unknown[] = Array.isArray(raw) ? raw : [raw]
      if (layers.length === 0) throw new TokenError(`${where}: a shadow needs at least one layer`)
      return layers.map((layer, i) => {
        const at = `${where} (layer ${i + 1})`
        if (!isObject(layer)) throw new TokenError(`${at}: a shadow layer must be an object`)
        const px = (key: string) => readLiteral(layer[key], 'dimension', `${at} ${key}`) as number
        const color: ShadowLayer['color'] =
          typeof layer.color === 'string'
            ? (readEntry(layer.color, 'color', `${at} color`) as { alias: string })
            : (readLiteral(layer.color, 'color', `${at} color`) as Oklch)
        if (layer.inset !== undefined && typeof layer.inset !== 'boolean') {
          throw new TokenError(`${at}: inset must be true or false`)
        }
        return {
          color,
          x: px('offsetX'),
          y: px('offsetY'),
          blur: px('blur'),
          spread: px('spread'),
          inset: layer.inset === true,
        }
      })
    }
    case 'typography': {
      if (!isObject(raw)) throw new TokenError(`${where}: a typography token needs an object`)
      const fontFamily = readEntry(raw.fontFamily, 'fontFamily', `${where} fontFamily`)
      const { fontWeight, lineHeight } = raw
      if (
        typeof fontWeight !== 'number' ||
        !Number.isInteger(fontWeight) ||
        fontWeight < 1 ||
        fontWeight > 1000
      ) {
        throw new TokenError(`${where}: fontWeight must be a whole number from 1 to 1000`)
      }
      if (typeof lineHeight !== 'number' || !Number.isFinite(lineHeight) || lineHeight <= 0) {
        throw new TokenError(
          `${where}: lineHeight must be a positive number, a multiple of the size`,
        )
      }
      return {
        fontFamily: 'alias' in fontFamily ? fontFamily : (fontFamily.literal as string[]),
        fontWeight,
        fontSize: readLiteral(raw.fontSize, 'dimension', `${where} fontSize`) as number,
        lineHeight,
        letterSpacing: readLiteral(
          raw.letterSpacing,
          'dimension',
          `${where} letterSpacing`,
        ) as number,
      }
    }
    case 'fontFamily': {
      const names = typeof raw === 'string' ? [raw] : raw
      if (
        Array.isArray(names) &&
        names.length > 0 &&
        names.every(n => typeof n === 'string' && n.length > 0)
      ) {
        return names as string[]
      }
      throw new TokenError(`${where}: a fontFamily token needs a name or a list of names`)
    }
    case 'number':
      if (typeof raw === 'number' && Number.isFinite(raw)) return raw
      throw new TokenError(`${where}: a number token needs a finite number`)
    case 'cubicBezier': {
      if (
        Array.isArray(raw) &&
        raw.length === 4 &&
        raw.every(n => typeof n === 'number' && Number.isFinite(n))
      ) {
        const [x1, y1, x2, y2] = raw as CubicBezier
        if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) {
          throw new TokenError(`${where}: cubic-bezier x values must be between 0 and 1`)
        }
        return [x1, y1, x2, y2]
      }
      throw new TokenError(`${where}: a cubicBezier token needs four numbers`)
    }
    case 'duration':
    case 'dimension': {
      const units = type === 'duration' ? { ms: 1, s: 1000 } : { px: 1, rem: 16 }
      if (isObject(raw) && typeof raw.value === 'number' && Number.isFinite(raw.value)) {
        const table: Record<string, number | undefined> = units
        const factor = typeof raw.unit === 'string' ? table[raw.unit] : undefined
        if (factor !== undefined) return raw.value * factor
      }
      const names = Object.keys(units).join(' or ')
      throw new TokenError(`${where}: a ${type} token needs { value, unit } with unit ${names}`)
    }
  }
}

function walk(
  node: Record<string, unknown>,
  path: string[],
  inheritedType: TokenType | undefined,
  file: string,
  out: Token[],
): void {
  const where = `${file}: ${path.join('.') || '(root)'}`
  for (const key of Object.keys(node)) {
    if (key.startsWith('$') && !SUPPORTED_KEYS.has(key)) {
      throw new TokenError(`${where}: ${key} is not supported by this parser`)
    }
  }

  let type = inheritedType
  if (node.$type !== undefined) {
    if (!TYPES.includes(node.$type as TokenType)) {
      throw new TokenError(`${where}: $type ${JSON.stringify(node.$type)} is not supported`)
    }
    type = node.$type as TokenType
  }
  const description = typeof node.$description === 'string' ? node.$description : undefined

  if ('$value' in node) {
    if (path.length === 0) throw new TokenError(`${where}: the root cannot be a token`)
    if (!type) throw new TokenError(`${where}: no $type on the token or any group above it`)
    const extensionRoot = node.$extensions
    if (extensionRoot !== undefined && !isObject(extensionRoot)) {
      throw new TokenError(`${where}: $extensions must be an object`)
    }
    const ours = extensionRoot?.[EXTENSION]
    if (ours !== undefined && !isObject(ours)) {
      throw new TokenError(`${where}: $extensions["${EXTENSION}"] must be an object`)
    }
    const { modes: rawModes, ...extension } = ours ?? {}
    const modes: Record<string, Entry> = {}
    if (rawModes !== undefined) {
      if (!isObject(rawModes)) throw new TokenError(`${where}: modes must be an object`)
      for (const [mode, raw] of Object.entries(rawModes)) {
        modes[mode] = readEntry(raw, type, `${where} (mode ${mode})`)
      }
    }
    for (const key of Object.keys(node)) {
      if (!key.startsWith('$')) throw new TokenError(`${where}: a token cannot hold "${key}"`)
    }
    out.push({
      name: path.join('.'),
      type,
      ...(description === undefined ? {} : { description }),
      value: readEntry(node.$value, type, where),
      modes,
      extension,
      file,
    })
    return
  }

  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith('$')) continue
    if (!SEGMENT.test(key)) {
      throw new TokenError(`${where}: "${key}" must be lowercase letters, digits and hyphens`)
    }
    if (!isObject(child)) throw new TokenError(`${where}.${key}: must be a group or a token`)
    walk(child, [...path, key], type, file, out)
  }
}

/** Reads one DTCG document into a flat list of tokens, in source order. */
export function parseDocument(document: unknown, file: string): Token[] {
  if (!isObject(document)) throw new TokenError(`${file}: the document must be an object`)
  const out: Token[] = []
  walk(document, [], undefined, file, out)
  return out
}

/** A resolved value, with the alias chain that led to it. */
export interface Resolved {
  literal: Literal
  /** The token that holds the literal. */
  source: Token
  /** Names followed from the starting token, in order; empty for a literal. */
  via: string[]
}

export class TokenSet {
  readonly tokens: ReadonlyMap<string, Token>

  constructor(tokens: Token[]) {
    const map = new Map<string, Token>()
    for (const token of tokens) {
      const existing = map.get(token.name)
      if (existing) {
        throw new TokenError(`${token.name} is defined in both ${existing.file} and ${token.file}`)
      }
      map.set(token.name, token)
    }
    // A token and a group cannot share a name: "a.b" and "a.b.c" together
    // would make "a.b" both a value and a container.
    for (const name of map.keys()) {
      const parts = name.split('.')
      for (let i = 1; i < parts.length; i++) {
        const prefix = parts.slice(0, i).join('.')
        if (map.has(prefix)) throw new TokenError(`${prefix} is both a token and a group`)
      }
    }
    this.tokens = map
    for (const token of map.values()) {
      this.resolve(token.name)
      for (const mode of Object.keys(token.modes)) this.resolve(token.name, mode)
    }
  }

  get(name: string): Token {
    const token = this.tokens.get(name)
    if (!token) throw new TokenError(`no token named ${name}`)
    return token
  }

  /** Tokens whose names start with the group's path, in source order. */
  under(group: string): Token[] {
    return [...this.tokens.values()].filter(token => token.name.startsWith(`${group}.`))
  }

  /**
   * Follows aliases to a literal. In a mode, each token on the way uses its
   * value for that mode if it has one, and its default value if not.
   */
  resolve(name: string, mode?: string): Resolved {
    const via: string[] = []
    let token = this.get(name)
    for (;;) {
      const entry = (mode === undefined ? undefined : token.modes[mode]) ?? token.value
      if ('literal' in entry) return { literal: entry.literal, source: token, via }
      if (via.includes(entry.alias) || entry.alias === name) {
        throw new TokenError(
          `${name}: alias cycle through ${[name, ...via, entry.alias].join(' > ')}`,
        )
      }
      const target = this.tokens.get(entry.alias)
      if (!target) throw new TokenError(`${token.name}: alias {${entry.alias}} has no target`)
      if (target.type !== token.type) {
        throw new TokenError(
          `${token.name}: a ${token.type} token cannot alias {${entry.alias}}, which is ${target.type}`,
        )
      }
      via.push(entry.alias)
      token = target
    }
  }
}
