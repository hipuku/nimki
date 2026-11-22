'use client'

import {
  DURATION_CAPS_MS,
  MOTION_TOKENS,
  type MotionMode,
  type MotionRole,
  type RoleToken,
} from '@hipuku/nimki'
import { Play } from 'lucide-react'
import { useRef, useState } from 'react'
import { curvePath, sampleEasing } from '../lib/curves'
import { useSettings } from './settings-provider'
import { button } from './styles'

/**
 * The motion foundations page's live parts (PRD FR-D3). Every value comes from
 * the engine's generated tokens, so the page shows what the components run.
 */

const MODES: MotionMode[] = ['subtle', 'expressive', 'reduced']
const MODE_NAMES: Record<MotionMode, string> = {
  subtle: 'Subtle',
  expressive: 'Expressive',
  reduced: 'Reduced',
}

type Kind = 'press' | 'move' | 'enter' | 'exit'
const kindOf = (role: MotionRole): Kind =>
  role === 'press'
    ? 'press'
    : role.endsWith('-enter')
      ? 'enter'
      : role.endsWith('-exit')
        ? 'exit'
        : 'move'

const KIND_TEXT: Record<Kind, string> = {
  press: 'Scales on press, back on release',
  move: 'Moves between two places',
  enter: 'Comes in: fade, offset and scale',
  exit: 'Goes out: fade',
}

