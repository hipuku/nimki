'use client'

import { useFetchSearch, type SearchResultRecord } from 'fumadocs-core/search/client'
import Link from 'next/link'
import { useId } from 'react'

/**
 * Search over every page, from the index Fumadocs builds at /api/search
 * (PRD FR-D7). A plain field and list for now; it becomes nimki's Combobox
 * when that ships.
 */
export function Search() {
  const { search, onSearchChange, isLoading, data } = useFetchSearch({ api: '/api/search' })
  const id = useId()
  // Table rows come as their own items; the list shows pages, headings and text.
  const results = (data?.items ?? []).filter(
    (item): item is SearchResultRecord => item.type !== 'table',
  )
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        Search the docs
      </label>
      <input
        id={id}
        type="search"
        value={search}
        onChange={event => onSearchChange(event.target.value)}
        placeholder="Search"
        autoComplete="off"
        className="h-8 w-full rounded-md border border-input bg-transparent px-3 text-sm placeholder:text-muted-foreground"
      />
      {search.length > 0 && (
        <div
          role="region"
          aria-live="polite"
          aria-label="Search results"
          className="absolute top-full right-0 left-0 z-50 mt-1 max-h-80 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-[var(--nk-elevation-1)]"
        >
          {isLoading && results.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">Searching</p>
          ) : results.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">No results</p>
          ) : (
            <ul>
              {results.map(result => (
                <li key={result.id}>
                  <Link
                    href={result.url}
                    onClick={() => onSearchChange('')}
                    className={`block rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground ${result.type === 'page' ? 'font-medium' : 'pl-4 text-muted-foreground'}`}
                  >
                    {result.content}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
