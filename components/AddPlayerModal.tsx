// components/AddPlayerModal.tsx
'use client'

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import type { Player, GuestEntry, NewPlayerEntry, Strength } from '@/lib/types'
import { Toggle } from '@/components/ui/toggle'
import { StrengthPills } from '@/components/ui/StrengthPills'
import { NewPlayerForm } from '@/components/NewPlayerForm'

interface Props {
  players: Player[]           // attending players (used for lineup-membership warning check)
  allLeaguePlayers: Player[]  // full league roster (for collision check)
  existingGuests: GuestEntry[] // used to compute +1, +2 suffixes
  onAdd: (entry: GuestEntry | NewPlayerEntry) => void
  onClose: () => void
}

type Step = 'choose' | 'guest' | 'new_player'

export function AddPlayerModal({ players, allLeaguePlayers, existingGuests, onAdd, onClose }: Props) {
  const [step, setStep] = useState<Step>('choose')

  // Guest sub-flow state
  const [associatedPlayer, setAssociatedPlayer] = useState('')
  const [guestStrength, setGuestStrength] = useState<Strength>('average')
  const [guestIsGoalkeeper, setGuestIsGoalkeeper] = useState(false)

  const selectedPlayerInLineup = players.some((p) => p.name === associatedPlayer)
  const showWarning = associatedPlayer && !selectedPlayerInLineup

  function deriveGuestName(base: string): string {
    const existingForPlayer = existingGuests.filter((g) => g.associatedPlayer === base)
    const n = existingForPlayer.length + 1
    return `${base} +${n}`
  }

  function handleAddGuest() {
    if (!associatedPlayer) return
    const name = deriveGuestName(associatedPlayer)
    onAdd({
      type: 'guest',
      name,
      associatedPlayer,
      goalkeeper: guestIsGoalkeeper,
      strength: guestStrength,
    })
    onClose()
  }

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 z-[999]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] w-full max-w-sm rounded-xl bg-slate-800 border border-slate-700 shadow-xl focus:outline-none">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
            <Dialog.Title className="text-base font-semibold text-slate-100">
              {step === 'choose' && 'Add Player'}
              {step === 'guest' && 'Add Guest'}
              {step === 'new_player' && 'Add New Player'}
            </Dialog.Title>
            <Dialog.Close
              onClick={onClose}
              className="text-slate-500 hover:text-slate-300 text-lg leading-none"
            >
              ✕
            </Dialog.Close>
          </div>

          {/* Step: choose */}
          {step === 'choose' && (
            <>
              <div className="p-5">
                <p className="text-xs text-slate-400 mb-3">Who are you adding?</p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep('guest')}
                    className="flex-1 flex flex-col items-center gap-1.5 bg-slate-900 border border-slate-600 hover:border-blue-500 rounded-lg p-4 transition-colors"
                  >
                    <span className="text-2xl">👤</span>
                    <span className="text-sm font-semibold text-slate-100">Guest</span>
                    <span className="text-[11px] text-slate-500 text-center leading-tight">A +1 for an existing player</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep('new_player')}
                    className="flex-1 flex flex-col items-center gap-1.5 bg-slate-900 border border-slate-600 hover:border-blue-500 rounded-lg p-4 transition-colors"
                  >
                    <span className="text-2xl">✨</span>
                    <span className="text-sm font-semibold text-slate-100">New player</span>
                    <span className="text-[11px] text-slate-500 text-center leading-tight">Add them to the roster</span>
                  </button>
                </div>
              </div>
              <div className="flex justify-end px-5 pb-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded border border-slate-600 text-slate-300 text-sm hover:border-slate-500"
                >
                  Cancel
                </button>
              </div>
            </>
          )}

          {/* Step: guest */}
          {step === 'guest' && (
            <>
              <div className="p-5 flex flex-col gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    Plays with
                  </label>
                  <select
                    name="plays-with"
                    value={associatedPlayer}
                    onChange={(e) => setAssociatedPlayer(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Select a player…</option>
                    {allLeaguePlayers.map((p) => (
                      <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                  {associatedPlayer && (
                    <p className="text-[11px] text-slate-500 mt-1">
                      Will appear as <span className="text-slate-300 font-medium">{deriveGuestName(associatedPlayer)}</span> and placed on the same team as {associatedPlayer}.
                    </p>
                  )}
                  {showWarning && (
                    <div className="mt-2 flex gap-2 bg-amber-950 border border-amber-800 rounded p-2 text-[11px] text-amber-400 leading-relaxed">
                      ⚠ {associatedPlayer} isn&apos;t attending this game. Add them to the lineup first, or the guest will be distributed freely by Auto-Pick.
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Strength
                  </label>
                  <StrengthPills value={guestStrength} onChange={setGuestStrength} />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Defaults to Average — change only if you know this player.
                  </p>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                      Dedicated goalkeeper
                    </label>
                    <p className="text-[11px] text-slate-400 leading-relaxed mt-px">
                      Plays in goal all game, every game.
                    </p>
                  </div>
                  <Toggle enabled={guestIsGoalkeeper} onChange={(v) => setGuestIsGoalkeeper(v)} />
                </div>
              </div>

              <div className="flex gap-2 justify-end px-5 pb-4">
                <button
                  type="button"
                  onClick={() => { setStep('choose'); setGuestStrength('average'); setGuestIsGoalkeeper(false) }}
                  className="px-4 py-2 rounded border border-slate-600 text-slate-300 text-sm hover:border-slate-500"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleAddGuest}
                  disabled={!associatedPlayer}
                  className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-40"
                >
                  Add guest
                </button>
              </div>
            </>
          )}

          {/* Step: new player */}
          {step === 'new_player' && (
            <NewPlayerForm
              existingNames={allLeaguePlayers.map((p) => p.name)}
              showNameHelper
              cancelLabel="Back"
              onCancel={() => setStep('choose')}
              onSubmit={({ name, strength, mentality }) => {
                onAdd({ type: 'new_player', name, strength, mentality })
                onClose()
              }}
            />
          )}

        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
