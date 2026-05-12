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

const OPTIONS: { value: Strength; label: string }[] = [
  { value: 'below', label: 'Below average' },
  { value: 'average', label: 'Average' },
  { value: 'above', label: 'Above average' },
]

export function StrengthPills({ value, onChange, disabled = false, size = 'md', ariaLabel = 'Strength' }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'flex bg-slate-900 border border-slate-700 rounded-md overflow-hidden font-semibold',
        size === 'sm' ? 'text-[10px]' : 'text-[11px]'
      )}
    >
      {OPTIONS.map((opt, i) => {
        const selected = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => { if (!disabled) onChange(opt.value) }}
            className={cn(
              'flex-1 transition-colors',
              size === 'sm' ? 'py-1.5' : 'py-2',
              i < OPTIONS.length - 1 && 'border-r',
              selected
                ? 'bg-blue-950 text-blue-300 border-blue-800'
                : 'text-slate-500 border-slate-700 hover:text-slate-300',
              disabled && 'opacity-50 cursor-not-allowed hover:text-slate-500'
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
