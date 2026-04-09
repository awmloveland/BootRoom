'use client'

import { useRef, useState } from 'react'
import { cn, ewptScore, winProbability, winCopy } from '@/lib/utils'
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
    <div className="space-y-5">

      {/* Intro card */}
      <div className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 flex gap-3 items-start">
        <span className="text-lg leading-none mt-0.5">⚽</span>
        <div>
          <p className="text-sm font-semibold text-slate-100">The Lineup Lab</p>
          <p className="mt-1 text-xs text-slate-400 leading-relaxed">
            Pick players, drag them around, see how the teams balance out. Nothing here affects the actual match.
          </p>
        </div>
      </div>

      {/* Lineups header + actions */}
      <div className="flex items-center justify-between">
        <p className="text-base font-semibold text-slate-100">Lineups</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAutoBalance}
            disabled={totalSelected < 2}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 border border-slate-700 text-sm text-slate-300 hover:border-slate-600 hover:text-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ⚖️ Auto-Balance Teams
          </button>
          <button
            type="button"
            onClick={handleClearAll}
            disabled={totalSelected === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-950 border border-red-900 text-sm text-red-400 hover:border-red-700 hover:text-red-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ↺ Clear all
          </button>
        </div>
      </div>

      {/* Teams grid */}
      <>
        <div className="grid grid-cols-2 gap-3">
            {(['A', 'B'] as const).map((team) => {
              const players = team === 'A' ? teamA : teamB
              const score = ewptScore(players)
              return (
                <div key={team}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-slate-100">Team {team}</p>
                    <span className={cn(
                      'px-1.5 py-0.5 rounded text-xs font-semibold tabular-nums',
                      team === 'A'
                        ? 'bg-sky-900/60 border border-sky-700 text-sky-300'
                        : 'bg-violet-900/60 border border-violet-700 text-violet-300'
                    )}>
                      {players.length >= MIN_PLAYERS ? score.toFixed(3) : '—'}
                    </span>
                  </div>
                  <div className="space-y-1 min-h-[32px]">
                    {players.length === 0 ? (
                      <div className={cn(
                        'rounded border border-dashed px-2.5 py-4 text-center text-xs',
                        team === 'A' ? 'border-sky-900/40 text-sky-800' : 'border-violet-900/40 text-violet-800'
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
                              'flex items-center justify-between px-2.5 py-1.5 rounded border cursor-grab active:cursor-grabbing transition-colors select-none',
                              team === 'A'
                                ? isOver ? 'bg-sky-800/60 border-sky-600' : 'bg-sky-950/40 border-sky-900/60'
                                : isOver ? 'bg-violet-800/60 border-violet-600' : 'bg-violet-950/40 border-violet-900/60'
                            )}
                          >
                            <span className={cn('text-xs font-medium', team === 'A' ? 'text-sky-100' : 'text-violet-100')}>
                              {p.name}{p.goalkeeper ? ' 🧤' : ''}
                            </span>
                            {p.recentForm && <FormDots form={p.recentForm} />}
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
            const winProbA = winProbability(scoreA, scoreB)
            const winProbB = 1 - winProbA
            const copy = winCopy(winProbA)
            const isEven = copy.team === 'even'
            return (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2.5">
                  <span className={cn('text-[15px] font-bold tabular-nums min-w-[34px]', isEven ? 'text-slate-400' : 'text-sky-300')}>
                    {Math.round(winProbA * 100)}%
                  </span>
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden flex">
                    <div className="bg-sky-600 transition-all" style={{ width: `${winProbA * 100}%` }} />
                    <div className="bg-violet-600 flex-1" />
                  </div>
                  <span className={cn('text-[15px] font-bold tabular-nums min-w-[34px] text-right', isEven ? 'text-slate-400' : 'text-violet-300')}>
                    {Math.round(winProbB * 100)}%
                  </span>
                </div>
                <p className={cn('text-xs font-medium text-center', copy.team === 'A' ? 'text-sky-400' : copy.team === 'B' ? 'text-violet-400' : 'text-slate-400')}>
                  {copy.text}
                </p>
              </div>
            )
          })()}
      </>

      {/* Divider */}
      <hr className="border-slate-800" />

      {/* Player pool */}
      <div>
        <div className="flex items-baseline justify-between mb-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">All Players</p>
          <p className="text-xs text-slate-600">Tap to pick · colours show team</p>
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
                  'px-3 py-1 rounded-full text-xs border transition-colors',
                  inA
                    ? 'bg-sky-950/60 border-sky-800 text-sky-300 hover:border-sky-600'
                    : inB
                      ? 'bg-violet-950/60 border-violet-800 text-violet-300 hover:border-violet-600'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500 hover:text-slate-100'
                )}
              >
                {player.name}{player.goalkeeper ? ' 🧤' : ''}
              </button>
            )
          })}
        </div>
      </div>

    </div>
  )
}
