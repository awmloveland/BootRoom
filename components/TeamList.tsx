import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isGuestName } from '@/lib/guestName'
import type { Winner } from '@/lib/types'

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

// ── FaceOffLineup ─────────────────────────────────────────────────────────────
// Played weeks lay both teams out in one grid: Team A row, index, Team B row.
// Accent borders face the centre and the losing side dims.

interface FaceOffLineupProps {
  teamA: string[]
  teamB: string[]
  teamARating?: number | null
  teamBRating?: number | null
  winner: Winner
  goalkeepers?: string[]
  linkedPlayerName?: string | null
  onNameGuest?: (guestName: string) => void
}

export function FaceOffLineup({
  teamA,
  teamB,
  teamARating,
  teamBRating,
  winner,
  goalkeepers,
  linkedPlayerName,
  onNameGuest,
}: FaceOffLineupProps) {
  const dimA = winner === 'teamB'
  const dimB = winner === 'teamA'
  const rowCount = Math.max(teamA.length, teamB.length)

  function playerCell(team: 'A' | 'B', name: string | undefined, key: string) {
    if (name === undefined) return <div key={key} />
    return (
      <FaceOffPlayer
        key={key}
        team={team}
        name={name}
        isKeeper={!!goalkeepers?.includes(name)}
        isYou={!!linkedPlayerName && name === linkedPlayerName}
        dimmed={team === 'A' ? dimA : dimB}
        onNameGuest={onNameGuest}
      />
    )
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)] items-center gap-x-1.5 gap-y-[5px]">
      <div className={cn(
        'flex items-baseline justify-between gap-1.5 pb-2 border-b border-[#1b2c46] text-[#7dd3fc]',
        dimA && 'opacity-60'
      )}>
        {teamARating != null && (
          <span className="font-plex text-sm font-bold tabular-nums">{teamARating.toFixed(3)}</span>
        )}
        <p className="ml-auto text-xs font-bold uppercase tracking-[.04em]">Team A</p>
      </div>
      <span className="pb-2 text-center font-plex text-[9px] font-bold text-[#4f688a]" aria-hidden="true">
        v
      </span>
      <div className={cn(
        'flex items-baseline justify-between gap-1.5 pb-2 border-b border-[#1b2c46] text-[#c4b5fd]',
        dimB && 'opacity-60'
      )}>
        <p className="text-xs font-bold uppercase tracking-[.04em]">Team B</p>
        {teamBRating != null && (
          <span className="font-plex text-sm font-bold tabular-nums">{teamBRating.toFixed(3)}</span>
        )}
      </div>

      {Array.from({ length: rowCount }, (_, i) => [
        playerCell('A', teamA[i], `a-${i}`),
        <span key={`n-${i}`} className="text-center font-plex text-[9px] text-[#2f4a70]" aria-hidden="true">
          {i + 1}
        </span>,
        playerCell('B', teamB[i], `b-${i}`),
      ])}
    </div>
  )
}

interface FaceOffPlayerProps {
  team: 'A' | 'B'
  name: string
  isKeeper: boolean
  isYou: boolean
  dimmed: boolean
  onNameGuest?: (guestName: string) => void
}

function FaceOffPlayer({ team, name, isKeeper, isYou, dimmed, onNameGuest }: FaceOffPlayerProps) {
  const isA = team === 'A'
  const showNameGuest = !!onNameGuest && isGuestName(name)

  const label = (
    <span className="flex min-w-0 items-center gap-1.5">
      {isYou && (
        <span className={cn(
          'shrink-0 rounded-[3px] px-[5px] py-0.5 font-plex text-[7.5px] font-bold uppercase tracking-[.14em] text-[#05101d]',
          isA ? 'bg-[#38bdf8]' : 'bg-[#a78bfa]'
        )}>
          You
        </span>
      )}
      <span className="min-w-0 break-words">{name}{isKeeper ? ' 🧤' : ''}</span>
    </span>
  )

  const addButton = showNameGuest && (
    <button
      type="button"
      onClick={() => onNameGuest!(name)}
      aria-label={`Add player: ${name}`}
      className={cn(
        'shrink-0 whitespace-nowrap rounded font-plex text-[8.5px] font-bold uppercase tracking-[.12em]',
        'hover:text-white focus-visible:outline-none focus-visible:ring-2',
        isA
          ? 'text-[#7dd3fc] focus-visible:ring-[#38bdf8]'
          : 'text-[#c4b5fd] focus-visible:ring-[#a78bfa]'
      )}
    >
      + Add
    </button>
  )

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-[7px] rounded font-inter-body text-xs font-semibold',
        showNameGuest && 'outline-dashed outline-1 -outline-offset-1',
        isA
          ? 'border-r-2 border-[#38bdf8] bg-[rgba(8,47,73,.55)] text-[#dff1ff] text-right outline-[#38bdf8]/50'
          : 'border-l-2 border-[#a78bfa] bg-[rgba(46,16,101,.45)] text-[#efeaff] outline-[#a78bfa]/50',
        // Team A mirrors Team B: the name hugs the centre, + Add sits on the outer edge.
        isA ? (showNameGuest ? 'justify-between' : 'justify-end') : 'justify-between',
        dimmed && 'opacity-60'
      )}
    >
      {isA && addButton}
      {label}
      {!isA && addButton}
    </div>
  )
}
