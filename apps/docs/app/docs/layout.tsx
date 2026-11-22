import type { ReactNode } from 'react'
import { SiteHeader } from '../../components/site-header'
import { Sidebar } from '../../components/sidebar'
import { source } from '../../lib/source'

export default function DocsLayout({ children }: { children: ReactNode }) {
  const tree = source.getPageTree()
  return (
    <>
      <SiteHeader tree={tree} />
      <div className="mx-auto flex max-w-7xl gap-10 px-4">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-52 shrink-0 overflow-y-auto py-8 lg:block">
          <Sidebar tree={tree} />
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </>
  )
}
