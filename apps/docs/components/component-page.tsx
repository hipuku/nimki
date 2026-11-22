import type { ReactNode } from 'react'

/**
 * The parts of a component page (PRD FR-D2). Every component page uses them
 * in this order: Status, Demo, Install, then MDX sections for usage and
 * examples, ApiReference, KeyboardMap, accessibility notes, MotionSpec,
 * QualityBar and Changelog. A part with nothing real to show yet says so
 * rather than showing a placeholder that looks finished.
 */

type Stage = 'in design' | 'in code' | 'released'

const STAGE_TEXT: Record<Stage, string> = {
  'in design': 'In design. Designed in Figma, waiting for sign-off; no code yet.',
  'in code': 'In code. Not released.',
  released: 'Released.',
}

export function Status({ stage, weight }: { stage: Stage; weight?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="rounded-full border border-border px-2.5 py-1">{STAGE_TEXT[stage]}</span>
      <span
        className="rounded-full border border-border px-2.5 py-1 text-muted-foreground"
        title="Runtime weight, minified and compressed, measured by size-limit"
      >
        Weight: {weight ?? 'measured once built'}
      </span>
    </div>
  )
}

/** The live example. Until the component exists it states what will be here. */
export function Demo({ children }: { children?: ReactNode }) {
  return (
    <div className="flex min-h-48 items-center justify-center rounded-lg border border-border bg-card p-8 text-sm text-muted-foreground">
      {children ?? 'The live demo lands with the code, under the global controls above.'}
    </div>
  )
}

/** The shadcn registry command. The registry URL is final once nimki.dev is live. */
export function Install({ name }: { name: string }) {
  return (
    <div className="grid gap-2">
      <pre>
        <code>{`npx shadcn add @nimki/${name}`}</code>
      </pre>
      <p className="text-sm text-muted-foreground">
        The registry is not published yet; this command works from the first release.
      </p>
    </div>
  )
}

/** Generated from the component's types once its code exists. */
export function ApiReference({ parts }: { parts: string[] }) {
  return (
    <div className="grid gap-2">
      <p>
        The same parts and props as shadcn&apos;s, so a shadcn project swaps it in without changing
        a line:{' '}
        {parts.map((part, i) => (
          <span key={part}>
            {i > 0 && ', '}
            <code>{part}</code>
          </span>
        ))}
        .
      </p>
      <p className="text-sm text-muted-foreground">
        The props table is generated from the types once the code lands.
      </p>
    </div>
  )
}

export function KeyboardMap({ keys }: { keys: [string, string][] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Key</th>
            <th scope="col">Does</th>
          </tr>
        </thead>
        <tbody>
          {keys.map(([key, does]) => (
            <tr key={key}>
              <td>
                <kbd className="rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {key}
                </kbd>
              </td>
              <td>{does}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The motion roles a component uses, and what each does with reduced motion. */
export function MotionSpec({ moments }: { moments: [string, string, string][] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Moment</th>
            <th scope="col">Role</th>
            <th scope="col">Reduced motion</th>
          </tr>
        </thead>
        <tbody>
          {moments.map(([moment, role, reduced]) => (
            <tr key={moment}>
              <td>{moment}</td>
              <td>
                <a href={`/docs/foundations/motion#${role}`}>
                  <code>{role}</code>
                </a>
              </td>
              <td>{reduced}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Each quality-bar line and whether this component passes it (PRD FR-D4). */
export function QualityBar({ passed }: { passed?: number }) {
  return (
    <p>
      {passed === undefined
        ? 'Recorded line by line once the component is built. A component ships only when it passes every line of the quality bar.'
        : `Passes ${passed} of the quality bar's lines.`}
    </p>
  )
}

/** Changes per component (PRD FR-D5). */
export function Changelog({ entries }: { entries?: [string, string][] }) {
  if (!entries || entries.length === 0) return <p>No releases yet.</p>
  return (
    <ul>
      {entries.map(([version, change]) => (
        <li key={version}>
          <strong>{version}</strong>: {change}
        </li>
      ))}
    </ul>
  )
}
