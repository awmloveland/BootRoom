// components/AddPlayerModal.tsx
'use client'

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Sparkles, User, X } from 'lucide-react'
import type { Player, GuestEntry, NewPlayerEntry, Strength } from '@/lib/types'
import { Toggle } from '@/components/ui/toggle'
import { StrengthPills } from '@/components/ui/StrengthPills'
import { NewPlayerForm } from '@/components/NewPlayerForm'
import { nextGuestName } from '@/lib/guestName'

interface Props {
  players: Player[]           // attending players (used for lineup-membership warning check)
  allLeaguePlayers: Player[]  // full league roster (for collision check)
  existingGuests: GuestEntry[] // used to compute +1, +2 suffixes and block name collisions
  existingNewPlayers: NewPlayerEntry[] // used to block name collisions
  onAdd: (entry: GuestEntry | NewPlayerEntry) => void
  onClose: () => void
}

type Step = 'choose' | 'guest' | 'new_player'

export function AddPlayerModal({ players, allLeaguePlayers, existingGuests, existingNewPlayers, onAdd, onClose }: Props) {
  const [step, setStep] = useState<Step>('choose')

  // Guest sub-flow state
  const [associatedPlayer, setAssociatedPlayer] = useState('')
  const [guestStrength, setGuestStrength] = useState<Strength>('average')
  const [guestIsGoalkeeper, setGuestIsGoalkeeper] = useState(false)

  const selectedPlayerInLineup = players.some((p) => p.name === associatedPlayer)
  const showWarning = associatedPlayer && !selectedPlayerInLineup

  function handleAddGuest() {
    if (!associatedPlayer) return
    const name = nextGuestName(associatedPlayer, existingGuests)
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
        <Dialog.Overlay className="fixed inset-0 bg-[#030710]/80 z-[999]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] w-full max-w-[calc(100%-32px)] sm:max-w-sm rounded-[14px] bg-[#0a1421] border border-[#1b2c46] shadow-[0_34px_80px_rgba(0,0,0,.65)] focus:outline-none">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#1b2c46]">
            <Dialog.Title className="text-base font-bold tracking-[-.02em] text-[#f4f9ff]">
              {step === 'choose' && 'Add Player'}
              {step === 'guest' && 'Add Guest'}
              {step === 'new_player' && 'Add New Player'}
            </Dialog.Title>
            <Dialog.Close
              onClick={onClose}
              aria-label="Close"
              className="inline-flex size-7 items-center justify-center rounded text-[#8ba4c4] hover:text-[#f4f9ff] transition-colors"
            >
              <X className="size-4" aria-hidden />
            </Dialog.Close>
          </div>

          {/* Step: choose */}
          {step === 'choose' && (
            <>
              <div className="p-5">
                <p className="font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#6f88a8] mb-3">Who are you adding?</p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep('guest')}
                    className="flex-1 flex flex-col items-center gap-2 bg-[#0c1728] border border-[#223a5c] hover:border-[#38bdf8] rounded-lg p-4 transition-colors"
                  >
                    <span className="flex size-9 items-center justify-center rounded-full border border-[#223a5c] bg-[#0a1421] text-[#8ba4c4]">
                      <User className="size-4" aria-hidden />
                    </span>
                    <span className="text-sm font-bold tracking-[-.02em] text-[#f4f9ff]">Guest</span>
                    <span className="font-inter-body text-[11px] text-[#6f88a8] text-center leading-tight">A +1 for an existing player</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep('new_player')}
                    className="flex-1 flex flex-col items-center gap-2 bg-[#0c1728] border border-[#223a5c] hover:border-[#38bdf8] rounded-lg p-4 transition-colors"
                  >
                    <span className="flex size-9 items-center justify-center rounded-full border border-[#bef264]/40 bg-[#bef264]/12 text-[#bef264]">
                      <Sparkles className="size-4" aria-hidden />
                    </span>
                    <span className="text-sm font-bold tracking-[-.02em] text-[#f4f9ff]">New player</span>
                    <span className="font-inter-body text-[11px] text-[#6f88a8] text-center leading-tight">Add them to the roster</span>
                  </button>
                </div>
              </div>
              <div className="flex justify-end px-5 pb-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-9 px-3.5 rounded border border-[#223a5c] text-[#cfe0f4] text-[13px] font-semibold hover:border-[#38bdf8] hover:text-white transition-colors"
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
                  <label className="block font-plex text-[9px] font-bold text-[#6f88a8] uppercase tracking-[.18em] mb-1.5">
                    Plays with
                  </label>
                  <select
                    name="plays-with"
                    value={associatedPlayer}
                    onChange={(e) => setAssociatedPlayer(e.target.value)}
                    className="w-full h-9 bg-[#0c1728] border border-[#1b2c46] rounded px-3 font-inter-body text-[13px] text-[#f4f9ff] focus:outline-none focus:ring-0 focus:border-[#38bdf8]"
                  >
                    <option value="">Select a player…</option>
                    {allLeaguePlayers.map((p) => (
                      <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                  {associatedPlayer && (
                    <p className="font-inter-body text-[11px] text-[#6f88a8] mt-1">
                      Will appear as <span className="text-[#cfe0f4] font-medium">{nextGuestName(associatedPlayer, existingGuests)}</span> and placed on the same team as {associatedPlayer}.
                    </p>
                  )}
                  {showWarning && (
                    <div className="mt-2 rounded border border-[#e2686f]/40 bg-[#e2686f]/10 px-3 py-2 font-inter-body text-xs text-[#e2686f] leading-relaxed">
                      {associatedPlayer} isn&apos;t attending this game. Add them to the lineup first, or the guest will be distributed freely by Auto-Pick.
                    </div>
                  )}
                </div>

                <div>
                  <label className="block font-plex text-[9px] font-bold text-[#6f88a8] uppercase tracking-[.18em] mb-1.5">
                    Strength
                  </label>
                  <StrengthPills value={guestStrength} onChange={setGuestStrength} />
                  <p className="font-inter-body text-[11px] text-[#6f88a8] mt-1">
                    Defaults to Average. Change only if you know this player.
                  </p>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <label className="block font-plex text-[9px] font-bold text-[#6f88a8] uppercase tracking-[.18em]">
                      Dedicated goalkeeper
                    </label>
                    <p className="font-inter-body text-[11px] text-[#8ba4c4] leading-relaxed mt-1">
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
                  className="h-9 px-3.5 rounded border border-[#223a5c] text-[#cfe0f4] text-[13px] font-semibold hover:border-[#38bdf8] hover:text-white transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleAddGuest}
                  disabled={!associatedPlayer}
                  className="h-9 px-3.5 rounded bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] text-[13px] font-bold disabled:opacity-50 transition-colors"
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
              lineupNames={[...existingNewPlayers.map((p) => p.name), ...existingGuests.map((g) => g.name)]}
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
