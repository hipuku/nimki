/**
 * The live check (master plan step 1.4c). The export is produced by a script
 * inside Figma, so a fault in that script would hide a difference from every
 * other check. This one reads the file another way, through Figma's REST API,
 * from the Parity page: a generated page that binds every variable Figma lets
 * a node bind, in every mode, and applies every text and effect style.
 *
 * - A colour variable fills a rectangle.
 * - A number variable sets an auto layout frame's gap, which may be zero or a
 *   fraction, unlike a size.
 * - A string variable is a text layer's content.
 * - A text style sets a text layer; an effect style sets a rectangle in each
 *   colour mode, so its bound colours resolve in both.
 *
 * Motion's TIMING and EASING variables cannot be bound to a node, so they are
 * checked through the export and the freshness check only.
 */
import { close, type Snapshot } from './figma.ts'
import { FONT_STYLE } from './layout.ts'

/** The page the check reads. */
export const LIVE_PAGE = 'Parity'

/** The collection whose modes the effect styles are shown in. */
const COLOUR = 'nimki/colour'

const REBUILD = 'run pnpm figma:live --script through use_figma to rebuild the page'

/** A node as Figma's REST API returns it, reduced to what the check reads. */
export interface RestNode {
  name: string
  type: string
  children?: RestNode[]
  fills?: {
    type: string
    opacity?: number
    color?: { r: number; g: number; b: number; a: number }
  }[]
  itemSpacing?: number
  characters?: string
  style?: {
    fontFamily?: string
    fontWeight?: number
    fontSize?: number
    lineHeightPx?: number
    letterSpacing?: number
  }
  effects?: {
    type: string
    visible?: boolean
    color?: { r: number; g: number; b: number; a: number }
    offset?: { x: number; y: number }
    radius?: number
    spread?: number
  }[]
}

type Kind = 'COLOR' | 'FLOAT' | 'STRING'
const BINDABLE = new Set<string>(['COLOR', 'FLOAT', 'STRING'])

/** Each collection with a variable a node can bind, and those variables, in code's order. */
function plan(expected: Snapshot): { collection: string; modes: string[]; names: string[] }[] {
  return Object.entries(expected.collections)
    .map(([collection, modes]) => ({
      collection,
      modes,
      names: Object.entries(expected.variables)
        .filter(([, v]) => v.collection === collection && BINDABLE.has(v.type))
        .map(([name]) => name),
    }))
    .filter(group => group.names.length > 0)
}

/** The frame that shows one collection in one mode. */
const frameName = (collection: string, mode: string) => `${collection} / ${mode}`

/** A variable's value in a mode, following aliases to a value. */
function resolve(expected: Snapshot, name: string, mode: string): unknown {
  for (let seen = 0; seen < 10; seen++) {
    const variable = expected.variables[name]
    if (!variable) return null
    // An alias into another collection reads that collection's own mode: its
    // only one, since nimki aliases across collections only into single-mode
    // ones. The variable asked for must have the mode itself.
    const values = Object.values(variable.values)
    const value = variable.values[mode] ?? (seen > 0 && values.length === 1 ? values[0] : undefined)
    if (value === undefined) return null
    if (!value || typeof value !== 'object' || !('alias' in value)) return value
    name = value.alias as string
  }
  return null
}

/**
 * The script, for use_figma, that builds the Parity page. Running it again
 * rebuilds the page, so it follows variables and styles being added or removed.
 */
