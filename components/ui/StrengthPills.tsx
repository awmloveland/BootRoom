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
        'inline-flex border border-[#223a5c] rounded overflow-hidden font-plex font-bold uppercase tracking-[.12em]',
        isSm ? 'text-[8.5px]' : 'flex w-full text-[9px]'
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
              'transition-colors whitespace-nowrap border-[#223a5c]',
              isSm ? 'px-2 h-6' : 'flex-1 h-8',
              i < OPTIONS.length - 1 && 'border-r',
              selected
                ? 'bg-[rgba(8,47,73,.6)] text-[#7dd3fc]'
                : 'text-[#8ba4c4] hover:text-white',
              disabled && 'opacity-50 cursor-not-allowed hover:text-[#8ba4c4]'
            )}
          >
            {labels[opt]}
          </button>
        )
      })}
    </div>
  )
}
