import { contrast, inSrgb, oklchCss } from './colour.ts'
import { TokenError, type Oklch, type TokenSet } from './dtcg.ts'

export const COLOUR_MODES = ['light', 'dark'] as const
export type ColourMode = (typeof COLOUR_MODES)[number]

/** How a derived colour is built from its base, per mode (PRD FR-V3). */
interface Recipe {
  /** An absolute OKLCH lightness, "keep" for the base's own, or an offset from it. */
  lightness: number | 'keep' | { offset: number }
  chromaMax: number
  hue: number
}

export interface ThemeColour {
  /** The token, as "color.background" or "nk.success". */
  token: string
  /** The custom property: --background, --nk-success. */
  cssVar: string
  /** The resolved colour, for contrast checks and the Figma file. */
  value: Record<ColourMode, Oklch>
  /** What the CSS writes: a var() for an alias, oklch() for a value, a relative colour for a recipe. */
  css: Record<ColourMode, string>
}

export interface Theme {
  colours: ThemeColour[]
  amounts: { token: string; cssVar: string; value: number }[]
  radiusPx: number
  fonts: { token: string; cssVar: string; families: string[] }[]
}

/** "color.background" to --background, "nk.success" to --nk-success, "font.sans" to --font-sans. */
export function themeVar(token: string): string {
  const [group, ...rest] = token.split('.')
  const name = rest.join('-')
  if (group === 'color') return `--${name}`
  return `--${group}-${name}`
}

function colourOf(set: TokenSet, name: string, mode: ColourMode): Oklch {
  // The parser only lets a color token alias another color token, so this is a colour.
  return set.resolve(name, mode === 'light' ? undefined : mode).literal as Oklch
}

function readRecipe(name: string, raw: unknown): Recipe {
  const bad = () => new TokenError(`${name}: a relative recipe needs lightness, chromaMax and hue`)
  if (typeof raw !== 'object' || raw === null) throw bad()
  const { lightness, chromaMax, hue } = raw as Record<string, unknown>
  const lightnessOk =
    typeof lightness === 'number' ||
    lightness === 'keep' ||
    (typeof lightness === 'object' &&
      lightness !== null &&
      typeof (lightness as { offset?: unknown }).offset === 'number')
  if (!lightnessOk || typeof chromaMax !== 'number' || typeof hue !== 'number') throw bad()
  return { lightness: lightness as Recipe['lightness'], chromaMax, hue }
}

function applyRecipe(base: Oklch, recipe: Recipe): Oklch {
  const l =
    recipe.lightness === 'keep'
      ? base.l
      : typeof recipe.lightness === 'number'
        ? recipe.lightness
        : base.l + recipe.lightness.offset
  return { l, c: Math.min(base.c, recipe.chromaMax), h: recipe.hue, alpha: base.alpha }
}

function recipeCss(baseVar: string, recipe: Recipe): string {
  const l =
    recipe.lightness === 'keep'
      ? 'l'
      : typeof recipe.lightness === 'number'
        ? String(recipe.lightness)
        : `calc(l + ${recipe.lightness.offset})`
  return `oklch(from var(${baseVar}) ${l} min(c, ${recipe.chromaMax}) ${recipe.hue})`
}

function readColour(set: TokenSet, name: string): ThemeColour {
  const token = set.get(name)
  const relative = token.extension.relative
  const value = {} as Record<ColourMode, Oklch>
  const css = {} as Record<ColourMode, string>
  for (const mode of COLOUR_MODES) {
    const entry = (mode === 'light' ? undefined : token.modes[mode]) ?? token.value
    const alias = 'alias' in entry ? entry.alias : null
    if (relative !== undefined) {
      if (!alias) throw new TokenError(`${name}: a relative colour must alias its base`)
      const recipe = readRecipe(name, (relative as Record<string, unknown>)[mode])
      value[mode] = applyRecipe(colourOf(set, alias, mode), recipe)
      css[mode] = recipeCss(themeVar(alias), recipe)
    } else {
      value[mode] = colourOf(set, name, mode)
      css[mode] = alias ? `var(${themeVar(alias)})` : oklchCss(value[mode])
    }
  }
  return { token: name, cssVar: themeVar(name), value, css }
}

