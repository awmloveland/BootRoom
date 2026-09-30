'use client'

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'
import { validateNameGuestInput } from '@/lib/guestName'
import { StrengthPills } from '@/components/ui/StrengthPills'
import type { Mentality, Strength } from '@/lib/types'

interface Props {
  guestName: string
  existingPlayers: string[]
  onSubmit: (entry: { newName: string; mentality: Mentality; strength: Strength }) => Promise<void>
  onClose: () => void
}

const MENTALITY_OPTIONS: { value: Mentality; label: string }[] = [
  { value: 'goalkeeper', label: 'GK' },
  { value: 'defensive', label: 'DEF' },
  { value: 'balanced', label: 'BAL' },
  { value: 'attacking', label: 'ATT' },
]

export function NameGuestModal({ guestName, existingPlayers, onSubmit, onClose }: Props) {
  const [name, setName] = useState('')
  const [mentality, setMentality] = useState<Mentality>('balanced')
  const [strength, setStrength] = useState<Strength>('average')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    const validationError = validateNameGuestInput(name, existingPlayers)
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await onSubmit({ newName: name.trim(), mentality, strength })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-[#030710]/80 z-[999]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] w-full max-w-[calc(100%-32px)] sm:max-w-sm rounded-[14px] bg-[#0a1421] border border-[#1b2c46] shadow-[0_34px_80px_rgba(0,0,0,.65)] focus:outline-none">
          <form onSubmit={handleSubmit} className="p-4">
            <Dialog.Title className="text-sm font-semibold text-[#f4f9ff]">
              Name {guestName}
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-xs text-[#8ba4c4]">
              Replace this guest entry with a real player for this match.
            </Dialog.Description>

            <div className="mt-4">
              <label htmlFor="name-guest-name" className="font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#6f88a8]">
                Name
              </label>
              <input
                id="name-guest-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
                className="mt-1 w-full rounded border border-[#1b2c46] bg-[#0c1728] px-2.5 py-1.5 text-sm text-[#f4f9ff] focus:border-[#38bdf8] focus:outline-none"
                autoFocus
              />
            </div>

            <div className="mt-3">
              <p id="mentality-label" className="font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#6f88a8]">Mentality</p>
              <div
                role="radiogroup"
                aria-labelledby="mentality-label"
                className="mt-1.5 flex overflow-hidden rounded border border-[#223a5c] font-plex text-[9px] font-bold uppercase tracking-[.12em]"
              >
                {MENTALITY_OPTIONS.map((opt, i) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={mentality === opt.value}
                    onClick={() => setMentality(opt.value)}
                    className={cn(
                      'flex-1 h-8 px-2 transition-colors',
                      i < MENTALITY_OPTIONS.length - 1 && 'border-r border-[#223a5c]',
                      mentality === opt.value
                        ? 'bg-[rgba(8,47,73,.6)] text-[#7dd3fc]'
                        : 'text-[#8ba4c4] hover:text-white'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <p className="font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#6f88a8]">Strength</p>
              <div className="mt-1">
                <StrengthPills value={strength} onChange={setStrength} />
              </div>
            </div>

            {error && <p className="mt-3 text-xs text-[#e2686f]">{error}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={submitting}
                  className="rounded border border-[#1b2c46] px-3 py-1.5 text-xs font-semibold text-[#cfe0f4] hover:bg-[#1b2c46] disabled:opacity-50"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={submitting}
                className="rounded bg-[#38bdf8] px-3 py-1.5 text-xs font-bold text-[#05101d] hover:bg-[#7dd3fc] disabled:opacity-50"
              >
                Add player
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
