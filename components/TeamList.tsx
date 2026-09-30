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
      {/* Team heading + rating */}
      <div className={cn(
        'flex items-baseline justify-between gap-2 pb-2 border-b border-[#1b2c46]',
        isA ? 'text-[#7dd3fc]' : 'text-[#c4b5fd]'
      )}>
        <p className="text-xs font-bold uppercase tracking-[.04em]">{label}</p>
        {rating != null && (
          <span className="font-plex text-sm font-bold tabular-nums">
            {rating.toFixed(3)}
          </span>
        )}
      </div>

      {/* Player rows */}
      <ul className="flex flex-col gap-[5px] mt-2">
        {players.map((player) => {
          const showNameGuest = !!onNameGuest && isGuestName(player)
          return (
            <li
              key={player}
              className={cn(
                'font-inter-body text-xs font-semibold px-2.5 py-[7px] rounded border-l-2 flex items-center justify-between gap-2',
                showNameGuest && 'outline-dashed outline-1 -outline-offset-1',
                isA
                  ? 'bg-[rgba(8,47,73,.55)] border-[#38bdf8] text-[#dff1ff] outline-[#38bdf8]/30'
                  : 'bg-[rgba(46,16,101,.45)] border-[#a78bfa] text-[#efeaff] outline-[#a78bfa]/30'
              )}
            >
              <span>{player}{goalkeepers?.includes(player) ? ' 🧤' : ''}</span>
              {showNameGuest && (
                <button
                  type="button"
                  onClick={() => onNameGuest!(player)}
                  aria-label={`Add player: ${player}`}
                  className={cn(
                    'shrink-0 inline-flex items-center gap-1 whitespace-nowrap',
                    'font-plex text-[9px] font-bold uppercase tracking-[.12em] px-1 py-0.5 rounded',
                    'hover:text-white focus-visible:outline-none focus-visible:ring-2',
                    isA
                      ? 'text-[#7dd3fc] focus-visible:ring-[#38bdf8]'
                      : 'text-[#c4b5fd] focus-visible:ring-[#a78bfa]'
                  )}
                >
                  <Plus className="h-3 w-3" />
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
