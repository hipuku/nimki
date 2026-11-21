/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument --
   These tests edit the raw token JSON one field at a time to break one rule. Typing every
   path into it would only restate the source file. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TokenSet, parseDocument } from './dtcg.ts'
import { RuleError, render } from './generate.ts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>

const sourceDir = join(import.meta.dirname, '../source')
const read = (file: string): Json => JSON.parse(readFileSync(join(sourceDir, file), 'utf8')) as Json

/** The real source with one change made to it, rendered. */
function renderWith(change: (motion: Json, density: Json) => void) {
  const motion = read('motion.tokens.json')
  const density = read('density.tokens.json')
  change(motion, density)
  return render(
    new TokenSet([
      ...parseDocument(density, 'density.tokens.json'),
      ...parseDocument(motion, 'motion.tokens.json'),
    ]),
  )
}

/** The problems a change produces, or [] if it renders. */
function problems(change: (motion: Json, density: Json) => void): string[] {
  try {
    renderWith(change)
    return []
  } catch (error) {
    if (error instanceof RuleError) return error.problems
    throw error
  }
}

const ms = (value: number) => ({ value, unit: 'ms' })
const modes = (token: Json): Json => token.$extensions['dev.hipuku.nimki'].modes as Json

describe('the token source as committed', () => {
  it('passes every rule', () => {
    expect(problems(() => {})).toEqual([])
  })
})

describe('shape', () => {
  it('needs a cap for every role', () => {
    expect(problems(m => delete m.limit.cap.press)).toContain('role.press has no limit.cap.press')
  })

  it('needs a role for every cap', () => {
    expect(problems(m => (m.limit.cap.tooltip = { $value: ms(200) }))).toContain(
      'limit.cap.tooltip has no role',
    )
  })

  it('needs an offset and a scale on an enter', () => {
    expect(problems(m => delete m.role['dialog-enter'].scale)).toContain(
      'role.dialog-enter has duration, easing, offset; it needs duration, easing, offset, scale',
    )
  })

  it('refuses an offset on an exit', () => {
    const found = problems(m => {
      m.role['dialog-exit'].offset = m.role['dialog-enter'].offset
    })
    expect(found).toContain(
      'role.dialog-exit has duration, easing, offset; it needs duration, easing',
    )
  })

  it('refuses a spring on an exit', () => {
    const found = problems(m => (m.role['popover-exit'] = { spring: m.role.highlight.spring }))
    expect(found).toContain('role.popover-exit: an enter or exit cannot be a spring (FR-M3)')
  })

  it('needs both stagger tokens', () => {
    expect(problems(m => delete m.role.stagger.max)).toContain('role.stagger.max is missing')
  })

  it('needs exactly the expressive and reduced modes on every role token', () => {
    const found = problems(m => delete modes(m.role.press.duration).reduced)
    expect(found).toContain(
      'role.press.duration has modes [expressive]; it needs [expressive, reduced]',
    )
  })

  it('needs a bounce on every spring, and only on springs', () => {
    const found = problems(m => {
      delete m.spring.smooth.$extensions
      m.duration.fast.$extensions = { 'dev.hipuku.nimki': { bounce: 0 } }
    })
    expect(found).toContain('spring.smooth has no bounce')
    expect(found).toContain('duration.fast has a bounce but is not under spring')
  })

  it('needs the compact mode on every density token', () => {
    expect(problems((_m, d) => delete d.density.gap.$extensions)).toContain(
      'density.gap has modes []; it needs [compact]',
    )
  })
})

