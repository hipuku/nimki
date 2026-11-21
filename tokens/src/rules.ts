import type { TokenSet } from './dtcg.ts'
import { MOTION_MODES, type Density, type Motion } from './model.ts'

const ENTER = /-enter$/
const EXIT = /-exit$/

/**
 * Checks the source's shape: every role has a cap, the right properties for its
 * kind and exactly the expressive and reduced modes; only spring primitives
 * carry a bounce. Runs before the model is read, so a malformed role fails
 * with its name rather than as a missing value further on.
 */
export function checkShape(set: TokenSet): string[] {
  const problems: string[] = []
  const roleTokens = set.under('role')
  const roles = new Set(roleTokens.map(token => token.name.split('.')[1] as string))
  roles.delete('stagger')
  const caps = new Set(set.under('limit.cap').map(token => token.name.slice('limit.cap.'.length)))

  for (const role of roles) {
    if (!caps.has(role)) problems.push(`role.${role} has no limit.cap.${role}`)
    const props = new Set(
      set.under(`role.${role}`).map(token => token.name.slice(`role.${role}.`.length)),
    )
    // An enter moves and scales in; press may scale (FR-M16); an exit only fades.
    const wanted = props.has('spring')
      ? ['spring']
      : ENTER.test(role)
        ? ['duration', 'easing', 'offset', 'scale']
        : !EXIT.test(role) && props.has('scale')
          ? ['duration', 'easing', 'scale']
          : ['duration', 'easing']
    if (props.has('spring') && (ENTER.test(role) || EXIT.test(role))) {
      problems.push(`role.${role}: an enter or exit cannot be a spring (FR-M3)`)
    }
    const have = [...props].sort().join(', ')
    if (have !== [...wanted].sort().join(', ')) {
      problems.push(`role.${role} has ${have}; it needs ${wanted.join(', ')}`)
    }
  }
  for (const cap of caps) {
    if (!roles.has(cap)) problems.push(`limit.cap.${cap} has no role`)
  }
  for (const part of ['step', 'max']) {
    if (!set.tokens.has(`role.stagger.${part}`)) problems.push(`role.stagger.${part} is missing`)
  }

  const otherModes = MOTION_MODES.filter(mode => mode !== 'subtle').join(', ')
  for (const token of roleTokens) {
    const modes = Object.keys(token.modes).sort().join(', ')
    if (modes !== otherModes) {
      problems.push(`${token.name} has modes [${modes}]; it needs [${otherModes}]`)
    }
  }
  for (const token of set.tokens.values()) {
    const isSpring = token.name.startsWith('spring.')
    if (isSpring && token.extension.bounce === undefined) {
      problems.push(`${token.name} has no bounce`)
    }
    if (!isSpring && token.extension.bounce !== undefined) {
      problems.push(`${token.name} has a bounce but is not under spring`)
    }
  }
  for (const token of set.under('density')) {
    const modes = Object.keys(token.modes).join(', ')
    if (modes !== 'compact') problems.push(`${token.name} has modes [${modes}]; it needs [compact]`)
  }
  return problems
}

