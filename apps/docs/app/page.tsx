import { Activity, BookOpen, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { SiteHeader } from '../components/site-header'
import { source } from '../lib/source'

export default function Home() {
  return (
    <>
      <SiteHeader tree={source.getPageTree()} />
      <main className="mx-auto max-w-3xl px-6 py-24">
        <h1 className="font-display text-5xl leading-tight">nimki</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          React components for product interfaces: a drop-in superset of shadcn/ui with designed
          motion.
        </p>
        <p className="mt-6 text-sm">
          Nothing is released yet. Version 0 is Button, Input with Label, Select, Switch, Tabs and
          Dialog.
        </p>
        <ul className="mt-12 grid gap-4 sm:grid-cols-2">
          {(
            [
              ['/docs', 'Introduction', 'What nimki is and how these docs work.', BookOpen],
              [
                '/docs/foundations/motion',
                'Motion',
                'Every role in every theme, played live.',
                Activity,
              ],
            ] as [string, string, string, LucideIcon][]
          ).map(([href, title, text, Icon]) => (
            <li key={href}>
              <Link
                href={href}
                className="nk-state flex h-full gap-4 rounded-xl border border-border bg-card p-6"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                  <Icon aria-hidden="true" size={16} strokeWidth={1.5} />
                </span>
                <span>
                  <span className="block font-medium">{title}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{text}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  )
}