describe('motion rules', () => {
  it('fails an exit that is not one step below its enter (FR-M3)', () => {
    const found = problems(m => (m.role['dialog-exit'].duration.$value = '{duration.fast}'))
    expect(found).toContain(
      "role.dialog-exit (subtle): duration.fast must be the step below the enter's duration.moderate (FR-M3)",
    )
  })

  it('fails an exit that is as long as its enter (FR-M3)', () => {
    const found = problems(
      m => (modes(m.role['sheet-exit'].duration).expressive = '{duration.slower}'),
    )
    expect(
      found.some(p => p.startsWith('role.sheet-exit (expressive): duration.slower must be')),
    ).toBe(true)
  })

  it('fails an exit on a literal duration rather than a step', () => {
    const found = problems(m => (m.role['popover-exit'].duration.$value = ms(100)))
    expect(found).toContain(
      'role.popover-exit (subtle): enter and exit must both alias a duration step',
    )
  })

  it('fails an exit without ease.exit (FR-M3)', () => {
    const found = problems(m => (m.role['popover-exit'].easing.$value = '{ease.move}'))
    expect(found).toContain('role.popover-exit (subtle): an exit uses ease.exit (FR-M3)')
  })

  it('fails an exit whose enter is missing', () => {
    const found = problems(m => {
      delete m.role['sheet-enter']
      delete m.limit.cap['sheet-enter']
    })
    expect(found).toContain('role.sheet-exit (subtle): has no matching enter')
  })

  it('fails a duration over its cap (FR-M13)', () => {
    const found = problems(m => (modes(m.role.press.duration).expressive = '{duration.moderate}'))
    expect(found).toContain('role.press (expressive): 240ms is over its cap of 200ms')
  })

  it('fails a spring whose visual duration is over its cap (FR-M13)', () => {
    const found = problems(m => (m.spring.snappy.$value = ms(250)))
    expect(found).toContain(
      'role.highlight (subtle): visual duration 250ms is over its cap of 200ms',
    )
  })

  it('fails a bounce over the ceiling (FR-M13)', () => {
    const found = problems(
      m => (m.spring['smooth-bounce'].$extensions['dev.hipuku.nimki'].bounce = 0.3),
    )
    expect(found).toContain('spring.smooth-bounce: bounce 0.3 is over 0.2')
  })

  it('fails an offset over the ceiling, as a primitive and as a role value (FR-M13)', () => {
    const found = problems(m => {
      m.offset.md.$value = { value: 16, unit: 'px' }
      modes(m.role['dialog-enter'].offset).expressive = { value: 14, unit: 'px' }
    })
    expect(found).toContain('offset.md: 16px is over 12px')
    expect(found).toContain('role.dialog-enter (expressive): offset 14px is over 12px')
  })

  it('fails a scale below the ceiling, as a primitive and as a role value (FR-M13)', () => {
    const found = problems(m => {
      m.scale.md.$value = 0.9
      modes(m.role['popover-enter'].scale).expressive = 0.88
    })
    expect(found).toContain('scale.md: 0.9 is outside 0.92 to 1')
    expect(found).toContain('role.popover-enter (expressive): scale 0.88 is outside 0.92 to 1')
  })

  it('fails reduced motion that still moves, scales, springs, staggers or runs long (FR-M9)', () => {
    const found = problems(m => {
      modes(m.role['dialog-enter'].offset).reduced = '{offset.sm}'
      modes(m.role['dialog-enter'].scale).reduced = '{scale.sm}'
      modes(m.role.highlight.spring).reduced = '{spring.snappy}'
      modes(m.role.stagger.step).reduced = '{stagger.sm.step}'
      modes(m.role['sheet-enter'].duration).reduced = '{duration.base}'
    })
    expect(found).toEqual(
      expect.arrayContaining([
        'role.dialog-enter (reduced): reduced motion cannot move (offset 4px)',
        'role.dialog-enter (reduced): reduced motion cannot scale (scale 0.96)',
        'role.highlight (reduced): reduced motion cannot use a spring (FR-M9)',
        'role.stagger (reduced): reduced motion has no stagger (FR-M9)',
        'role.sheet-enter (reduced): 180ms is over 120ms',
      ]),
    )
  })

  it('fails a jump outside reduced motion, and a jump that takes time', () => {
    const found = problems(m => {
      m.role.layout.spring.$value = ms(0)
      modes(m.role.feedback.spring).reduced = ms(50)
    })
    expect(found).toContain('role.layout (subtle): only reduced motion may jump')
    expect(found).toContain('role.feedback (reduced): a jump takes 0ms')
  })

  it('fails a stagger step longer than its cap', () => {
    const found = problems(m => (m.stagger.sm.step.$value = ms(200)))
    expect(found).toContain('role.stagger (subtle): step 200ms is over max 120ms')
  })
})

describe('values the parser accepts but the model refuses', () => {
  it('refuses a bounce that is not a number', () => {
    expect(() =>
      renderWith(m => (m.spring.snappy.$extensions['dev.hipuku.nimki'].bounce = 'lots')),
    ).toThrow(/spring.snappy: \$extensions\["dev.hipuku.nimki"\].bounce must be a number/)
  })

  it('refuses a role duration that is not a duration', () => {
    expect(() =>
      renderWith(m => {
        m.role.press.duration = { ...m.role.press.easing }
      }),
    ).toThrow(/role.press.duration must resolve to a number/)
  })

  it('refuses a role easing that is not a cubic bezier', () => {
    expect(() =>
      renderWith(m => {
        m.role.press.easing = { ...m.role.press.duration }
      }),
    ).toThrow(/role.press.easing must resolve to a cubic bezier/)
  })
})

describe('literal role values', () => {
  it('writes a role value that aliases nothing into the CSS as itself', () => {
    const { motionCss } = renderWith(m => (modes(m.role.press.easing).reduced = [0.5, 0, 0.5, 1]))
    expect(motionCss).toContain('--nk-press-easing: cubic-bezier(0.5, 0, 0.5, 1);')
  })
})

describe('density rules (FR-V5)', () => {
  it('fails a compact size larger than comfortable', () => {
    const found = problems((_m, d) => (modes(d.density.gap).compact = { value: 10, unit: 'px' }))
    expect(found).toContain('density.gap: compact 10px is larger than comfortable')
  })

  it('fails a control or item shorter than the hit-area floor', () => {
    const found = problems((_m, d) => (modes(d.density.item).compact = { value: 20, unit: 'px' }))
    expect(found).toContain('density.item: compact 20px is under 24px')
  })

  it('lets padding and gaps go under the hit-area floor', () => {
    expect(problems((_m, d) => (modes(d.density.gap).compact = { value: 4, unit: 'px' }))).toEqual(
      [],
    )
  })
})
