import type { ReactNode } from 'react'
import { SiteHeader } from '../../components/site-header'
import { Sidebar } from '../../components/sidebar'
import { source } from '../../lib/source'

export default function DocsLayout({ children }: { children: ReactNode }) {
  const tree = source.getPageTree()
  return (
    <>
      <SiteHeader tree={tree} />
      <div className="mx-auto flex max-w-7xl gap-12 px-6">
        <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-56 shrink-0 overflow-y-auto py-10 lg:block">
          <Sidebar tree={tree} />
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </>
  )
}
