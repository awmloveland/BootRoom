'use client'

import { cn } from '@/lib/utils'
import type { Strength } from '@/lib/strength'

interface Props {
  value: Strength | null
  onChange: (next: Strength) => void
  disabled?: boolean
  size?: 'sm' | 'md'
  ariaLabel?: string
}

const LONG_LABELS: Record<Strength, string> = {
  below: 'Below average',
  average: 'Average',
  above: 'Above average',
}

const SHORT_LABELS: Record<Strength, string> = {
  below: 'Below',
  average: 'Avg',
  above: 'Above',
}

const OPTIONS: Strength[] = ['below', 'average', 'above']

export function StrengthPills({ value, onChange, disabled = false, size = 'md', ariaLabel = 'Strength' }: Props) {
  const isSm = size === 'sm'
  const labels = isSm ? SHORT_LABELS : LONG_LABELS
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex bg-slate-900 border border-slate-700 rounded-md overflow-hidden font-semibold',
        isSm ? 'text-[10px]' : 'flex w-full text-[11px]'
      )}
    >
      {OPTIONS.map((opt, i) => {
        const selected = value === opt
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={LONG_LABELS[opt]}
            disabled={disabled}
            onClick={() => { if (!disabled) onChange(opt) }}
            className={cn(
              'transition-colors whitespace-nowrap',
              isSm ? 'px-2 py-1' : 'flex-1 py-2',
              i < OPTIONS.length - 1 && 'border-r',
              selected
                ? 'bg-blue-950 text-blue-300 border-blue-800'
                : 'text-slate-500 border-slate-700 hover:text-slate-300',
              disabled && 'opacity-50 cursor-not-allowed hover:text-slate-500'
            )}
          >
            {labels[opt]}
          </button>
        )
      })}
    </div>
  )
}
