/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await --
   A stand-in for Figma's plugin API: plain objects shaped like Figma's. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import {
  FIGMA_EXPORT_SCRIPT,
  SYNC_PAYLOAD_KIND,
  compare,
  figmaSyncScript,
  fromGenerated,
  pluginCode,
  readExport,
  syncData,
} from './figma.ts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

const root = join(import.meta.dirname, '../..')
const code = fromGenerated(
  JSON.parse(
    readFileSync(join(root, 'tokens/generated/figma-variables.json'), 'utf8'),
  ) as Parameters<typeof fromGenerated>[0],
)

/**
 * An in-memory Figma file with the parts of the plugin API the scripts use.
 * Floats are stored as 32-bit, as Figma does.
 */
function fakeFigma() {
  let next = 1
  const id = (prefix: string) => `${prefix}:${next++}`
  const f32 = (n: number) => Math.fround(n)
  const store = (value: Any): Any => {
    if (typeof value === 'number') return f32(value)
    if (value && typeof value === 'object' && 'r' in value) {
      return { r: f32(value.r), g: f32(value.g), b: f32(value.b), a: f32(value.a) }
    }
    return structuredClone(value)
  }
  const collections: Any[] = []
  const variables: Any[] = []
  const styles: Any[] = []
  const textStyles: Any[] = []
  const fonts = new Set<string>()
  const figma = {
    async loadFontAsync(font: Any) {
      fonts.add(`${font.family} ${font.style}`)
    },
    getLocalTextStylesAsync: async () => textStyles.slice(),
    createTextStyle() {
      const s: Any = {
        name: '',
        boundVariables: {},
        remove() {
          textStyles.splice(textStyles.indexOf(s), 1)
        },
        setBoundVariable(field: string, v: Any) {
          s.boundVariables[field] = { type: 'VARIABLE_ALIAS', id: v.id }
        },
      }
      // Figma refuses a font that was not loaded first.
      let fontName: Any = { family: 'Inter', style: 'Regular' }
      Object.defineProperty(s, 'fontName', {
        get: () => fontName,
        set(value: Any) {
          if (!fonts.has(`${value.family} ${value.style}`))
            throw new Error(`font ${value.family} ${value.style} was not loaded`)
          fontName = value
        },
      })
      s.fontSize = f32(12)
      s.lineHeight = { unit: 'AUTO' }
      s.letterSpacing = { unit: 'PERCENT', value: 0 }
      textStyles.push(s)
      return s
    },
    variables: {
      getLocalVariableCollectionsAsync: async () => collections.slice(),
      getLocalVariablesAsync: async () => variables.slice(),
      createVariableCollection(name: string) {
        const c: Any = {
          id: id('VariableCollectionId'),
          name,
          modes: [{ modeId: id('mode'), name: 'Mode 1' }],
          get variableIds() {
            return variables.filter(v => v.variableCollectionId === c.id).map(v => v.id)
          },
          renameMode(modeId: string, newName: string) {
            c.modes.find((m: Any) => m.modeId === modeId).name = newName
          },
          addMode(modeName: string) {
            c.modes.push({ modeId: id('mode'), name: modeName })
          },
          removeMode(modeId: string) {
            c.modes = c.modes.filter((m: Any) => m.modeId !== modeId)
          },
          remove() {
            collections.splice(collections.indexOf(c), 1)
          },
        }
        collections.push(c)
        return c
      },
      createVariable(name: string, collection: Any, resolvedType: string) {
        const v: Any = {
          id: id('VariableID'),
          name,
          resolvedType,
          variableCollectionId: collection.id,
          valuesByMode: {},
          scopes: ['ALL_SCOPES'],
          codeSyntax: {},
          setValueForMode(modeId: string, value: Any) {
            v.valuesByMode[modeId] = store(value)
          },
          setVariableCodeSyntax(platform: string, value: string) {
            v.codeSyntax[platform] = value
          },
          removeVariableCodeSyntax(platform: string) {
            delete v.codeSyntax[platform]
          },
          remove() {
            variables.splice(variables.indexOf(v), 1)
          },
        }
        variables.push(v)
        return v
      },
      createVariableAlias: (v: Any) => ({ type: 'VARIABLE_ALIAS', id: v.id }),
      setBoundVariableForEffect: (effect: Any, _field: string, v: Any) => ({
        ...effect,
        boundVariables: { color: { type: 'VARIABLE_ALIAS', id: v.id } },
      }),
    },
    getLocalEffectStylesAsync: async () => styles.slice(),
    createEffectStyle() {
      const s: Any = {
        name: '',
        effects: [],
        remove() {
          styles.splice(styles.indexOf(s), 1)
        },
      }
      styles.push(s)
      return s
    },
  }
  return { figma, variables, collections, styles, textStyles }
}

const run = (figma: Any, source: string): Promise<Any> =>
  runInNewContext(`(async () => {\n${source}\n})()`, { figma })

