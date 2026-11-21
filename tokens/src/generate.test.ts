import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { springToLinear } from '@hipuku/nimki'
import { describe, expect, it } from 'vitest'
import { OUTPUTS, generate, loadSource, render } from './generate.ts'

const root = join(import.meta.dirname, '../..')
const outputs = render(loadSource(join(root, 'tokens/source')))

interface Figma {
  variableCollections: { id: string; name: string; initialModeId: string }[]
  variableModes: { id: string; name: string; variableCollectionId: string; action: string }[]
  variables: { id: string; name: string; codeSyntax?: { WEB: string } }[]
  variableModeValues: { variableId: string; modeId: string; value: unknown }[]
}
const figma = JSON.parse(outputs.figma) as Figma

describe('generate', () => {
  it('matches every generated file on disk', async () => {
    // The same comparison as pnpm tokens:check, so a stale output also fails the tests.
    const generated = await generate(root)
    expect([...generated.keys()].sort()).toEqual(Object.values(OUTPUTS).sort())
    for (const [path, content] of generated) {
      expect(readFileSync(join(root, path), 'utf8'), path).toBe(content)
    }
  })
})

describe('motion.css', () => {
  it('declares each theme on its own selector and reduced motion last', () => {
    const css = outputs.motionCss
    const order = [
      ":root,\n[data-motion='subtle']",
      "[data-motion='expressive']",
      '@media (prefers-reduced-motion: reduce)',
      '[data-motion-reduce],\n[data-motion-reduce] [data-motion]',
    ].map(selector => css.indexOf(selector))
    expect(order.every(index => index >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('points roles at primitives, so tuning a primitive moves every role on it', () => {
    expect(outputs.motionCss).toContain('--nk-dialog-enter-duration: var(--nk-duration-moderate);')
    expect(outputs.motionCss).toContain('--nk-highlight-easing: var(--nk-spring-snappy-easing);')
  })

  it('writes a spring as its settle time and the engine linear() easing', () => {
    const spring = springToLinear({ visualDuration: 0.2, bounce: 0 })
    expect(outputs.motionCss).toContain(`--nk-spring-snappy-duration: ${spring.durationMs}ms;`)
    expect(outputs.motionCss).toContain(`--nk-spring-snappy-easing: ${spring.easing};`)
  })

  it('jumps the spring roles under reduced motion', () => {
    expect(outputs.motionCss).toContain('--nk-layout-duration: 0ms;')
    expect(outputs.motionCss).toContain('--nk-layout-easing: linear;')
  })
})

describe('density.css', () => {
  it('writes sizes in rem, comfortable on the root and compact on the attribute', () => {
    expect(outputs.densityCss).toMatch(
      /\[data-density='comfortable'\] \{\n {2}--nk-control-sm: 2rem;/,
    )
    expect(outputs.densityCss).toMatch(
      /\[data-density='compact'\] \{\n {2}--nk-control-sm: 1.75rem;/,
    )
    expect(outputs.densityCss).toContain('--nk-gap: 0.375rem;')
  })
})

describe('tokens.generated.ts', () => {
  it('gives the Motion adapter seconds, a bezier array or a spring', () => {
    // render() output, before Prettier drops the quotes on plain keys.
    expect(outputs.engine).toContain("'press': { duration: 0.12, ease: [0.65, 0, 0.35, 1] },")
    expect(outputs.engine).toContain(
      "'highlight': { type: 'spring', visualDuration: 0.2, bounce: 0 },",
    )
    expect(outputs.engine).toContain("'layout': { duration: 0 },")
  })
})

describe('figma-variables.json', () => {
  const ids = new Set(figma.variables.map(v => v.id))
  const modeIds = new Set(figma.variableModes.map(m => m.id))

  it('has one collection per layer, with its modes', () => {
    expect(figma.variableCollections.map(c => c.name)).toEqual([
      'nimki/primitives',
      'nimki/motion',
      'nimki/density',
    ])
    const motion = figma.variableModes.filter(m => m.variableCollectionId === 'collection:motion')
    expect(motion.map(m => m.name)).toEqual(['Subtle', 'Expressive', 'Reduced'])
    expect(motion[0]?.action).toBe('UPDATE')
  })

  it('sets every variable once in every mode of its collection', () => {
    for (const variable of figma.variables) {
      const set = figma.variableModeValues.filter(value => value.variableId === variable.id)
      expect(new Set(set.map(value => value.modeId)).size, variable.name).toBe(set.length)
      expect(set.length, variable.name).toBeGreaterThan(0)
    }
    for (const value of figma.variableModeValues) {
      expect(ids.has(value.variableId)).toBe(true)
      expect(modeIds.has(value.modeId)).toBe(true)
    }
  })

  it('aliases role variables to the primitive the CSS uses', () => {
    const value = (name: string, mode: string) =>
      figma.variableModeValues.find(v => v.variableId === `variable:${name}` && v.modeId === mode)
        ?.value
    expect(value('dialog-enter/duration', 'mode:motion:subtle')).toEqual({
      type: 'VARIABLE_ALIAS',
      id: 'variable:duration/moderate',
    })
    expect(value('highlight/bounce', 'mode:motion:expressive')).toEqual({
      type: 'VARIABLE_ALIAS',
      id: 'variable:spring/snappy-bounce/bounce',
    })
    expect(value('dialog-enter/offset', 'mode:motion:reduced')).toBe(0)
    expect(value('highlight/visual-duration', 'mode:motion:reduced')).toBe(0)
  })

  it('points every alias at a variable that exists', () => {
    for (const { value } of figma.variableModeValues) {
      if (typeof value === 'object' && value !== null) {
        expect(ids.has((value as { id: string }).id)).toBe(true)
      }
    }
  })

  it('gives code syntax only where the CSS holds the same value', () => {
    const syntax = (name: string) => figma.variables.find(v => v.name === name)?.codeSyntax
    expect(syntax('duration/fast')).toEqual({ WEB: 'var(--nk-duration-fast)' })
    expect(syntax('control-md')).toEqual({ WEB: 'var(--nk-control-md)' })
    expect(syntax('spring/snappy/visual-duration')).toBeUndefined()
  })
})
