import { Winner } from '@/lib/types'
import { cn } from '@/lib/utils'

interface WinnerBadgeProps {
  winner: Winner
  cancelled?: boolean
}

const BADGE_CLASSES: Record<NonNullable<Winner>, string> = {
  teamA: 'bg-sky-900/60 text-sky-300 border border-sky-700',
  teamB: 'bg-violet-900/60 text-violet-300 border border-violet-700',
  draw: 'bg-slate-700 text-slate-300 border border-slate-600',
}

const BADGE_LABELS: Record<NonNullable<Winner>, string> = {
  teamA: 'Team A Won',
  teamB: 'Team B Won',
  draw: 'Draw',
}

export function WinnerBadge({ winner, cancelled = false }: WinnerBadgeProps) {
  const base = 'text-xs font-semibold rounded-full px-2.5 py-0.5 whitespace-nowrap'

  if (cancelled) {
    return (
      <span className={cn(base, 'bg-red-950 text-red-400 border border-red-900')}>
        Cancelled
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
