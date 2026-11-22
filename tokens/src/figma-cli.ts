/**
 * Figma parity (master plan step 1.4c). Code is the source of truth.
 *
 * pnpm figma:check            the snapshot against the generated variables (offline)
 * pnpm figma:fresh            the file's lastModified against the snapshot's export time (needs FIGMA_TOKEN)
 * pnpm figma:script           prints the export script, for use_figma
 * pnpm figma:save <file>      checks an export's checksum and saves it as the snapshot
 * pnpm figma:save --clipboard the same, from the clipboard (the dev plugin copies there; macOS)
 * pnpm figma:sync [--apply]   prints the script that makes Figma match code; a dry run unless --apply
 * pnpm figma:plugin           writes the dev plugin's code from the export script
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  FIGMA_EXPORT_SCRIPT,
  FIGMA_FILE_KEY,
  compare,
  figmaSyncScript,
  freshness,
  fromGenerated,
  normaliseSnapshot,
  pluginCode,
  readExport,
  type Snapshot,
} from './figma.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const snapshotPath = join(root, 'figma/snapshot/nimki.json')
const generatedPath = join(root, 'tokens/generated/figma-variables.json')
const pluginCodePath = join(root, 'figma/plugin/code.js')
const [mode, arg] = process.argv.slice(2)

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8')) as unknown
const expected = () => fromGenerated(readJson(generatedPath) as Parameters<typeof fromGenerated>[0])

async function main() {
  if (mode === 'script') {
    console.log(FIGMA_EXPORT_SCRIPT)
  } else if (mode === 'plugin') {
    mkdirSync(dirname(pluginCodePath), { recursive: true })
    writeFileSync(pluginCodePath, pluginCode())
    console.log('wrote figma/plugin/code.js')
  } else if (mode === 'save' && arg) {
    const text =
      arg === '--clipboard'
        ? execFileSync('pbpaste', { encoding: 'utf8' })
        : readFileSync(resolve(arg), 'utf8')
    let snapshot: Snapshot
    try {
      snapshot = readExport(JSON.parse(text))
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
    mkdirSync(dirname(snapshotPath), { recursive: true })
    writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`)
    console.log(`wrote figma/snapshot/nimki.json, exported ${snapshot.exportedAt}`)
  } else if (mode === 'sync') {
    console.log(figmaSyncScript(expected(), arg !== '--apply'))
  } else if (mode === 'check') {
    const want = expected()
    const actual = normaliseSnapshot(readJson(snapshotPath) as Snapshot)
    const problems = compare(want, actual)
    if (problems.length > 0) {
      console.error(`The Figma file and tokens/source disagree in ${problems.length} place(s):`)
      for (const problem of problems) console.error(`  ${problem}`)
      console.error(
        'Code wins: run pnpm figma:sync --apply in the file, export it, then pnpm figma:save.',
      )
      process.exit(1)
    }
    console.log(
      `Figma matches the source: ${Object.keys(want.variables).length} variables, ${Object.keys(want.effectStyles).length} effect styles.`,
    )
  } else if (mode === 'fresh') {
    const snapshot = readJson(snapshotPath) as Snapshot
    if (!snapshot.exportedAt) {
      // Switches on with the first export that carries a time (step 1.4c).
      console.log(
        'Freshness not active yet: the snapshot has no export time. It turns on with the first export after FIGMA_TOKEN is set.',
      )
      return
    }
    const token = process.env.FIGMA_TOKEN
    if (!token) {
      // Fork pull requests get no secrets; everywhere else the workflow requires it.
      if (process.env.FIGMA_PARITY_REQUIRED === '1') {
        console.error('FIGMA_TOKEN is not set, so Figma cannot be read. Add it as a repo secret.')
        process.exit(1)
      }
      console.log(
        'Skipped: no FIGMA_TOKEN here (a fork pull request). It runs on main and our branches.',
      )
      return
    }
    const response = await fetch(`https://api.figma.com/v1/files/${FIGMA_FILE_KEY}?depth=1`, {
      headers: { 'X-Figma-Token': token },
    })
    if (response.status === 401 || response.status === 403) {
      console.error(
        'FIGMA_TOKEN expired or invalid: Figma refused it. Make a new read-only token and update the secret.',
      )
      process.exit(1)
    }
    if (!response.ok) {
      console.error(`Figma answered ${response.status}; the freshness check could not run.`)
      process.exit(1)
    }
    const file = (await response.json()) as { lastModified: string; version: string }
    const problem = freshness(file.lastModified, snapshot.exportedAt)
    if (problem) {
      console.error(problem)
      process.exit(1)
    }
    console.log(
      `Figma has nothing newer than the snapshot: saved ${file.lastModified}, exported ${snapshot.exportedAt}.`,
    )
  } else {
    console.error(
      'Usage: node src/figma-cli.ts check | fresh | script | save <file> | save --clipboard | sync [--apply] | plugin',
    )
    process.exit(2)
  }
}

await main()
