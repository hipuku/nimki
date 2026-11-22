import Link from 'next/link'
import { SiteHeader } from '../components/site-header'
import { source } from '../lib/source'

export default function Home() {
  return (
    <>
      <SiteHeader tree={source.getPageTree()} />
      <main className="mx-auto max-w-3xl px-4 py-20">
        <h1 className="font-display text-5xl leading-tight">nimki</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          React components for product interfaces: a drop-in superset of shadcn/ui with designed
          motion.
        </p>
        <p className="mt-6 text-sm">
          Nothing is released yet. Version 0 is Button, Input with Label, Select, Switch, Tabs and
          Dialog.
        </p>
        <ul className="mt-10 grid gap-3 sm:grid-cols-2">
          {[
            ['/docs', 'Introduction', 'What nimki is and how these docs work.'],
            ['/docs/foundations/motion', 'Motion', 'Every role in every theme, played live.'],
          ].map(([href, title, text]) => (
            <li key={href}>
              <Link
                href={href as string}
                className="block rounded-lg border border-border bg-card p-4 hover:border-input"
              >
                <span className="font-medium">{title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{text}</span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  )
}