export function liveScript(expected: Snapshot): string {
  const groups = plan(expected).map(group => ({
    ...group,
    types: Object.fromEntries(
      group.names.map(name => [name, expected.variables[name]?.type as Kind]),
    ),
  }))
  return `const groups = ${JSON.stringify(groups)};
const textStyleNames = ${JSON.stringify(Object.keys(expected.textStyles))};
const effectStyleNames = ${JSON.stringify(Object.keys(expected.effectStyles))};
const colourModes = ${JSON.stringify(expected.collections[COLOUR] ?? [])};
const collections = await figma.variables.getLocalVariableCollectionsAsync();
const all = await figma.variables.getLocalVariablesAsync();
const key = v => collections.find(c => c.id === v.variableCollectionId)?.name + ' ' + v.name;
const vars = new Map(all.map(v => [key(v), v]));
const textStyles = new Map((await figma.getLocalTextStylesAsync()).map(s => [s.name, s]));
const effectStyles = new Map((await figma.getLocalEffectStylesAsync()).map(s => [s.name, s]));
const missing = [
  ...groups.flatMap(g => g.names.filter(n => !vars.has(g.collection + ' ' + n)).map(n => g.collection + ' ' + n)),
  ...textStyleNames.filter(n => !textStyles.has(n)),
  ...effectStyleNames.filter(n => !effectStyles.has(n)),
];
if (missing.length > 0) return { error: 'Sync from code first; Figma has no ' + missing.join(', ') };
await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
for (const s of textStyles.values()) await figma.loadFontAsync(s.fontName);
const solid = { type: 'SOLID', color: { r: 0, g: 0, b: 0 } };
const bind = variable => [figma.variables.setBoundVariableForPaint(solid, 'color', variable)];
const ink = { type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } };
const text = (parent, name, characters, size) => {
  const t = figma.createText();
  parent.appendChild(t);
  t.name = name;
  t.fontSize = size;
  t.characters = characters;
  t.fills = [ink];
  return t;
};
const row = (parent, name, direction) => {
  const f = figma.createFrame();
  parent.appendChild(f);
  f.name = name;
  f.layoutMode = direction;
  f.primaryAxisSizingMode = 'AUTO';
  f.counterAxisSizingMode = 'AUTO';
  f.fills = [];
  return f;
};
let page = figma.root.children.find(p => p.name === ${JSON.stringify(LIVE_PAGE)});
if (!page) { page = figma.createPage(); page.name = ${JSON.stringify(LIVE_PAGE)}; }
await page.loadAsync();
for (const node of [...page.children]) node.remove();
const note = text(page, 'note', 'Generated by pnpm figma:live --script. CI reads this page through Figma\\'s REST API and compares it with code (figma/README.md). Do not edit by hand; run the script again when a variable or style is added or removed.', 14);
note.textAutoResize = 'HEIGHT';
note.resize(1000, note.height);
let y = note.height + 32;
const board = (name, collection, mode) => {
  const frame = figma.createFrame();
  page.appendChild(frame);
  frame.name = name;
  if (collection) {
    const c = collections.find(x => x.name === collection);
    frame.setExplicitVariableModeForCollection(c, c.modes.find(m => m.name === mode).modeId);
  }
  frame.layoutMode = 'HORIZONTAL';
  frame.layoutWrap = 'WRAP';
  frame.primaryAxisSizingMode = 'FIXED';
  frame.counterAxisSizingMode = 'AUTO';
  frame.resize(1000, 100);
  frame.itemSpacing = 12;
  frame.counterAxisSpacing = 16;
  frame.paddingTop = frame.paddingBottom = frame.paddingLeft = frame.paddingRight = 24;
  frame.fills = [{ type: 'SOLID', color: { r: 0.97, g: 0.97, b: 0.97 } }];
  frame.y = y;
  return frame;
};
const cell = (frame, name) => {
  const c = row(frame, name, 'VERTICAL');
  c.counterAxisSizingMode = 'FIXED';
  c.resize(120, 10);
  c.itemSpacing = 6;
  return c;
};
for (const group of groups) {
  for (const mode of group.modes) {
    const frame = board(group.collection + ' / ' + mode, group.collection, mode);
    for (const name of group.names) {
      const variable = vars.get(group.collection + ' ' + name);
      const c = cell(frame, name);
      if (group.types[name] === 'COLOR') {
        const swatch = figma.createRectangle();
        c.appendChild(swatch);
        swatch.name = 'value';
        swatch.resize(120, 40);
        swatch.fills = bind(variable);
        swatch.strokes = [ink];
        swatch.strokeWeight = 1;
      } else if (group.types[name] === 'FLOAT') {
        const gap = row(c, 'value', 'HORIZONTAL');
        for (let i = 0; i < 2; i++) {
          const dot = figma.createRectangle();
          gap.appendChild(dot);
          dot.name = 'dot';
          dot.resize(6, 6);
          dot.fills = [ink];
        }
        gap.setBoundVariable('itemSpacing', variable);
      } else {
        const t = text(c, 'value', ' ', 12);
        t.setBoundVariable('characters', variable);
      }
      text(c, 'label', name, 10).layoutSizingHorizontal = 'FILL';
    }
    y += frame.height + 40;
  }
}
const styles = board('Text styles', null, null);
for (const name of textStyleNames) {
  const t = figma.createText();
  styles.appendChild(t);
  t.name = name;
  await t.setTextStyleIdAsync(textStyles.get(name).id);
  t.characters = name;
  t.fills = [ink];
}
y += styles.height + 40;
for (const mode of colourModes) {
  const frame = board('Effect styles / ' + mode, ${JSON.stringify(COLOUR)}, mode);
  for (const name of effectStyleNames) {
    const r = figma.createRectangle();
    frame.appendChild(r);
    r.name = name;
    r.resize(120, 64);
    r.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
    await r.setEffectStyleIdAsync(effectStyles.get(name).id);
  }
  y += frame.height + 40;
}
return { page: page.id, variables: groups.reduce((n, g) => n + g.names.length * g.modes.length, 0), textStyles: textStyleNames.length, effectStyles: effectStyleNames.length * colourModes.length };`
}

