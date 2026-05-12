import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isGuestName } from '@/lib/guestName'

interface TeamListProps {
  label: string
  players: string[]
  team: 'A' | 'B'
  rating?: number | null
  goalkeepers?: string[]
  onNameGuest?: (guestName: string) => void
}

export function TeamList({ label, players, team, rating, goalkeepers, onNameGuest }: TeamListProps) {
  const isA = team === 'A'

  return (
    <div>
      {/* Team heading + score chip */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-slate-100">{label}</p>
        {rating != null && (
          <span className={cn(
            'px-1.5 py-0.5 rounded text-xs font-semibold tabular-nums border',
            isA
              ? 'bg-sky-900/60 border-sky-700 text-sky-300'
              : 'bg-violet-900/60 border-violet-700 text-violet-300'
          )}>
            {rating.toFixed(3)}
          </span>
        )}
      </div>

      {/* Player rows */}
      <ul className="space-y-1">
        {players.map((player) => {
          const showNameGuest = !!onNameGuest && isGuestName(player)
          return (
            <li
              key={player}
              className={cn(
                'text-xs font-medium px-2.5 py-1.5 rounded border flex items-center justify-between gap-2',
                showNameGuest && 'border-dashed',
                isA
                  ? 'bg-sky-950/40 border-sky-900/60 text-sky-100'
                  : 'bg-violet-950/40 border-violet-900/60 text-violet-100'
              )}
            >
              <span>{player}{goalkeepers?.includes(player) ? ' 🧤' : ''}</span>
              {showNameGuest && (
                <button
                  type="button"
                  onClick={() => onNameGuest!(player)}
                  aria-label={`Name ${player}`}
                  className={cn(
                    'shrink-0 inline-flex items-center gap-1 whitespace-nowrap',
                    'text-[11px] font-semibold px-1 py-0.5 rounded',
                    'hover:underline focus-visible:outline-none focus-visible:ring-2',
                    isA
                      ? 'text-sky-400 hover:text-sky-300 focus-visible:ring-sky-400'
                      : 'text-violet-400 hover:text-violet-300 focus-visible:ring-violet-400'
                  )}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Player
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
