import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TokenSet, parseDocument } from './dtcg.ts'
import { loadSource } from './generate.ts'
import { checkLayout, checkLayoutShape, readLayout, type Layout } from './layout.ts'
import { readTheme } from './theme.ts'

const source = loadSource(join(import.meta.dirname, '../source'))
const layout = () => readLayout(source, readTheme(source))

const px = (value: number) => ({ value, unit: 'px' })
const style = (extra: Record<string, unknown> = {}, tailwind: unknown = 'text-sm') => ({
  $value: {
    fontFamily: '{font.sans}',
    fontWeight: 400,
    fontSize: px(14),
    lineHeight: 1.428571,
    letterSpacing: px(0),
    ...extra,
  },
  ...(tailwind === null ? {} : { $extensions: { 'dev.hipuku.nimki': { tailwind } } }),
})
const fonts = {
  font: { $type: 'fontFamily', sans: { $value: ['DM Sans'] }, mono: { $value: 'DM Mono' } },
}
const set = (document: Record<string, unknown>) =>
  new TokenSet(parseDocument({ ...fonts, ...document }, 'test.tokens.json'))

describe('readLayout', () => {
  it('reads the spacing steps in order, the radius steps and the text styles', () => {
    const { spacing, radii, textStyles } = layout()
    expect(spacing.map(s => s.key)).toEqual([
      '0-5',
      '1',
      '1-5',
      '2',
      '2-5',
      '3',
      '3-5',
      '4',
      '5',
      '6',
      '8',
      '10',
      '12',
      '16',
    ])
    expect(spacing[2]).toEqual({ token: 'spacing.1-5', key: '1-5', step: 1.5, px: 6 })
    expect(radii.map(r => [r.name, r.px])).toEqual([
      ['radius-sm', 2],
      ['radius-md', 4],
      ['radius-lg', 6],
      ['radius-xl', 10],
    ])
    expect(textStyles.find(t => t.name === 'text/lg')).toEqual({
      token: 'text-style.text.lg',
      name: 'text/lg',
      familyToken: 'font.sans',
      family: 'DM Sans',
      weight: 600,
      sizePx: 18,
      lineHeightPx: 28,
      letterSpacingPx: 0,
      tailwind: 'text-lg font-semibold',
    })
  })
})

describe('checkLayout', () => {
  it('passes the source', () => {
    expect(checkLayoutShape(source)).toEqual([])
    expect(checkLayout(layout())).toEqual([])
  })

  it('refuses a spacing step that is not Tailwind’s, and a radius too small for its steps', () => {
    const base = layout()
    const broken: Layout = {
      ...base,
      spacing: [
        { token: 'spacing.2', key: '2', step: 2, px: 9 },
        { token: 'spacing.x', key: 'x', step: NaN, px: 4 },
      ],
      radii: [{ name: 'radius-sm', offset: -4, px: -2 }],
    }
    expect(checkLayout(broken)).toEqual([
      "spacing.2 is 9px; Tailwind's step 2 is 8px",
      'spacing.x: the name must be a Tailwind step such as 2 or 1-5',
      'radius-sm is -2px: radius is too small for its steps',
    ])
  })

  it('refuses a text style that is not what its Tailwind classes give', () => {
    const [first] = layout().textStyles
    const t = (over: Partial<NonNullable<typeof first>>) => ({ ...first!, ...over })
    const broken: Layout = {
      spacing: [],
      radii: [],
      textStyles: [
        t({ token: 'a', sizePx: 13 }),
        t({ token: 'b', tailwind: 'font-medium' }),
        t({ token: 'c', weight: 500 }),
        t({ token: 'd', familyToken: 'font.mono' }),
        t({ token: 'e', weight: 450, tailwind: 'text-xs font-[450]' }),
        t({ token: 'f', letterSpacingPx: 0.5 }),
        t({ token: 'g', tailwind: 'text-huge' }),
      ],
    }
    expect(checkLayout(broken)).toEqual([
      'a is 13/16px; text-xs is 12/16px',
      'b: "font-medium" has no Tailwind text size class',
      'b has weight 400; "font-medium" gives 500',
      'c has weight 500; "text-xs" gives 400',
      'd uses {font.mono}; "text-xs" gives font-sans',
      'e has weight 450; "text-xs font-[450]" gives 400',
      'e uses {font.sans}; "text-xs font-[450]" gives font-[450]',
      'e: weight 450 has no Figma style name',
      "f: Tailwind's text sizes set no letter spacing, so it must be 0",
      'g: "text-huge" has no Tailwind text size class',
    ])
  })
})

describe('checkLayoutShape', () => {
  it('refuses spacing that is not a dimension or has modes', () => {
    const problems = checkLayoutShape(
      set({
        spacing: {
          '1': { $type: 'number', $value: 4 },
          '2': {
            $type: 'dimension',
            $value: px(8),
            $extensions: { 'dev.hipuku.nimki': { modes: { compact: px(6) } } },
          },
        },
      }),
    )
    expect(problems).toEqual(['spacing.1 must be a dimension', 'spacing.2 takes no modes'])
  })

  it('refuses a text style that is not typography, aliases, has modes, or names no classes', () => {
    const problems = checkLayoutShape(
      set({
        'text-style': {
          $type: 'typography',
          plain: { $type: 'number', $value: 1 },
          base: style(),
          copy: { $value: '{text-style.base}' },
          moded: {
            ...style(),
            $extensions: {
              'dev.hipuku.nimki': {
                tailwind: 'text-sm',
                modes: { compact: style().$value },
              },
            },
          },
          literal: style({ fontFamily: 'Inter' }),
          'not-a-font': style({ fontFamily: '{other.n}' }),
          unnamed: style({}, null),
        },
        spacing: { one: { $type: 'fontFamily', $value: 'x' } },
        other: { n: { $type: 'number', $value: 1 } },
      }),
    )
    expect(problems).toEqual([
      'spacing.one must be a dimension',
      'text-style.plain must be a typography token',
      'text-style.copy must hold its value, not alias another style',
      'text-style.moded takes no modes',
      'text-style.literal: fontFamily must alias a font token, so Figma binds the variable',
      'text-style.not-a-font: {other.n} is not a fontFamily token',
      'text-style.unnamed has no tailwind classes in its extension',
    ])
  })
})
