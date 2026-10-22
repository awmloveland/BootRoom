'use client'

import { useState } from 'react'
import { X, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ewptScore, winProbability, winCopy, manAdvantage } from '@/lib/utils'
import type { Player } from '@/lib/types'
import { FormatLabel } from '@/components/FormatLabel'
import { FormDots } from '@/components/FormDots'
import { AddPlayerModal } from '@/components/AddPlayerModal'
import { MIN_SQUAD, type LineupBuilderState } from '@/components/useLineupBuilder'

interface Props {
  builder: LineupBuilderState
  allPlayers: Player[]
  week: number
  date: string
  saving: boolean
  error: string | null
  /** The X in the header: empties the squad, then leaves the builder. */
  onClose: () => void
  /** The footer Cancel: leaves the builder and keeps the squad. */
  onCancel: () => void
  /** Confirm Lineup: saves the split. */
  onConfirm: () => void
}

/** The next match's team builder: pick the squad, auto-pick a split, swap, confirm. */
export function LineupBuilder({ builder, allPlayers, week, date, saving, error, onClose, onCancel, onConfirm }: Props) {
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false)
  const { squadNames, format, autoPickResult, suggestionIndex } = builder
  const isAutoPickMode = autoPickResult !== null

  return (
    <>
      {/* Header — matches idle style */}
      <div className="flex items-center justify-between gap-3 px-[18px] py-3 bg-[#0c1728] border-b border-[#1b2c46]">
        <div>
          <p className="text-sm font-bold tracking-[-.01em] text-[#f4f9ff]">Week {week}</p>
          <p className="mt-[3px] font-plex text-[9.5px] uppercase tracking-[.14em] text-[#6f88a8]">{date}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* One calm status line in a fixed colour, so it doesn't flash as players are tapped. */}
          {squadNames.length > 0 && (
            <span className="font-plex text-[9.5px] font-bold uppercase tracking-[.12em] tabular-nums text-[#8ba4c4]">
              {squadNames.length < MIN_SQUAD ? (
                `${squadNames.length} selected · ${MIN_SQUAD - squadNames.length} more needed`
              ) : squadNames.length % 2 !== 0 ? (
                <>
                  <span className="text-[#fbbf24]">
                    <TriangleAlert className="inline size-[11px] mr-1 -mt-px align-middle" aria-hidden />
                    <FormatLabel format={format} />
                  </span>
                  {` · ${squadNames.length} players`}
                </>
              ) : (
                `${format} · ${squadNames.length} players`
              )}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[#8ba4c4] hover:text-white transition-colors"
            aria-label="Close team builder"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-[18px] py-4 space-y-4">

        {/* Player selection — hidden once auto-pick has run */}
        {!isAutoPickMode && (
          <SquadPicker builder={builder} onAddPlayer={() => setShowAddPlayerModal(true)} />
        )}

        {/* Auto-pick result — replaces player list once built */}
        {isAutoPickMode && autoPickResult.suggestions.length > 0 && <SplitPreview builder={builder} />}

        {error && <p className="font-inter-body text-xs text-[#e2686f]">{error}</p>}
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-[18px] py-3 border-t border-[#1b2c46] bg-[#0c1728]">
        {isAutoPickMode ? (
          <button
            type="button"
            onClick={() => builder.clearSplit()}
            className="h-8 px-3 rounded border border-[#223a5c] text-[#cfe0f4] text-xs font-bold whitespace-nowrap hover:border-[#38bdf8] hover:text-white transition-colors"
          >
            Back
          </button>
        ) : (
          <button
            type="button"
            onClick={onCancel}
            className="h-8 px-3 rounded border border-[#223a5c] text-[#cfe0f4] text-xs font-bold whitespace-nowrap hover:border-[#38bdf8] hover:text-white transition-colors"
          >
            Cancel
          </button>
        )}
        <div className="flex items-center gap-2">
          {isAutoPickMode && autoPickResult && (
            builder.isManuallyEdited ? (
              <button
                type="button"
                onClick={builder.rebalance}
                className="h-8 px-3 rounded border border-[#223a5c] text-[#cfe0f4] text-xs font-bold whitespace-nowrap hover:border-[#38bdf8] hover:text-white transition-colors"
              >
                Auto Balance Teams
              </button>
            ) : autoPickResult.suggestions.length > 1 ? (
              <button
                type="button"
                onClick={builder.shuffle}
                className="h-8 px-3 rounded border border-[#223a5c] text-[#cfe0f4] text-xs font-bold whitespace-nowrap hover:border-[#38bdf8] hover:text-white transition-colors"
              >
                Shuffle teams ({suggestionIndex + 1}/{autoPickResult.suggestions.length})
              </button>
            ) : null
          )}
          <button
            type="button"
            onClick={isAutoPickMode ? onConfirm : builder.runAutoPick}
            disabled={saving || squadNames.length < MIN_SQUAD}
            className="h-8 px-3.5 rounded bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] text-xs font-bold whitespace-nowrap transition-colors disabled:opacity-40"
          >
            {saving ? 'Saving…' : isAutoPickMode ? 'Confirm Lineup' : 'Build Lineup'}
          </button>
        </div>
      </div>

      {showAddPlayerModal && (
        <AddPlayerModal
          players={builder.sortedPlayers.filter((p) => builder.selectedNames.includes(p.name))}
          allLeaguePlayers={allPlayers}
          existingGuests={builder.guestEntries}
          onAdd={builder.addEntry}
          onClose={() => setShowAddPlayerModal(false)}
        />
      )}
    </>
  )
}

/** The attending-player pills, with the week's guests and new players. */
function SquadPicker({ builder, onAddPlayer }: { builder: LineupBuilderState; onAddPlayer: () => void }) {
  return (
    <div>
      <p className="font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#6f88a8] mb-3">Select attending players</p>
      <div className="flex flex-wrap gap-2">
        {builder.sortedPlayers.map((player) => {
          const active = builder.selectedSet.has(player.name)
          return (
            <button
              key={player.name}
              type="button"
              onClick={() => builder.togglePlayer(player.name)}
              className={cn(
                'h-[30px] px-3 rounded border font-inter-body text-xs font-semibold transition-colors',
                active
                  ? 'bg-[rgba(8,47,73,.55)] border-[#38bdf8]/50 text-[#7dd3fc]'
                  : 'bg-[#0a1421] border-[#1b2c46] text-[#cfe0f4] hover:border-[#2c4a72]'
              )}
            >
              {player.name}
            </button>
          )
        })}

        {/* Guest pills */}
        {builder.guestEntries.map((g) => (
          <AddedPill key={g.name} name={g.name} onRemove={() => builder.removeGuest(g.name)} />
        ))}

        {/* New player pills */}
        {builder.newPlayerEntries.map((p) => (
          <AddedPill key={p.name} name={p.name} onRemove={() => builder.removeNewPlayer(p.name)} />
        ))}

        {/* Add guest or new player button */}
        <button
          type="button"
          onClick={onAddPlayer}
          className="inline-flex items-center gap-1 h-[30px] px-3 rounded border border-dashed border-[#223a5c] font-inter-body text-xs font-semibold text-[#6f88a8] hover:border-[#38bdf8] hover:text-white transition-colors"
        >
          + Add guest or new player
        </button>
      </div>
    </div>
  )
}

function AddedPill({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 h-[30px] px-3 rounded border font-inter-body text-xs font-semibold bg-[rgba(8,47,73,.55)] border-[#38bdf8]/50 text-[#7dd3fc]">
      {name}
      <button
        type="button"
        onClick={onRemove}
        className="text-[#38bdf8] hover:text-white"
      >
        <X size={10} />
      </button>
    </span>
  )
}

/** The auto-picked split: both teams, draggable to swap, and the live win odds. */
function SplitPreview({ builder }: { builder: LineupBuilderState }) {
  const { teamA, teamB } = builder
  const liveScoreA = ewptScore(teamA)
  const liveScoreB = ewptScore(teamB)
  return (
    <div>
      <div className="grid grid-cols-2 gap-4">
        <TeamColumn team="A" players={teamA} score={liveScoreA} drag={builder.drag} />
        <TeamColumn team="B" players={teamB} score={liveScoreB} drag={builder.drag} />
      </div>
      {teamA.length !== teamB.length && (
        <p className="mt-3 font-plex text-[9.5px] uppercase tracking-[.12em] text-[#6f88a8]">
          Uneven teams · {teamA.length < teamB.length ? 'Team A' : 'Team B'} is a player short, which the odds below allow for
        </p>
      )}
      <WinOdds winProbA={winProbability(liveScoreA, liveScoreB, manAdvantage(teamA.length, teamB.length))} />
    </div>
  )
}

function TeamColumn({ team, players, score, drag }: {
  team: 'A' | 'B'
  players: Player[]
  score: number
  drag: LineupBuilderState['drag']
}) {
  return (
    <div>
      <div className={cn(
        'flex items-baseline justify-between gap-2 pb-2 border-b border-[#1b2c46]',
        team === 'A' ? 'text-[#7dd3fc]' : 'text-[#c4b5fd]'
      )}>
        <p className="text-xs font-bold uppercase tracking-[.04em]">{team === 'A' ? 'Team A' : 'Team B'}</p>
        <span className="font-plex text-sm font-bold tabular-nums">
          {score.toFixed(3)}
        </span>
      </div>
      <div className="flex flex-col gap-[5px] mt-2">
        {players.map((p, i) => {
          const isOver = drag.over?.team === team && drag.over?.index === i
          return (
            <div
              key={p.name}
              draggable
              onDragStart={() => drag.start(team, i)}
              onDragOver={(e) => { e.preventDefault(); drag.enter(team, i) }}
              onDragLeave={drag.leave}
              onDrop={() => drag.drop(team, i)}
              onDragEnd={drag.end}
              className={cn(
                'flex items-center justify-between gap-2 px-2.5 py-[7px] rounded border-l-2 cursor-grab active:cursor-grabbing transition-colors select-none',
                team === 'A'
                  ? cn('border-[#38bdf8] text-[#dff1ff]', isOver ? 'bg-[rgba(8,47,73,.95)]' : 'bg-[rgba(8,47,73,.55)]')
                  : cn('border-[#a78bfa] text-[#efeaff]', isOver ? 'bg-[rgba(46,16,101,.85)]' : 'bg-[rgba(46,16,101,.45)]')
              )}
            >
              <span className="font-inter-body text-xs font-semibold">
                {p.name}{p.mentality === 'goalkeeper' ? ' 🧤' : ''}
              </span>
              {p.recentForm && <FormDots form={p.recentForm} team={team} className="gap-1 text-[10px]" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WinOdds({ winProbA }: { winProbA: number }) {
  const winProbB = 1 - winProbA
  const copy = winCopy(winProbA)
  const isEven = copy.team === 'even'
  return (
    <div className="mt-[18px] pt-3.5 border-t border-[#1b2c46]">
      <div className="flex items-center gap-3">
        <span className={cn(
          'font-plex text-[15px] font-bold tabular-nums min-w-10',
          isEven ? 'text-[#8ba4c4]' : 'text-[#7dd3fc]'
        )}>
          {Math.round(winProbA * 100)}%
        </span>
        <div className="flex-1 h-1.5 rounded-[3px] overflow-hidden flex bg-[#a78bfa]">
          <div
            className="bg-[#38bdf8] transition-all duration-300"
            style={{ width: `${winProbA * 100}%` }}
          />
        </div>
        <span className={cn(
          'font-plex text-[15px] font-bold tabular-nums min-w-10 text-right',
          isEven ? 'text-[#8ba4c4]' : 'text-[#c4b5fd]'
        )}>
          {Math.round(winProbB * 100)}%
        </span>
      </div>
      <p className={cn(
        'mt-2 text-center font-plex text-[9.5px] font-bold uppercase tracking-[.16em]',
        copy.team === 'A' ? 'text-[#38bdf8]' : copy.team === 'B' ? 'text-[#a78bfa]' : 'text-[#8ba4c4]'
      )}>
        {copy.text}
      </p>
    </div>
  )
}
