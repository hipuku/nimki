# Contributing

Thanks for looking. nimki is React components for product interfaces: shadcn/ui's components with the same names, parts and props, plus motion designed for each.

## Set up

Requires Node 22 and pnpm 10.

```bash
git clone https://github.com/hipuku/nimki.git
cd nimki
pnpm install
```

## Run it

| Command                  | What it does                                                    |
| ------------------------ | --------------------------------------------------------------- |
| `pnpm run check`         | Every CI check, locally. Run it before opening a pull request   |
| `pnpm storybook`         | The workbench: each component's states, to look at              |
| `pnpm --filter docs dev` | The docs site                                                   |
| `pnpm tokens:write`      | Regenerates the token outputs after a change to `tokens/source` |
| `pnpm changeset`         | Adds a note for the next release of `@hipuku/nimki`             |

## Stories

Each component in `registry/ui/<name>/` has two story files. `<name>.stories.tsx` holds still states to look at in Storybook. `<name>.test.stories.tsx` holds the behaviour tests: play functions that drive the component, tagged `!dev` so they run in CI (`pnpm test`) and Storybook's test panel without replaying in the sidebar.

## What is wanted

- **Bug reports** with a way to see the problem: a link to a repository, a sandbox or the docs page, and the browser it happens in.
- **Keyboard and screen reader problems.** Anything a keyboard or a screen reader cannot do, or does differently from shadcn's original.
- **Motion that is wrong:** longer than its cap, moving with reduced motion on, or janky on a real device. Say which motion theme and density were set.
- **Places nimki is no longer a drop-in** for shadcn: a part, prop or behaviour that differs.
- **Docs corrections.**

Issues labelled `good first issue` name the files to change and what done looks like.

## What is out of scope

- Components for marketing sites (heroes, pricing tables, scroll effects). nimki is for product interfaces only.
- Changing a component's API away from shadcn's. Additions are fine; differences are not.
- A new component that is not in the catalogue. Open an issue first; it is labelled `needs decision` until it is decided.
- Raw values in component styles. Components read the tokens; a new value starts in `tokens/source`.

## How a change lands

1. For anything beyond a small fix, open an issue first, so the approach is agreed before the work.
2. New components and visual changes are designed in the nimki Figma file before their code; the maintainer does that part. How Figma and code stay the same is in [figma/README.md](./figma/README.md); a contributor never needs to open Figma.
3. Open a pull request using the template. CI runs the same checks as `pnpm run check`, plus the Figma parity check. Chromatic publishes the stories for visual review, but is not a required check.
4. If a consumer of `@hipuku/nimki` would notice the change, add a changeset (`pnpm changeset`).

`pnpm install` turns on a git hook that checks staged files and commit messages for names that should not be in the repository.

## Response

Every issue and pull request gets a first reply within 14 days. A pull request that is not going to be merged is closed with the reason.

## Conduct

Everyone taking part follows the [code of conduct](./CODE_OF_CONDUCT.md). Security problems go through [SECURITY.md](./SECURITY.md), not a public issue.
