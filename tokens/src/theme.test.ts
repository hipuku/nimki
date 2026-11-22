/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment --
   These tests edit the raw colour JSON one field at a time to break one rule. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TokenSet, parseDocument } from './dtcg.ts'
import { RuleError, loadSource, render } from './generate.ts'
import { checkTheme, fontCss, readTheme, shadowCss, themeVar } from './theme.ts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>

const sourceDir = join(import.meta.dirname, '../source')
const files = ['colour.tokens.json', 'density.tokens.json', 'motion.tokens.json']

function renderWith(change: (colour: Json) => void) {
  const docs = files.map(file => JSON.parse(readFileSync(join(sourceDir, file), 'utf8')) as Json)
  change(docs[0] as Json)
  return render(new TokenSet(files.flatMap((file, i) => parseDocument(docs[i], file))))
}

function problems(change: (colour: Json) => void): string[] {
  try {
    renderWith(change)
    return []
  } catch (error) {
    if (error instanceof RuleError) return error.problems
    throw error
  }
}

const oklch = (l: number, c: number, h: number) => ({ colorSpace: 'oklch', components: [l, c, h] })
const dark = (token: Json): Json => token.$extensions['dev.hipuku.nimki'].modes as Json

describe('the colour source as committed', () => {
  it('passes every theme rule', () => {
    expect(problems(() => {})).toEqual([])
  })
})

describe('contrast (FR-V9)', () => {
  it('fails body text under 4.5:1', () => {
    // foreground is ramp step 12 in the Linear theme, so the step is what breaks.
    const found = problems(c => (c.ramp.neutral['12'].$value = oklch(0.7, 0.006, 260)))
    expect(found.some(p => p.startsWith('color.foreground on color.background (light):'))).toBe(
      true,
    )
  })

  it('fails a status colour under 4.5:1 on any surface it sits on', () => {
    const found = problems(c => {
      c.nk.warning.$extensions['dev.hipuku.nimki'].relative.light.lightness = 0.7
    })
    expect(found.some(p => p.startsWith('nk.warning on color.background (light):'))).toBe(true)
    expect(found.some(p => p.startsWith('nk.warning on color.popover (light):'))).toBe(true)
  })

  it('fails a focus ring under 3:1 (FR-V10)', () => {
    const found = problems(c => (dark(c.ramp.neutral['10']).dark = oklch(0.25, 0.01, 260)))
    expect(found.some(p => p.startsWith('color.ring on color.background (dark):'))).toBe(true)
  })
})

describe('fields and elevation', () => {
  it('fails an input border under 3:1 on any surface a field sits on (WCAG 2.2, 1.4.11)', () => {
    const found = problems(c => (dark(c.ramp.neutral['9']).dark = oklch(0.4, 0.006, 260)))
    expect(found.some(p => p.startsWith('color.input on color.popover (dark):'))).toBe(true)
  })

  it('keeps one shadow shape in both modes', () => {
    const found = problems(c => {
      c.nk['elevation-1'].$extensions = {
        'dev.hipuku.nimki': { modes: { dark: c.nk['elevation-2'].$value } },
      }
    })
    expect(found).toContain(
      'nk.elevation-1 takes no modes; give its layer colours a dark mode instead',
    )
  })

  it('needs a shadow layer colour to point at a colour', () => {
    const found = problems(c => (c.nk['elevation-2'].$value[0].color = '{radius}'))
    expect(found).toContain('nk.elevation-2: {radius} is not a color token')
  })

  it('needs a mix amount for both modes', () => {
    const found = problems(c => delete c.nk.edge.$extensions['dev.hipuku.nimki'].mix.dark)
    expect(found).toContain('nk.edge has no dark recipe')
  })

  it('refuses a mix amount that is not a number', () => {
    expect(() =>
      renderWith(c => (c.nk.edge.$extensions['dev.hipuku.nimki'].mix.dark = 'some')),
    ).toThrow(/nk.edge: mix needs a dark amount/)
  })

  it('fades the edge by mixing --foreground with transparent', () => {
    const { extensionsCss } = renderWith(() => {})
    expect(extensionsCss).toContain(
      '--nk-edge: color-mix(in oklch, var(--foreground) 6%, transparent);',
    )
    expect(extensionsCss).toContain('inset 0px 1px 0px 0px var(--nk-edge)')
  })
})

describe('missing colours', () => {
  it('fails a contrast pair whose colour is not in the source', () => {
    expect(problems(c => delete c.nk.warning)).toContain(
      'nk.warning on color.background: one of them is missing',
    )
  })
})

