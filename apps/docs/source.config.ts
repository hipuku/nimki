import { defineConfig, defineDocs } from 'fumadocs-mdx/config'

/** Every page under content/docs; folders and meta.json files give the navigation. */
export const docs = defineDocs({ dir: 'content/docs' })

export default defineConfig()