const round = (n: number) => Math.round(n * 1000) / 1000

/** A paint or effect colour as [r, g, b, a], alpha from the paint's opacity. */
function rgba(color: { r: number; g: number; b: number; a: number }, opacity = 1): number[] {
  return [round(color.r), round(color.g), round(color.b), round(color.a * opacity)]
}

/** What a variable's cell shows, in the snapshot's shape, or null when it shows nothing. */
function shown(cell: RestNode, type: string): unknown {
  const value = cell.children?.find(child => child.name === 'value')
  if (!value) return null
  if (type === 'COLOR') {
    const fill = value.fills?.[0]
    return fill?.type === 'SOLID' && fill.color ? rgba(fill.color, fill.opacity) : null
  }
  // The REST API leaves out a gap of zero.
  if (type === 'FLOAT') return round(value.itemSpacing ?? 0)
  return value.characters ?? null
}

const weightOf = (style: string) =>
  Number(Object.entries(FONT_STYLE).find(([, name]) => name === style)?.[0] ?? NaN)

/**
 * Compares the Parity page, as the REST API returns it, with code: every
 * bindable variable in every mode, every text style and every effect style in
 * each colour mode. Extra cells, frames or styles are reported too, so the
 * page cannot fall behind code.
 */
export function liveProblems(expected: Snapshot, page: RestNode | undefined): string[] {
  if (!page) return [`The ${LIVE_PAGE} page is missing: ${REBUILD}`]
  const problems: string[] = []
  const frames = new Map((page.children ?? []).map(child => [child.name, child]))
  const expectedFrames = new Set<string>()
  const cells = (frame: RestNode) => new Map((frame.children ?? []).map(c => [c.name, c]))
  const frameOrProblem = (name: string) => {
    expectedFrames.add(name)
    const frame = frames.get(name)
    if (!frame) problems.push(`No "${name}" frame on the ${LIVE_PAGE} page: ${REBUILD}`)
    return frame
  }

  for (const group of plan(expected)) {
    for (const mode of group.modes) {
      const frame = frameOrProblem(frameName(group.collection, mode))
      if (!frame) continue
      const byName = cells(frame)
      for (const name of group.names) {
        const cell = byName.get(name)
        if (!cell) {
          problems.push(`${name} (${mode}): not on the page; ${REBUILD}`)
          continue
        }
        const type = expected.variables[name]?.type as string
        const got = shown(cell, type)
        const want = resolve(expected, name, mode)
        if (got === null) {
          problems.push(`${name} (${mode}): its cell shows no value; ${REBUILD}`)
        } else if (want === null || !close(got, want)) {
          problems.push(
            `${name} (${mode}): Figma shows ${JSON.stringify(got)}, code has ${JSON.stringify(want)}`,
          )
        }
      }
      for (const name of byName.keys()) {
        if (!group.names.includes(name))
          problems.push(`${name} (${mode}): on the page but not in code; ${REBUILD}`)
      }
    }
  }

  const styleFrame = frameOrProblem('Text styles')
  if (styleFrame) {
    const byName = cells(styleFrame)
    for (const [name, want] of Object.entries(expected.textStyles)) {
      const style = byName.get(name)?.style
      if (!style) {
        problems.push(`text style ${name}: not on the page; ${REBUILD}`)
        continue
      }
      const fontVariable = expected.variables[want.family]
      const family = fontVariable
        ? resolve(expected, want.family, Object.keys(fontVariable.values)[0] as string)
        : want.family
      const got = {
        family: style.fontFamily,
        weight: style.fontWeight,
        size: round(style.fontSize ?? NaN),
        lineHeight: round(style.lineHeightPx ?? NaN),
        letterSpacing: round(style.letterSpacing ?? 0),
      }
      const code = {
        family,
        weight: weightOf(want.style),
        size: want.size,
        lineHeight: want.lineHeight,
        letterSpacing: want.letterSpacing,
      }
      if (!close(got, code)) {
        problems.push(
          `text style ${name}: Figma shows ${JSON.stringify(got)}, code has ${JSON.stringify(code)}`,
        )
      }
    }
    for (const name of byName.keys()) {
      if (!(name in expected.textStyles))
        problems.push(`text style ${name}: on the page but not in code; ${REBUILD}`)
    }
  }

  for (const mode of expected.collections[COLOUR] ?? []) {
    const frame = frameOrProblem(`Effect styles / ${mode}`)
    if (!frame) continue
    const byName = cells(frame)
    for (const [name, layers] of Object.entries(expected.effectStyles)) {
      const node = byName.get(name)
      if (!node) {
        problems.push(`effect style ${name} (${mode}): not on the page; ${REBUILD}`)
        continue
      }
      const got = (node.effects ?? [])
        .filter(effect => effect.visible !== false)
        .map(effect => ({
          type: effect.type,
          x: round(effect.offset?.x ?? 0),
          y: round(effect.offset?.y ?? 0),
          radius: round(effect.radius ?? 0),
          spread: round(effect.spread ?? 0),
          color: effect.color ? rgba(effect.color) : null,
        }))
      const code = layers.map(layer => ({
        type: layer.type,
        x: layer.x,
        y: layer.y,
        radius: layer.radius,
        spread: layer.spread,
        color: layer.color ? resolve(expected, layer.color, mode) : null,
      }))
      if (!close(got, code)) {
        problems.push(
          `effect style ${name} (${mode}): Figma shows ${JSON.stringify(got)}, code has ${JSON.stringify(code)}`,
        )
      }
    }
  }

  for (const name of frames.keys()) {
    if (name !== 'note' && !expectedFrames.has(name))
      problems.push(`"${name}" is on the ${LIVE_PAGE} page but not in code; ${REBUILD}`)
  }
  return problems
}

/** How many values the page holds, for the success message. */
export function liveCount(expected: Snapshot): number {
  const variables = plan(expected).reduce((n, g) => n + g.names.length * g.modes.length, 0)
  const effects =
    Object.keys(expected.effectStyles).length * (expected.collections[COLOUR] ?? []).length
  return variables + Object.keys(expected.textStyles).length + effects
}
