'use client'

import { useRef, useState } from 'react'
import { FlaskConical, Trash2 } from 'lucide-react'
import { cn, ewptScore, winProbability, winCopy, manAdvantage } from '@/lib/utils'
import { autoPick } from '@/lib/autoPick'
import { FormDots } from '@/components/FormDots'
import type { Player } from '@/lib/types'

const MIN_PLAYERS = 4

interface Props {
  allPlayers: Player[]
}

export function LineupLab({ allPlayers }: Props) {
  const [teamA, setTeamA] = useState<Player[]>([])
  const [teamB, setTeamB] = useState<Player[]>([])
  const [dragOver, setDragOver] = useState<{ team: 'A' | 'B'; index: number } | null>(null)
  const dragSource = useRef<{ team: 'A' | 'B'; index: number } | null>(null)

  const selectedNames = new Set([...teamA, ...teamB].map((p) => p.name))
  const totalSelected = teamA.length + teamB.length
  const sortedPlayers = [...allPlayers].sort((a, b) => a.name.localeCompare(b.name))

  function addPlayer(player: Player) {
    if (teamA.length <= teamB.length) {
      setTeamA((prev) => [...prev, player])
    } else {
      setTeamB((prev) => [...prev, player])
    }
  }

  function removePlayer(player: Player) {
    setTeamA((prev) => prev.filter((p) => p.name !== player.name))
    setTeamB((prev) => prev.filter((p) => p.name !== player.name))
  }

  function handleChipClick(player: Player) {
    if (selectedNames.has(player.name)) {
      removePlayer(player)
    } else {
      addPlayer(player)
    }
  }

  function handleSwap(dropTeam: 'A' | 'B', dropIndex: number) {
    if (!dragSource.current) return
    const { team: srcTeam, index: srcIndex } = dragSource.current
    if (srcTeam === dropTeam && srcIndex === dropIndex) return

    const nextA = [...teamA]
    const nextB = [...teamB]
    const srcArr = srcTeam === 'A' ? nextA : nextB
    const dropArr = dropTeam === 'A' ? nextA : nextB

    if (srcTeam === dropTeam) {
      // Reorder within the same team
      const [moved] = srcArr.splice(srcIndex, 1)
      srcArr.splice(dropIndex, 0, moved)
    } else {
      // Swap across teams
      const temp = srcArr[srcIndex]
      srcArr[srcIndex] = dropArr[dropIndex]
      dropArr[dropIndex] = temp
    }

    setTeamA(nextA)
    setTeamB(nextB)
  }

  function handleAutoBalance() {
    const allSelected = [...teamA, ...teamB]
    if (allSelected.length < 2) return
    const result = autoPick(allSelected)
    if (result.suggestions.length === 0) return
    const suggestion = result.suggestions[0]
    setTeamA(suggestion.teamA)
    setTeamB(suggestion.teamB)
  }

  function handleClearAll() {
    setTeamA([])
    setTeamB([])
  }

  return (
    <div className="flex flex-col gap-5">

      {/* Intro card */}
      <div className="rounded-xl border border-[#1b2c46] bg-[#0a1421] px-[18px] py-3.5 flex gap-3.5 items-start shadow-[0_18px_44px_rgba(0,0,0,.42)]">
        <span
          aria-hidden
          className="inline-flex size-[34px] shrink-0 items-center justify-center rounded-full border border-[#a78bfa]/40 bg-[#a78bfa]/12 text-[#a78bfa]"
        >
          <FlaskConical className="size-4" strokeWidth={1.8} />
        </span>
        <div>
          <p className="text-[15px] font-bold tracking-[-.02em] text-[#f4f9ff]">The Lineup Lab</p>
          <p className="mt-[5px] font-inter-body text-xs leading-[1.55] text-[#8ba4c4]">
            Pick players, drag them around, see how the teams balance out. Nothing here affects the actual match.
          </p>
        </div>
      </div>

      {/* Lineups header + actions */}
      <div className="flex items-center justify-between gap-2.5">
        <p className="text-base font-bold tracking-[-.02em] text-[#f4f9ff]">Lineups</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAutoBalance}
            disabled={totalSelected < 2}
            className="inline-flex items-center justify-center h-[30px] px-3 rounded border border-[#223a5c] text-xs font-bold text-[#cfe0f4] hover:border-[#38bdf8] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[#223a5c] disabled:hover:text-[#cfe0f4] transition-colors"
          >
            Auto-Balance Teams
          </button>
          <button
            type="button"
            onClick={handleClearAll}
            disabled={totalSelected === 0}
            className="inline-flex items-center justify-center gap-1.5 h-[30px] px-3 rounded border border-[#e2686f]/40 text-xs font-bold text-[#e2686f] hover:bg-[#e2686f]/10 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
          >
            <Trash2 size={13} />
            Clear all
          </button>
        </div>
      </div>

      {/* Pitch: teams grid + balance bar */}
      <div className="relative overflow-hidden rounded-[14px] border border-[#1b2c46] bg-[#060b14] p-[18px]">
        {/* Pitch markings — decorative */}
        <svg
          aria-hidden
          viewBox="0 0 600 340"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full fill-none stroke-[#132339] stroke-2"
        >
          <line x1="300" y1="0" x2="300" y2="340" />
          <circle cx="300" cy="170" r="78" />
        </svg>

        <div className="relative grid grid-cols-2 gap-4">
          {(['A', 'B'] as const).map((team) => {
            const players = team === 'A' ? teamA : teamB
            const score = ewptScore(players)
            return (
              <div key={team}>
                <div className={cn(
                  'flex items-baseline justify-between gap-2 pb-2 border-b border-[#1b2c46]',
                  team === 'A' ? 'text-[#7dd3fc]' : 'text-[#c4b5fd]'
                )}>
                  <p className="text-[13px] font-bold uppercase tracking-[.04em]">Team {team}</p>
                  <span className="font-plex text-[15px] font-bold tabular-nums">
                    {players.length >= MIN_PLAYERS ? score.toFixed(3) : '—'}
                  </span>
                </div>
                <div className="flex flex-col gap-[5px] mt-2.5 min-h-9">
                  {players.length === 0 ? (
                    <div className={cn(
                      'rounded border border-dashed px-2.5 py-4 text-center font-plex text-[9px] uppercase tracking-[.14em]',
                      team === 'A' ? 'border-[#38bdf8]/30 text-[#2f5c85]' : 'border-[#a78bfa]/30 text-[#5b4a8a]'
                    )}>
                      No players yet
                    </div>
                  ) : (
                    players.map((p, i) => {
                      const isOver = dragOver?.team === team && dragOver?.index === i
                      return (
                        <div
                          key={p.name}
                          draggable
                          onDragStart={() => { dragSource.current = { team, index: i } }}
                          onDragOver={(e) => { e.preventDefault(); setDragOver({ team, index: i }) }}
                          onDragLeave={() => setDragOver(null)}
                          onDrop={() => handleSwap(team, i)}
                          onDragEnd={() => { dragSource.current = null; setDragOver(null) }}
                          className={cn(
                            'flex items-center justify-between gap-2 px-2.5 py-[7px] rounded border-l-2 cursor-grab active:cursor-grabbing transition-colors select-none',
                            team === 'A'
                              ? cn('border-[#38bdf8] text-[#dff1ff]', isOver ? 'bg-[rgba(8,47,73,.95)]' : 'bg-[rgba(8,47,73,.55)]')
                              : cn('border-[#a78bfa] text-[#efeaff]', isOver ? 'bg-[rgba(46,16,101,.85)]' : 'bg-[rgba(46,16,101,.45)]')
                          )}
                        >
                          <span className="font-inter-body text-xs font-semibold whitespace-nowrap">
                            {p.name}{p.mentality === 'goalkeeper' ? ' 🧤' : ''}
                          </span>
                          {p.recentForm && <FormDots form={p.recentForm} team={team} className="gap-1 text-[10px]" />}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Balance bar — only when both teams have at least MIN_PLAYERS players */}
        {teamA.length >= MIN_PLAYERS && teamB.length >= MIN_PLAYERS && (() => {
          const scoreA = ewptScore(teamA)
          const scoreB = ewptScore(teamB)
          const winProbA = winProbability(scoreA, scoreB, manAdvantage(teamA.length, teamB.length))
          const winProbB = 1 - winProbA
          const copy = winCopy(winProbA)
          const isEven = copy.team === 'even'
          return (
            <div className="relative mt-[18px] pt-3.5 border-t border-[#1b2c46]">
              <div className="flex items-center gap-3">
                <span className={cn('font-plex text-[15px] font-bold tabular-nums min-w-10', isEven ? 'text-[#8ba4c4]' : 'text-[#7dd3fc]')}>
                  {Math.round(winProbA * 100)}%
                </span>
                <div className="flex-1 h-1.5 rounded-[3px] overflow-hidden flex bg-[#a78bfa]">
                  <div className="bg-[#38bdf8] transition-all duration-300" style={{ width: `${winProbA * 100}%` }} />
                </div>
                <span className={cn('font-plex text-[15px] font-bold tabular-nums min-w-10 text-right', isEven ? 'text-[#8ba4c4]' : 'text-[#c4b5fd]')}>
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
        })()}
      </div>

      {/* Divider */}
      <div className="h-px bg-[#17263c]" />

      {/* Player pool */}
      <div>
        <div className="flex items-baseline justify-between mb-3">
          <p className="font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#6f88a8]">All Players</p>
          <p className="font-plex text-[9px] uppercase tracking-[.12em] text-[#4f688a]">Tap to pick · colours show team</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {sortedPlayers.map((player) => {
            const inA = teamA.some((p) => p.name === player.name)
            const inB = teamB.some((p) => p.name === player.name)
            return (
              <button
                key={player.name}
                type="button"
                onClick={() => handleChipClick(player)}
                className={cn(
                  'h-[30px] px-3 rounded border font-inter-body text-xs font-semibold transition-colors',
                  inA
                    ? 'bg-[rgba(8,47,73,.55)] border-[#38bdf8]/50 text-[#7dd3fc]'
                    : inB
                      ? 'bg-[rgba(46,16,101,.45)] border-[#a78bfa]/50 text-[#c4b5fd]'
                      : 'bg-[#0a1421] border-[#1b2c46] text-[#cfe0f4] hover:border-[#2c4a72]'
                )}
              >
                {player.name}{player.mentality === 'goalkeeper' ? ' 🧤' : ''}
              </button>
            )
          })}
        </div>
      </div>

    </div>
  )
}
