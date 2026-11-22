import { defineConfig, defineDocs } from 'fumadocs-mdx/config'

/** Every page under content/docs; folders and meta.json files give the navigation. */
export const docs = defineDocs({ dir: 'content/docs' })

export default defineConfig({
  mdxOptions: {
    // GitHub's -default themes are the ones built for WCAG contrast; the older
    // github-light keyword red is 4.3:1 on the light card.
    rehypeCodeOptions: { themes: { light: 'github-light-default', dark: 'github-dark-default' } },
  },
})
