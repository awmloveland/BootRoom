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
  /** `lg` is the league setup size: 46px segments, 38px tall. */
  size?: 'sm' | 'lg'
}

export function MentalityControl({ value, onChange, fullWidth = false, disabled = false, size = 'sm' }: Props) {
  const lg = size === 'lg'
  return (
    <div
      className={cn(
        'flex border border-[#223a5c] overflow-hidden font-plex font-bold uppercase',
        lg ? 'rounded-md text-[9px] tracking-[.1em]' : 'rounded text-[9px] tracking-[.12em]',
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
            lg ? 'w-[46px] h-[38px]' : fullWidth ? 'flex-1 h-8' : 'h-6 px-2',
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
