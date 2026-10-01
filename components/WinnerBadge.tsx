import { Winner } from '@/lib/types'
import { cn } from '@/lib/utils'

interface WinnerBadgeProps {
  winner: Winner
  cancelled?: boolean
  dnf?: boolean
}

const BADGE_CLASSES: Record<NonNullable<Winner>, string> = {
  teamA: 'bg-[#38bdf8]/12 text-[#7dd3fc] border-[#38bdf8]/40',
  teamB: 'bg-[#a78bfa]/12 text-[#c4b5fd] border-[#a78bfa]/40',
  draw: 'bg-transparent text-[#8ba4c4] border-[#223a5c]',
}

const BADGE_LABELS: Record<NonNullable<Winner>, string> = {
  teamA: 'Team A Won',
  teamB: 'Team B Won',
  draw: 'Drawn',
}

// ── ResultChip ────────────────────────────────────────────────────────────────
// Header chip for played weeks: the winning team plus a lime "+n" margin.

const CHIP_CLASSES: Record<NonNullable<Winner>, string> = {
  teamA: 'bg-[#38bdf8]/12 border-[#38bdf8]/40',
  teamB: 'bg-[#a78bfa]/12 border-[#a78bfa]/40',
  draw: 'bg-transparent border-[#223a5c]',
}

const CHIP_LABEL_CLASSES: Record<NonNullable<Winner>, string> = {
  teamA: 'text-[#7dd3fc]',
  teamB: 'text-[#c4b5fd]',
  draw: 'text-[#8ba4c4]',
}

const CHIP_LABELS: Record<NonNullable<Winner>, string> = {
  teamA: 'Team A',
  teamB: 'Team B',
  draw: 'Drawn',
}

interface ResultChipProps {
  winner: Winner
  goalDifference?: number | null
}

export function ResultChip({ winner, goalDifference }: ResultChipProps) {
  // Legacy rows can be marked played without a winner; say so rather than show nothing.
  if (!winner) {
    return (
      <span className="inline-flex items-center h-7 px-2.5 rounded border border-dashed border-[#223a5c] whitespace-nowrap font-plex text-[10px] font-bold uppercase tracking-[.14em] text-[#4f688a]">
        No result
      </span>
    )
  }
  const margin = winner !== 'draw' && goalDifference ? Math.abs(goalDifference) : 0

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 h-7 px-2.5 rounded border whitespace-nowrap font-plex font-bold',
        CHIP_CLASSES[winner]
      )}
    >
      <span className={cn('text-[10px] uppercase tracking-[.14em]', CHIP_LABEL_CLASSES[winner])}>
        {CHIP_LABELS[winner]}
      </span>
      {margin > 0 && (
        <span className="text-[11px] tracking-[.06em] text-[#bef264] tabular-nums">
          +{margin}
        </span>
      )}
    </span>
  )
}

// ── WinnerBadge ───────────────────────────────────────────────────────────────

export function WinnerBadge({ winner, cancelled = false, dnf = false }: WinnerBadgeProps) {
  const base = 'font-plex text-[9px] font-bold uppercase tracking-[.14em] rounded border px-2.5 py-[5px] whitespace-nowrap'

  if (cancelled) {
    return (
      <span className={cn(base, 'bg-[#e2686f]/12 text-[#e2686f] border-[#e2686f]/40')}>
        Cancelled
      </span>
    )
  }

  if (dnf) {
    return (
      <span className={cn(base, 'bg-[#1b2c46] text-[#cfe0f4] border-[#2c4a72]')}>
        DNF
      </span>
    )
  }

  if (!winner) return null

  return (
    <span className={cn(base, BADGE_CLASSES[winner])}>
      {BADGE_LABELS[winner]}
    </span>
  )
}
