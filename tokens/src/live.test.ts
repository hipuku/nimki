import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fromGenerated, type Snapshot } from './figma.ts'
import { LIVE_PAGE, liveCount, liveProblems, liveScript, type RestNode } from './live.ts'

const root = join(import.meta.dirname, '../..')
const code = fromGenerated(
  JSON.parse(
    readFileSync(join(root, 'tokens/generated/figma-variables.json'), 'utf8'),
  ) as Parameters<typeof fromGenerated>[0],
)

/** A value in a mode; an alias into a one-mode collection reads that collection's only mode. */
function value(name: string, mode: string): unknown {
  const v = code.variables[name]!
  const current = v.values[mode] ?? Object.values(v.values)[0]
  return current && typeof current === 'object' && 'alias' in current
    ? value(current.alias as string, mode)
    : current
}

const WEIGHT: Record<string, number> = { Regular: 400, Medium: 500, SemiBold: 600 }

/** The Parity page as the REST API would return it when every value matches code. */
function page(): RestNode {
  const children: RestNode[] = [{ name: 'note', type: 'TEXT' }]
  for (const [collection, modes] of Object.entries(code.collections)) {
    const names = Object.entries(code.variables)
      .filter(([, v]) => v.collection === collection && v.type !== 'TIMING' && v.type !== 'EASING')
      .map(([name]) => name)
    if (names.length === 0) continue
    for (const mode of modes) {
      children.push({
        name: `${collection} / ${mode}`,
        type: 'FRAME',
        children: names.map(name => {
          const type = code.variables[name]!.type
          const v = value(name, mode)
          let shown: RestNode
          if (type === 'COLOR') {
            const [r, g, b, a] = v as number[]
            // Figma puts a colour's alpha in the paint's opacity.
            shown = {
              name: 'value',
              type: 'RECTANGLE',
              fills: [{ type: 'SOLID', opacity: a ?? 1, color: { r: r!, g: g!, b: b!, a: 1 } }],
            }
          } else if (type === 'FLOAT') {
            // The REST API leaves out a gap of zero.
            shown = {
              name: 'value',
              type: 'FRAME',
              ...(v === 0 ? {} : { itemSpacing: v as number }),
            }
          } else {
            shown = { name: 'value', type: 'TEXT', characters: v as string }
          }
          return { name, type: 'FRAME', children: [shown, { name: 'label', type: 'TEXT' }] }
        }),
      })
    }
  }
  children.push({
    name: 'Text styles',
    type: 'FRAME',
    children: Object.entries(code.textStyles).map(([name, s]) => ({
      name,
      type: 'TEXT',
      style: {
        fontFamily: value(s.family, 'Linear') as string,
        fontWeight: WEIGHT[s.style]!,
        fontSize: s.size,
        lineHeightPx: s.lineHeight as number,
        letterSpacing: s.letterSpacing,
      },
    })),
  })
  for (const mode of code.collections['nimki/colour']!) {
    children.push({
      name: `Effect styles / ${mode}`,
      type: 'FRAME',
      children: Object.entries(code.effectStyles).map(([name, layers]) => ({
        name,
        type: 'RECTANGLE',
        effects: [
          { type: 'BACKGROUND_BLUR', visible: false },
          ...layers.map(layer => {
            const [r, g, b, a] = value(layer.color, mode) as number[]
            return {
              type: layer.type,
              color: { r: r!, g: g!, b: b!, a: a! },
              offset: { x: layer.x, y: layer.y },
              radius: layer.radius,
              ...(layer.spread ? { spread: layer.spread } : {}),
            }
          }),
        ],
      })),
    })
  }
  return { name: LIVE_PAGE, type: 'CANVAS', children }
}

const frame = (p: RestNode, name: string) => p.children!.find(c => c.name === name)!
const cell = (p: RestNode, frameName: string, name: string) =>
  frame(p, frameName).children!.find(c => c.name === name)!
const shownIn = (p: RestNode, frameName: string, name: string) =>
  cell(p, frameName, name).children![0]!

