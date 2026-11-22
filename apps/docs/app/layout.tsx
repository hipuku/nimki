import type { Metadata } from 'next'
import { DM_Mono, DM_Sans, DM_Serif_Display } from 'next/font/google'
import type { ReactNode } from 'react'
import { SettingsProvider } from '../components/settings-provider'
import { BOOT_SCRIPT } from '../lib/settings'
import './globals.css'

const sans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans', display: 'swap' })
const mono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-dm-mono',
  display: 'swap',
})
const display = DM_Serif_Display({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-dm-serif-display',
  display: 'swap',
})

export const metadata: Metadata = {
  title: { default: 'nimki', template: '%s · nimki' },
  description:
    'React components for product interfaces: a drop-in superset of shadcn/ui with designed motion.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The boot script sets the class and data attributes before React hydrates.
    <html
      lang="en-AU"
      className={`${sans.variable} ${mono.variable} ${display.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body>
        <SettingsProvider>{children}</SettingsProvider>
      </body>
    </html>
  )
}
