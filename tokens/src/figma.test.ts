import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import {
  CHECKSUM_SOURCE,
  FIGMA_EXPORT_SCRIPT,
  checksum,
  close,
  compare,
  figmaSyncScript,
  freshness,
  fromGenerated,
  normaliseSnapshot,
  pluginCode,
  readExport,
  type Snapshot,
} from './figma.ts'

const root = join(import.meta.dirname, '../..')
const generated = fromGenerated(
  JSON.parse(
    readFileSync(join(root, 'tokens/generated/figma-variables.json'), 'utf8'),
  ) as Parameters<typeof fromGenerated>[0],
)
const snapshot = () =>
  normaliseSnapshot(
    JSON.parse(readFileSync(join(root, 'figma/snapshot/nimki.json'), 'utf8')) as Snapshot,
  )

describe('the committed snapshot', () => {
  it('matches the generated variables', () => {
    expect(compare(generated, snapshot())).toEqual([])
  })
})

describe('compare', () => {
  it('reports a value changed in Figma', () => {
    const actual = snapshot()
    ;(actual.variables['duration/fast'] as Snapshot['variables'][string]).values.Value = 0.15
    expect(compare(generated, actual)).toEqual([
      'variable duration/fast (Value): 0.15, expected 0.12',
    ])
  })

  it('reports an alias pointed somewhere else', () => {
    const actual = snapshot()
    const press = actual.variables['press/duration'] as Snapshot['variables'][string]
    press.values.Subtle = { alias: 'duration/base' }
    expect(compare(generated, actual)[0]).toMatch(/^variable press\/duration \(Subtle\)/)
  })

  it('reports variables, collections and styles missing on either side', () => {
    const actual = snapshot()
    delete actual.variables.gap
    actual.variables.extra = {
      collection: 'nimki/theme',
      type: 'FLOAT',
      web: null,
      scopes: [],
      values: {},
    }
    delete actual.collections['nimki/theme']
    actual.collections['nimki/other'] = ['Value']
    delete actual.effectStyles['elevation/2']
    actual.effectStyles['elevation/3'] = []
    expect(compare(generated, actual)).toEqual(
      expect.arrayContaining([
        'variable gap is missing from Figma',
        'variable extra is in Figma but not in the source',
        'collection nimki/theme is missing from Figma',
        'collection nimki/other is in Figma but not in the source',
        'effect style elevation/2 is missing from Figma',
        'effect style elevation/3 is in Figma but not in the source',
      ]),
    )
  })

  it('reports changed modes, code syntax, scopes and shadow layers', () => {
    const actual = snapshot()
    actual.collections['nimki/colour'] = ['Light']
    const ring = actual.variables.ring as Snapshot['variables'][string]
    ring.web = 'var(--focus)'
    ring.scopes = ['ALL_SCOPES']
    ;(actual.effectStyles['elevation/1'] as Snapshot['effectStyles'][string])[0]!.radius = 8
    expect(compare(generated, actual)).toEqual(
      expect.arrayContaining([
        'collection nimki/colour: modes Light, expected Light, Dark',
        'variable ring: web is "var(--focus)", expected "var(--ring)"',
        'variable ring: scopes is ["ALL_SCOPES"], expected ["STROKE_COLOR"]',
        'effect style elevation/1: layers differ from the source',
      ]),
    )
  })
})

describe('close', () => {
  it('allows the difference between a 32-bit float and the source rounding', () => {
    expect(close(0.0865, 0.08649999)).toBe(true)
    expect(close([0.072, 0.078, 0.086, 1], [0.072, 0.078, 0.087, 1])).toBe(true)
  })

  it('refuses a real change, a different shape or a different string', () => {
    expect(close(0.12, 0.15)).toBe(false)
    expect(close([1, 2], [1, 2, 3])).toBe(false)
    expect(close({ a: 1 }, { a: 1, b: 2 })).toBe(false)
    expect(close('DM Sans', 'Inter')).toBe(false)
  })
})

