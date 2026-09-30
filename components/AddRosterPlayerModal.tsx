'use client'

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
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
      setSubmitError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open && !submitting) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-[#030710]/80 z-[999]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] w-full max-w-[calc(100%-32px)] sm:max-w-sm rounded-[14px] bg-[#0a1421] border border-[#1b2c46] shadow-[0_34px_80px_rgba(0,0,0,.65)] focus:outline-none">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#1b2c46]">
            <Dialog.Title className="text-base font-semibold text-[#f4f9ff]">Add player</Dialog.Title>
            <Dialog.Close
              onClick={onClose}
              disabled={submitting}
              aria-label="Close"
              className="inline-flex size-7 items-center justify-center rounded text-[#8ba4c4] hover:text-[#f4f9ff] disabled:opacity-50 transition-colors"
            >
              <X className="size-4" aria-hidden />
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
