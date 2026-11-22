/**
 * The docs' buttons, one rule for all of them: filled, never outlined. Colour
 * does the work a stroke would; a hover fill and the press role's scale give
 * the feedback. Hover and press use the role's own state colours
 * (--nk-secondary-hover and -active), as nimki's components will.
 *
 * When to use an icon:
 * - Text only, for most actions: the words say what happens.
 * - Icon and text, when the icon adds meaning at a glance (Play, Copy).
 * - Icon only, for small utilities repeated in a fixed place (Display,
 *   Pages, Copy on a code block), always with an aria-label and a title.
 */

/** A filled button with text, or icon and text. */
export const button =
  'nk-press inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md bg-secondary px-4 text-sm font-medium text-secondary-foreground hover:bg-nk-secondary-hover active:bg-nk-secondary-active'

/** An icon-only button: filled at rest, so the icon has a boundary; deeper on hover. */
export const iconButton =
  'nk-press inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md bg-secondary text-secondary-foreground hover:bg-nk-secondary-hover active:bg-nk-secondary-active'

/** A floating surface: popovers, menus, search results. */
export const surface =
  'rounded-lg border border-border bg-popover text-popover-foreground shadow-[var(--nk-elevation-1)]'
