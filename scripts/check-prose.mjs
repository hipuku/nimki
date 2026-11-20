#!/usr/bin/env node
// Fails on any em dash, as the character or as its HTML entity. House style
// does not use one.
//
// Absolute, with no baseline: the repository started with none, so any count
// above zero is new. haus and kern carry a baseline because the rule arrived
// after the prose did.
//
// Files come from `git ls-files --cached --others --exclude-standard`, so a new
// file is checked before it is added. A check that read only tracked files
// passed in haus while an untracked document carried the character.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// Built from a character code and a split string, so this file contains
// neither form and does not fail its own check.
const PATTERNS = [new RegExp(String.fromCharCode(0x2014), 'g'), new RegExp('&' + 'mdash;', 'gi')]

const SKIP = /(^|\/)(pnpm-lock\.yaml|.*\.(png|jpe?g|gif|webp|svg|ico|woff2?|ttf|pdf|zip))$/i

const files = execFileSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  {
    encoding: 'utf8',
  },
)
  .split('\0')
  .filter(file => file && !SKIP.test(file))

const problems = []
for (const file of files) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') continue // deleted but not yet staged
    throw error
  }
  text.split('\n').forEach((line, index) => {
    if (PATTERNS.some(pattern => line.match(pattern))) problems.push(`  ${file}:${index + 1}`)
  })
}

if (problems.length > 0) {
  console.error('Em dash found. Use a comma, colon, full stop or brackets instead:')
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log(`Prose check passed: ${files.length} files, no em dashes.`)
