#!/usr/bin/env node
// Run by the pre-commit hook. When a commit touches tokens, their generated
// files or the Figma snapshot, it checks the generated files are current and
// that Figma and code agree, and says which command fixes it. Other commits
// skip it. Checks the working tree, which is what the staged files came from.

import { execFileSync, spawnSync } from 'node:child_process'

const staged = execFileSync('git', ['diff', '--cached', '--name-only'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
const watched =
  /^(tokens\/(source|generated|src)\/|registry\/styles\/|figma\/snapshot\/|packages\/engine\/src\/tokens\.generated\.ts$)/
if (!staged.some(file => watched.test(file))) process.exit(0)

const run = args => spawnSync(process.execPath, args, { encoding: 'utf8' })

const tokens = run(['tokens/src/cli.ts', 'check'])
if (tokens.status !== 0) {
  process.stderr.write(tokens.stdout + tokens.stderr)
  console.error(
    '\nThe generated token files do not match tokens/source. Run: pnpm figma:out (or pnpm tokens:write), then commit again.',
  )
  process.exit(1)
}

const figma = run(['tokens/src/figma-cli.ts', 'check'])
if (figma.status !== 0) {
  process.stderr.write(figma.stdout + figma.stderr)
  console.error(
    '\nFigma and code disagree. Code changed: pnpm figma:out, Sync from code in Figma, pnpm figma:in. Figma changed: export in Figma, pnpm figma:in. Then commit again.',
  )
  process.exit(1)
}