describe('the sync and export scripts, against a stand-in Figma file', () => {
  it('build an empty file into one that exports exactly as code', async () => {
    const { figma } = fakeFigma()
    const { changes } = await run(figma, figmaSyncScript(code, false))
    expect(changes.length).toBeGreaterThan(117)
    const exported = readExport(JSON.parse(await run(figma, FIGMA_EXPORT_SCRIPT)))
    expect(compare(code, exported)).toEqual([])
  })

  it('report nothing to change once the file matches', async () => {
    const { figma } = fakeFigma()
    await run(figma, figmaSyncScript(code, false))
    expect((await run(figma, figmaSyncScript(code, true))).changes).toEqual([])
  })

  it('list a hand-edited value in a dry run, and put it back with apply', async () => {
    const { figma, variables, collections } = fakeFigma()
    await run(figma, figmaSyncScript(code, false))
    const fast = variables.find(v => v.name === 'duration/fast')
    const mode = collections.find(c => c.id === fast.variableCollectionId).modes[0].modeId
    fast.setValueForMode(mode, 0.5)
    expect((await run(figma, figmaSyncScript(code, true))).changes).toEqual([
      'value duration/fast (Value)',
    ])
    expect(fast.valuesByMode[mode]).toBeCloseTo(0.5)
    await run(figma, figmaSyncScript(code, false))
    expect(fast.valuesByMode[mode]).toBeCloseTo(0.12)
  })

  it('build text styles with the font loaded and the family bound to its variable', async () => {
    const { figma, textStyles, variables } = fakeFigma()
    await run(figma, figmaSyncScript(code, false))
    const lg = textStyles.find(s => s.name === 'text/lg')
    expect(lg.fontName).toEqual({ family: 'DM Sans', style: 'SemiBold' })
    expect(lg.lineHeight).toEqual({ unit: 'PIXELS', value: 28 })
    const sans = variables.find(v => v.name === 'font/sans')
    expect(lg.boundVariables.fontFamily.id).toBe(sans.id)
    // A style held in percent reads back in px, so it is not rewritten.
    lg.letterSpacing = { unit: 'PERCENT', value: 0 }
    expect((await run(figma, figmaSyncScript(code, true))).changes).toEqual([])
    lg.fontSize = 19
    expect((await run(figma, figmaSyncScript(code, true))).changes).toEqual([
      'set text style text/lg',
    ])
  })

  it('remove what code no longer has, and only under nimki/', async () => {
    const { figma, variables, collections, styles } = fakeFigma()
    await run(figma, figmaSyncScript(code, false))
    const colour = collections.find(c => c.name === 'nimki/colour')
    figma.variables.createVariable('nk/stray', colour, 'COLOR')
    const other = figma.variables.createVariableCollection('someone else')
    figma.variables.createVariable('kept', other, 'FLOAT')
    figma.createEffectStyle().name = 'elevation/9'
    figma.createTextStyle().name = 'text/stray'
    const { changes } = await run(figma, figmaSyncScript(code, false))
    expect(changes).toEqual(
      expect.arrayContaining([
        'remove variable nk/stray',
        'remove effect style elevation/9',
        'remove text style text/stray',
      ]),
    )
    expect(variables.some(v => v.name === 'nk/stray')).toBe(false)
    expect(variables.some(v => v.name === 'kept')).toBe(true)
    expect(styles.some(s => s.name === 'elevation/9')).toBe(false)
  })
})

describe('the dev plugin', () => {
  /** Loads code.js with a stand-in figma and UI, and returns what the UI receives. */
  async function plugin(message: Any) {
    const { figma } = fakeFigma()
    const sent: Any[] = []
    let onmessage: Any
    const ui = {
      postMessage: (m: Any) => sent.push(m),
      set onmessage(handler: Any) {
        onmessage = handler
      },
    }
    runInNewContext(readFileSync(join(root, 'figma/plugin/code.js'), 'utf8'), {
      figma: { ...figma, showUI: () => {}, ui },
      __html__: '',
    })
    await onmessage(message)
    return sent
  }

  it('syncs from what figma:out copies, then exports a snapshot that matches code', async () => {
    const payload = JSON.stringify({ kind: SYNC_PAYLOAD_KIND, expected: syncData(code) })
    const [reply] = await plugin({ type: 'sync', text: payload })
    expect(reply.type).toBe('synced')
    expect(reply.changes.length).toBeGreaterThan(0)
    expect(compare(code, readExport(JSON.parse(reply.text)))).toEqual([])
  })

  it('exports on Export', async () => {
    const [reply] = await plugin({ type: 'export' })
    expect(reply.type).toBe('exported')
    expect(() => readExport(JSON.parse(reply.text))).not.toThrow()
  })

  it('refuses a paste that is not figma:out output', async () => {
    for (const text of ['hello', '{"kind":"other"}']) {
      const [reply] = await plugin({ type: 'sync', text })
      expect(reply).toEqual({
        type: 'error',
        text: 'That is not what pnpm figma:out copied. Run it again and paste.',
      })
    }
  })

  it('is generated from the scripts', () => {
    expect(readFileSync(join(root, 'figma/plugin/code.js'), 'utf8')).toBe(pluginCode())
  })
})
