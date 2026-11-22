'use client'

import { Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState, type ComponentProps } from 'react'
import { iconButton } from './styles'

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
        className={`${iconButton} absolute top-2.5 right-2.5`}
      >
        {copied ? (
          <Check key="check" aria-hidden="true" size={14} strokeWidth={1.5} className="nk-pop-in" />
        ) : (
          <Copy key="copy" aria-hidden="true" size={14} strokeWidth={1.5} className="nk-pop-in" />
        )}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? 'Copied to the clipboard' : ''}
      </span>
    </div>
  )
}
