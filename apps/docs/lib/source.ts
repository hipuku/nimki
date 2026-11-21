import { loader } from 'fumadocs-core/source'
import { docs } from '../.source/server'

/** The pages, their URLs under /docs and the navigation tree. */
export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
})
