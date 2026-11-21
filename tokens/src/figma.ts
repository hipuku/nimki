/**
 * The Figma parity check (master plan step F5). Figma's variables REST API
 * needs an Enterprise plan, so the file is read by a script run inside Figma
 * (FIGMA_EXPORT_SCRIPT, through the Figma MCP's use_figma tool) and its output
 * saved as figma/snapshot/nimki.json. CI then compares that snapshot with
 * tokens/generated/figma-variables.json, offline: a value changed in the
 * source but not in Figma, or in Figma but not in the source, fails.
 *
 * Both sides are brought to one shape first, keyed by name, with numbers
 * rounded to three places, because Figma stores 32-bit floats (0.12 comes back
 * as 0.1199999973).
 */

type Value = number | string | { alias: string } | Record<string, unknown> | number[]

export interface Snapshot {
  collections: Record<string, string[]>
  variables: Record<
    string,
    {
      collection: string
      type: string
      web: string | null
      scopes: string[] | null
      values: Record<string, Value>
    }
  >
  effectStyles: Record<
    string,
    { type: string; x: number; y: number; radius: number; spread: number; color: string }[]
  >
}

const round = (n: number) => Math.round(n * 1000) / 1000

function roundDeep(value: unknown): unknown {
  if (typeof value === 'number') return round(value)
  if (Array.isArray(value)) return value.map(roundDeep)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, roundDeep(v)]),
    )
  }
  return value
}

/** A colour as [r, g, b, a]; an easing keeps only the fields its type uses. */
function normaliseValue(value: unknown): Value {
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>
    if ('alias' in v) return { alias: v.alias as string }
    if ('r' in v) return [v.r, v.g, v.b, v.a].map(n => round(n as number))
    if (v.type === 'LINEAR') return { type: 'LINEAR' }
    return roundDeep(v) as Value
  }
  return roundDeep(value) as Value
}

/** Scopes are compared only where Figma lets them be set (not on TIMING or EASING). */
const scoped = (type: string, scopes: string[]) =>
  type === 'TIMING' || type === 'EASING' ? null : [...scopes].sort()

interface Generated {
  variableCollections: { id: string; name: string }[]
  variableModes: { id: string; name: string; variableCollectionId: string }[]
  variables: {
    id: string
    name: string
    variableCollectionId: string
    resolvedType: string
    scopes: string[]
    codeSyntax?: { WEB: string }
  }[]
  variableModeValues: { variableId: string; modeId: string; value: unknown }[]
  effectStyles: {
    name: string
    layers: {
      type: string
      offset: { x: number; y: number }
      radius: number
      spread: number
      colorVariableId?: string
    }[]
  }[]
}

/** tokens/generated/figma-variables.json in the snapshot's shape. */
export function fromGenerated(generated: Generated): Snapshot {
  const collectionName = new Map(generated.variableCollections.map(c => [c.id, c.name]))
  const modeName = new Map(generated.variableModes.map(m => [m.id, m.name]))
  const variableName = new Map(generated.variables.map(v => [v.id, v.name]))
  const collections: Snapshot['collections'] = {}
  for (const c of generated.variableCollections) {
    collections[c.name] = generated.variableModes
      .filter(m => m.variableCollectionId === c.id)
      .map(m => m.name)
  }
  const variables: Snapshot['variables'] = {}
  for (const v of generated.variables) {
    variables[v.name] = {
      collection: collectionName.get(v.variableCollectionId) as string,
      type: v.resolvedType,
      web: v.codeSyntax?.WEB ?? null,
      scopes: scoped(v.resolvedType, v.scopes),
      values: {},
    }
  }
  for (const { variableId, modeId, value } of generated.variableModeValues) {
    const target = variables[
      variableName.get(variableId) as string
    ] as Snapshot['variables'][string]
    const alias =
      value && typeof value === 'object' && (value as { type?: string }).type === 'VARIABLE_ALIAS'
        ? { alias: variableName.get((value as { id: string }).id) as string }
        : value
    target.values[modeName.get(modeId) as string] = normaliseValue(alias)
  }
  const effectStyles: Snapshot['effectStyles'] = {}
  for (const style of generated.effectStyles) {
    effectStyles[style.name] = style.layers.map(layer => ({
      type: layer.type,
      x: round(layer.offset.x),
      y: round(layer.offset.y),
      radius: round(layer.radius),
      spread: round(layer.spread),
      color: variableName.get(layer.colorVariableId ?? '') ?? '',
    }))
  }
  return { collections, variables, effectStyles }
}

