import type { Root } from 'fumadocs-core/page-tree'
import { Menu, SlidersHorizontal } from 'lucide-react'
import Link from 'next/link'
import { GlobalControls } from './global-controls'
import { Search } from './search'
import { Sidebar } from './sidebar'
import { iconButton, surface } from './styles'

/**
 * The bar on every page: the name, search and a Display button that opens the
 * global controls (PRD FR-D1). The popovers are the browser's own (the popover
 * attribute): they close on Escape or a click outside, and move on the
 * popover roles. Below the large breakpoint a Pages button holds the list.
 */
export function SiteHeader({ tree }: { tree: Root }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-6">
        <Link href="/" className="mr-auto font-display text-2xl leading-none">
          nimki
        </Link>
        <div className="w-44 sm:w-72">
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
        className={`nk-popover fixed inset-auto top-[4.5rem] right-6 m-0 w-80 p-5 ${surface}`}
      >
        <p className="mb-4 text-sm font-medium">Display</p>
        <GlobalControls />
        <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
          Every demo follows these. Kept in this browser.
        </p>
      </div>
      <div
        id="docs-menu"
        popover="auto"
        aria-label="Pages"
        className={`nk-popover fixed inset-auto top-[4.5rem] right-6 m-0 max-h-[calc(100dvh-6rem)] w-72 overflow-y-auto p-4 ${surface}`}
      >
        <Sidebar tree={tree} />
      </div>
    </header>
  )
}
