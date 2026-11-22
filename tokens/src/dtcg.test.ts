import { describe, expect, it } from 'vitest'
import { TokenError, TokenSet, parseDocument } from './dtcg.ts'

const parse = (document: unknown) => parseDocument(document, 'test.tokens.json')
const set = (document: unknown) => new TokenSet(parse(document))

describe('parseDocument', () => {
  it('reads a token, inheriting $type from its group', () => {
    const [token] = parse({
      duration: { $type: 'duration', fast: { $value: { value: 120, unit: 'ms' } } },
    })
    expect(token).toMatchObject({
      name: 'duration.fast',
      type: 'duration',
      value: { literal: 120 },
    })
  })

  it('normalises seconds to ms and rem to px', () => {
    const tokens = parse({
      a: { $type: 'duration', $value: { value: 0.2, unit: 's' } },
      b: { $type: 'dimension', $value: { value: 0.5, unit: 'rem' } },
    })
    expect(tokens.map(t => t.value)).toEqual([{ literal: 200 }, { literal: 8 }])
  })

  it('reads a cubic bezier and a number', () => {
    const tokens = parse({
      ease: { $type: 'cubicBezier', $value: [0.4, 0, 1, 1] },
      scale: { $type: 'number', $value: 0.96 },
    })
    expect(tokens.map(t => t.value)).toEqual([{ literal: [0.4, 0, 1, 1] }, { literal: 0.96 }])
  })

  it('reads an OKLCH colour, with alpha defaulting to 1', () => {
    const tokens = parse({
      a: { $type: 'color', $value: { colorSpace: 'oklch', components: [0.5, 0.1, 200] } },
      b: { $type: 'color', $value: { colorSpace: 'oklch', components: [1, 0, 0], alpha: 0.08 } },
    })
    expect(tokens.map(t => t.value)).toEqual([
      { literal: { l: 0.5, c: 0.1, h: 200, alpha: 1 } },
      { literal: { l: 1, c: 0, h: 0, alpha: 0.08 } },
    ])
  })

  it('reads a font family as one name or a list, and still reads an alias', () => {
    const tokens = parse({
      font: {
        $type: 'fontFamily',
        one: { $value: 'DM Sans' },
        list: { $value: ['DM Mono', 'monospace'] },
        alias: { $value: '{font.one}' },
      },
    })
    expect(tokens.map(t => t.value)).toEqual([
      { literal: ['DM Sans'] },
      { literal: ['DM Mono', 'monospace'] },
      { alias: 'font.one' },
    ])
  })

  it('reads a shadow as layers, with colours as values or aliases', () => {
    const px = (value: number) => ({ value, unit: 'px' })
    const [token] = parse({
      a: {
        $type: 'shadow',
        $value: [
          { color: '{c.soft}', offsetX: px(0), offsetY: px(4), blur: px(12), spread: px(0) },
          {
            color: { colorSpace: 'oklch', components: [1, 0, 0], alpha: 0.06 },
            offsetX: px(0),
            offsetY: px(1),
            blur: px(0),
            spread: px(0),
            inset: true,
          },
        ],
      },
    })
    expect(token?.value).toEqual({
      literal: [
        { color: { alias: 'c.soft' }, x: 0, y: 4, blur: 12, spread: 0, inset: false },
        { color: { l: 1, c: 0, h: 0, alpha: 0.06 }, x: 0, y: 1, blur: 0, spread: 0, inset: true },
      ],
    })
  })

  it('keeps the description, the modes and the rest of the extension apart', () => {
    const [token] = parse({
      spring: {
        $type: 'duration',
        $description: 'A spring',
        $value: { value: 200, unit: 'ms' },
        $extensions: { 'dev.hipuku.nimki': { bounce: 0.1, modes: { other: '{x}' } } },
      },
    })
    expect(token).toMatchObject({
      description: 'A spring',
      extension: { bounce: 0.1 },
      modes: { other: { alias: 'x' } },
    })
  })

  it('reads a typography token, its family an alias or names', () => {
    const font = { value: 14, unit: 'px' }
    const [aliased, named] = parse({
      t: {
        $type: 'typography',
        a: {
          $value: {
            fontFamily: '{font.sans}',
            fontWeight: 500,
            fontSize: font,
            lineHeight: 1.5,
            letterSpacing: { value: 0, unit: 'px' },
          },
        },
        b: {
          $value: {
            fontFamily: ['Inter', 'sans-serif'],
            fontWeight: 400,
            fontSize: { value: 1, unit: 'rem' },
            lineHeight: 1.25,
            letterSpacing: { value: 0.5, unit: 'px' },
          },
        },
      },
    })
    expect(aliased?.value).toEqual({
      literal: {
        fontFamily: { alias: 'font.sans' },
        fontWeight: 500,
        fontSize: 14,
        lineHeight: 1.5,
        letterSpacing: 0,
      },
    })
    expect(named?.value).toEqual({
      literal: {
        fontFamily: ['Inter', 'sans-serif'],
        fontWeight: 400,
        fontSize: 16,
        lineHeight: 1.25,
        letterSpacing: 0.5,
      },
    })
  })

  it.each([
    ['a typography value that is not an object', 3, /needs an object/],
    ['a fractional weight', { fontWeight: 450.5 }, /fontWeight must be a whole number/],
    ['a weight over 1000', { fontWeight: 1200 }, /fontWeight must be a whole number/],
    ['a line height of zero', { lineHeight: 0 }, /lineHeight must be a positive number/],
  ] as [string, unknown, RegExp][])('refuses %s', (_label, change, message) => {
    const base = {
      fontFamily: 'Inter',
      fontWeight: 400,
      fontSize: { value: 14, unit: 'px' },
      lineHeight: 1.5,
      letterSpacing: { value: 0, unit: 'px' },
    }
    const value = typeof change === 'object' ? { ...base, ...(change as object) } : change
    expect(() => parse({ t: { $type: 'typography', $value: value } })).toThrow(message)
  })

  it('ignores another vendor extension', () => {
    const [token] = parse({
      a: { $type: 'number', $value: 1, $extensions: { 'com.figma': { hidden: true } } },
    })
    expect(token?.extension).toEqual({})
  })

  it.each([
    [
      'a DTCG key it does not support',
      { a: { $type: 'number', $value: 1, $deprecated: true } },
      /\$deprecated is not supported/,
    ],
    [
      'an unknown type',
      { a: { $type: 'gradient', $value: 1 } },
      /\$type "gradient" is not supported/,
    ],
    ['a token with no type anywhere', { a: { $value: 1 } }, /no \$type/],
    ['a value on the root', { $type: 'number', $value: 1 }, /root cannot be a token/],
    [
      'a child inside a token',
      { a: { $type: 'number', $value: 1, b: { $value: 2 } } },
      /cannot hold "b"/,
    ],
    ['an upper-case name', { Fast: { $type: 'number', $value: 1 } }, /lowercase letters/],
    ['a group that is not an object', { a: 3 }, /must be a group or a token/],
    ['a malformed alias', { a: { $type: 'number', $value: '{a b}' } }, /not an alias/],
    ['a string where a number belongs', { a: { $type: 'number', $value: 'one' } }, /not an alias/],
    ['a non-number', { a: { $type: 'number', $value: true } }, /needs a finite number/],
    ['three bezier points', { a: { $type: 'cubicBezier', $value: [0, 0, 1] } }, /four numbers/],
    [
      'a bezier x outside 0 to 1',
      { a: { $type: 'cubicBezier', $value: [1.2, 0, 1, 1] } },
      /between 0 and 1/,
    ],
    [
      'a duration in a unit it does not know',
      { a: { $type: 'duration', $value: { value: 1, unit: 'min' } } },
      /unit ms or s/,
    ],
    [
      'a colour in another space',
      { a: { $type: 'color', $value: { colorSpace: 'srgb', components: [1, 1, 1] } } },
      /colorSpace: "oklch"/,
    ],
    [
      'a colour lightness over 1',
      { a: { $type: 'color', $value: { colorSpace: 'oklch', components: [1.2, 0, 0] } } },
      /lightness is 0 to 1/,
    ],
    ['a shadow with no layers', { a: { $type: 'shadow', $value: [] } }, /at least one layer/],
    [
      'a shadow layer that is not an object',
      { a: { $type: 'shadow', $value: [1] } },
      /must be an object/,
    ],
    [
      'a shadow layer with a non-boolean inset',
      {
        a: {
          $type: 'shadow',
          $value: {
            color: '{b}',
            offsetX: { value: 0, unit: 'px' },
            offsetY: { value: 1, unit: 'px' },
            blur: { value: 0, unit: 'px' },
            spread: { value: 0, unit: 'px' },
            inset: 'yes',
          },
        },
      },
      /inset must be true or false/,
    ],
    [
      'an empty font family list',
      { a: { $type: 'fontFamily', $value: [] } },
      /a name or a list of names/,
    ],
    ['a dimension as a bare number', { a: { $type: 'dimension', $value: 4 } }, /unit px or rem/],
    [
      'extensions that are not an object',
      { a: { $type: 'number', $value: 1, $extensions: [] } },
      /\$extensions must be an object/,
    ],
    [
      'our extension not an object',
      { a: { $type: 'number', $value: 1, $extensions: { 'dev.hipuku.nimki': 1 } } },
      /must be an object/,
    ],
    [
      'modes that are not an object',
      { a: { $type: 'number', $value: 1, $extensions: { 'dev.hipuku.nimki': { modes: [] } } } },
      /modes must be an object/,
    ],
    [
      'a mode value of the wrong type',
      {
        a: {
          $type: 'number',
          $value: 1,
          $extensions: { 'dev.hipuku.nimki': { modes: { x: 'no' } } },
        },
      },
      /mode x/,
    ],
  ])('refuses %s', (_label, document, message) => {
    expect(() => parse(document)).toThrow(message)
  })

  it('refuses a document that is not an object', () => {
    expect(() => parse([])).toThrow(TokenError)
  })
})

