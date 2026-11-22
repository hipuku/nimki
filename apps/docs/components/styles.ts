/**
 * The docs' buttons, one rule for all of them: filled, never outlined. Colour
 * does the work a stroke would; a hover fill and the press role's scale give
 * the feedback.
 *
 * When to use an icon:
 * - Text only, for most actions: the words say what happens.
 * - Icon and text, when the icon adds meaning at a glance (Play, Copy).
 * - Icon only, for small utilities repeated in a fixed place (Display,
 *   Pages, Copy on a code block), always with an aria-label and a title.
 */

/** A filled button with text, or icon and text. */
export const button =
  'nk-press inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md bg-secondary px-4 text-sm font-medium text-secondary-foreground hover:bg-accent hover:text-accent-foreground'

/** An icon-only button: no fill until hovered. */
export const iconButton =
  'nk-press inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground'

/** A floating surface: popovers, menus, search results. */
export const surface =
  'rounded-lg border border-border bg-popover text-popover-foreground shadow-[var(--nk-elevation-1)]'
