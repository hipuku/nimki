'use client'

import type { Node, Root } from 'fumadocs-core/page-tree'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

function NavNode({ node, pathname }: { node: Node; pathname: string }) {
  if (node.type === 'separator') {
    return (
      <li className="mt-5 mb-1 px-2 text-xs font-medium text-muted-foreground first:mt-0">
        {node.name}
      </li>
    )
  }
  if (node.type === 'folder') {
    return (
      <li className="mt-5 first:mt-0">
        <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">{node.name}</p>
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
        className={`block rounded-sm px-2 py-1 text-sm ${current ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}
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
