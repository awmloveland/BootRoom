// components/EyeTestSlider.tsx
'use client'

import { cn } from '@/lib/utils'

interface Props {
  value: number           // 1 | 2 | 3
  onChange: (v: number) => void
  showNote?: boolean      // show reassurance note below slider
}

export function EyeTestSlider({ value, onChange, showNote = false }: Props) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          name="eye-test-rating"
          min={1}
          max={3}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 h-1 rounded appearance-none cursor-pointer bg-slate-700 accent-blue-500"
        />
        <span className="min-w-[2rem] text-center bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs font-semibold text-slate-100">
          {value}
        </span>
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
        <span>1 — Below avg</span>
        <span>2 — Average</span>
        <span>3 — Strong</span>
      </div>
      {showNote && (
        <p className="mt-2 text-[11px] text-slate-500 leading-relaxed bg-slate-900 border border-slate-700/50 rounded p-2">
          <span className="text-slate-400 font-medium">This isn&apos;t personal.</span>{' '}
          It&apos;s just a starting point to help balance teams. Ratings aren&apos;t visible to players
          and will naturally adjust over time based on their form.
        </p>
      )}
    </div>
  )
}
