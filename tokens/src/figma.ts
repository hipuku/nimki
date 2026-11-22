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
  /** When the export ran inside Figma, as ISO 8601; the freshness check compares it with the file's lastModified. */
  exportedAt?: string
  collections: Record<string, string[]>
  variables: Record<
    string,
    {
      /** Figma's variable id, for reading bound variables through the REST API. */
      id?: string
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
    ...(raw.exportedAt ? { exportedAt: raw.exportedAt } : {}),
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

/** The Figma file this repository's parity check reads. */
export const FIGMA_FILE_KEY = '7EoZah6GtSPR9XQlYWbzAO'

/**
 * FNV-1a, 32-bit, over UTF-16 code units, as hex. The export computes it inside
 * Figma over its own JSON and `figma:save` recomputes it, so an export copied
 * wrongly on its way to the repository is refused. It finds accidents, not
 * forgery.
 */
export function checksum(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** The body of the checksum as a string, so the export and Node run the same code. */
export const CHECKSUM_SOURCE = `const checksum = text => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 0x01000193); }
  return (hash >>> 0).toString(16).padStart(8, '0');
};`

/** What the export returns: the snapshot, when it was taken, and a checksum over both. */
export interface Export {
  exportedAt: string
  snapshot: Snapshot
  checksum: string
}

/**
 * Checks an export and returns its snapshot stamped with the export time, or
 * throws saying what is wrong. The checksum covers exportedAt and snapshot, in
 * that order, exactly as the export wrote them.
 */
export function readExport(raw: unknown): Snapshot {
  const value = raw as Partial<Export> | null
  if (!value || typeof value !== 'object' || !value.snapshot || !value.exportedAt) {
    throw new Error(
      'Not a nimki export: it needs exportedAt, snapshot and checksum. Run the export again.',
    )
  }
  const expected = checksum(
    JSON.stringify({ exportedAt: value.exportedAt, snapshot: value.snapshot }),
  )
  if (value.checksum !== expected) {
    throw new Error(
      `The export's checksum does not match (${String(value.checksum)}, expected ${expected}): it changed on the way here. Export again; do not edit it.`,
    )
  }
  const { collections, variables, effectStyles } = value.snapshot
  if (!collections || !variables || !effectStyles) {
    throw new Error('The export has no collections, variables or effect styles.')
  }
  return normaliseSnapshot({ ...value.snapshot, exportedAt: value.exportedAt })
}

/**
 * Whether the snapshot still describes the file: nothing saved in Figma after
 * the export. Returns a problem, or null.
 */
export function freshness(lastModified: string, exportedAt: string | undefined): string | null {
  if (!exportedAt) {
    return 'The snapshot has no export time. Export the file and run pnpm figma:save.'
  }
  const modified = Date.parse(lastModified)
  const exported = Date.parse(exportedAt)
  if (Number.isNaN(modified) || Number.isNaN(exported)) {
    return `Cannot compare the times: lastModified ${lastModified}, exportedAt ${exportedAt}.`
  }
  if (modified > exported) {
    return `Figma has changes that are not in the snapshot: the file was saved at ${lastModified}, the snapshot exported at ${exportedAt}. Export the file and run pnpm figma:save; if a value changed in Figma, run pnpm figma:sync to put code's value back first.`
  }
  return null
}

/** Shared by the export and the sync script: a variable value in the snapshot's shape. */
const VALUE_SOURCE = `const r = n => Math.round(n * 1000) / 1000;
const value = val => {
  if (val && typeof val === 'object' && val.type === 'VARIABLE_ALIAS') return { alias: byId.get(val.id).name };
  if (val && typeof val === 'object' && 'r' in val) return [r(val.r), r(val.g), r(val.b), r(val.a)];
  if (val && typeof val === 'object' && val.type === 'LINEAR') return { type: 'LINEAR' };
  if (typeof val === 'number') return r(val);
  return val;
};`

/**
 * Run inside Figma (the dev plugin in figma/plugin, or use_figma); returns an
 * Export as JSON. Kept as a string because it runs in Figma's plugin sandbox,
 * not in Node.
 */
export const FIGMA_EXPORT_SCRIPT = `const collections = await figma.variables.getLocalVariableCollectionsAsync();
const all = await figma.variables.getLocalVariablesAsync();
const byId = new Map(all.map(v => [v.id, v]));
${VALUE_SOURCE}
${CHECKSUM_SOURCE}
const snapshot = { collections: {}, variables: {}, effectStyles: {} };
for (const c of collections) {
  snapshot.collections[c.name] = c.modes.map(m => m.name);
  for (const id of c.variableIds) {
    const v = byId.get(id);
    const values = {};
    for (const m of c.modes) values[m.name] = value(v.valuesByMode[m.modeId]);
    const timed = v.resolvedType === 'TIMING' || v.resolvedType === 'EASING';
    snapshot.variables[v.name] = { id: v.id, collection: c.name, type: v.resolvedType, web: v.codeSyntax.WEB ?? null, scopes: timed ? null : v.scopes, values };
  }
}
for (const s of await figma.getLocalEffectStylesAsync()) {
  snapshot.effectStyles[s.name] = s.effects.map(e => ({ type: e.type, x: r(e.offset.x), y: r(e.offset.y), radius: r(e.radius), spread: r(e.spread ?? 0), color: e.boundVariables?.color ? byId.get(e.boundVariables.color.id).name : '' }));
}
const body = { exportedAt: new Date().toISOString(), snapshot };
return JSON.stringify({ ...body, checksum: checksum(JSON.stringify(body)) });`

/**
 * The script that makes the Figma file's variables and effect styles match
 * code: creates what is missing, sets what differs, and removes variables,
 * modes and collections under nimki/ that code no longer has. With dryRun it
 * changes nothing and only lists what it would do. Values are written at the
 * snapshot's precision (three decimals), inside the parity tolerance.
 */
export function figmaSyncScript(expected: Snapshot, dryRun: boolean): string {
  const data = {
    collections: expected.collections,
    variables: Object.fromEntries(
      Object.entries(expected.variables).map(([name, v]) => [
        name,
        { collection: v.collection, type: v.type, web: v.web, scopes: v.scopes, values: v.values },
      ]),
    ),
    effectStyles: expected.effectStyles,
  }
  return `const expected = ${JSON.stringify(data)};
const dryRun = ${dryRun};
const changes = [];
const close = (a, b) => {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 0.002;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => close(x, b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object') { const k = Object.keys(a); return k.length === Object.keys(b).length && k.every(x => close(a[x], b[x])); }
  return a === b;
};
let all = await figma.variables.getLocalVariablesAsync();
let byId = new Map(all.map(v => [v.id, v]));
${VALUE_SOURCE}
const owned = name => name.startsWith('nimki/');
let collections = await figma.variables.getLocalVariableCollectionsAsync();
const collectionByName = new Map(collections.map(c => [c.name, c]));
for (const [name, modes] of Object.entries(expected.collections)) {
  let c = collectionByName.get(name);
  if (!c) {
    changes.push('create collection ' + name);
    if (dryRun) continue;
    c = figma.variables.createVariableCollection(name);
    c.renameMode(c.modes[0].modeId, modes[0]);
    collectionByName.set(name, c);
  }
  for (const mode of modes) if (!c.modes.some(m => m.name === mode)) { changes.push('add mode ' + name + ' / ' + mode); if (!dryRun) c.addMode(mode); }
  for (const m of c.modes) if (!modes.includes(m.name)) { changes.push('remove mode ' + name + ' / ' + m.name); if (!dryRun) c.removeMode(m.modeId); }
}
for (const c of collections) if (owned(c.name) && !(c.name in expected.collections)) { changes.push('remove collection ' + c.name); if (!dryRun) c.remove(); }
const varByName = new Map(all.map(v => [v.name, v]));
for (const [name, want] of Object.entries(expected.variables)) {
  const v = varByName.get(name);
  const c = collectionByName.get(want.collection);
  if (v && (v.resolvedType !== want.type || v.variableCollectionId !== c?.id)) { changes.push('recreate variable ' + name); if (!dryRun) { v.remove(); varByName.delete(name); } }
  if (!varByName.has(name) || (dryRun && !v)) {
    if (!v) changes.push('create variable ' + name);
    if (!dryRun && c) varByName.set(name, figma.variables.createVariable(name, c, want.type));
  }
}
all = await figma.variables.getLocalVariablesAsync();
byId = new Map(all.map(v => [v.id, v]));
for (const [name, want] of Object.entries(expected.variables)) {
  const v = varByName.get(name);
  const c = collectionByName.get(want.collection);
  if (!v || !c) continue;
  if (want.scopes !== null && !close([...v.scopes].sort(), [...want.scopes].sort())) { changes.push('scopes ' + name); if (!dryRun) v.scopes = want.scopes; }
  if ((v.codeSyntax.WEB ?? null) !== want.web) {
    changes.push('code syntax ' + name);
    if (!dryRun) { if (want.web) v.setVariableCodeSyntax('WEB', want.web); else v.removeVariableCodeSyntax('WEB'); }
  }
  for (const [mode, desired] of Object.entries(want.values)) {
    const m = c.modes.find(x => x.name === mode);
    if (!m) continue;
    if (close(value(v.valuesByMode[m.modeId]), desired)) continue;
    changes.push('value ' + name + ' (' + mode + ')');
    if (dryRun) continue;
    if (desired && typeof desired === 'object' && 'alias' in desired) v.setValueForMode(m.modeId, figma.variables.createVariableAlias(varByName.get(desired.alias)));
    else if (Array.isArray(desired)) v.setValueForMode(m.modeId, { r: desired[0], g: desired[1], b: desired[2], a: desired[3] });
    else v.setValueForMode(m.modeId, desired);
  }
}
for (const v of all) {
  const c = collections.find(x => x.id === v.variableCollectionId);
  if (c && owned(c.name) && !(v.name in expected.variables)) { changes.push('remove variable ' + v.name); if (!dryRun) v.remove(); }
}
const styles = await figma.getLocalEffectStylesAsync();
for (const [name, layers] of Object.entries(expected.effectStyles)) {
  let s = styles.find(x => x.name === name);
  const current = s ? s.effects.map(e => ({ type: e.type, x: r(e.offset.x), y: r(e.offset.y), radius: r(e.radius), spread: r(e.spread ?? 0), color: e.boundVariables?.color ? byId.get(e.boundVariables.color.id)?.name ?? '' : '' })) : null;
  if (current && close(current, layers)) continue;
  changes.push((s ? 'set effect style ' : 'create effect style ') + name);
  if (dryRun) continue;
  if (!s) { s = figma.createEffectStyle(); s.name = name; }
  s.effects = layers.map(l => {
    const effect = { type: l.type, color: { r: 0, g: 0, b: 0, a: 1 }, offset: { x: l.x, y: l.y }, radius: l.radius, spread: l.spread, visible: true, blendMode: 'NORMAL' };
    const bound = varByName.get(l.color);
    return bound ? figma.variables.setBoundVariableForEffect(effect, 'color', bound) : effect;
  });
}
for (const s of styles) if (!(s.name in expected.effectStyles)) { changes.push('remove effect style ' + s.name); if (!dryRun) s.remove(); }
return { dryRun, changes };`
}

/** The dev plugin's code.js (figma/plugin): the export, then a window that copies its result. */
export function pluginCode(): string {
  return `// Generated by pnpm figma:plugin from tokens/src/figma.ts. Do not edit.
/* global figma, __html__ */
;(async () => {
  const result = await (async () => {
${FIGMA_EXPORT_SCRIPT.split('\n')
  .map(line => `    ${line}`)
  .join('\n')}
  })()
  figma.showUI(__html__, { width: 360, height: 220 })
  figma.ui.postMessage(result)
})()
`
}
