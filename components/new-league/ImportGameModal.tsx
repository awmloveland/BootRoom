'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { PlayerAttribute, Winner } from '@/lib/types'
import { cn } from '@/lib/utils'
import { parseWeekDate } from '@/lib/dates'
import { LineupEditor, ResultPicker } from '@/components/EditWeekModal'
import { AddRosterPlayerModal } from '@/components/AddRosterPlayerModal'
import { shiftWeeks } from './confidence'

export interface DraftGame {
  id: string
  /** 'DD MMM YYYY' */
  date: string
  teamA: string[]
  teamB: string[]
  winner: Winner
  goalDifference: number
}

interface Props {
  leagueId: string
  /** "Game 3" in the header. */
  number: number
  draft: DraftGame
  /** True when the draft is already in the saved list. */
  editing: boolean
  roster: string[]
  /** The most recent match day on or before today; the stepper cannot pass it. */
  latestMatchDay: string
  /** Dates taken by other saved games. */
  takenDates: string[]
  onRosterAdd: (name: string) => void
  onSave: (game: DraftGame) => void
  onDelete: () => void
  onClose: () => void
}

const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function ImportGameModal({ leagueId, number, draft, editing, roster, latestMatchDay, takenDates, onRosterAdd, onSave, onDelete, onClose }: Props) {
  const [date, setDate] = useState(draft.date)
  const [teamA, setTeamA] = useState(draft.teamA)
  const [teamB, setTeamB] = useState(draft.teamB)
  const [winner, setWinner] = useState<Winner>(draft.winner)
  const [margin, setMargin] = useState(draft.goalDifference > 0 ? draft.goalDifference : 1)
  const [adding, setAdding] = useState(false)

  const canGoForward = parseWeekDate(date) < parseWeekDate(latestMatchDay)
  const dateTaken = takenDates.includes(date)
  const blocker = teamA.length === 0 || teamB.length === 0 ? 'Pick both teams to save' : !winner ? 'Pick a result to save' : dateTaken ? 'You already have a game on that date' : null

  function save() {
    if (blocker) return
    onSave({ ...draft, date, teamA, teamB, winner, goalDifference: winner === 'draw' ? 0 : margin })
  }

  function addPlayer(p: PlayerAttribute) {
    onRosterAdd(p.name)
    if (teamA.length <= teamB.length) setTeamA([...teamA, p.name])
    else setTeamB([...teamB, p.name])
  }

  const label = 'block font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#6f88a8] mb-1.5'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#030710]/80" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-[440px] flex-col overflow-hidden rounded-[14px] border border-[#1b2c46] bg-[#0a1421] shadow-[0_34px_80px_rgba(0,0,0,.65)]">
        <div className="flex items-center justify-between border-b border-[#1b2c46] bg-[#0c1728] px-5 pb-3.5 pt-4">
          <h2 className="text-[15px] font-bold tracking-[-.02em] text-[#f4f9ff]">Game {number}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="inline-flex size-7 items-center justify-center text-[#8ba4c4] transition-colors hover:text-white">
            <X className="size-4" strokeWidth={2.2} />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-[18px]">
          <div>
            <span className={label}>Date</span>
            <div role="group" aria-label="Date" className="grid h-11 grid-cols-[44px_1fr_44px] items-center overflow-hidden rounded border border-[#1b2c46] bg-[#060b14]">
              <button type="button" aria-label="A week earlier" onClick={() => setDate(shiftWeeks(date, -1))} className="flex h-full items-center justify-center text-[#8ba4c4] hover:text-white">
                <ChevronLeft className="size-4" />
              </button>
              <div className="text-center">
                <p className="font-plex text-[13px] font-bold text-[#f4f9ff]">{parseInt(date, 10)} {date.slice(3)}</p>
                <p className="font-plex text-[8.5px] uppercase tracking-[.14em] text-[#4f688a]">{DAY_LONG[parseWeekDate(date).getDay()]}</p>
              </div>
              <button type="button" aria-label="A week later" disabled={!canGoForward} onClick={() => setDate(shiftWeeks(date, 1))} className="flex h-full items-center justify-center text-[#8ba4c4] hover:text-white disabled:opacity-30">
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>

          <div>
            <span className={label}>Lineups</span>
            <LineupEditor teamA={teamA} teamB={teamB} allPlayers={roster.map((name) => ({ name }))} onChangeTeamA={setTeamA} onChangeTeamB={setTeamB} />
            <button type="button" onClick={() => setAdding(true)} className="mt-2 h-[30px] rounded border border-dashed border-[#223a5c] px-2.5 font-inter-body text-xs font-semibold text-[#8ba4c4] transition-colors hover:border-[#38bdf8] hover:text-[#f4f9ff]">
              + Add player
            </button>
          </div>

          <ResultPicker winner={winner} margin={margin} onWinner={setWinner} onMargin={setMargin} />
        </div>

        <div className={cn('grid gap-2 border-t border-[#1b2c46] bg-[#0c1728] px-5 py-3.5', editing ? 'grid-cols-2' : 'grid-cols-1')}>
          {editing && (
            <button type="button" onClick={onDelete} className="h-11 rounded-md border border-[#e2686f]/40 text-[13px] font-bold text-[#e2686f] transition-colors hover:bg-[#e2686f]/10">
              Delete game
            </button>
          )}
          <button type="button" onClick={save} disabled={!!blocker} className="h-11 rounded-md border border-[#38bdf8] bg-[#38bdf8]/12 text-[13px] font-bold text-[#7dd3fc] transition-colors hover:bg-[#38bdf8]/20 disabled:opacity-50">
            {blocker ?? (editing ? 'Save changes' : 'Save game')}
          </button>
        </div>
      </div>

      {adding && (
        <AddRosterPlayerModal leagueId={leagueId} existingNames={roster} onCreated={addPlayer} onClose={() => setAdding(false)} />
      )}
    </div>
  )
}
