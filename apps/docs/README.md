# docs

nimki's documentation site: Next.js App Router with its own UI, and Fumadocs' headless core for MDX, search and the table of contents. Pages are server components; demos are client components.

```sh
pnpm --filter docs dev
```

## Layout

| Path                   | What                                                                      |
| ---------------------- | ------------------------------------------------------------------------- |
| `content/docs`         | The pages, as MDX. Folders and `meta.json` files set the navigation order |
| `app/docs/[[...slug]]` | Renders a page with its table of contents                                 |
| `app/api/search`       | The search index over every page and heading                              |
| `components/`          | The site's UI: header, global controls, sidebar, search, page parts       |
| `lib/settings.ts`      | The global controls: mode, motion theme, density, reduced motion          |
| `lib/curves.ts`        | Samples a CSS easing into points, for the motion page                     |
| `registry.json`        | The shadcn registry; `pnpm --filter docs build` writes it to `public/r/`  |

## The global controls

Mode, Motion, Density and Reduced motion set shadcn's `.dark` class and the `data-motion`, `data-density` and `data-motion-reduce` attributes on `<html>`, the same hooks Storybook's toolbar sets. A script in `<head>` applies the saved choice before the first paint. The visual theme switcher joins them once a second theme ships.

## A component page

Every component page uses the parts in `components/component-page.tsx`, in this order:

1. `<Status stage="..." />` with the runtime weight
2. `<Demo />`
3. `## Installation` with `<Install name="..." />`
4. `## Usage` and `## Examples`
5. `## API reference` with `<ApiReference parts={[...]} />`
6. `## Keyboard` with `<KeyboardMap keys={[...]} />`
7. `## Accessibility`
8. `## Motion` with `<MotionSpec moments={[...]} />`
9. `## Quality bar` with `<QualityBar />`
10. `## Changelog` with `<Changelog />`

`content/docs/components/select.mdx` is the first. A part with nothing real to show says so.

## Buttons and motion

`components/styles.ts` holds the one button rule: filled, never outlined, with a hover fill and the press role's scale. Text only for most actions; icon and text when the icon adds meaning at a glance (Play, Copy); icon only for small utilities in a fixed place, always with an `aria-label` and a `title`.

The docs move on nimki's own role variables (`.nk-press`, `.nk-pop-in`, `.nk-popover`, `.nk-slide` in `app/globals.css`), so they follow the Motion and Reduced motion controls. The docs default to Subtle, as the library does.
