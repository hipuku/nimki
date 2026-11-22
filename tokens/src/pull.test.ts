/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call --
   The tests read the raw source JSON one field at a time. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { format, resolveConfig } from 'prettier'
import { describe, expect, it } from 'vitest'
import { fromSrgb, toSrgb } from './colour.ts'
import { fromGenerated, type Snapshot } from './figma.ts'
import { applyToText, locate, pull, type SourceFile } from './pull.ts'

const root = join(import.meta.dirname, '../..')
const read = (path: string): unknown =>
  JSON.parse(readFileSync(join(root, path), 'utf8')) as unknown
const expected = fromGenerated(
  read('tokens/generated/figma-variables.json') as Parameters<typeof fromGenerated>[0],
)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>
const sources = () =>
  Object.fromEntries(
    (['colour', 'motion', 'density'] as SourceFile[]).map(file => [
      file,
      read(`tokens/source/${file}.tokens.json`),
    ]),
  ) as Record<SourceFile, Json>

/** Figma's side: code's snapshot with one change made. */
function figmaWith(change: (variables: Snapshot['variables']) => void): Snapshot {
  const copy = structuredClone(expected)
  change(copy.variables)
  return copy
}
const values = (v: Snapshot['variables'], name: string) =>
  (v[name] as Snapshot['variables'][string]).values