export function readTheme(set: TokenSet): Theme {
  const colourNames = [...set.under('color'), ...set.under('nk')]
    .filter(token => token.type === 'color')
    .map(token => token.name)
  const radius = set.resolve('radius').literal
  if (typeof radius !== 'number') throw new TokenError('radius must resolve to a dimension')
  return {
    colours: colourNames.map(name => readColour(set, name)),
    amounts: set
      .under('nk')
      .filter(token => token.type === 'number')
      .map(token => {
        const { literal } = set.resolve(token.name)
        return { token: token.name, cssVar: themeVar(token.name), value: literal as number }
      }),
    radiusPx: radius,
    fonts: set.under('font').map(token => ({
      token: token.name,
      cssVar: themeVar(token.name),
      families: set.resolve(token.name).literal as string[],
    })),
  }
}

/** Text pairs that must reach 4.5:1 in both modes (FR-V9), as [text, surface]. */
export const TEXT_PAIRS: [string, string][] = [
  ['color.foreground', 'color.background'],
  ['color.card-foreground', 'color.card'],
  ['color.popover-foreground', 'color.popover'],
  ['color.primary-foreground', 'color.primary'],
  ['color.secondary-foreground', 'color.secondary'],
  ['color.accent-foreground', 'color.accent'],
  ['color.muted-foreground', 'color.background'],
  ['color.muted-foreground', 'color.muted'],
  ['nk.highlight-foreground', 'nk.highlight'],
  ...['color.destructive', 'nk.success', 'nk.warning'].flatMap(text =>
    ['color.background', 'color.card', 'color.popover'].map((surface): [string, string] => [
      text,
      surface,
    ]),
  ),
]

/** Pairs that must reach 3:1, for focus indicators (FR-V9, FR-V10). */
export const UI_PAIRS: [string, string][] = [['color.ring', 'color.background']]

/** Source shape for the theme: colour tokens carry exactly the dark mode, unless they alias. */
export function checkThemeShape(set: TokenSet): string[] {
  const problems: string[] = []
  for (const token of [...set.under('color'), ...set.under('nk')]) {
    if (token.type !== 'color') continue
    const modes = Object.keys(token.modes).join(', ')
    const relative = token.extension.relative !== undefined
    if ('alias' in token.value) {
      if (modes) problems.push(`${token.name} aliases a colour, so it takes no modes`)
      if (relative) {
        for (const mode of COLOUR_MODES) {
          if ((token.extension.relative as Record<string, unknown>)[mode] === undefined) {
            problems.push(`${token.name} has no ${mode} recipe`)
          }
        }
      }
    } else {
      if (relative) problems.push(`${token.name} has a recipe but no base to apply it to`)
      if (modes !== 'dark') problems.push(`${token.name} has modes [${modes}]; it needs [dark]`)
    }
  }
  return problems
}

export function checkTheme(theme: Theme): string[] {
  const problems: string[] = []
  const byToken = new Map(theme.colours.map(colour => [colour.token, colour]))
  for (const mode of COLOUR_MODES) {
    for (const colour of theme.colours) {
      if (colour.value[mode].alpha === 1 && !inSrgb(colour.value[mode])) {
        problems.push(`${colour.token} (${mode}): ${oklchCss(colour.value[mode])} is outside sRGB`)
      }
    }
    for (const [pairs, floor] of [
      [TEXT_PAIRS, 4.5],
      [UI_PAIRS, 3],
    ] as const) {
      for (const [text, surface] of pairs) {
        const a = byToken.get(text)?.value[mode]
        const b = byToken.get(surface)?.value[mode]
        if (!a || !b) {
          problems.push(`${text} on ${surface}: one of them is missing`)
          continue
        }
        const ratio = contrast(a, b)
        if (ratio < floor) {
          problems.push(
            `${text} on ${surface} (${mode}): ${ratio.toFixed(2)}:1 is under ${floor}:1`,
          )
        }
      }
    }
  }
  for (const amount of theme.amounts) {
    if (amount.value <= 0 || amount.value >= 1) {
      problems.push(`${amount.token}: ${amount.value} must be between 0 and 1`)
    }
  }
  return problems
}

/** A font family list as CSS: names with spaces quoted, generic families as written. */
export function fontCss(families: string[]): string {
  return families.map(name => (/\s/.test(name) ? `"${name}"` : name)).join(', ')
}
