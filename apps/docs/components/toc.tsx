'use client'

import { AnchorProvider, TOCItem, type TOCItemType } from 'fumadocs-core/toc'

/** The page's headings, with the one in view marked (PRD FR-D7). */
export function Toc({ items }: { items: TOCItemType[] }) {
  if (items.length === 0) return null
  return (
    <AnchorProvider toc={items}>
      <nav aria-label="On this page">
        <p className="mb-2 text-xs font-medium text-muted-foreground">On this page</p>
        <ul className="grid gap-1 text-sm">
          {items.map(item => (
            <li key={item.url} style={{ paddingLeft: `${Math.max(0, item.depth - 2) * 0.75}rem` }}>
              <TOCItem
                href={item.url}
                className="block text-muted-foreground hover:text-foreground data-[active=true]:text-foreground"
              >
                {item.title}
              </TOCItem>
            </li>
          ))}
        </ul>
      </nav>
    </AnchorProvider>
  )
}
