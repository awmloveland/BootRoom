'use client'

import { useState } from 'react'
import type { Mentality, Strength } from '@/lib/types'
import { StrengthPills } from '@/components/ui/StrengthPills'
import { cn } from '@/lib/utils'

const MENTALITY_OPTIONS: { value: Mentality; label: string }[] = [
  { value: 'goalkeeper', label: 'GK' },
  { value: 'defensive',  label: 'DEF' },
  { value: 'balanced',   label: 'BAL' },
  { value: 'attacking',  label: 'ATT' },
]

export interface NewPlayerFormValues {
  name: string
  strength: Strength
  mentality: Mentality
}

interface Props {
  /** Existing names used for client-side case-insensitive collision check. */
  existingNames: string[]
  /** Whether to show the helper text under the name field (lineup-builder shows it; settings does not). */
  showNameHelper?: boolean
  /** External submit-error message (e.g. from a 409 response). */
  submitError?: string | null
  /** Disable inputs + submit while a parent request is in flight. */
  submitting?: boolean
  /** Submit-button label (default: 'Add player'). */
  submitLabel?: string
  /** Cancel-button label (default: 'Cancel'). Pass `null` to hide it. */
  cancelLabel?: string | null
  onSubmit: (values: NewPlayerFormValues) => void
  onCancel: () => void
}

export function NewPlayerForm({
  existingNames,
  showNameHelper = false,
  submitError = null,
  submitting = false,
  submitLabel = 'Add player',
  cancelLabel = 'Cancel',
  onSubmit,
  onCancel,
}: Props) {
  const [name, setName] = useState('')
  const [strength, setStrength] = useState<Strength>('average')
  const [mentality, setMentality] = useState<Mentality>('balanced')
  const [nameError, setNameError] = useState<string | null>(null)

  function handleSubmit() {
    const trimmed = name.trim()
    if (!trimmed) return
    const collision = existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())
    if (collision) {
      setNameError(`A player named "${trimmed}" already exists in this league.`)
      return
    }
    onSubmit({ name: trimmed, strength, mentality })
  }

  return (
    <>
      <div className="p-5 flex flex-col gap-4">
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Player name
          </label>
          <input
            type="text"
            name="player-name"
            value={name}
            onChange={(e) => { setName(e.target.value); setNameError(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
            placeholder="Full name"
            disabled={submitting}
            autoFocus
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          />
          {nameError && <p className="text-xs text-red-400 mt-1">{nameError}</p>}
          {!nameError && submitError && <p className="text-xs text-red-400 mt-1">{submitError}</p>}
          {showNameHelper && (
            <p className="text-[11px] text-slate-500 mt-1">
              They&apos;ll be added to the league roster permanently after confirming during result.
            </p>
          )}
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Strength
          </label>
          <StrengthPills value={strength} onChange={setStrength} disabled={submitting} />
          <p className="text-[11px] text-slate-500 mt-1">
            Defaults to Average — change only if you know this player.
          </p>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Mentality
          </label>
          <div className="flex bg-slate-900 border border-slate-700 rounded-md overflow-hidden text-[10px] font-semibold">
            {MENTALITY_OPTIONS.map(({ value, label }, i) => (
              <button
                key={value}
                type="button"
                disabled={submitting}
                onClick={() => { if (value !== mentality) setMentality(value) }}
                className={cn(
                  'flex-1 py-1.5 transition-colors',
                  i < MENTALITY_OPTIONS.length - 1 && 'border-r',
                  value === mentality
                    ? 'bg-blue-950 text-blue-300 border-blue-800'
                    : 'text-slate-500 border-slate-700 hover:text-slate-300',
                  submitting && 'opacity-50'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            GK = dedicated goalkeeper, plays in goal every game.
          </p>
        </div>
      </div>

      <div className="flex gap-2 justify-end px-5 pb-4">
        {cancelLabel !== null && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 rounded border border-slate-600 text-slate-300 text-sm hover:border-slate-500 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !name.trim()}
          className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-40"
        >
          {submitting ? 'Adding…' : submitLabel}
        </button>
      </div>
    </>
  )
}
