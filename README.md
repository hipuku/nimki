# nimki

React components for product interfaces, built as a drop-in superset of shadcn/ui: the same component names, parts and props, with designed motion added. Components install through the shadcn registry as `@nimki/<component>`, and the motion engine they share is published to npm as `@hipuku/nimki`.

Nothing is released yet. Version 0 is six components: Button, Input with Label, Select, Switch, Tabs and Dialog.

## Develop

Requires Node 22 (`.nvmrc`).

```bash
git config core.hooksPath .githooks
```

The hooks run `scripts/check-names.mjs` on staged files and commit messages. CI runs the same check on every file and the full history.

## Licence

[MIT](./LICENSE)
