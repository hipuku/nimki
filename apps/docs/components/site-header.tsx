import type { Root } from 'fumadocs-core/page-tree'
import Link from 'next/link'
import { GlobalControls } from './global-controls'
import { Search } from './search'
import { Sidebar } from './sidebar'

/**
 * The bar on every page: the name, search and the global controls (PRD
 * FR-D1). Below the large breakpoint the controls and the page list move into
 * a disclosure, so the bar never scrolls sideways.
 */
export function SiteHeader({ tree }: { tree: Root }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
        <Link href="/" className="font-display text-xl leading-none">
          nimki
        </Link>
        <div className="ml-auto w-40 sm:w-56">
          <Search />
        </div>
        <div className="hidden lg:block">
          <GlobalControls />
        </div>
        <details className="group lg:hidden">
          <summary className="flex h-8 cursor-pointer list-none items-center rounded-md border border-input px-3 text-sm [&::-webkit-details-marker]:hidden">
            Menu
          </summary>
          <div className="absolute inset-x-0 top-14 max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-b border-border bg-background px-4 py-5">
            <GlobalControls layout="stack" />
            <div className="mt-6 border-t border-border pt-5">
              <Sidebar tree={tree} />
            </div>
          </div>
        </details>
      </div>
    </header>
  )
}
