import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { mdxComponents } from '../../../components/mdx'
import { Toc } from '../../../components/toc'
import { source } from '../../../lib/source'

interface Props {
  params: Promise<{ slug?: string[] }>
}

/** Every docs page: a server component; demos inside it are client components (FR-D7). */
export default async function Page({ params }: Props) {
  const { slug } = await params
  const page = source.getPage(slug)
  if (!page) notFound()
  const Body = page.data.body
  const toc = page.data.toc
  return (
    <div className="flex gap-12 pt-12 pb-24">
      <article className="min-w-0 flex-1">
        <header className="mb-10">
          <h1 className="font-display text-4xl leading-tight">{page.data.title}</h1>
          {page.data.description && (
            <p className="mt-3 text-base text-muted-foreground">{page.data.description}</p>
          )}
        </header>
        <div className="prose">
          <Body components={mdxComponents} />
        </div>
      </article>
      <aside className="sticky top-24 hidden h-fit w-48 shrink-0 xl:block">
        <Toc items={Array.isArray(toc) ? toc : []} />
      </aside>
    </div>
  )
}

export function generateStaticParams() {
  return source.generateParams()
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const page = source.getPage(slug)
  if (!page) notFound()
  return {
    title: page.data.title,
    ...(page.data.description ? { description: page.data.description } : {}),
  }
}
