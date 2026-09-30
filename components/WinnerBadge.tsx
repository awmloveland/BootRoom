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
