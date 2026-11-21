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
      { a: { $type: 'color', $value: '#fff' } },
      /\$type "color" is not supported/,
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
