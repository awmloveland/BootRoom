// components/AddPlayerModal.tsx
'use client'

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import type { Player, GuestEntry, NewPlayerEntry } from '@/lib/types'
import { EyeTestSlider } from '@/components/EyeTestSlider'
import { Toggle } from '@/components/ui/toggle'

interface Props {
  players: Player[]           // current lineup players (for "plays with" dropdown)
  allLeaguePlayers: Player[]  // full league roster (for collision check)
  avgRating: number           // pre-computed average rating to default slider to
  existingGuests: GuestEntry[] // used to compute +1, +2 suffixes
  onAdd: (entry: GuestEntry | NewPlayerEntry) => void
  onClose: () => void
}

type Step = 'choose' | 'guest' | 'new_player'

export function AddPlayerModal({ players, allLeaguePlayers, avgRating, existingGuests, onAdd, onClose }: Props) {
  const [step, setStep] = useState<Step>('choose')

  // Guest sub-flow state
  const [associatedPlayer, setAssociatedPlayer] = useState('')
  const [guestRating, setGuestRating] = useState(avgRating)

  // New player sub-flow state
  const [newName, setNewName] = useState('')
  const [newRating, setNewRating] = useState(avgRating)
  const [nameError, setNameError] = useState<string | null>(null)

  const [guestIsGoalkeeper, setGuestIsGoalkeeper] = useState(false)
  const [newPlayerIsGoalkeeper, setNewPlayerIsGoalkeeper] = useState(false)

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
      rating: guestRating,
      goalkeeper: guestIsGoalkeeper,
    })
    onClose()
  }

  function handleAddNewPlayer() {
    const trimmed = newName.trim()
    if (!trimmed) return
    const collision = allLeaguePlayers.some(
      (p) => p.name.toLowerCase() === trimmed.toLowerCase()
    )
    if (collision) {
      setNameError(`A player named "${trimmed}" already exists in this league.`)
      return
    }
    onAdd({
      type: 'new_player',
      name: trimmed,
      rating: newRating,
      goalkeeper: newPlayerIsGoalkeeper,
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
              {step === 'choose' && 'Add player'}
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
                    value={associatedPlayer}
                    onChange={(e) => setAssociatedPlayer(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Select a player…</option>
                    {players.map((p) => (
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
                      ⚠ {associatedPlayer} isn&apos;t in the current lineup. The guest will be added but can&apos;t be pinned to a team until {associatedPlayer} is selected.
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    The Eye Test
                    <span className="ml-2 normal-case text-blue-400 bg-blue-950 border border-blue-800 rounded px-1.5 py-0.5 font-medium">avg: {avgRating}</span>
                  </label>
                  <EyeTestSlider value={guestRating} onChange={setGuestRating} showNote />
                </div>

                <div className="pt-1">
                  <div className="flex items-center gap-2.5">
                    <Toggle enabled={guestIsGoalkeeper} onChange={(v) => setGuestIsGoalkeeper(v)} />
                    <span className="text-xs font-semibold text-slate-300">Dedicated goalkeeper</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 ml-[42px] leading-relaxed">
                    Plays in goal every game. Goalkeepers are always split across teams during auto-pick.
                  </p>
                </div>
              </div>

              <div className="flex gap-2 justify-end px-5 pb-4">
                <button
                  type="button"
                  onClick={() => { setStep('choose'); setGuestIsGoalkeeper(false) }}
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
            <>
              <div className="p-5 flex flex-col gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    Player name
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => { setNewName(e.target.value); setNameError(null) }}
                    placeholder="Full name"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    autoFocus
                  />
                  {nameError && <p className="text-xs text-red-400 mt-1">{nameError}</p>}
                  <p className="text-[11px] text-slate-500 mt-1">
                    They&apos;ll be added to the league roster permanently after confirming during result.
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    The Eye Test
                    <span className="ml-2 normal-case text-blue-400 bg-blue-950 border border-blue-800 rounded px-1.5 py-0.5 font-medium">avg: {avgRating}</span>
                  </label>
                  <EyeTestSlider value={newRating} onChange={setNewRating} showNote />
                </div>

                <div className="pt-1">
                  <div className="flex items-center gap-2.5">
                    <Toggle enabled={newPlayerIsGoalkeeper} onChange={(v) => setNewPlayerIsGoalkeeper(v)} />
                    <span className="text-xs font-semibold text-slate-300">Dedicated goalkeeper</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 ml-[42px] leading-relaxed">
                    Plays in goal every game. Goalkeepers are always split across teams during auto-pick.
                  </p>
                </div>
              </div>

              <div className="flex gap-2 justify-end px-5 pb-4">
                <button
                  type="button"
                  onClick={() => { setStep('choose'); setNewPlayerIsGoalkeeper(false) }}
                  className="px-4 py-2 rounded border border-slate-600 text-slate-300 text-sm hover:border-slate-500"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleAddNewPlayer}
                  disabled={!newName.trim()}
                  className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-40"
                >
                  Add player
                </button>
              </div>
            </>
          )}

        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
