import { DURATION_CAPS_MS, MOTION_LIMITS, STAGGER, type MotionMode } from '@hipuku/nimki'

const MODES: [MotionMode, string][] = [
  ['subtle', 'Subtle'],
  ['expressive', 'Expressive'],
  ['reduced', 'Reduced'],
]

/** Stagger per theme, from the engine (PRD FR-D3). */
export function StaggerTable() {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Theme</th>
            <th scope="col">Step</th>
            <th scope="col">Longest total delay</th>
          </tr>
        </thead>
        <tbody>
          {MODES.map(([mode, name]) => (
            <tr key={mode}>
              <td>{name}</td>
              <td>{STAGGER[mode].stepMs} ms</td>
              <td>{STAGGER[mode].maxMs} ms</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The caps and limits every theme is checked against when the tokens build. */
export function LimitsTable() {
  const rows: [string, string][] = [
    ...Object.entries(DURATION_CAPS_MS).map(([role, ms]): [string, string] => [
      `${role} duration`,
      `${ms} ms at most`,
    ]),
    ['Spring bounce', `${MOTION_LIMITS.bounceMax} at most`],
    ['Offset', `${MOTION_LIMITS.offsetMaxPx} px at most`],
    ['Scale', `${MOTION_LIMITS.scaleMin} at least`],
    ['Any reduced-motion duration', `${MOTION_LIMITS.reducedDurationMaxMs} ms at most`],
  ]
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Limit</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([limit, value]) => (
            <tr key={limit}>
              <td>{limit}</td>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
