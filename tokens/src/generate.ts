import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { format, resolveConfig } from 'prettier'
import { TokenSet, parseDocument } from './dtcg.ts'
import {
  densityCss,
  engineTs,
  extensionsCss,
  figmaVariables,
  motionCss,
  tailwindCss,
  themeCss,
} from './emit.ts'
import { readDensity, readMotion } from './model.ts'
import { checkDensity, checkMotion, checkShape } from './rules.ts'
import { checkLayout, checkLayoutShape, readLayout } from './layout.ts'
import { checkTheme, checkThemeShape, readTheme } from './theme.ts'

/** Every generated file, by its path from the repository root. */
export const OUTPUTS = {
  motionCss: 'registry/styles/motion.css',
  densityCss: 'registry/styles/density.css',
  themeCss: 'registry/styles/theme-linear.css',
  extensionsCss: 'registry/styles/extensions.css',
  tailwindCss: 'registry/styles/tailwind.css',
  engine: 'packages/engine/src/tokens.generated.ts',
  figma: 'tokens/generated/figma-variables.json',
} as const

export class RuleError extends Error {
  override name = 'RuleError'
  readonly problems: string[]
  constructor(problems: string[]) {
    super(
      `The token source breaks ${problems.length} rule(s):\n${problems.map(p => `  ${p}`).join('\n')}`,
    )
    this.problems = problems
  }
}

/** Reads every *.tokens.json in a folder into one set, in file name order. */
export function loadSource(dir: string): TokenSet {
  const files = readdirSync(dir)
    .filter(file => file.endsWith('.tokens.json'))
    .sort()
  return new TokenSet(
    files.flatMap(file => parseDocument(JSON.parse(readFileSync(join(dir, file), 'utf8')), file)),
  )
}

/** Checks the rules and renders every output, unformatted. Throws RuleError on a broken rule. */
export function render(set: TokenSet): Record<keyof typeof OUTPUTS, string> {
  const shape = [...checkShape(set), ...checkThemeShape(set), ...checkLayoutShape(set)]
  if (shape.length > 0) throw new RuleError(shape)
  const motion = readMotion(set)
  const density = readDensity(set)
  const theme = readTheme(set)
  const layout = readLayout(set, theme)
  const problems = [
    ...checkMotion(motion),
    ...checkDensity(density),
    ...checkTheme(theme),
    ...checkLayout(layout),
  ]
  if (problems.length > 0) throw new RuleError(problems)
  return {
    motionCss: motionCss(motion),
    densityCss: densityCss(density),
    themeCss: themeCss(theme),
    extensionsCss: extensionsCss(theme),
    tailwindCss: tailwindCss(theme),
    engine: engineTs(motion),
    figma: figmaVariables(motion, density, theme, layout),
  }
}

/** Every output, formatted with the repository's Prettier config, keyed by path from the root. */
export async function generate(root: string): Promise<Map<string, string>> {
  const rendered = render(loadSource(join(root, 'tokens/source')))
  const out = new Map<string, string>()
  for (const [key, path] of Object.entries(OUTPUTS)) {
    const filepath = join(root, path)
    const options = (await resolveConfig(filepath)) ?? {}
    out.set(path, await format(rendered[key as keyof typeof OUTPUTS], { ...options, filepath }))
  }
  return out
}
