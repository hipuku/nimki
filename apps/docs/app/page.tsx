import { DURATION_CAPS_MS } from '@hipuku/nimki'

export default function Home() {
  return (
    <main>
      <h1>nimki</h1>
      <p>
        Nothing is released yet. Version 0 is Button, Input with Label, Select, Switch, Tabs and
        Dialog.
      </p>
      <h2>Duration caps</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Role</th>
            <th scope="col">Cap</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(DURATION_CAPS_MS).map(([role, ms]) => (
            <tr key={role}>
              <td>{role}</td>
              <td>{ms} ms</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
