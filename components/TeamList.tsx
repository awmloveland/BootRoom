import { cn } from '@/lib/utils'

interface TeamListProps {
  label: string
  players: string[]
  team: 'A' | 'B'
  rating?: number | null
  goalkeepers?: string[]
}

export function TeamList({ label, players, team, rating, goalkeepers }: TeamListProps) {
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
        {players.map((player) => (
          <li
            key={player}
            className={cn(
              'text-xs font-medium px-2.5 py-1.5 rounded border',
              isA
                ? 'bg-sky-950/40 border-sky-900/60 text-sky-100'
                : 'bg-violet-950/40 border-violet-900/60 text-violet-100'
            )}
          >
            {player}{goalkeepers?.includes(player) ? ' 🧤' : ''}
          </li>
        ))}
      </ul>
    </div>
  )
}
