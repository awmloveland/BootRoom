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
  players: RosterPlayer[]
  /** Names already in the league's roster, for the duplicate check. */
  existingNames: string[]
  onAdd: (names: string[]) => void
  onRename: (id: string, name: string) => void
  onRemove: (id: string) => void
  onNext: () => void
}

const MIN_PLAYERS = 2
const TWO_SIDES = 10

export function PlayersStep({ players, existingNames, onAdd, onRename, onRemove, onNext }: Props) {
  const [draft, setDraft] = useState('')
  const [pasteMode, setPasteMode] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const taken = new Set([...players.map((p) => p.name), ...existingNames].map((n) => n.toLowerCase()))
  const isTaken = (name: string) => taken.has(name.trim().toLowerCase())
  const pasted = pasteMode ? splitPastedNames(draft).filter((n) => !isTaken(n)) : []

  function addOne() {
    const name = draft.trim()
    if (!name) return
    if (isTaken(name)) {
      setError('Already on the list')
      return
    }
    onAdd([name])
    setDraft('')
    setError(null)
  }

  function addPasted() {
    if (pasted.length === 0) return
    onAdd(pasted)
    setDraft('')
    setPasteMode(false)
  }

  const count = players.length
  const enough = count >= TWO_SIDES
  // Renames can collide with another row or an existing player; the route would
  // reject the first and silently overwrite the second, so block Continue here.
  const keys = players.map((p) => p.name.trim().toLowerCase())
  const dupe = players.find((_, i) => keys.indexOf(keys[i]) !== i || existingNames.some((e) => e.toLowerCase() === keys[i]))

  return (
    <StepShell
      eyebrow={<StepEyebrow n={4} />}
      title="Who plays?"
      sub="Add the regulars by name. They do not need an account yet."
      action={<button type="button" className={PRIMARY_BUTTON} disabled={count < MIN_PLAYERS || !!dupe} onClick={onNext}>Continue</button>}
      secondary={
        <button type="button" className={SECONDARY_LINK} onClick={() => { setPasteMode((m) => !m); setDraft(''); setError(null) }}>
          {pasteMode ? 'Add one at a time instead' : 'Paste a list instead'}
        </button>
      }
    >
      <ul className="flex flex-col gap-2">
        {players.map((p) => (
          <li key={p.id}>
            {p.you ? (
              <PlayerRow name={<span className="truncate">{p.name}</span>} you />
            ) : (
              <PlayerRow
                className="pl-1.5"
                name={
                  <input
                    aria-label={`Player name ${p.name}`}
                    className="h-[38px] w-full rounded-md bg-transparent px-2.5 font-inter-body text-[15px] font-semibold text-[#f4f9ff] border border-transparent focus:border-[#38bdf8] focus:bg-[#0c1728] focus:outline-none"
                    value={p.name}
                    onChange={(e) => onRename(p.id, e.target.value)}
                    onBlur={(e) => { const v = e.target.value.trim(); v ? onRename(p.id, v) : onRemove(p.id) }}
                  />
                }
              >
                <button
                  type="button"
                  aria-label={`Remove ${p.name}`}
                  onClick={() => onRemove(p.id)}
                  className="flex size-[38px] shrink-0 items-center justify-center rounded-md text-[#4f688a] transition-colors hover:bg-[#e2686f]/10 hover:text-[#e2686f]"
                >
                  <X className="size-4" />
                </button>
              </PlayerRow>
            )}
          </li>
        ))}
        <li>
          {pasteMode ? (
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
          ) : (
            <div className="flex h-[50px] items-center gap-2 rounded-lg border border-dashed border-[#223a5c] px-1.5">
              <input
                aria-label="Add a player"
                className="h-[38px] min-w-0 flex-1 bg-transparent px-2.5 font-inter-body text-[15px] text-[#f4f9ff] placeholder:text-[#4f688a] focus:outline-none"
                placeholder="Add a player and press Enter"
                value={draft}
                onChange={(e) => { setDraft(e.target.value); setError(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOne() } }}
                autoFocus
              />
              <button type="button" className={cn(PRIMARY_BUTTON, 'h-[38px] w-auto px-4 text-[13px]')} disabled={!draft.trim()} onClick={addOne}>
                Add
              </button>
            </div>
          )}
          {error && <p role="alert" className="mt-1.5 px-2 font-inter-body text-[12.5px] text-[#e2686f]">{error}</p>}
        </li>
      </ul>
      {dupe && <p role="alert" className="mt-3 text-center font-inter-body text-[12.5px] text-[#e2686f]">{dupe.name} is already on the list</p>}
      <p className={cn('mt-3 text-center font-plex text-[9.5px] font-bold uppercase tracking-[.14em]', enough ? 'text-[#bef264]' : 'text-[#4f688a]')}>
        {count} {count === 1 ? 'player' : 'players'} · {enough ? 'enough for two sides' : `${TWO_SIDES} fills two sides of five`}
      </p>
    </StepShell>
  )
}
