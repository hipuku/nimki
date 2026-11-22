/**
 * Tailwind's fixed scales as nimki's tokens (tokens/source/layout.tokens.json):
 * the spacing steps, the radius steps shadcn's theme derives from --radius,
 * and the text styles. Code emits no CSS for spacing or text, since Tailwind
 * already defines them; the generator writes them as Figma variables and text
 * styles so a component's gaps, padding, corners and text can be bound there,
 * and these rules keep each one equal to what the Tailwind class produces.
 */
import type { TokenSet, Typography } from './dtcg.ts'
import type { Theme } from './theme.ts'

/** Tailwind's --spacing: one step of the spacing scale, in px. nimki does not change it. */
export const TAILWIND_SPACING_PX = 4

/** Tailwind's text sizes: font size and line height in px. */
export const TAILWIND_TEXT: Readonly<Record<string, readonly [number, number]>> = {
  xs: [12, 16],
  sm: [14, 20],
  base: [16, 24],
  lg: [18, 28],
  xl: [20, 28],
  '2xl': [24, 32],
  '3xl': [30, 36],
  '4xl': [36, 40],
  '5xl': [48, 48],
  '6xl': [60, 60],
}

/** Tailwind's font weight classes. */
export const TAILWIND_WEIGHT: Readonly<Record<string, number>> = {
  thin: 100,
  extralight: 200,
  light: 300,
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
  black: 900,
}

/**
 * The radius steps shadcn's theme derives from --radius, as offsets in px.
 * tailwind.css writes them as calc(); Figma, which cannot calculate, gets the
 * resolved values.
 */
export const RADIUS_STEPS: readonly (readonly [string, number])[] = [
  ['sm', -4],
  ['md', -2],
  ['lg', 0],
  ['xl', 4],
]

/** The style name Figma gives each weight of the fonts nimki uses. */
export const FONT_STYLE: Readonly<Record<number, string>> = {
  100: 'Thin',
  200: 'ExtraLight',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'SemiBold',
  700: 'Bold',
  800: 'ExtraBold',
  900: 'Black',
}

export interface SpacingStep {
  token: string
  /** The name after spacing., as Figma also uses it: 1-5, since Figma refuses a dot in a name. */
  key: string
  /** The Tailwind step, as a class writes it: 1.5 in p-1.5. */
  step: number
  px: number
}

export interface RadiusStep {
  /** As Tailwind names it: radius-sm. */
  name: string
  offset: number
  px: number
}

export interface TextStyle {
  token: string
  /** Figma's name: text/sm-medium. */
  name: string
  /** The fontFamily token the style uses: font.sans. */
  familyToken: string
  /** Its first family, the one Figma uses. */
  family: string
  weight: number
  sizePx: number
  lineHeightPx: number
  letterSpacingPx: number
  /** The Tailwind classes the style stands for. */
  tailwind: string
}

export interface Layout {
  spacing: SpacingStep[]
  radii: RadiusStep[]
  textStyles: TextStyle[]
}

const round = (n: number) => Math.round(n * 100) / 100

/** Source shape: every spacing step is a dimension, every text style aliases a font and names its classes. */
export function checkLayoutShape(set: TokenSet): string[] {
  const problems: string[] = []
  for (const token of set.under('spacing')) {
    if (token.type !== 'dimension') problems.push(`${token.name} must be a dimension`)
    if (Object.keys(token.modes).length > 0) problems.push(`${token.name} takes no modes`)
  }
  for (const token of set.under('text-style')) {
    if (token.type !== 'typography') {
      problems.push(`${token.name} must be a typography token`)
      continue
    }
    if (Object.keys(token.modes).length > 0) problems.push(`${token.name} takes no modes`)
    if (!('literal' in token.value)) {
      problems.push(`${token.name} must hold its value, not alias another style`)
      continue
    }
    const family = (token.value.literal as Typography).fontFamily
    if (!('alias' in family)) {
      problems.push(
        `${token.name}: fontFamily must alias a font token, so Figma binds the variable`,
      )
    } else if (set.tokens.get(family.alias)?.type !== 'fontFamily') {
      problems.push(`${token.name}: {${family.alias}} is not a fontFamily token`)
    }
    if (typeof token.extension.tailwind !== 'string') {
      problems.push(`${token.name} has no tailwind classes in its extension`)
    }
  }
  return problems
}

