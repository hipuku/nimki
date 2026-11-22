import type { Root } from 'fumadocs-core/page-tree'
import { Menu, SlidersHorizontal } from 'lucide-react'
import Link from 'next/link'
import { GlobalControls } from './global-controls'
import { Search } from './search'
import { Sidebar } from './sidebar'

const iconButton =
  'inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground'

/**
 * The bar on every page: the name, search and a Display button that opens the
 * global controls (PRD FR-D1) in a popover. The popover is the browser's own
 * (the popover attribute): it closes on Escape or a click outside and needs no
 * script. Below the large breakpoint a Menu button holds the page list.
 */
export function SiteHeader({ tree }: { tree: Root }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4">
        <Link href="/" className="mr-auto font-display text-xl leading-none">
          nimki
        </Link>
        <div className="w-40 sm:w-64">
          <Search />
        </div>
        <button
          type="button"
          popoverTarget="display-settings"
          aria-label="Display settings"
          title="Display settings"
          className={iconButton}
        >
          <SlidersHorizontal aria-hidden="true" size={16} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          popoverTarget="docs-menu"
          aria-label="Pages"
          title="Pages"
          className={`${iconButton} lg:hidden`}
        >
          <Menu aria-hidden="true" size={16} strokeWidth={1.5} />
        </button>
      </div>
      <div
        id="display-settings"
        popover="auto"
        aria-label="Display settings"
        className="fixed inset-auto top-16 right-4 m-0 w-72 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-[var(--nk-elevation-1)]"
      >
        <p className="mb-3 text-sm font-medium">Display</p>
        <GlobalControls />
        <p className="mt-4 text-xs text-muted-foreground">
          Every demo follows these. Kept in this browser.
        </p>
      </div>
      <div
        id="docs-menu"
        popover="auto"
        aria-label="Pages"
        className="fixed inset-auto top-16 right-4 m-0 max-h-[calc(100dvh-5rem)] w-64 overflow-y-auto rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-[var(--nk-elevation-1)]"
      >
        <Sidebar tree={tree} />
      </div>
    </header>
  )
}