/** The easing drawn across the cell's width; 0 and 1 are the two guide lines. */
function Curve({ easing, durationMs }: { easing: string; durationMs: number }) {
  const width = 200
  const height = 100
  if (durationMs === 0) {
    return (
      <div className="flex aspect-[2/1] w-full items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
        Jumps, no curve
      </div>
    )
  }
  const path = curvePath(sampleEasing(easing), width, height)
  const at = (y: number) => height - ((y + 0.15) / 1.3) * height
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Easing curve: ${easing.startsWith('linear(') ? 'spring' : easing}`}
      className="aspect-[2/1] w-full overflow-visible rounded-md bg-muted"
    >
      {[0, 1].map(y => (
        <line
          key={y}
          x1="0"
          x2={width}
          y1={at(y)}
          y2={at(y)}
          stroke="var(--border)"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/** The token's values as short facts, in a fixed order. */
function facts(token: RoleToken): string[] {
  const out =
    token.visualDurationMs !== undefined
      ? [
          `${token.visualDurationMs} ms spring`,
          `settles ${token.durationMs} ms`,
          `bounce ${token.bounce ?? 0}`,
        ]
      : [token.durationMs === 0 ? 'instant' : `${token.durationMs} ms`]
  if (token.scale !== undefined && token.scale !== 1) out.push(`scale ${token.scale}`)
  if (token.offsetPx) out.push(`offset ${token.offsetPx} px`)
  return out
}

const quiet = () => {}

function play(element: HTMLElement, kind: Kind, token: RoleToken, forward: boolean) {
  const timing = { duration: token.durationMs, easing: token.easing, fill: 'forwards' as const }
  if (kind === 'move') {
    const track = element.parentElement
    const distance = track ? track.clientWidth - element.offsetWidth - 16 : 0
    const [from, to] = forward ? [0, distance] : [distance, 0]
    element.animate(
      [{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }],
      timing,
    )
    return
  }
  if (kind === 'press') {
    const scale = `scale(${token.scale ?? 1})`
    element.animate([{ transform: 'scale(1)' }, { transform: scale }], timing).finished.then(
      () =>
        element.animate([{ transform: scale }, { transform: 'scale(1)' }], {
          ...timing,
          delay: 160,
        }),
      quiet,
    )
    return
  }
  if (kind === 'enter') {
    element.animate(
      [
        {
          opacity: 0,
          transform: `translateY(${token.offsetPx ?? 0}px) scale(${token.scale ?? 1})`,
        },
        { opacity: 1, transform: 'none' },
      ],
      timing,
    )
    return
  }
  element.animate([{ opacity: 1 }, { opacity: 0 }], timing).finished.then(
    () =>
      element.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 0,
        delay: 500,
        fill: 'forwards',
      }),
    quiet,
  )
}

/** One role in every theme, drawn and played side by side. */
export function RoleCard({ role }: { role: MotionRole }) {
  const { settings, reducedMotion } = useSettings()
  const kind = kindOf(role)
  const boxes = useRef<Partial<Record<MotionMode, HTMLDivElement | null>>>({})
  const [forward, setForward] = useState(true)
  const current: MotionMode = reducedMotion ? 'reduced' : settings.motion

  const run = () => {
    for (const mode of MODES) {
      if (reducedMotion && mode !== 'reduced') continue
      const element = boxes.current[mode]
      if (element) play(element, kind, MOTION_TOKENS[mode][role], forward)
    }
    if (kind === 'move') setForward(value => !value)
  }

  return (
    <section
      id={role}
      aria-labelledby={`${role}-name`}
      className="scroll-mt-24 rounded-xl border border-border bg-card p-6 text-card-foreground"
    >
      <div className="flex items-center justify-between gap-6">
        <div className="grid gap-1.5">
          <h3 id={`${role}-name`} className="font-mono text-sm font-medium">
            {role}
          </h3>
          <p className="text-sm text-muted-foreground">
            {KIND_TEXT[kind]}. Cap {DURATION_CAPS_MS[role]} ms.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          aria-label={`Play ${role} in every theme`}
          className={button}
        >
          <Play aria-hidden="true" size={14} strokeWidth={1.5} />
          Play
        </button>
      </div>
      <div className="mt-6 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
        {MODES.map(mode => {
          const token = MOTION_TOKENS[mode][role]
          const still = reducedMotion && mode !== 'reduced'
          return (
            <div key={mode} className="grid content-start gap-4 bg-card p-5">
              <p className="flex h-5 items-center justify-between text-xs">
                <span className="font-medium">{MODE_NAMES[mode]}</span>
                {mode === current ? (
                  <span className="text-muted-foreground">Your setting</span>
                ) : still ? (
                  <span className="text-muted-foreground">Still</span>
                ) : null}
              </p>
              <Curve easing={token.easing} durationMs={token.durationMs} />
              <ul className="flex min-h-10 flex-wrap content-start gap-x-4 gap-y-1.5 text-xs text-muted-foreground tabular-nums">
                {facts(token).map(fact => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
              <div className="flex h-14 items-center rounded-md bg-muted p-2">
                <div
                  ref={element => {
                    boxes.current[mode] = element
                  }}
                  aria-hidden="true"
                  className={`size-10 rounded-sm bg-foreground ${kind === 'move' ? '' : 'mx-auto'}`}
                />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** Every role, in the order the components meet them. */
export function RoleGallery() {
  return (
    <div className="grid gap-4">
      {(Object.keys(DURATION_CAPS_MS) as MotionRole[]).map(role => (
        <RoleCard key={role} role={role} />
      ))}
    </div>
  )
}

/**
 * The same roles through the CSS variables the components read, so it follows
 * the global controls: Motion switches the theme, Reduced motion makes it jump.
 */
export function LiveCss() {
  const [moved, setMoved] = useState(false)
  const rows: { role: string; vars: string }[] = [
    { role: 'highlight', vars: 'var(--nk-highlight-duration) var(--nk-highlight-easing)' },
    { role: 'layout', vars: 'var(--nk-layout-duration) var(--nk-layout-easing)' },
  ]
  return (
    <div className="grid gap-4 rounded-xl border border-border bg-card p-6">
      {rows.map(row => (
        <div key={row.role} className="grid gap-1">
          <p className="font-mono text-xs text-muted-foreground">{row.role}</p>
          <div className="@container h-10 rounded-md bg-muted p-1">
            <div
              aria-hidden="true"
              className="h-8 w-8 rounded-sm bg-foreground"
              style={{
                transition: `translate ${row.vars}`,
                translate: moved ? 'calc(100cqw - 2rem) 0' : '0 0',
              }}
            />
          </div>
        </div>
      ))}
      <button type="button" onClick={() => setMoved(value => !value)} className={`${button} w-fit`}>
        {moved ? 'Move back' : 'Move'}
      </button>
    </div>
  )
}
