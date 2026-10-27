'use client'

import { cn } from '@/lib/utils'
import type { Strength } from '@/lib/strength'

interface Props {
  value: Strength | null
  onChange: (next: Strength) => void
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
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
  const isLg = size === 'lg'
  const labels = size === 'md' ? LONG_LABELS : SHORT_LABELS
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex border border-[#223a5c] overflow-hidden font-plex font-bold uppercase',
        isLg ? 'rounded-md text-[9px] tracking-[.1em]' : 'rounded tracking-[.12em]',
        isSm && 'text-[8.5px]',
        size === 'md' && 'flex w-full text-[9px]'
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
              isLg ? 'w-[58px] h-[38px]' : isSm ? 'px-2 h-6' : 'flex-1 h-8',
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
