'use client'

import { Player } from '@/lib/types'
import { wprScore, cn } from '@/lib/utils'
import { RecentForm } from './RecentForm'
import { X } from 'lucide-react'

interface ComparePanelProps {
  playerA: Player
  playerB: Player
  onClear?: () => void
}

type Direction = 'higher' | 'lower' | 'neutral'

interface StatConfig {
  label: string
  getValue: (p: Player) => number | string
  direction: Direction
  format?: (v: number) => string
}

const STATS: StatConfig[] = [
  { label: 'WPR Score', getValue: (p) => wprScore(p), direction: 'higher', format: (v) => v.toFixed(1) },
  { label: 'Win Rate', getValue: (p) => p.winRate, direction: 'higher', format: (v) => `${v.toFixed(1)}%` },
  { label: 'Points / Game', getValue: (p) => (p.played > 0 ? p.points / p.played : 0), direction: 'higher', format: (v) => v.toFixed(2) },
  { label: 'Won', getValue: (p) => p.won, direction: 'higher' },
  { label: 'Lost', getValue: (p) => p.lost, direction: 'lower' },
  { label: 'Games Played', getValue: (p) => p.played, direction: 'neutral' },
  { label: 'Drawn', getValue: (p) => p.drew, direction: 'neutral' },
  { label: 'Recent Form', getValue: (p) => p.recentForm, direction: 'neutral' },
]

function MirroredBar({
  valA,
  valB,
  direction,
}: {
  valA: number
  valB: number
  direction: 'higher' | 'lower'
}) {
  const effA = direction === 'lower' ? valB : valA
  const effB = direction === 'lower' ? valA : valB
  const total = effA + effB
  const pctA = total > 0 ? Math.round((effA / total) * 100) : 50
  const pctB = 100 - pctA
  const aWins = effA > effB
  const bWins = effB > effA

  return (
    <div className="grid grid-cols-2 gap-px h-1.5">
      <div className="flex justify-end items-center">
        <div
          className={cn(
            'h-full rounded-l-sm transition-all duration-500',
            aWins ? 'bg-sky-400' : bWins ? 'bg-slate-600' : 'bg-slate-500',
          )}
          style={{ width: `${pctA}%` }}
        />
      </div>
      <div className="flex justify-start items-center">
        <div
          className={cn(
            'h-full rounded-r-sm transition-all duration-500',
            bWins ? 'bg-sky-400' : aWins ? 'bg-slate-600' : 'bg-slate-500',
          )}
          style={{ width: `${pctB}%` }}
        />
      </div>
    </div>
  )
}

export function ComparePanel({ playerA, playerB, onClear }: ComparePanelProps) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 overflow-hidden">
      {/* Player names header */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center px-4 py-3 border-b border-slate-700">
        <span className="text-sm font-semibold text-slate-100 truncate pr-2">{playerA.name}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs text-slate-500">vs</span>
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="text-slate-500 hover:text-slate-300 transition-colors ml-1"
              aria-label="Clear comparison"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <span className="text-sm font-semibold text-slate-100 truncate text-right pl-2">{playerB.name}</span>
      </div>

      {/* Stat rows */}
      <div className="divide-y divide-slate-700/40 px-4">
        {STATS.map((stat) => {
          const rawA = stat.getValue(playerA)
          const rawB = stat.getValue(playerB)
          const isString = typeof rawA === 'string'
          const numA = isString ? 0 : (rawA as number)
          const numB = isString ? 0 : (rawB as number)
          const displayA = isString
            ? (rawA as string)
            : stat.format
              ? stat.format(numA)
              : String(numA)
          const displayB = isString
            ? (rawB as string)
            : stat.format
              ? stat.format(numB)
              : String(numB)

          const aWins =
            stat.direction === 'higher'
              ? numA > numB
              : stat.direction === 'lower'
                ? numA < numB
                : false
          const bWins =
            stat.direction === 'higher'
              ? numB > numA
              : stat.direction === 'lower'
                ? numB < numA
                : false

          const isForm = stat.label === 'Recent Form'

          return (
            <div key={stat.label} className="py-2.5">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 text-center mb-1.5">
                {stat.label}
              </p>
              <div
                className={cn(
                  'grid items-center gap-2',
                  isString ? 'grid-cols-[auto_1fr_auto]' : 'grid-cols-[56px_1fr_56px]',
                )}
              >
                {/* Value A */}
                {isForm ? (
                  <div className="flex justify-start">
                    <RecentForm form={displayA} />
                  </div>
                ) : (
                  <span
                    className={cn(
                      'text-sm font-mono font-medium text-right',
                      stat.direction !== 'neutral' && aWins ? 'text-sky-300' : 'text-slate-300',
                    )}
                  >
                    {displayA}
                  </span>
                )}

                {/* Bar or neutral divider */}
                {stat.direction !== 'neutral' ? (
                  <MirroredBar valA={numA} valB={numB} direction={stat.direction} />
                ) : (
                  <div className="flex justify-center">
                    <div className="w-px h-4 bg-slate-700" />
                  </div>
                )}

                {/* Value B */}
                {isForm ? (
                  <div className="flex justify-end">
                    <RecentForm form={displayB} />
                  </div>
                ) : (
                  <span
                    className={cn(
                      'text-sm font-mono font-medium text-left',
                      stat.direction !== 'neutral' && bWins ? 'text-sky-300' : 'text-slate-300',
                    )}
                  >
                    {displayB}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