describe('pull', () => {
  it('writes nothing when Figma matches code', () => {
    expect(pull(expected, expected, sources())).toEqual({ written: [], manual: [], edits: [] })
  })

  it('writes a duration changed in Figma back as milliseconds', () => {
    const s = sources()
    const plan = pull(
      expected,
      figmaWith(v => (values(v, 'duration/fast').Value = 0.15)),
      s,
    )
    expect(s.motion.duration.fast.$value).toEqual({ value: 150, unit: 'ms' })
    expect(plan.written).toEqual([
      'tokens/source/motion.tokens.json duration.fast: {"value":150,"unit":"ms"}',
    ])
  })

  it('writes a density size into the mode it was changed in', () => {
    const s = sources()
    pull(
      expected,
      figmaWith(v => (values(v, 'control-sm').Compact = 30)),
      s,
    )
    expect(s.density.density['control-sm'].$extensions['dev.hipuku.nimki'].modes.compact).toEqual({
      value: 30,
      unit: 'px',
    })
    expect(s.density.density['control-sm'].$value).toEqual({ value: 32, unit: 'px' })
  })

  it('writes a ramp colour back as OKLCH in both modes', () => {
    const s = sources()
    const darker = toSrgb({ l: 0.95, c: 0.004, h: 260, alpha: 1 })
    pull(
      expected,
      figmaWith(v => (values(v, 'ramp/neutral/3').Light = [darker.r, darker.g, darker.b, 1])),
      s,
    )
    const step = s.colour.ramp.neutral['3']
    expect(step.$value.components[0]).toBeCloseTo(0.95, 2)
    // Rounding noise in Figma's sRGB does not move the hue or chroma.
    expect(step.$value.components.slice(1)).toEqual([0.004, 260])
    // Dark was not changed in Figma, so it stays exactly as written.
    expect(step.$extensions['dev.hipuku.nimki'].modes.dark).toEqual({
      colorSpace: 'oklch',
      components: [0.237, 0.006, 260],
    })
  })

  it('writes a colour changed only in dark mode, leaving light as it was', () => {
    const s = sources()
    const before = structuredClone(s.colour.color.destructive.$value)
    const deeper = toSrgb({ l: 0.6, c: 0.2, h: 25, alpha: 1 })
    pull(
      expected,
      figmaWith(v => (values(v, 'destructive').Dark = [deeper.r, deeper.g, deeper.b, 1])),
      s,
    )
    expect(s.colour.color.destructive.$value).toEqual(before)
    const dark = s.colour.color.destructive.$extensions['dev.hipuku.nimki'].modes.dark
    expect(dark.components[0]).toBeCloseTo(0.6, 2)
  })

  it('keeps a real hue or chroma change made in Figma', () => {
    const s = sources()
    const bluer = toSrgb({ l: 0.874, c: 0.04, h: 240, alpha: 1 })
    pull(
      expected,
      figmaWith(v => (values(v, 'ramp/neutral/7').Light = [bluer.r, bluer.g, bluer.b, 1])),
      s,
    )
    const [, c, h] = s.colour.ramp.neutral['7'].$value.components as number[]
    expect(c).toBeCloseTo(0.04, 2)
    expect(h).toBeCloseTo(240, -1)
  })

  it('re-points an alias changed in Figma', () => {
    const s = sources()
    pull(
      expected,
      figmaWith(v => {
        values(v, 'secondary').Light = { alias: 'ramp/neutral/4' }
        values(v, 'secondary').Dark = { alias: 'ramp/neutral/4' }
      }),
      s,
    )
    expect(s.colour.color.secondary.$value).toBe('{ramp.neutral.4}')
  })

  it('writes fonts, amounts, easings and spring bounce', () => {
    const s = sources()
    pull(
      expected,
      figmaWith(v => {
        values(v, 'font/sans').Linear = 'Inter'
        values(v, 'nk/hover-amount').Linear = 10
        values(v, 'ease/enter').Value = {
          type: 'CUSTOM_CUBIC_BEZIER',
          easingFunctionCubicBezier: { x1: 0.2, y1: 1, x2: 0.3, y2: 1 },
        }
        values(v, 'spring/snappy-bounce/easing').Value = {
          type: 'CUSTOM_SPRING',
          easingFunctionSpring: { bounce: 0.1 },
        }
      }),
      s,
    )
    expect(s.colour.font.sans.$value[0]).toBe('Inter')
    expect(s.colour.font.sans.$value.length).toBeGreaterThan(1)
    expect(s.colour.nk['hover-amount'].$value).toBe(0.1)
    expect(s.motion.ease.enter.$value).toEqual([0.2, 1, 0.3, 1])
    expect(s.motion.spring['snappy-bounce'].$extensions['dev.hipuku.nimki'].bounce).toBe(0.1)
  })

  it('reports, and does not write, a colour code works out', () => {
    const s = sources()
    const before = JSON.stringify(s.colour)
    const plan = pull(
      expected,
      figmaWith(v => (values(v, 'nk/primary-hover').Light = [0, 0, 0, 1])),
      s,
    )
    expect(JSON.stringify(s.colour)).toBe(before)
    expect(plan.manual[0]).toMatch(/^nk\/primary-hover: derived from another colour in code/)
  })

  it('reports a ramp colour detached from its step in Figma', () => {
    const plan = pull(
      expected,
      figmaWith(v => (values(v, 'background').Light = [1, 1, 1, 1])),
      sources(),
    )
    expect(plan.manual[0]).toMatch(/^background: points at \{ramp\.neutral\.1\} in code/)
  })

  it('reports motion roles, missing and extra variables, and changed shadows', () => {
    const figma = figmaWith(v => {
      values(v, 'press/duration').Subtle = 0.3
      delete v.gap
      v.extra = {
        collection: 'nimki/theme',
        type: 'FLOAT',
        web: null,
        scopes: [],
        values: { Linear: 1 },
      }
    })
    ;(figma.effectStyles['elevation/1'] as Snapshot['effectStyles'][string])[0]!.radius = 9
    const { manual } = pull(expected, figma, sources())
    expect(manual).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^press\/duration \(Subtle\): a motion role/),
        expect.stringMatching(/^extra: in Figma but not in code/),
        expect.stringMatching(/^gap: in code but missing from Figma/),
        expect.stringMatching(/^effect style elevation\/1: differs from code/),
      ]),
    )
  })
  it('writes spring durations, offsets and scales', () => {
    const s = sources()
    pull(
      expected,
      figmaWith(v => {
        values(v, 'spring/smooth/duration').Value = 0.35
        values(v, 'offset/md').Value = 10
        values(v, 'scale/md').Value = 0.93
      }),
      s,
    )
    expect(s.motion.spring.smooth.$value).toEqual({ value: 350, unit: 'ms' })
    expect(s.motion.offset.md.$value).toEqual({ value: 10, unit: 'px' })
    expect(s.motion.scale.md.$value).toBe(0.93)
  })

  it('reports what it cannot write as a value', () => {
    const extra = {
      collection: 'nimki/colour',
      type: 'COLOR',
      web: null,
      scopes: [],
      values: { Light: [0, 0, 0, 1], Dark: [0, 0, 0, 1] },
    }
    const code = structuredClone(expected)
    code.variables['ramp/neutral/13'] = {
      ...extra,
      values: { Light: [1, 1, 1, 1], Dark: [1, 1, 1, 1] },
    }
    const figma = figmaWith(v => {
      v['ramp/neutral/13'] = extra
      values(v, 'popover').Light = { alias: 'ramp/neutral/1' }
      values(v, 'ease/enter').Value = { type: 'LINEAR' }
      values(v, 'spring/snappy/easing').Value = { type: 'CUSTOM_CUBIC_BEZIER' }
      values(v, 'offset/sm').Compact = 3
    })
    const { manual, written } = pull(code, figma, sources())
    expect(written).toEqual([])
    expect(manual).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^ramp\/neutral\/13: no token at ramp\.neutral\.13/),
        expect.stringMatching(/^popover: Light and Dark point at different variables/),
        expect.stringMatching(/^ease\/enter: not a cubic Bézier in Figma/),
        expect.stringMatching(/^spring\/snappy\/easing: not a spring in Figma/),
        expect.stringMatching(/^offset\/sm \(Compact\): .* has no compact mode to write/),
      ]),
    )
  })

  it('reports a mode the source does not have', () => {
    const figma = figmaWith(v => (values(v, 'radius').Sharp = 2))
    expect(pull(expected, figma, sources()).manual).toContain(
      'radius (Sharp): a mode the source does not have',
    )
  })
})