/** The motion rules of PRD FR-M3, FR-M9 and FR-M13. */
export function checkMotion(motion: Motion): string[] {
  const problems: string[] = []
  const { limits, caps } = motion
  const steps = [...motion.primitives.durations].sort((a, b) => a.ms - b.ms).map(d => d.name)

  for (const spring of motion.primitives.springs) {
    if (spring.bounce > limits.bounceMax) {
      problems.push(`${spring.primitive}: bounce ${spring.bounce} is over ${limits.bounceMax}`)
    }
  }
  for (const offset of motion.primitives.offsets) {
    if (offset.px > limits.offsetMaxPx) {
      problems.push(`${offset.name}: ${offset.px}px is over ${limits.offsetMaxPx}px`)
    }
  }
  for (const scale of motion.primitives.scales) {
    if (scale.value < limits.scaleMin || scale.value > 1) {
      problems.push(`${scale.name}: ${scale.value} is outside ${limits.scaleMin} to 1`)
    }
  }

  for (const mode of MOTION_MODES) {
    const { roles, stagger } = motion.modes[mode]
    const reduced = mode === 'reduced'
    for (const [role, value] of Object.entries(roles)) {
      const where = `role.${role} (${mode})`
      const cap = caps[role] as number
      if (value.kind === 'spring') {
        if (reduced) problems.push(`${where}: reduced motion cannot use a spring (FR-M9)`)
        // A spring is capped by its visual duration. Its linear() easing runs
        // to the settle time, a tail under 4% of the distance.
        if (value.spring.visualDurationMs > cap) {
          problems.push(
            `${where}: visual duration ${value.spring.visualDurationMs}ms is over its cap of ${cap}ms`,
          )
        }
        continue
      }
      if (value.kind === 'jump') {
        if (!reduced) problems.push(`${where}: only reduced motion may jump`)
        if (value.durationMs !== 0) problems.push(`${where}: a jump takes 0ms`)
        continue
      }
      if (value.durationMs > cap) {
        problems.push(`${where}: ${value.durationMs}ms is over its cap of ${cap}ms`)
      }
      if (reduced) {
        if (value.durationMs > limits.reducedDurationMaxMs) {
          problems.push(`${where}: ${value.durationMs}ms is over ${limits.reducedDurationMaxMs}ms`)
        }
        if (value.offsetPx !== undefined && value.offsetPx !== 0) {
          problems.push(`${where}: reduced motion cannot move (offset ${value.offsetPx}px)`)
        }
        if (value.scale !== undefined && value.scale !== 1) {
          problems.push(`${where}: reduced motion cannot scale (scale ${value.scale})`)
        }
      } else {
        if (value.offsetPx !== undefined && value.offsetPx > limits.offsetMaxPx) {
          problems.push(`${where}: offset ${value.offsetPx}px is over ${limits.offsetMaxPx}px`)
        }
        if (value.scale !== undefined && (value.scale < limits.scaleMin || value.scale > 1)) {
          problems.push(`${where}: scale ${value.scale} is outside ${limits.scaleMin} to 1`)
        }
      }

      const enter = roles[role.replace(EXIT, '-enter')]
      if (!EXIT.test(role) || reduced) continue
      if (value.easingPrimitive !== 'ease.exit') {
        problems.push(`${where}: an exit uses ease.exit (FR-M3)`)
      }
      if (enter?.kind !== 'tween') {
        problems.push(`${where}: has no matching enter`)
        continue
      }
      const exitStep = value.durationPrimitive ? steps.indexOf(value.durationPrimitive) : -1
      const enterStep = enter.durationPrimitive ? steps.indexOf(enter.durationPrimitive) : -1
      if (exitStep < 0 || enterStep < 0) {
        problems.push(`${where}: enter and exit must both alias a duration step`)
      } else if (exitStep !== enterStep - 1) {
        problems.push(
          `${where}: ${value.durationPrimitive} must be the step below the enter's ${enter.durationPrimitive} (FR-M3)`,
        )
      }
    }

    if (stagger.step.ms > stagger.max.ms) {
      problems.push(
        `role.stagger (${mode}): step ${stagger.step.ms}ms is over max ${stagger.max.ms}ms`,
      )
    }
    if (reduced && (stagger.step.ms !== 0 || stagger.max.ms !== 0)) {
      problems.push(`role.stagger (reduced): reduced motion has no stagger (FR-M9)`)
    }
  }
  return problems
}

/** PRD FR-V5: compact is never larger, and no control or item is under the hit-area floor. */
export function checkDensity(density: Density): string[] {
  const problems: string[] = []
  for (const token of density.tokens) {
    if (token.px.compact > token.px.comfortable) {
      problems.push(`${token.name}: compact ${token.px.compact}px is larger than comfortable`)
    }
    const isHeight = /^density\.(control-(sm|md|lg)|item)$/.test(token.name)
    if (isHeight && token.px.compact < density.hitMinPx) {
      problems.push(`${token.name}: compact ${token.px.compact}px is under ${density.hitMinPx}px`)
    }
  }
  return problems
}
