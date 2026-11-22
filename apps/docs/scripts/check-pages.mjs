// Checks the built docs as a reader meets them (PRD FR-D6): every page in
// light and dark, at desktop and phone width, with axe at WCAG 2.2 AA, and at
// phone width nothing may scroll sideways. Run after `next build`; it starts
// `next start` itself.

/* global document -- the functions passed to page.evaluate run in the browser */
import { AxeBuilder } from '@axe-core/playwright'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const PORT = 3217
const ORIGIN = `http://localhost:${PORT}`
const PAGES = ['/', '/docs', '/docs/foundations/motion', '/docs/components/select']
const MODES = ['light', 'dark']
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'phone', width: 375, height: 812 },
]

const server = spawn('pnpm', ['exec', 'next', 'start', '-p', String(PORT)], {
  cwd: new URL('..', import.meta.url),
  stdio: 'ignore',
})

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(ORIGIN)).ok) return
    } catch {
      // not up yet
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error(`next start did not answer on ${ORIGIN}`)
}

const problems = []
let browser
try {
  await waitForServer()
  browser = await chromium.launch()
  for (const viewport of VIEWPORTS) {
    for (const mode of MODES) {
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce' })
      // The saved settings the boot script reads, so each mode renders from the first paint.
      await context.addInitScript(saved => {
        localStorage.setItem('nimki-docs-settings', saved)
      }, JSON.stringify({ mode }))
      const page = await context.newPage()
      for (const path of PAGES) {
        const where = `${path} (${mode}, ${viewport.name})`
        const response = await page.goto(ORIGIN + path, { waitUntil: 'networkidle' })
        if (!response?.ok()) {
          problems.push(`${where}: HTTP ${response?.status()}`)
          continue
        }
        const { violations } = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze()
        for (const v of violations) {
          problems.push(
            `${where}: ${v.id} (${v.impact}) on ${v.nodes.length} element(s): ${v.help}`,
          )
          for (const node of v.nodes.slice(0, 5)) {
            problems.push(
              `    ${node.target.join(' ')}: ${node.failureSummary?.split('\n').pop()?.trim()}`,
            )
          }
        }
        if (viewport.name === 'phone') {
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          )
          if (overflow > 0) problems.push(`${where}: scrolls sideways by ${overflow}px`)
        }
      }
      await context.close()
    }
  }
} finally {
  await browser?.close()
  server.kill()
}

if (problems.length > 0) {
  console.error(`The docs fail ${problems.length} check(s):`)
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}
console.log(
  `Docs pages pass: ${PAGES.length} pages, light and dark, desktop and phone, axe WCAG 2.2 AA, no sideways scroll.`,
)
