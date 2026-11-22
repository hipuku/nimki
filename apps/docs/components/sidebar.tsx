'use client'

import type { Node, Root } from 'fumadocs-core/page-tree'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

function NavNode({ node, pathname }: { node: Node; pathname: string }) {
  if (node.type === 'separator') {
    return (
      <li className="mt-6 mb-1.5 px-2 text-[0.6875rem] font-medium tracking-wider text-muted-foreground uppercase first:mt-0">
        {node.name}
      </li>
    )
  }
  if (node.type === 'folder') {
    return (
      <li className="mt-6 first:mt-0">
        <p className="mb-1.5 px-2 text-[0.6875rem] font-medium tracking-wider text-muted-foreground uppercase">
          {node.name}
        </p>
        <ul>
          {node.index && <NavNode node={node.index} pathname={pathname} />}
          {node.children.map((child, i) => (
            <NavNode key={child.$id ?? i} node={child} pathname={pathname} />
          ))}
        </ul>
      </li>
    )
  }
  const current = node.url === pathname
  return (
    <li>
      <Link
        href={node.url}
        aria-current={current ? 'page' : undefined}
        className={`nk-press block rounded-md px-3 py-2 text-sm ${current ? 'bg-accent font-medium text-accent-foreground' : 'text-foreground/80 hover:bg-accent/60 hover:text-foreground'}`}
      >
        {node.name}
      </Link>
    </li>
  )
}

/** The page tree from content/docs, with the current page marked. */
export function Sidebar({ tree }: { tree: Root }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Docs">
      <ul>
        {tree.children.map((node, i) => (
          <NavNode key={node.$id ?? i} node={node} pathname={pathname} />
        ))}
      </ul>
    </nav>
  )
}
