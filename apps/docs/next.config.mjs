import { createMDX } from 'fumadocs-mdx/next'

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
}

// Fumadocs MDX turns content/docs into the collections in .source (PRD FR-D7).
export default createMDX()(config)
