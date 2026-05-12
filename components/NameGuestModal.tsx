'use client'

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'
import { validateNameGuestInput } from '@/lib/guestName'
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

const STRENGTH_OPTIONS: { value: Strength; label: string }[] = [
  { value: 'below', label: 'Below average' },
  { value: 'average', label: 'Average' },
  { value: 'above', label: 'Above average' },
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
        <Dialog.Overlay className="fixed inset-0 bg-black/70 z-[999]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] w-full max-w-sm rounded-xl bg-slate-800 border border-slate-700 shadow-xl focus:outline-none">
          <form onSubmit={handleSubmit} className="p-4">
            <Dialog.Title className="text-sm font-semibold text-slate-100">
              Name {guestName}
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-xs text-slate-400">
              Replace this guest entry with a real player for this match.
            </Dialog.Description>

            <div className="mt-4">
              <label htmlFor="name-guest-name" className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Name
              </label>
              <input
                id="name-guest-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-100 focus:border-blue-700 focus:outline-none"
                autoFocus
              />
            </div>

            <div className="mt-3">
              <p id="mentality-label" className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Mentality</p>
              <div
                role="radiogroup"
                aria-labelledby="mentality-label"
                className="mt-1 flex overflow-hidden rounded border border-slate-700"
              >
                {MENTALITY_OPTIONS.map((opt, i) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={mentality === opt.value}
                    onClick={() => setMentality(opt.value)}
                    className={cn(
                      'flex-1 px-2 py-1.5 text-xs font-semibold',
                      i < MENTALITY_OPTIONS.length - 1 && 'border-r border-slate-700',
                      mentality === opt.value
                        ? 'bg-blue-950 text-blue-300'
                        : 'text-slate-500 hover:text-slate-300'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <p id="strength-label" className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Strength hint</p>
              <div
                role="radiogroup"
                aria-labelledby="strength-label"
                className="mt-1 flex overflow-hidden rounded border border-slate-700"
              >
                {STRENGTH_OPTIONS.map((opt, i) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={strength === opt.value}
                    onClick={() => setStrength(opt.value)}
                    className={cn(
                      'flex-1 px-2 py-1.5 text-xs font-semibold',
                      i < STRENGTH_OPTIONS.length - 1 && 'border-r border-slate-700',
                      strength === opt.value
                        ? 'bg-blue-950 text-blue-300'
                        : 'text-slate-500 hover:text-slate-300'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={submitting}
                  className="rounded border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-50"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={submitting}
                className="rounded bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
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