describe('normaliseSnapshot', () => {
  it('rounds Figma floats and keeps LINEAR without its implied curve', () => {
    const raw: Snapshot = {
      collections: { c: ['A'] },
      variables: {
        e: {
          collection: 'c',
          type: 'EASING',
          web: null,
          scopes: null,
          values: {
            A: { type: 'LINEAR', easingFunctionCubicBezier: { x1: 0, y1: 0, x2: 1, y2: 1 } },
          },
        },
        t: {
          collection: 'c',
          type: 'TIMING',
          web: null,
          scopes: null,
          values: { A: 0.11999999731779099 },
        },
        f: {
          collection: 'c',
          type: 'FLOAT',
          web: null,
          scopes: ['GAP', 'CORNER_RADIUS'],
          values: { A: { r: 1, g: 0.5, b: 0, a: 1 } },
        },
      },
      effectStyles: {},
    }
    const out = normaliseSnapshot(raw)
    expect(out.variables.e?.values.A).toEqual({ type: 'LINEAR' })
    expect(out.variables.t?.values.A).toBe(0.12)
    expect(out.variables.f?.values.A).toEqual([1, 0.5, 0, 1])
    expect(out.variables.f?.scopes).toEqual(['CORNER_RADIUS', 'GAP'])
  })
})

describe('checksum', () => {
  it('is FNV-1a over the text, as hex', () => {
    expect(checksum('')).toBe('811c9dc5')
    expect(checksum('nimki')).toMatch(/^[0-9a-f]{8}$/)
    expect(checksum('nimki')).not.toBe(checksum('nimkj'))
  })

  it('matches the copy the export runs inside Figma', () => {
    // Run as its own script, as Figma's plugin sandbox runs it.
    const inFigma = runInNewContext(`${CHECKSUM_SOURCE} checksum`) as (text: string) => string
    for (const text of ['', 'a', '{"x":[0.12,1]}', 'ünïcödé']) {
      expect(inFigma(text)).toBe(checksum(text))
    }
  })
})

describe('readExport', () => {
  const exported = () => {
    const body = { exportedAt: '2026-11-23T10:00:00.000Z', snapshot: snapshot() }
    return { ...body, checksum: checksum(JSON.stringify(body)) }
  }

  it('returns the snapshot stamped with its export time', () => {
    const saved = readExport(exported())
    expect(saved.exportedAt).toBe('2026-11-23T10:00:00.000Z')
    expect(compare(generated, saved)).toEqual([])
  })

  it('refuses an export changed on the way', () => {
    const changed = exported()
    ;(changed.snapshot.variables['duration/fast'] as Snapshot['variables'][string]).values.Value =
      0.15
    expect(() => readExport(changed)).toThrow(/checksum does not match/)
  })

  it('refuses something that is not an export', () => {
    expect(() => readExport(snapshot())).toThrow(/Not a nimki export/)
    expect(() => readExport(null)).toThrow(/Not a nimki export/)
    const empty = { exportedAt: 'x', snapshot: {} as Snapshot }
    expect(() => readExport({ ...empty, checksum: checksum(JSON.stringify(empty)) })).toThrow(
      /no collections/,
    )
  })
})

describe('freshness', () => {
  it('passes when nothing was saved after the export', () => {
    expect(freshness('2026-11-23T09:59:59Z', '2026-11-23T10:00:00Z')).toBeNull()
    expect(freshness('2026-11-23T10:00:00Z', '2026-11-23T10:00:00Z')).toBeNull()
  })

  it('fails when Figma was saved after the export, naming the fix', () => {
    expect(freshness('2026-11-23T10:00:01Z', '2026-11-23T10:00:00Z')).toMatch(
      /changes that are not in the snapshot.*pnpm figma:save/,
    )
  })

  it('fails without an export time, or with times it cannot read', () => {
    expect(freshness('2026-11-23T10:00:00Z', undefined)).toMatch(/no export time/)
    expect(freshness('later', '2026-11-23T10:00:00Z')).toMatch(/Cannot compare/)
  })
})

describe('figmaSyncScript', () => {
  it('carries the expected file and a dry-run switch', () => {
    const dry = figmaSyncScript(generated, true)
    expect(dry).toContain('const dryRun = true;')
    expect(dry).toContain('"ramp/neutral/1"')
    expect(figmaSyncScript(generated, false)).toContain('const dryRun = false;')
  })

  it('fits in one use_figma call', () => {
    expect(figmaSyncScript(generated, false).length).toBeLessThan(50_000)
  })
})

describe('the dev plugin', () => {
  it('is the export script as generated', () => {
    expect(readFileSync(join(root, 'figma/plugin/code.js'), 'utf8')).toBe(pluginCode())
    expect(pluginCode()).toContain(FIGMA_EXPORT_SCRIPT.split('\n')[0])
  })
})
