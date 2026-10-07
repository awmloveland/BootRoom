import { Calendar, MapPin, Share2 } from 'lucide-react'
import { cn, formatFixtureDate } from '@/lib/utils'
import { FormatLabel } from '@/components/FormatLabel'

const BADGE_BASE = 'rounded border px-2.5 py-[5px] font-plex text-[9px] font-bold uppercase tracking-[.18em] whitespace-nowrap'
const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#38bdf8]'

function NextGameHeader({ week, badge }: { week: number; badge: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#1b2c46] bg-[#0c1728] px-4 py-3">
      <div>
        <p className="font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#6f88a8]">Next game</p>
        <p className="mt-[5px] text-[15px] font-bold leading-none tracking-[-.02em] text-[#f4f9ff]">Week {week}</p>
      </div>
      {badge}
    </div>
  )
}

// ─── Lineups set ──────────────────────────────────────────────────────────────

function TeamColumn({
  team,
  players,
  linkedPlayerName,
}: {
  team: 'A' | 'B'
  players: string[]
  linkedPlayerName: string | null
}) {
  const isA = team === 'A'
  const viewerOnTeam = linkedPlayerName !== null && players.includes(linkedPlayerName)

  return (
    <div className="min-w-0">
      <div className="flex h-[26px] items-center justify-between gap-2 border-b border-[#1b2c46] pb-2">
        <span className={cn('text-xs font-bold uppercase tracking-[.04em]', isA ? 'text-[#7dd3fc]' : 'text-[#c4b5fd]')}>
          {isA ? 'Team A' : 'Team B'}
        </span>
        {viewerOnTeam && (
          <span className={cn(
            'rounded-[3px] px-[5px] py-0.5 font-plex text-[7.5px] font-bold uppercase tracking-[.14em] text-[#05101d]',
            isA ? 'bg-[#38bdf8]' : 'bg-[#a78bfa]'
          )}>
            Your team
          </span>
        )}
      </div>
      <ul className="mt-2 flex flex-col gap-[5px]">
        {players.map((name) => {
          const you = name === linkedPlayerName
          return (
            <li
              key={name}
              className={cn(
                'flex items-center justify-between gap-2 rounded border-l-2 px-2.5 py-[7px] font-inter-body text-xs',
                you ? 'font-bold' : 'font-semibold',
                isA
                  ? 'border-[#38bdf8] bg-[rgba(8,47,73,.55)] text-[#dff1ff]'
                  : 'border-[#a78bfa] bg-[rgba(46,16,101,.45)] text-[#efeaff]'
              )}
            >
              <span className="truncate">{name}</span>
              {you && (
                <span className={cn(
                  'shrink-0 font-plex text-[7.5px] font-bold uppercase tracking-[.14em]',
                  isA ? 'text-[#7dd3fc]' : 'text-[#c4b5fd]'
                )}>
                  You
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

interface NextGameLineupProps {
  week: number
  /** 'DD MMM YYYY' */
  date: string
  format: string | null
  teamA: string[]
  teamB: string[]
  /** The viewer's linked player, for the YOUR TEAM and YOU markers. */
  linkedPlayerName?: string | null
  location?: string | null
  kickoffTime?: string | null
  /** True once the 20:00 deadline has passed with no result. */
  awaitingResult?: boolean
  canEdit: boolean
  onEditLineups: () => void
  onResultGame: () => void
  /** Shares the lineups; omitted while a team is empty. */
  onShare?: () => void
  /** True briefly after the share text was copied to the clipboard. */
  copied?: boolean
}

/** Overview next game card, lineups set. Renders inside NextMatchCard's card element. */
export function NextGameLineup({
  week,
  date,
  format,
  teamA,
  teamB,
  linkedPlayerName = null,
  location = null,
  kickoffTime = null,
  awaitingResult = false,
  canEdit,
  onEditLineups,
  onResultGame,
  onShare,
  copied = false,
}: NextGameLineupProps) {
  const when = [formatFixtureDate(date), kickoffTime].filter(Boolean).join(' · ')

  return (
    <>
      <NextGameHeader
        week={week}
        badge={awaitingResult ? (
          <span className={cn(BADGE_BASE, 'border-[#223a5c] text-[#8ba4c4]')}>Awaiting Result</span>
        ) : (
          <span className={cn(BADGE_BASE, 'inline-flex items-center gap-[7px] border-[#38bdf8]/40 bg-[#38bdf8]/12 text-[#7dd3fc]')}>
            <span className="size-1.5 rounded-full bg-[#38bdf8] animate-cf-pulse motion-reduce:animate-none" />
            Upcoming
          </span>
        )}
      />

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3.5 px-4 py-3.5">
        <TeamColumn team="A" players={teamA} linkedPlayerName={linkedPlayerName} />
        <TeamColumn team="B" players={teamB} linkedPlayerName={linkedPlayerName} />
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[#1b2c46] bg-[#0c1728] px-4 py-2.5 font-plex text-[9px] uppercase tracking-[.12em] text-[#8ba4c4]">
        {location || format ? (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <MapPin className="size-[11px] shrink-0" aria-hidden />
            <span className="truncate">
              {location}
              {location && format && ' · '}
              {format && <FormatLabel format={format} />}
            </span>
          </span>
        ) : (
          <span />
        )}
        <span className="inline-flex shrink-0 items-center gap-1.5">
          <Calendar className="size-[11px] shrink-0" aria-hidden />
          <span>{when}</span>
        </span>
      </div>

      {(canEdit || onShare) && (
        <div className="flex gap-2 border-t border-[#1b2c46] bg-[#38bdf8]/6 px-4 py-3">
          {onShare && (
            <button
              type="button"
              onClick={onShare}
              className={cn(
                'inline-flex h-10 items-center justify-center gap-1.5 rounded border border-[#223a5c] px-3.5 text-[13px] font-bold text-[#cfe0f4] transition-colors hover:border-[#38bdf8] hover:text-white',
                !canEdit && 'flex-1',
                FOCUS_RING
              )}
            >
              <Share2 className="size-[15px] shrink-0" aria-hidden />
              {copied ? 'Copied!' : 'Share'}
            </button>
          )}
          {canEdit && (
            <>
              <button
                type="button"
                onClick={onEditLineups}
                className={cn(
                  'h-10 flex-1 rounded border border-[#38bdf8] text-[13px] font-bold text-[#7dd3fc] transition-colors hover:bg-[#38bdf8]/12 hover:text-white',
                  FOCUS_RING
                )}
              >
                Edit Lineups
              </button>
              <button
                type="button"
                onClick={onResultGame}
                className={cn(
                  'h-10 flex-[1.4] rounded bg-[#38bdf8] text-[13px] font-bold text-[#05101d] shadow-[0_8px_22px_rgba(56,189,248,.25)] transition-colors hover:bg-[#7dd3fc]',
                  FOCUS_RING
                )}
              >
                Result Game
              </button>
            </>
          )}
        </div>
      )}
    </>
  )
}

// ─── Not built ────────────────────────────────────────────────────────────────

// Ghost rows fade downwards: dashed outline / solid left edge alphas .45/.6, .35/.45, .2/.3.
const GHOST_A = [
  'border-[#38bdf8]/45 border-l-[#38bdf8]/60',
  'border-[#38bdf8]/35 border-l-[#38bdf8]/45',
  'border-[#38bdf8]/20 border-l-[#38bdf8]/30',
]
const GHOST_B = [
  'border-[#a78bfa]/45 border-l-[#a78bfa]/60',
  'border-[#a78bfa]/35 border-l-[#a78bfa]/45',
  'border-[#a78bfa]/20 border-l-[#a78bfa]/30',
]

function GhostColumn({ rows }: { rows: string[] }) {
  return (
    <div className="flex flex-col gap-[5px]">
      {rows.map((colour) => (
        <span
          key={colour}
          className={cn('h-[22px] rounded border border-dashed border-l-2 [border-left-style:solid]', colour)}
        />
      ))}
    </div>
  )
}

interface NextGameIdleProps {
  week: number
  canEdit: boolean
  onBuildTeams: () => void
  onCancelGame: () => void
}

/** Overview next game card, lineups not built. Renders inside NextMatchCard's card element. */
export function NextGameIdle({ week, canEdit, onBuildTeams, onCancelGame }: NextGameIdleProps) {
  return (
    <>
      <NextGameHeader
        week={week}
        badge={<span className={cn(BADGE_BASE, 'border-dashed border-[#223a5c] text-[#4f688a]')}>No lineup</span>}
      />

      <div className="flex flex-col items-center gap-3 px-4 py-[22px] text-center">
        <div aria-hidden className="grid w-full max-w-[300px] grid-cols-2 gap-3.5 opacity-70">
          <GhostColumn rows={GHOST_A} />
          <GhostColumn rows={GHOST_B} />
        </div>

        <div>
          <p className="text-sm font-bold text-[#f4f9ff]">Lineups not set yet</p>
          <p className="mt-[5px] font-inter-body text-xs text-[#8ba4c4]">
            {canEdit
              ? 'Pick who is playing and we will balance the teams.'
              : 'Teams are usually posted the day before.'}
          </p>
        </div>

        {canEdit && (
          <div className="mt-0.5 flex w-full gap-2">
            <button
              type="button"
              onClick={onCancelGame}
              className={cn(
                'h-[34px] flex-1 rounded border border-[#e2686f]/40 text-xs font-bold text-[#e2686f] transition-colors hover:bg-[#e2686f]/10',
                FOCUS_RING
              )}
            >
              Cancel Game
            </button>
            <button
              type="button"
              onClick={onBuildTeams}
              className={cn(
                'h-[34px] flex-[2] rounded bg-[#38bdf8] text-xs font-bold text-[#05101d] transition-colors hover:bg-[#7dd3fc]',
                FOCUS_RING
              )}
            >
              Build Teams
            </button>
          </div>
        )}
      </div>
    </>
  )
}