/** Brings a saved Figma export to the same rounding and ordering. */
export function normaliseSnapshot(raw: Snapshot): Snapshot {
  const variables: Snapshot['variables'] = {}
  for (const [name, v] of Object.entries(raw.variables)) {
    variables[name] = {
      ...v,
      scopes: v.scopes === null ? null : scoped(v.type, v.scopes),
      values: Object.fromEntries(
        Object.entries(v.values).map(([m, val]) => [m, normaliseValue(val)]),
      ),
    }
  }
  return {
    collections: raw.collections,
    variables,
    effectStyles: roundDeep(raw.effectStyles) as Snapshot['effectStyles'],
  }
}

/**
 * Equal within 0.002, about half of one step in an 8-bit colour channel, so
 * Figma's 32-bit floats and the source's rounding cannot split a value that
 * sits on a rounding boundary.
 */
export function close(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 0.002
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => close(item, b[i]))
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = Object.keys(a)
    return (
      keys.length === Object.keys(b).length &&
      keys.every(key =>
        close((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
      )
    )
  }
  return a === b
}

/** Every difference between what the source generates and what the Figma file holds. */
export function compare(expected: Snapshot, actual: Snapshot): string[] {
  const problems: string[] = []
  const same = (a: unknown, b: unknown) => close(a, b)
  for (const [name, modes] of Object.entries(expected.collections)) {
    const got = actual.collections[name]
    if (!got) problems.push(`collection ${name} is missing from Figma`)
    else if (!same(got, modes))
      problems.push(`collection ${name}: modes ${got.join(', ')}, expected ${modes.join(', ')}`)
  }
  for (const name of Object.keys(actual.collections)) {
    if (!expected.collections[name])
      problems.push(`collection ${name} is in Figma but not in the source`)
  }
  for (const [name, want] of Object.entries(expected.variables)) {
    const got = actual.variables[name]
    if (!got) {
      problems.push(`variable ${name} is missing from Figma`)
      continue
    }
    for (const key of ['collection', 'type', 'web', 'scopes'] as const) {
      if (!same(got[key], want[key])) {
        problems.push(
          `variable ${name}: ${key} is ${JSON.stringify(got[key])}, expected ${JSON.stringify(want[key])}`,
        )
      }
    }
    for (const [mode, value] of Object.entries(want.values)) {
      if (!same(got.values[mode], value)) {
        problems.push(
          `variable ${name} (${mode}): ${JSON.stringify(got.values[mode])}, expected ${JSON.stringify(value)}`,
        )
      }
    }
  }
  for (const name of Object.keys(actual.variables)) {
    if (!expected.variables[name])
      problems.push(`variable ${name} is in Figma but not in the source`)
  }
  for (const [name, layers] of Object.entries(expected.effectStyles)) {
    const got = actual.effectStyles[name]
    if (!got) problems.push(`effect style ${name} is missing from Figma`)
    else if (!same(got, layers))
      problems.push(`effect style ${name}: layers differ from the source`)
  }
  for (const name of Object.keys(actual.effectStyles)) {
    if (!expected.effectStyles[name])
      problems.push(`effect style ${name} is in Figma but not in the source`)
  }
  return problems
}

/**
 * Run inside Figma with use_figma; its return value is the snapshot. Kept as a
 * string because it runs in Figma's plugin sandbox, not in Node.
 */
export const FIGMA_EXPORT_SCRIPT = `const collections = await figma.variables.getLocalVariableCollectionsAsync();
const all = await figma.variables.getLocalVariablesAsync();
const byId = new Map(all.map(v => [v.id, v]));
const r = n => Math.round(n * 1000) / 1000;
const value = val => {
  if (val && typeof val === 'object' && val.type === 'VARIABLE_ALIAS') return { alias: byId.get(val.id).name };
  if (val && typeof val === 'object' && 'r' in val) return [r(val.r), r(val.g), r(val.b), r(val.a)];
  if (val && typeof val === 'object' && val.type === 'LINEAR') return { type: 'LINEAR' };
  if (typeof val === 'number') return r(val);
  return val;
};
const out = { collections: {}, variables: {}, effectStyles: {} };
for (const c of collections) {
  out.collections[c.name] = c.modes.map(m => m.name);
  for (const id of c.variableIds) {
    const v = byId.get(id);
    const values = {};
    for (const m of c.modes) values[m.name] = value(v.valuesByMode[m.modeId]);
    const timed = v.resolvedType === 'TIMING' || v.resolvedType === 'EASING';
    out.variables[v.name] = { collection: c.name, type: v.resolvedType, web: v.codeSyntax.WEB ?? null, scopes: timed ? null : v.scopes, values };
  }
}
for (const s of await figma.getLocalEffectStylesAsync()) {
  out.effectStyles[s.name] = s.effects.map(e => ({ type: e.type, x: r(e.offset.x), y: r(e.offset.y), radius: r(e.radius), spread: r(e.spread ?? 0), color: e.boundVariables?.color ? byId.get(e.boundVariables.color.id).name : '' }));
}
return out;`
