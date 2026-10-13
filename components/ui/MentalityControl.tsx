'use client'

import { cn } from '@/lib/utils'
import type { Mentality } from '@/lib/types'

const OPTIONS: { value: Mentality; label: string }[] = [
  { value: 'goalkeeper', label: 'GK' },
  { value: 'defensive',  label: 'DEF' },
  { value: 'balanced',   label: 'BAL' },
  { value: 'attacking',  label: 'ATT' },
]

interface Props {
  value: Mentality
  onChange: (m: Mentality) => void
  fullWidth?: boolean
  disabled?: boolean
}

export function MentalityControl({ value, onChange, fullWidth = false, disabled = false }: Props) {
  return (
    <div
      className={cn(
        'flex border border-[#223a5c] rounded overflow-hidden font-plex text-[9px] font-bold uppercase tracking-[.12em]',
        fullWidth && 'w-full'
      )}
    >
      {OPTIONS.map(({ value: v, label }, i) => (
        <button
          key={v}
          type="button"
          aria-pressed={v === value}
          disabled={disabled}
          onClick={() => { if (!disabled && v !== value) onChange(v) }}
          className={cn(
            'transition-colors border-[#223a5c] disabled:opacity-50 disabled:cursor-not-allowed',
            fullWidth ? 'flex-1 h-8' : 'h-6 px-2',
            i < OPTIONS.length - 1 && 'border-r',
            v === value
              ? 'bg-[rgba(8,47,73,.6)] text-[#7dd3fc]'
              : 'text-[#8ba4c4] hover:text-white'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
