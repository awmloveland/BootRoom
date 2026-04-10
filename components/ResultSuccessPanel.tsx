'use client'

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Share2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Winner } from '@/lib/types'

interface Props {
  week: number
  date: string
  winner: Winner
  goalDifference: number
  teamA: string[]
  teamB: string[]
  highlightsText: string
  shareText: string
  onDismiss: () => void
}

export function ResultSuccessPanel({
  week,
  date,
  winner,
  goalDifference,
  teamA,
  teamB,
  highlightsText,
  shareText,
  onDismiss,
}: Props) {
  const [copied, setCopied] = useState(false)

  const resultHeadline =
    winner === 'draw'
      ? '🤝 Draw!'
      : winner === 'teamA'
        ? `🏆 Team A win! (+${goalDifference} goals)`
        : `🏆 Team B win! (+${goalDifference} goals)`

  const highlightLines = highlightsText
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

  async function handleShare() {
    if (navigator.share && window.innerWidth < 768) {
      try {
        await navigator.share({ text: shareText })
      } catch (err) {
        if (err instanceof DOMException && err.name !== 'AbortError') {
          await copyToClipboard()
        }
      }
    } else {
      await copyToClipboard()
    }
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable — nothing to do
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onDismiss() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 z-[999]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] w-full max-w-sm rounded-xl bg-slate-800 border border-slate-700 shadow-xl focus:outline-none overflow-hidden">

          {/* Header */}
          <div className="px-5 pt-4 pb-3 border-b border-slate-700 flex items-center justify-between">
            <div>
              <Dialog.Title className="text-base font-semibold text-slate-100">
                Result saved — Week {week}
              </Dialog.Title>
              <Dialog.Description className="text-xs text-slate-400 mt-0.5">
                {date}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                className="text-slate-500 hover:text-slate-300 p-1 rounded transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Body */}
          <div className="p-5 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">

            {/* Result headline */}
            <div className={cn(
              'rounded-lg border px-4 py-3 text-center',
              winner === 'teamA' ? 'bg-blue-950 border-blue-800' :
              winner === 'teamB' ? 'bg-violet-950 border-violet-800' :
              'bg-slate-900 border-slate-700'
            )}>
              <p className={cn(
                'text-base font-bold',
                winner === 'teamA' ? 'text-blue-300' :
                winner === 'teamB' ? 'text-violet-300' :
                'text-slate-300'
              )}>
                {resultHeadline}
              </p>
            </div>

            {/* Teams */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-900 border border-blue-900/50 rounded-lg p-3">
                <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide mb-2">🔵 Team A</p>
                <p className="text-xs text-slate-300 leading-relaxed">{teamA.join(', ')}</p>
              </div>
              <div className="bg-slate-900 border border-violet-900/50 rounded-lg p-3">
                <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-wide mb-2">🟣 Team B</p>
                <p className="text-xs text-slate-300 leading-relaxed">{teamB.join(', ')}</p>
              </div>
            </div>

            {/* Highlights */}
            {highlightLines.length > 0 && (
              <div className="bg-slate-900 border border-slate-700 rounded-lg p-3">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Highlights</p>
                <div className="flex flex-col gap-1.5">
                  {highlightLines.map((line, i) => (
                    <p key={i} className="text-xs text-slate-300">{line}</p>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div className="flex gap-2 px-5 pb-5 pt-2">
            <button
              type="button"
              onClick={handleShare}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
            >
              <Share2 className="h-4 w-4" />
              {copied ? 'Result copied!' : 'Share result'}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="px-4 py-2.5 rounded-lg border border-slate-600 text-slate-300 text-sm hover:border-slate-500 transition-colors"
            >
              Done
            </button>
          </div>

        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
