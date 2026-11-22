import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fromGenerated, type Snapshot } from './figma.ts'
import { SWATCH_PAGE, swatchProblems, swatchScript, type RestNode } from './swatches.ts'

const root = join(import.meta.dirname, '../..')
const code = fromGenerated(
  JSON.parse(
    readFileSync(join(root, 'tokens/generated/figma-variables.json'), 'utf8'),
  ) as Parameters<typeof fromGenerated>[0],
)

const colours = Object.entries(code.variables)
  .filter(([, v]) => v.collection === 'nimki/colour' && v.type === 'COLOR')
  .map(([name]) => name)

function value(name: string, mode: string): number[] {
  let current = code.variables[name]!.values[mode]
  while (!Array.isArray(current)) {
    current = code.variables[(current as { alias: string }).alias]!.values[mode]
  }
  return current
}

/** The Parity page as the REST API would return it when every swatch shows code's colour. */
function page(): RestNode {
  return {
    name: SWATCH_PAGE,
    type: 'CANVAS',
    children: [
      { name: 'note', type: 'TEXT' },
      ...['Light', 'Dark'].map(mode => ({
        name: mode,
        type: 'FRAME',
        children: colours.map(name => {
          const [r, g, b, a] = value(name, mode)
          // Figma puts a colour's alpha in the paint's opacity.
          return {
            name,
            type: 'FRAME',
            children: [
              {
                name: 'swatch',
                type: 'RECTANGLE',
                fills: [{ type: 'SOLID', opacity: a ?? 1, color: { r: r!, g: g!, b: b!, a: 1 } }],
              },
            ],
          }
        }),
      })),
    ],
  }
}

const frame = (p: RestNode, mode: string) => p.children!.find(c => c.name === mode)!
const cell = (p: RestNode, mode: string, name: string) =>
  frame(p, mode).children!.find(c => c.name === name)!

describe('swatchProblems', () => {
  it('passes when every swatch shows code’s colour, alpha included', () => {
    expect(colours).toContain('nk/scrim')
    expect(swatchProblems(code, page())).toEqual([])
  })

  it('names a swatch that shows another colour', () => {
    const p = page()
    cell(p, 'Dark', 'nk/destructive-fill').children![0]!.fills![0]!.color!.r = 0.5
    const [problem] = swatchProblems(code, p)
    expect(problem).toMatch(/^nk\/destructive-fill \(Dark\): Figma shows \[0\.5,/)
  })

  it('asks for the page to be rebuilt when it is missing or incomplete', () => {
    expect(swatchProblems(code, undefined)).toEqual([
      'The Parity page is missing: run pnpm figma:swatches --script through use_figma to rebuild the page',
    ])
    const p = page()
    p.children = p.children!.filter(c => c.name !== 'Dark')
    frame(p, 'Light').children = frame(p, 'Light').children!.filter(c => c.name !== 'border')
    cell(p, 'Light', 'ring').children![0]!.fills = []
    frame(p, 'Light').children!.push({ name: 'nk/gone', type: 'FRAME' })
    expect(swatchProblems(code, p)).toEqual([
      'border (Light): no swatch; run pnpm figma:swatches --script through use_figma to rebuild the page',
      'ring (Light): the swatch has no solid fill; run pnpm figma:swatches --script through use_figma to rebuild the page',
      'nk/gone (Light): a swatch for a colour code does not have; run pnpm figma:swatches --script through use_figma to rebuild the page',
      'No Dark frame on the Parity page: run pnpm figma:swatches --script through use_figma to rebuild the page',
    ])
  })

  it('reports a colour code cannot resolve', () => {
    const broken: Snapshot = structuredClone(code)
    broken.variables.ring!.values.Light = { alias: 'nowhere' }
    broken.variables.border!.values.Light = 'text'
    broken.variables.input!.values.Light = { alias: 'input' }
    expect(swatchProblems(broken, page())).toEqual([
      expect.stringMatching(/^border \(Light\): Figma shows .*, code has null$/),
      expect.stringMatching(/^input \(Light\): Figma shows .*, code has null$/),
      expect.stringMatching(/^ring \(Light\): Figma shows .*, code has null$/),
    ])
  })
})

describe('swatchScript', () => {
  it('builds a swatch for every colour in every mode, and parses', () => {
    const script = swatchScript(code)
    for (const name of colours) expect(script).toContain(JSON.stringify(name))
    expect(script).toContain('const modes = ["Light","Dark"]')
    const AsyncFunction = (Object.getPrototypeOf(async () => {}) as { constructor: unknown })
      .constructor as new (source: string) => unknown
    expect(() => new AsyncFunction(script)).not.toThrow()
  })
})