/** Reads the layout tokens. Expects checkLayoutShape to have passed. */
export function readLayout(set: TokenSet, theme: Theme): Layout {
  // Sorted by step: JSON puts integer keys such as "2" ahead of "1-5".
  const spacing = set
    .under('spacing')
    .map(token => ({
      token: token.name,
      key: token.name.slice('spacing.'.length),
      step: Number(token.name.slice('spacing.'.length).replace('-', '.')),
      px: set.resolve(token.name).literal as number,
    }))
    .sort((a, b) => a.step - b.step)
  const radii = RADIUS_STEPS.map(([step, offset]) => ({
    name: `radius-${step}`,
    offset,
    px: theme.radiusPx + offset,
  }))
  const textStyles = set.under('text-style').map(token => {
    const value = set.resolve(token.name).literal as Typography
    const familyToken = (value.fontFamily as { alias: string }).alias
    const families = set.resolve(familyToken).literal as string[]
    return {
      token: token.name,
      name: token.name.slice('text-style.'.length).split('.').join('/'),
      familyToken,
      family: families[0] as string,
      weight: value.fontWeight,
      sizePx: value.fontSize,
      lineHeightPx: round(value.fontSize * value.lineHeight),
      letterSpacingPx: value.letterSpacing,
      tailwind: token.extension.tailwind as string,
    }
  })
  return { spacing, radii, textStyles }
}

/** Each token equals what its Tailwind class produces. */
export function checkLayout(layout: Layout): string[] {
  const problems: string[] = []
  for (const s of layout.spacing) {
    if (!Number.isFinite(s.step) || s.step <= 0) {
      problems.push(`${s.token}: the name must be a Tailwind step such as 2 or 1-5`)
    } else if (s.px !== s.step * TAILWIND_SPACING_PX) {
      problems.push(
        `${s.token} is ${s.px}px; Tailwind's step ${s.step} is ${s.step * TAILWIND_SPACING_PX}px`,
      )
    }
  }
  for (const r of layout.radii) {
    if (r.px < 0) problems.push(`${r.name} is ${r.px}px: radius is too small for its steps`)
  }
  for (const t of layout.textStyles) {
    const classes = t.tailwind.split(/\s+/)
    const size = classes.find(c => c.startsWith('text-'))?.slice('text-'.length)
    const metrics = size === undefined ? undefined : TAILWIND_TEXT[size]
    if (!metrics) {
      problems.push(`${t.token}: "${t.tailwind}" has no Tailwind text size class`)
    } else if (t.sizePx !== metrics[0] || Math.abs(t.lineHeightPx - metrics[1]) > 0.01) {
      problems.push(
        `${t.token} is ${t.sizePx}/${t.lineHeightPx}px; text-${size} is ${metrics[0]}/${metrics[1]}px`,
      )
    }
    const fontClasses = classes.filter(c => c.startsWith('font-')).map(c => c.slice(5))
    const weightClass = fontClasses.find(c => c in TAILWIND_WEIGHT)
    const weight = weightClass ? (TAILWIND_WEIGHT[weightClass] as number) : 400
    if (t.weight !== weight) {
      problems.push(`${t.token} has weight ${t.weight}; "${t.tailwind}" gives ${weight}`)
    }
    const familyClass = fontClasses.find(c => !(c in TAILWIND_WEIGHT)) ?? 'sans'
    if (t.familyToken !== `font.${familyClass}`) {
      problems.push(`${t.token} uses {${t.familyToken}}; "${t.tailwind}" gives font-${familyClass}`)
    }
    if (!(t.weight in FONT_STYLE)) {
      problems.push(`${t.token}: weight ${t.weight} has no Figma style name`)
    }
    if (t.letterSpacingPx !== 0) {
      problems.push(`${t.token}: Tailwind's text sizes set no letter spacing, so it must be 0`)
    }
  }
  return problems
}