describe('liveProblems', () => {
  it('passes when every value, text style and effect style matches code', () => {
    expect(liveProblems(code, page())).toEqual([])
    expect(liveCount(code)).toBe(167 + 7 + 4)
  })

  it('names a colour, a number or a string that differs', () => {
    const p = page()
    shownIn(p, 'nimki/colour / Dark', 'nk/destructive-fill').fills![0]!.color!.r = 0.5
    shownIn(p, 'nimki/density / Compact', 'gap').itemSpacing = 7
    shownIn(p, 'nimki/theme / Linear', 'font/mono').characters = 'Courier'
    expect(liveProblems(code, p)).toEqual([
      expect.stringMatching(/^gap \(Compact\): Figma shows 7, code has 6$/),
      expect.stringMatching(/^nk\/destructive-fill \(Dark\): Figma shows \[0\.5,/),
      'font/mono (Linear): Figma shows "Courier", code has "DM Mono"',
    ])
  })

  it('names a text style or an effect style that differs', () => {
    const p = page()
    cell(p, 'Text styles', 'text/lg').style!.fontWeight = 700
    cell(p, 'Effect styles / Dark', 'elevation/2').effects![1]!.radius = 9
    const problems = liveProblems(code, p)
    expect(problems).toHaveLength(2)
    expect(problems[0]).toMatch(/^text style text\/lg: Figma shows .*"weight":700/)
    expect(problems[1]).toMatch(/^effect style elevation\/2 \(Dark\): Figma shows/)
  })

  it('asks for the page to be rebuilt when it is missing, incomplete or has extras', () => {
    expect(liveProblems(code, undefined)).toEqual([
      'The Parity page is missing: run pnpm figma:live --script through use_figma to rebuild the page',
    ])
    const rebuild = 'run pnpm figma:live --script through use_figma to rebuild the page'
    const p = page()
    p.children = p.children!.filter(c => c.name !== 'nimki/motion / Reduced')
    const light = frame(p, 'nimki/colour / Light')
    light.children = light.children!.filter(c => c.name !== 'border')
    cell(p, 'nimki/colour / Light', 'ring').children = []
    light.children.push({ name: 'nk/gone', type: 'FRAME' })
    const styles = frame(p, 'Text styles')
    styles.children = styles.children!.filter(c => c.name !== 'mono/sm')
    styles.children.push({ name: 'text/gone', type: 'TEXT', style: {} })
    const effects = frame(p, 'Effect styles / Light')
    effects.children = effects.children!.filter(c => c.name !== 'elevation/1')
    p.children.push({ name: 'Scratch', type: 'FRAME' })
    expect(liveProblems(code, p)).toEqual([
      `No "nimki/motion / Reduced" frame on the Parity page: ${rebuild}`,
      `border (Light): not on the page; ${rebuild}`,
      `ring (Light): its cell shows no value; ${rebuild}`,
      `nk/gone (Light): on the page but not in code; ${rebuild}`,
      `text style mono/sm: not on the page; ${rebuild}`,
      `text style text/gone: on the page but not in code; ${rebuild}`,
      `effect style elevation/1 (Light): not on the page; ${rebuild}`,
      `"Scratch" is on the Parity page but not in code; ${rebuild}`,
    ])
    p.children = p.children.filter(c => !['Text styles', 'Effect styles / Dark'].includes(c.name))
    expect(liveProblems(code, p)).toEqual(
      expect.arrayContaining([
        `No "Text styles" frame on the Parity page: ${rebuild}`,
        `No "Effect styles / Dark" frame on the Parity page: ${rebuild}`,
      ]),
    )
  })

  it('reports a value code cannot resolve, and reads a cell that shows nothing', () => {
    const broken: Snapshot = structuredClone(code)
    broken.variables.ring!.values.Light = { alias: 'nowhere' }
    broken.variables.input!.values.Light = { alias: 'input' }
    broken.variables.gap!.values = { Comfortable: 8 }
    const p = page()
    const swatch = shownIn(p, 'nimki/colour / Light', 'border')
    swatch.fills = [{ type: 'GRADIENT_LINEAR' }]
    const font = shownIn(p, 'nimki/theme / Linear', 'font/sans')
    delete font.characters
    const style = cell(p, 'Text styles', 'text/xs')
    style.style = {}
    expect(liveProblems(broken, p)).toEqual([
      expect.stringMatching(/^gap \(Compact\): Figma shows 6, code has null$/),
      expect.stringMatching(/^border \(Light\): its cell shows no value/),
      expect.stringMatching(/^input \(Light\): Figma shows .*, code has null$/),
      expect.stringMatching(/^ring \(Light\): Figma shows .*, code has null$/),
      expect.stringMatching(/^font\/sans \(Linear\): its cell shows no value/),
      expect.stringMatching(/^text style text\/xs: Figma shows/),
    ])
  })

  it('compares an unbound text style family and an effect layer with no colour', () => {
    const local: Snapshot = structuredClone(code)
    local.textStyles['text/xs']!.family = 'DM Sans'
    local.effectStyles['elevation/1']![0]!.color = ''
    const p = page()
    for (const mode of ['Light', 'Dark']) {
      delete cell(p, `Effect styles / ${mode}`, 'elevation/1').effects![1]!.color
    }
    expect(liveProblems(local, p)).toEqual([])
  })
})

describe('liveScript', () => {
  it('builds every bindable variable, text style and effect style, and parses', () => {
    const script = liveScript(code)
    for (const name of Object.keys(code.variables)) {
      const type = code.variables[name]!.type
      if (type === 'TIMING' || type === 'EASING') expect(script).not.toContain(JSON.stringify(name))
      else expect(script).toContain(JSON.stringify(name))
    }
    for (const name of [...Object.keys(code.textStyles), ...Object.keys(code.effectStyles)]) {
      expect(script).toContain(JSON.stringify(name))
    }
    const AsyncFunction = (Object.getPrototypeOf(async () => {}) as { constructor: unknown })
      .constructor as new (source: string) => unknown
    expect(() => new AsyncFunction(script)).not.toThrow()
  })
})
