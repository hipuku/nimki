# nimki

React components for product interfaces, built as a drop-in superset of shadcn/ui: the same component names, parts and props, with designed motion added. Components install through the shadcn registry as `@nimki/<component>`, and the motion engine they share is published to npm as `@hipuku/nimki`.

Nothing is released yet. Version 0 is six components: Button, Input with Label, Select, Switch, Tabs and Dialog.

## Develop

Requires Node 22 (`.nvmrc`) and pnpm 10 (`packageManager` in `package.json`).

```bash
pnpm install
pnpm run check
```

`pnpm install` points git at `.githooks`, which run `scripts/check-names.mjs` on staged files and commit messages. `pnpm run check` runs every CI check locally.

[CONTRIBUTING.md](./CONTRIBUTING.md) covers what is wanted, what is out of scope and how a change lands.

| Path              | Contents                                                                          |
| ----------------- | --------------------------------------------------------------------------------- |
| `packages/engine` | `@hipuku/nimki` on npm: motion maths, no React                                    |
| `apps/docs`       | The docs site, which also serves the shadcn registry at `/r/`                     |
| `apps/storybook`  | The workbench: every story run as a test in Chromium, Firefox and WebKit          |
| `tokens`          | The DTCG token source and the generator for every output                          |
| `registry/ui`     | The components users copy with the shadcn CLI, each with its stories              |
| `registry/styles` | Generated token CSS that components read                                          |
| `figma`           | The Figma file's snapshot and export plugin ([how sync works](./figma/README.md)) |

## Release

The engine publishes from a tag shaped `engine-v<version>`, through `.github/workflows/publish.yml`, by npm trusted publishing. The docs site and registry deploy from `main`.

## Licence

[MIT](./LICENSE)
