# tokens

The source for nimki's motion and density tokens, and the script that generates every file that uses them. Token values are written once, here, in DTCG 2025.10 JSON; nothing downstream holds its own copy.

## Source

| File                         | Holds                                                                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `source/motion.tokens.json`  | Primitives (durations, easings, springs, offsets, scales, staggers), the roles components read, and the limits every theme stays under |
| `source/density.tokens.json` | Control, item, padding and gap sizes, and the 24 px hit-area floor                                                                     |

A role token's `$value` is its Subtle mapping. Its Expressive and reduced-motion mappings are in `$extensions["dev.hipuku.nimki"].modes`. Density works the same way: the value is comfortable, and compact is a mode.

DTCG has no spring type. A spring is a `duration` token whose value is its visual duration, with its bounce in `$extensions["dev.hipuku.nimki"].bounce`.

## Outputs

| File                                      | What reads it                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `registry/styles/motion.css`              | Components, through the role custom properties. Themes switch on `data-motion`; reduced motion overrides both |
| `registry/styles/density.css`             | Components, through the size custom properties. Compact switches on `data-density`                            |
| `packages/engine/src/tokens.generated.ts` | The engine: duration caps, every role resolved to values, and each role as a Motion transition                |
| `generated/figma-variables.json`          | The Figma build, in the shape of the body of Figma's variables API                                            |

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

The parser reads only the DTCG features the source uses and refuses the rest by name, so a feature added to the source without parser support fails rather than being ignored.
