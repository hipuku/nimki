/**
 * pnpm tokens:write regenerates every output from tokens/source.
 * pnpm tokens:check regenerates in memory and fails if any file on disk differs,
 * so CI catches a source edit without a regenerate, and a hand edit to an output.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RuleError, generate } from './generate.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const mode = process.argv[2]

if (mode !== 'write' && mode !== 'check') {
  console.error('Usage: node src/cli.ts write|check')
  process.exit(2)
}

try {
  const outputs = await generate(root)
  const stale: string[] = []
  for (const [path, content] of outputs) {
    const file = join(root, path)
    let current: string | undefined
    try {
      current = readFileSync(file, 'utf8')
    } catch {
      current = undefined
    }
    if (current === content) continue
    if (mode === 'write') {
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, content)
      console.log(`wrote ${path}`)
    } else {
      stale.push(path)
    }
  }
  if (stale.length > 0) {
    console.error('Generated token files are out of date with tokens/source:')
    for (const path of stale) console.error(`  ${path}`)
    console.error('Run pnpm tokens:write and commit the result.')
    process.exit(1)
  }
  if (mode === 'check') console.log(`Token outputs are current: ${outputs.size} files.`)
} catch (error) {
  if (error instanceof RuleError) {
    console.error(error.message)
    process.exit(1)
  }
  throw error
}
