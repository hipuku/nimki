/**
 * pnpm figma:check   compares figma/snapshot/nimki.json with the generated variables.
 * pnpm figma:script  prints the script to run in Figma with use_figma.
 * pnpm figma:save <file>  checks an export is a snapshot and saves it as the snapshot.
 *
 * Refreshing the snapshot: run figma:script's output in the nimki file, save
 * the returned JSON to a file, run figma:save with it, and commit the snapshot.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  FIGMA_EXPORT_SCRIPT,
  compare,
  fromGenerated,
  normaliseSnapshot,
  type Snapshot,
} from './figma.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const snapshotPath = join(root, 'figma/snapshot/nimki.json')
const generatedPath = join(root, 'tokens/generated/figma-variables.json')
const [mode, file] = process.argv.slice(2)

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8')) as unknown

if (mode === 'script') {
  console.log(FIGMA_EXPORT_SCRIPT)
} else if (mode === 'save' && file) {
  const raw = readJson(resolve(file)) as Snapshot
  if (!raw.collections || !raw.variables || !raw.effectStyles) {
    console.error(
      `${file} is not a Figma export: it needs collections, variables and effectStyles.`,
    )
    process.exit(1)
  }
  mkdirSync(dirname(snapshotPath), { recursive: true })
  writeFileSync(snapshotPath, `${JSON.stringify(normaliseSnapshot(raw), null, 2)}\n`)
  console.log('wrote figma/snapshot/nimki.json')
} else if (mode === 'check') {
  const expected = fromGenerated(readJson(generatedPath) as Parameters<typeof fromGenerated>[0])
  const actual = normaliseSnapshot(readJson(snapshotPath) as Snapshot)
  const problems = compare(expected, actual)
  if (problems.length > 0) {
    console.error(`The Figma file and tokens/source disagree in ${problems.length} place(s):`)
    for (const problem of problems) console.error(`  ${problem}`)
    console.error(
      'Update Figma from tokens/generated/figma-variables.json, or the source, then refresh the snapshot.',
    )
    process.exit(1)
  }
  console.log(
    `Figma matches the source: ${Object.keys(expected.variables).length} variables, ${Object.keys(expected.effectStyles).length} effect styles.`,
  )
} else {
  console.error('Usage: node src/figma-cli.ts check | script | save <file>')
  process.exit(2)
}