describe('gamut', () => {
  it('fails an opaque colour outside sRGB, as the first success value was', () => {
    const found = problems(c => {
      c.nk.success.$extensions['dev.hipuku.nimki'].relative.light = {
        lightness: 0.58,
        chromaMax: 0.22,
        hue: 150,
      }
    })
    expect(found).toContain('nk.success (light): oklch(0.58 0.22 150) is outside sRGB')
  })
})

describe('shape', () => {
  it('needs a dark value on every colour that is not an alias', () => {
    expect(problems(c => delete c.color.destructive.$extensions)).toContain(
      'color.destructive has modes []; it needs [dark]',
    )
  })

  it('refuses modes on an alias, which follows its target instead', () => {
    const found = problems(c => {
      c.color.muted.$extensions = { 'dev.hipuku.nimki': { modes: { dark: '{color.card}' } } }
    })
    expect(found).toContain('color.muted aliases a colour, so it takes no modes')
  })

  it('needs a recipe for both modes on a derived colour', () => {
    const found = problems(c => delete c.nk.success.$extensions['dev.hipuku.nimki'].relative.dark)
    expect(found).toContain('nk.success has no dark recipe')
  })

  it('refuses a recipe with no base colour to apply it to', () => {
    const found = problems(c => {
      c.nk.scrim.$extensions['dev.hipuku.nimki'].relative = { light: {}, dark: {} }
    })
    expect(found).toContain('nk.scrim has a recipe but no base to apply it to')
  })

  it('refuses a recipe missing its numbers', () => {
    expect(() =>
      renderWith(c => (c.nk.success.$extensions['dev.hipuku.nimki'].relative.light = { hue: 1 })),
    ).toThrow(/nk.success: a relative recipe needs lightness, chromaMax and hue/)
  })

  it('fails an amount outside 0 to 1', () => {
    expect(problems(c => (c.nk['hover-amount'].$value = 8))).toContain(
      'nk.hover-amount: 8 must be between 0 and 1',
    )
  })
})

describe('outputs', () => {
  const out = renderWith(() => {})

  it('writes shadcn variables under their own names, aliases as var()', () => {
    expect(out.themeCss).toContain('--nk-neutral-1: oklch(0.99 0.002 260);')
    expect(out.themeCss).toContain('--background: var(--nk-neutral-1);')
    expect(out.themeCss).toContain('--card-foreground: var(--foreground);')
    expect(out.themeCss).toContain('--popover: oklch(1 0 0);')
    expect(out.themeCss).toContain('--radius: 0.375rem;')
    expect(out.themeCss).toContain('--font-sans: "DM Sans", ui-sans-serif, system-ui, sans-serif;')
  })

  it('derives status colours from the project destructive, per mode', () => {
    expect(out.extensionsCss).toContain(
      '--nk-success: oklch(from var(--destructive) 0.53 min(c, 0.145) 150);',
    )
    expect(out.extensionsCss).toContain(
      '--nk-warning: oklch(from var(--destructive) calc(l + 0.12) min(c, 0.155) 80);',
    )
    expect(out.extensionsCss).toContain('--nk-hover-amount: 8%;')
  })

  it('redeclares every derived colour and shadow in the dark block, so a .dark subtree recomputes them', () => {
    const darkBlock = out.extensionsCss.slice(out.extensionsCss.indexOf('.dark'))
    expect(darkBlock).toContain('--nk-highlight: var(--accent);')
    expect(darkBlock).toContain('--nk-scrim: oklch(0 0 0 / 60%);')
    expect(darkBlock).toContain('--nk-elevation-1:')
  })

  it('maps every colour and the radius steps to Tailwind utilities', () => {
    expect(out.tailwindCss).toContain('@theme inline {')
    expect(out.tailwindCss).toContain('--color-foreground: var(--foreground);')
    expect(out.tailwindCss).toContain('--color-input: var(--input);')
    expect(out.tailwindCss).toContain('--color-nk-success: var(--nk-success);')
    expect(out.tailwindCss).toContain('--radius-md: calc(var(--radius) - 2px);')
    expect(out.tailwindCss).not.toContain('--font-')
  })
})

