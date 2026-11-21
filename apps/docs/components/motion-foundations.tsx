'use client'

import {
  DURATION_CAPS_MS,
  MOTION_TOKENS,
  type MotionMode,
  type MotionRole,
  type RoleToken,
} from '@hipuku/nimki'
import { useRef, useState } from 'react'
import { curvePath, sampleEasing } from '../lib/curves'
import { useSettings } from './settings-provider'

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

function Curve({ easing, durationMs }: { easing: string; durationMs: number }) {
  const width = 120
  const height = 64
  if (durationMs === 0) {
    return (
      <div className="flex h-16 w-[120px] items-center text-xs text-muted-foreground">
        Jumps, no curve
      </div>
    )
  }
  const path = curvePath(sampleEasing(easing), width, height)
  const at = (y: number) => height - ((y + 0.15) / 1.3) * height
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Easing curve: ${easing.startsWith('linear(') ? 'spring' : easing}`}
      className="overflow-visible"
    >
      <line x1="0" x2={width} y1={at(0)} y2={at(0)} stroke="var(--border)" />
      <line x1="0" x2={width} y1={at(1)} y2={at(1)} stroke="var(--border)" />
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function details(token: RoleToken): string[] {
  const lines = [`${token.durationMs} ms`]
  if (token.visualDurationMs !== undefined) {
    lines[0] = `Spring: ${token.visualDurationMs} ms visual, settles in ${token.durationMs} ms`
    lines.push(`Bounce ${token.bounce ?? 0}`)
  }
  if (token.scale !== undefined && token.scale !== 1) lines.push(`Scale ${token.scale}`)
  if (token.offsetPx) lines.push(`Offset ${token.offsetPx} px`)
  return lines
}

const quiet = () => {}

function play(element: HTMLElement, kind: Kind, token: RoleToken, forward: boolean) {
  const timing = { duration: token.durationMs, easing: token.easing, fill: 'forwards' as const }
  if (kind === 'move') {
    const track = element.parentElement
    const distance = track ? track.clientWidth - element.offsetWidth - 8 : 0
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
      className="scroll-mt-20 rounded-lg border border-border bg-card p-4 text-card-foreground"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 id={`${role}-name`} className="font-mono text-sm font-medium">
            {role}
          </h3>
          <p className="text-xs text-muted-foreground">
            {KIND_TEXT[kind]}. Cap {DURATION_CAPS_MS[role]} ms.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          className="h-8 rounded-md border border-input px-3 text-sm hover:bg-accent hover:text-accent-foreground"
        >
          Play {role}
        </button>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {MODES.map(mode => {
          const token = MOTION_TOKENS[mode][role]
          const still = reducedMotion && mode !== 'reduced'
          return (
            <div key={mode} className="grid content-start gap-2">
              <p className="flex items-center gap-2 text-xs font-medium">
                {MODE_NAMES[mode]}
                {mode === current && (
                  <span className="rounded-full bg-accent px-1.5 py-0.5 text-[0.6875rem] font-normal text-accent-foreground">
                    your setting
                  </span>
                )}
              </p>
              <Curve easing={token.easing} durationMs={token.durationMs} />
              <ul className="text-xs text-muted-foreground">
                {details(token).map(line => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <div className="relative flex h-12 items-center rounded-md bg-muted p-1">
                <div
                  ref={element => {
                    boxes.current[mode] = element
                  }}
                  aria-hidden="true"
                  className={`size-10 rounded-sm bg-foreground ${kind === 'move' ? '' : 'mx-auto'}`}
                />
                {still && (
                  <span className="absolute inset-x-0 -bottom-5 text-center text-[0.6875rem] text-muted-foreground">
                    Still: reduced motion is on
                  </span>
                )}
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
    <div className="grid gap-3 rounded-lg border border-border bg-card p-4">
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
      <button
        type="button"
        onClick={() => setMoved(value => !value)}
        className="h-8 w-fit rounded-md border border-input px-3 text-sm hover:bg-accent hover:text-accent-foreground"
      >
        {moved ? 'Move back' : 'Move'}
      </button>
    </div>
  )
}
