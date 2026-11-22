'use client'

import { useFetchSearch, type SearchResultRecord } from 'fumadocs-core/search/client'
import Link from 'next/link'
import { useId } from 'react'
import { surface } from './styles'

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
        className="nk-state h-9 w-full rounded-md bg-muted px-3.5 text-sm placeholder:text-muted-foreground focus:bg-background"
      />
      {search.length > 0 && (
        <div
          role="region"
          aria-live="polite"
          aria-label="Search results"
          className={`nk-pop-in absolute top-full right-0 left-0 z-50 mt-2 max-h-96 overflow-y-auto p-1.5 ${surface}`}
        >
          {isLoading && results.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-muted-foreground">Searching</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-muted-foreground">No results</p>
          ) : (
            <ul>
              {results.map(result => (
                <li key={result.id}>
                  <Link
                    href={result.url}
                    onClick={() => onSearchChange('')}
                    className={`nk-press block rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground ${result.type === 'page' ? 'font-medium' : 'pl-5 text-muted-foreground'}`}
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
