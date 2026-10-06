'use client'

import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Copy, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WIDGET_CLASS, WIDGET_TITLE_CLASS } from '@/components/StatsSidebar'

const COPIED_MS = 1800

/** Copies text and flips to "Copied" (lime) for 1.8s. */
function useCopy(text: string) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      return
    }
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), COPIED_MS)
  }

  return { copied, copy }
}

function CopyButton({ text, className }: { text: string; className?: string }) {
  const { copied, copy } = useCopy(text)
  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        'inline-flex w-full items-center justify-center gap-[7px] rounded font-bold text-[#05101d] transition-colors hover:bg-[#7dd3fc] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7dd3fc] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a1421]',
        copied ? 'bg-[#bef264]' : 'bg-[#38bdf8]',
        className
      )}
    >
      <Copy className="size-3.5" strokeWidth={2.2} />
      <span aria-live="polite">{copied ? 'Copied' : 'Copy to clipboard'}</span>
    </button>
  )
}

/** Bottom sheet with the plain-text breakdown and a copy button. */
export function ShareSheet({
  open,
  onOpenChange,
  text,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  text: string
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#030710]/70 backdrop-blur-[4px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88vh] w-full max-w-[420px] flex-col rounded-t-2xl border border-b-0 border-[#1b2c46] bg-[#0a1421] pb-[env(safe-area-inset-bottom)] shadow-[0_-30px_80px_rgba(0,0,0,.6)] focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-6 data-[state=open]:duration-[220ms] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-6">
          <div className="flex justify-center pt-2.5">
            <span className="h-1 w-9 rounded-sm bg-[#223a5c]" />
          </div>
          <div className="flex items-center justify-between gap-2.5 px-4 pt-3 pb-2.5">
            <div>
              <Dialog.Title className="text-base font-bold tracking-[-.02em] text-[#f4f9ff]">Share breakdown</Dialog.Title>
              <Dialog.Description className="mt-1 font-plex text-[9px] uppercase tracking-[.12em] text-[#6f88a8]">
                Paste into the group chat
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="inline-flex size-8 items-center justify-center rounded-full border border-[#223a5c] text-[#8ba4c4] transition-colors hover:border-[#38bdf8] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8]"
            >
              <X className="size-3.5" strokeWidth={2.2} />
            </Dialog.Close>
          </div>
          <div className="mx-4 min-h-0 overflow-auto rounded-lg border border-[#17263c] bg-[#0c1728] p-3">
            <pre className="m-0 whitespace-pre-wrap break-words font-plex text-[11.5px] leading-[1.6] text-[#dff1ff]">{text}</pre>
          </div>
          <div className="flex gap-2 px-4 pt-3.5 pb-5">
            <CopyButton text={text} className="h-10 text-[13px]" />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Desktop sidebar widget: the same text, always visible, with its own copy button. */
export function SharePreview({ text }: { text: string }) {
  return (
    <div className={WIDGET_CLASS}>
      <div className="flex items-center justify-between gap-2 rounded-t-[11px] border-b border-[#17263c] bg-[#0c1728] px-3.5 py-2.5">
        <span className={cn(WIDGET_TITLE_CLASS, 'whitespace-nowrap')}>Share preview</span>
        <span className="rounded-[3px] border border-[#38bdf8]/35 bg-[#38bdf8]/8 px-1.5 py-[3px] font-plex text-[8px] font-bold uppercase tracking-[.12em] text-[#7dd3fc]">
          Plain text
        </span>
      </div>
      <div className="p-3.5">
        <pre className="m-0 whitespace-pre-wrap break-words font-plex text-[11px] leading-[1.6] text-[#cfe0f4]">{text}</pre>
        <CopyButton text={text} className="mt-3.5 h-9 text-xs" />
      </div>
    </div>
  )
}
