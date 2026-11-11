// components/new-league/PlayersStep.tsx
'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { splitPastedNames } from '@/lib/playerUtils'
import { FIELD, PRIMARY_BUTTON, SECONDARY_LINK, StepEyebrow, StepShell } from './StepShell'
import { PlayerRow } from './PlayerRow'
import type { RosterPlayer } from './RosterWizard'

interface Props {
  stepOffset: number
  /** The list, always ending in at least one blank row. */
  players: RosterPlayer[]
  onAdd: (names: string[]) => void
  /** Appends a blank row, so the one being typed into always has an empty slot beneath. */
  onAddBlank: () => void
  onRename: (id: string, name: string) => void
  onRemove: (id: string) => void
  onNext: () => void
}

const MIN_PLAYERS = 2
const TWO_SIDES = 10

/** Moves focus to the next row's input, so Enter walks down the list. */
function focusNextRow(input: HTMLInputElement) {
  input.closest('li')?.nextElementSibling?.querySelector('input')?.focus()
}

export function PlayersStep({ players, onAdd, onAddBlank, onRename, onRemove, onNext, stepOffset }: Props) {
  const [draft, setDraft] = useState('')
  const [pasteMode, setPasteMode] = useState(false)

  const named = players.filter((p) => p.name.trim())
  const keys = named.map((p) => p.name.trim().toLowerCase())
  const pasted = pasteMode ? splitPastedNames(draft).filter((n) => !keys.includes(n.toLowerCase())) : []
  // Renames can collide with another row; the route would reject the batch two
  // screens later, so block Continue here.
  const dupe = named.find((_, i) => keys.indexOf(keys[i]) !== i)
  const count = named.length
  const enough = count >= TWO_SIDES

  function addPasted() {
    if (pasted.length === 0) return
    onAdd(pasted)
    setDraft('')
    setPasteMode(false)
  }

  return (
    <StepShell
      eyebrow={<StepEyebrow n={4} offset={stepOffset} />}
      title="Who plays?"
      sub="Add the regulars by name. They do not need an account yet."
      action={<button type="button" className={PRIMARY_BUTTON} disabled={count < MIN_PLAYERS || !!dupe} onClick={onNext}>Continue</button>}
      secondary={
        <button type="button" className={SECONDARY_LINK} onClick={() => { setPasteMode((m) => !m); setDraft('') }}>
          {pasteMode ? 'Add one at a time instead' : 'Paste a list instead'}
        </button>
      }
    >
      <ul className="flex flex-col gap-2">
        {players.map((p, i) => {
          const last = i === players.length - 1
          const blank = !p.name.trim()
          return (
            <li key={p.id}>
              {p.you ? (
                <PlayerRow name={<span className="truncate">{p.name}</span>} you />
              ) : (
                <PlayerRow
                  className={cn('pl-1.5', blank && 'border-dashed border-[#223a5c]')}
                  name={
                    <input
                      aria-label={blank ? 'Add a player' : `Player name ${p.name}`}
                      className="h-[38px] w-full rounded-md border border-transparent bg-transparent px-2.5 font-inter-body text-[15px] font-semibold text-[#f4f9ff] placeholder:font-normal placeholder:text-[#4f688a] focus:border-[#38bdf8] focus:bg-[#0c1728] focus:outline-none"
                      placeholder="Add a player"
                      value={p.name}
                      autoFocus={last && i === 1}
                      onFocus={() => { if (last) onAddBlank() }}
                      onChange={(e) => onRename(p.id, e.target.value)}
                      onBlur={(e) => {
                        const v = e.target.value.trim()
                        if (v) onRename(p.id, v)
                        else if (!last) onRemove(p.id)
                      }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusNextRow(e.currentTarget) } }}
                    />
                  }
                >
                  {!blank && (
                    <button
                      type="button"
                      aria-label={`Remove ${p.name}`}
                      onClick={() => onRemove(p.id)}
                      className="flex size-[38px] shrink-0 items-center justify-center rounded-md text-[#4f688a] transition-colors hover:bg-[#e2686f]/10 hover:text-[#e2686f]"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </PlayerRow>
              )}
            </li>
          )
        })}
        {pasteMode && (
          <li>
            <div className="rounded-lg border border-[#38bdf8]/45 p-2">
              <textarea
                aria-label="Paste player names"
                className={cn(FIELD, 'h-auto border-0 bg-transparent px-2 py-2 text-sm')}
                rows={5}
                placeholder="One name per line, or separated by commas"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
              />
              <button type="button" className={cn(PRIMARY_BUTTON, 'mt-2 h-[38px] text-[13px]')} disabled={pasted.length === 0} onClick={addPasted}>
                Add {pasted.length} {pasted.length === 1 ? 'player' : 'players'}
              </button>
            </div>
          </li>
        )}
      </ul>
      {dupe && <p role="alert" className="mt-3 text-center font-inter-body text-[12.5px] text-[#e2686f]">{dupe.name} is already on the list</p>}
      <p className={cn('mt-3 text-center font-plex text-[9.5px] font-bold uppercase tracking-[.14em]', enough ? 'text-[#bef264]' : 'text-[#4f688a]')}>
        {count} {count === 1 ? 'player' : 'players'} · {enough ? 'enough for two sides' : `${TWO_SIDES} fills two sides of five`}
      </p>
    </StepShell>
  )
}
