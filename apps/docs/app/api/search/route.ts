import { createFromSource } from 'fumadocs-core/search/server'
import { source } from '../../../lib/source'

/** The search index over every page and heading (PRD FR-D7). */
export const { GET } = createFromSource(source)