describe('applyToText', () => {
  it('changes only the edited value, keeping layout and key order', async () => {
    const path = join(root, 'tokens/source/colour.tokens.json')
    const text = readFileSync(path, 'utf8')
    const lighter = toSrgb({ l: 0.86, c: 0.008, h: 260, alpha: 1 })
    const { edits } = pull(
      expected,
      figmaWith(v => (values(v, 'ramp/neutral/7').Light = [lighter.r, lighter.g, lighter.b, 1])),
      sources(),
    )
    // As figma:pull writes it: edited in place, then formatted.
    const after = await format(applyToText(text, edits), {
      ...((await resolveConfig(path)) ?? {}),
      filepath: path,
    })
    const changed = after.split('\n').filter((line, i) => line !== text.split('\n')[i])
    expect(after.split('\n').length).toBe(text.split('\n').length)
    expect(changed.join('\n')).toMatch(/0\.86/)
    expect(changed).toHaveLength(1)
  })

  it('removes the modes when a colour becomes an alias', () => {
    const text = readFileSync(join(root, 'tokens/source/colour.tokens.json'), 'utf8')
    const { edits } = pull(
      expected,
      figmaWith(v => {
        values(v, 'popover').Light = { alias: 'ramp/neutral/1' }
        values(v, 'popover').Dark = { alias: 'ramp/neutral/1' }
      }),
      sources(),
    )
    const popover = (JSON.parse(applyToText(text, edits)) as Json).color.popover
    expect(popover.$value).toBe('{ramp.neutral.1}')
    expect(popover.$extensions?.['dev.hipuku.nimki']?.modes).toBeUndefined()
  })
})

describe('locate', () => {
  it('finds every variable code sets directly, and none it derives', () => {
    expect(locate('stagger/sm/step', 'nimki/primitives')).toEqual({
      file: 'motion',
      path: ['stagger', 'sm', 'step'],
      kind: 'duration',
    })
    expect(locate('radius', 'nimki/theme')?.kind).toBe('dimension')
    expect(locate('press/duration', 'nimki/motion')).toBeNull()
    expect(locate('unknown', 'nimki/primitives')).toBeNull()
  })
})

describe('fromSrgb', () => {
  it('inverts toSrgb', () => {
    for (const colour of [
      { l: 0.58, c: 0.2, h: 27, alpha: 1 },
      { l: 0.964, c: 0.004, h: 260, alpha: 1 },
      { l: 0.2, c: 0.006, h: 260, alpha: 1 },
    ]) {
      const s = toSrgb(colour)
      const back = fromSrgb(s.r, s.g, s.b)
      expect(back.l).toBeCloseTo(colour.l, 3)
      expect(back.c).toBeCloseTo(colour.c, 3)
      if (colour.c > 0.01) expect(back.h).toBeCloseTo(colour.h, 0)
    }
  })

  it('gives grey a hue of 0', () => {
    expect(fromSrgb(0.5, 0.5, 0.5).h).toBe(0)
  })
})