describe('TokenSet', () => {
  const document = {
    duration: {
      $type: 'duration',
      fast: { $value: { value: 120, unit: 'ms' } },
      base: { $value: { value: 180, unit: 'ms' } },
    },
    role: {
      $type: 'duration',
      press: {
        $value: '{duration.fast}',
        $extensions: { 'dev.hipuku.nimki': { modes: { expressive: '{duration.base}' } } },
      },
      alias: { $value: '{role.press}' },
    },
  }

  it('follows an alias to its literal and records the way', () => {
    const resolved = set(document).resolve('role.alias')
    expect(resolved.literal).toBe(120)
    expect(resolved.source.name).toBe('duration.fast')
    expect(resolved.via).toEqual(['role.press', 'duration.fast'])
  })

  it('uses a token mode where one is set, and its default where not', () => {
    const tokens = set(document)
    expect(tokens.resolve('role.press', 'expressive').literal).toBe(180)
    expect(tokens.resolve('role.alias', 'expressive').literal).toBe(180)
    expect(tokens.resolve('duration.fast', 'expressive').literal).toBe(120)
  })

  it('lists the tokens under a group, in source order', () => {
    expect(
      set(document)
        .under('duration')
        .map(t => t.name),
    ).toEqual(['duration.fast', 'duration.base'])
  })

  it('refuses a name it does not have', () => {
    expect(() => set(document).get('duration.slow')).toThrow(/no token named duration.slow/)
  })

  it('refuses an alias with no target', () => {
    expect(() => set({ a: { $type: 'number', $value: '{b}' } })).toThrow(/has no target/)
  })

  it('refuses an alias to a token of another type', () => {
    expect(() =>
      set({ a: { $type: 'number', $value: 1 }, b: { $type: 'duration', $value: '{a}' } }),
    ).toThrow(/cannot alias \{a\}, which is number/)
  })

  it('refuses an alias cycle', () => {
    expect(() =>
      set({ a: { $type: 'number', $value: '{b}' }, b: { $type: 'number', $value: '{a}' } }),
    ).toThrow(/alias cycle/)
  })

  it('refuses a token that aliases itself', () => {
    expect(() => set({ a: { $type: 'number', $value: '{a}' } })).toThrow(/alias cycle/)
  })

  it('refuses a cycle that only exists in one mode', () => {
    const cyclic = {
      a: {
        $type: 'number',
        $value: 1,
        $extensions: { 'dev.hipuku.nimki': { modes: { m: '{b}' } } },
      },
      b: {
        $type: 'number',
        $value: 2,
        $extensions: { 'dev.hipuku.nimki': { modes: { m: '{a}' } } },
      },
    }
    expect(() => set(cyclic)).toThrow(/alias cycle/)
  })

  it('refuses the same token in two files', () => {
    const tokens = parseDocument({ a: { $type: 'number', $value: 1 } }, 'one.tokens.json')
    const again = parseDocument({ a: { $type: 'number', $value: 2 } }, 'two.tokens.json')
    expect(() => new TokenSet([...tokens, ...again])).toThrow(/in both one.tokens.json and two/)
  })

  it('refuses a name that is both a token and a group', () => {
    const tokens = parseDocument({ a: { $type: 'number', $value: 1 } }, 'one.tokens.json')
    const group = parseDocument({ a: { b: { $type: 'number', $value: 2 } } }, 'two.tokens.json')
    expect(() => new TokenSet([...tokens, ...group])).toThrow(/a is both a token and a group/)
  })
})
