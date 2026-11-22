# Changesets

A changeset is a short note, written with the pull request, of what changed for someone using `@hipuku/nimki` and whether it is a patch, minor or major change.

```bash
pnpm changeset
```

A pull request that changes nothing a consumer sees needs none. Before a release, `pnpm changeset version` turns the notes into the version in `packages/engine/package.json` and the entries in its `CHANGELOG.md`. The release itself is still the `engine-v<version>` tag, which `publish.yml` publishes.

The docs, Storybook and the token generator are private packages, so they are never versioned. Components are not npm packages: each component's changes are listed on its docs page.
