'use client'

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import type { PlayerAttribute } from '@/lib/types'
import { NewPlayerForm, type NewPlayerFormValues } from '@/components/NewPlayerForm'

interface Props {
  leagueId: string
  /** Existing player names for client-side collision check. */
  existingNames: string[]
  /** Called with the freshly-created player after a successful POST. */
  onCreated: (player: PlayerAttribute) => void
  onClose: () => void
}

export function AddRosterPlayerModal({ leagueId, existingNames, onCreated, onClose }: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  async function handleSubmit(values: NewPlayerFormValues) {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch(`/api/league/${leagueId}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(values),
      })
      const data = await res.json()
      if (!res.ok) {
        setSubmitError(data?.error ?? 'Failed to add player')
        return
      }
      onCreated(data as PlayerAttribute)
      onClose()
    } catch {
      setSubmitError('Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open && !submitting) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 z-[999]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] w-full max-w-sm rounded-xl bg-slate-800 border border-slate-700 shadow-xl focus:outline-none">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
            <Dialog.Title className="text-base font-semibold text-slate-100">Add player</Dialog.Title>
            <Dialog.Close
              onClick={onClose}
              disabled={submitting}
              className="text-slate-500 hover:text-slate-300 text-lg leading-none disabled:opacity-50"
            >
              ✕
            </Dialog.Close>
          </div>
          <NewPlayerForm
            existingNames={existingNames}
            submitting={submitting}
            submitError={submitError}
            onCancel={onClose}
            onSubmit={handleSubmit}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