describe('helpers', () => {
  it('names custom properties by group', () => {
    expect(themeVar('color.card-foreground')).toBe('--card-foreground')
    expect(themeVar('nk.success')).toBe('--nk-success')
    expect(themeVar('font.sans')).toBe('--font-sans')
  })

  it('writes a shadow layer colour given as a value as oklch()', () => {
    const layer = {
      color: { l: 0, c: 0, h: 0, alpha: 0.1 },
      x: 0,
      y: 2,
      blur: 4,
      spread: 0,
      inset: false,
    }
    expect(shadowCss([layer])).toBe('0px 2px 4px 0px oklch(0 0 0 / 10%)')
  })

  it('quotes only family names with spaces', () => {
    expect(fontCss(['DM Sans', 'system-ui'])).toBe('"DM Sans", system-ui')
  })
})

describe('the neutral ramp (step 1.3c)', () => {
  const step = (c: Json, n: number): Json => c.ramp.neutral[String(n)] as Json

  it('writes its steps into the Linear theme as --nk-neutral-N, with a dark mode', () => {
    const { themeCss } = renderWith(() => {})
    expect(themeCss).toContain('--nk-neutral-1: oklch(0.99 0.002 260);')
    expect(themeCss.slice(themeCss.indexOf('.dark'))).toContain(
      '--nk-neutral-1: oklch(0.16 0.005 260);',
    )
    expect(themeVar('ramp.neutral.12')).toBe('--nk-neutral-12')
  })

  it('stays out of the Tailwind mapping, which only offers the semantic colours', () => {
    const { tailwindCss } = renderWith(() => {})
    expect(tailwindCss).not.toContain('neutral')
    expect(tailwindCss).toContain('--color-nk-secondary-hover: var(--nk-secondary-hover);')
  })

  it('fails a step that runs the wrong way', () => {
    const found = problems(c => (step(c, 5).$value = oklch(0.97, 0.006, 260)))
    expect(found).toContain('ramp.neutral.5 (light): must be darker than step 4')
  })

  it('fails a ramp with a step missing', () => {
    const found = problems(c => delete c.ramp.neutral['7'])
    expect(found).toContain('ramp.neutral.7 (light): a step is missing')
  })

  it('checks nothing when a theme has no ramp', () => {
    // A theme whose colours are its own values, with the ramp left out.
    const theme = readTheme(loadSource(sourceDir))
    expect(
      checkTheme({ ...theme, colours: theme.colours.filter(c => !c.token.startsWith('ramp.')) }),
    ).toEqual([])
  })

  it('fails text steps that do not read on the surface steps', () => {
    const found = problems(c => (dark(step(c, 11)).dark = oklch(0.4, 0.01, 260)))
    expect(found.some(p => p.startsWith('ramp.neutral.11 on ramp.neutral.1 (dark):'))).toBe(true)
  })
})

describe('state colours (step 1.3c)', () => {
  const relative = (c: Json, name: string): Json =>
    c.nk[name].$extensions['dev.hipuku.nimki'].relative as Json

  it('derives hover and pressed from the project variable, keeping chroma and hue', () => {
    const { extensionsCss } = renderWith(() => {})
    expect(extensionsCss).toContain(
      '--nk-primary-hover: oklch(from var(--primary) calc(l + 0.07) c h);',
    )
    expect(extensionsCss).toContain(
      '--nk-secondary-active: oklch(from var(--secondary) calc(l - 0.033) c h);',
    )
  })

  it('fails a state too close to its rest colour to see', () => {
    const found = problems(
      c => (relative(c, 'secondary-hover').light.lightness = { offset: -0.002 }),
    )
    expect(
      found.some(
        p => p.startsWith('nk.secondary-hover (light):') && p.endsWith('too close to see'),
      ),
    ).toBe(true)
  })

  it('fails a pressed state that moves less than hovered', () => {
    const found = problems(c => (relative(c, 'primary-active').light.lightness = { offset: 0.07 }))
    expect(found).toContain(
      'nk.primary-active (light): pressed must move further from rest than hovered',
    )
  })

  it('fails text that no longer reads on a hovered fill', () => {
    const found = problems(c => (relative(c, 'primary-hover').light.lightness = { offset: 0.5 }))
    expect(
      found.some(p => p.startsWith('color.primary-foreground on nk.primary-hover (light):')),
    ).toBe(true)
  })

  it('fails a state with no rest colour to belong to', () => {
    const found = problems(c => {
      c.nk['ghost-hover'] = { ...c.nk['secondary-hover'] }
    })
    expect(found).toContain('nk.ghost-hover: there is no color.ghost for it to be a state of')
  })

  it('caps chroma where a darker red would leave sRGB', () => {
    const found = problems(c => (relative(c, 'destructive-active').light.chromaMax = 'keep'))
    expect(
      found.some(p => p.startsWith('nk.destructive-active (light):') && p.includes('outside sRGB')),
    ).toBe(true)
  })
})
