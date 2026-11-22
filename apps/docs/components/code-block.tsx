'use client'

import { Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState, type ComponentProps } from 'react'

/** Every code block, with a button that copies its text. */
export function CodeBlock(props: ComponentProps<'pre'>) {
  const ref = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = () => {
    navigator.clipboard.writeText(ref.current?.textContent ?? '').then(
      () => setCopied(true),
      () => setCopied(false),
    )
  }

  return (
    <div className="relative">
      <pre ref={ref} {...props} />
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Copied' : 'Copy code'}
        title={copied ? 'Copied' : 'Copy code'}
        className="absolute top-2 right-2 inline-flex size-8 cursor-pointer items-center justify-center rounded-md bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        {copied ? (
          <Check aria-hidden="true" size={14} strokeWidth={1.5} />
        ) : (
          <Copy aria-hidden="true" size={14} strokeWidth={1.5} />
        )}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? 'Copied to the clipboard' : ''}
      </span>
    </div>
  )
}
