# tokens

The source for nimki's motion, density, colour and type tokens, and the script that generates every file that uses them. Token values are written once, here, in DTCG 2025.10 JSON; nothing downstream holds its own copy.

## Source

| File                         | Holds                                                                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `source/motion.tokens.json`  | Primitives (durations, easings, springs, offsets, scales, staggers), the roles components read, and the limits every theme stays under  |
| `source/colour.tokens.json`  | The Linear theme's values for shadcn's colour variables in light and dark, the radius, nimki's fonts, and the `--nk-` colour extensions |
| `source/density.tokens.json` | Control, item, padding and gap sizes, and the 24 px hit-area floor                                                                      |

A role token's `$value` is its Subtle mapping. Its Expressive and reduced-motion mappings are in `$extensions["dev.hipuku.nimki"].modes`. Density works the same way: the value is comfortable, and compact is a mode. So does colour: the value is light, and dark is a mode.

Colours are OKLCH. A derived colour, such as `nk.success`, aliases its base and holds a recipe per mode in `$extensions["dev.hipuku.nimki"].relative`: a lightness (a number, `"keep"` or an offset), a chroma cap and a hue. The CSS writes it as a relative colour of the base's custom property, so it follows whatever `--destructive` a project sets.

DTCG has no spring type. A spring is a `duration` token whose value is its visual duration, with its bounce in `$extensions["dev.hipuku.nimki"].bounce`.

## Outputs

| File                                      | What reads it                                                                                                                                                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `registry/styles/motion.css`              | Components, through the role custom properties. Themes switch on `data-motion`; reduced motion overrides both                                                                                                                              |
| `registry/styles/theme-linear.css`        | Optional. The Linear theme: its neutral ramp (`--nk-neutral-1` to `-12`), shadcn's variables pointing at ramp steps, the radius and the fonts; a project that sets these itself keeps its own                                              |
| `registry/styles/extensions.css`          | Components. The `--nk-` colours and amounts, derived from shadcn's variables, with dark mode on `.dark`: success, warning, highlight, the hover and pressed colour of each filled role, and the 8% and 12% layers for transparent surfaces |
| `registry/styles/density.css`             | Components, through the size custom properties. Compact switches on `data-density`                                                                                                                                                         |
| `packages/engine/src/tokens.generated.ts` | The engine: duration caps, every role resolved to values, and each role as a Motion transition                                                                                                                                             |
| `generated/figma-variables.json`          | The Figma build, in the shape of the body of Figma's variables API                                                                                                                                                                         |

A spring becomes two custom properties: a CSS `linear()` easing sampled from the spring, and the time it takes to settle. The engine's `springToLinear()` does the conversion, with the same formula Motion uses, so a CSS transition and a Motion spring with the same token follow the same curve.

## Commands

```bash
pnpm tokens:write
pnpm tokens:check
```

`tokens:write` regenerates every output. `tokens:check` regenerates in memory and fails if a file on disk differs, which CI runs on every pull request. Both need the engine built first (`pnpm build:engine`), because the spring maths lives there.

## Rules

Generation stops, listing every problem, if the source breaks a rule from the PRD:

- An exit is the duration step below its enter, uses `ease.exit` and is never a spring (FR-M3).
- No role runs past its cap; a spring is measured by its visual duration (FR-M13).
- No bounce over 0.2, offset over 12 px or scale under 0.92 (FR-M13).
- Reduced motion has no springs, movement, scale or stagger, and nothing over 120 ms (FR-M9).
- Compact is never larger than comfortable, and no control or item is under 24 px (FR-V5).
- Every text pairing reaches 4.5:1, and the focus ring and the input border 3:1, in both modes; every opaque colour fits in sRGB (FR-V9, FR-V10, WCAG 2.2 1.4.11).
- Every hover and pressed colour differs visibly from its rest colour (1.04:1 and 1.08:1), pressed further than hovered, and its text still passes 4.5:1.
- The neutral ramp runs one way per mode, and its text steps pass 4.5:1 (step 11) and 7:1 (step 12) on steps 1 to 3.
- A shadow keeps one shape in both modes. Its layer colours carry the dark mode, so the Figma effect style can switch with the mode too.

The parser reads only the DTCG features the source uses and refuses the rest by name, so a feature added to the source without parser support fails rather than being ignored.

## Browsers and scope

The outputs need the browsers in the PRD's support table (the last two versions of Chrome, Edge, Firefox and Safari, plus iOS Safari and Android Chrome). The derived colours use relative colour syntax (`oklch(from var(--destructive) ...)`), which needs Safari 16.4, Chrome 119 or Firefox 128, all inside that range; there is no fallback.

A derived `--nk-` colour is worked out where it is declared, on `:root` and `.dark`. A subtree that sets its own `--primary` keeps the page's `--nk-primary-hover` unless it redeclares that too, so a section with its own theme sets both, or adds the `.dark` class, which redeclares every derived colour.

## Figma parity

The [Figma file](https://www.figma.com/design/7EoZah6GtSPR9XQlYWbzAO/nimki) holds the same values as the source. Figma's variables API needs an Enterprise plan, so the file is read by a script run inside Figma, and its output is committed as `figma/snapshot/nimki.json`. The `Figma parity` workflow compares that snapshot with `generated/figma-variables.json` on every pull request: variables by name, with their collection, type, code syntax, scopes and values in every mode, and the elevation effect styles layer by layer. Numbers match within 0.002, because Figma stores 32-bit floats.

```bash
pnpm figma:check
pnpm figma:script
pnpm figma:save /absolute/path/to/export.json
```

To refresh the snapshot after a change in Figma: run the output of `figma:script` in the file through the Figma MCP's `use_figma` tool, save the JSON it returns, run `figma:save` with that file, and commit the snapshot.
