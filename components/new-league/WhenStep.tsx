// components/new-league/WhenStep.tsx
'use client'

import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { parseKickoffInput } from '@/lib/dates'
import { PRIMARY_BUTTON, StepEyebrow, StepShell } from './StepShell'
import type { LeagueDraft } from './NewLeagueWizard'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

interface Props {
  draft: LeagueDraft
  onChange: (patch: Partial<LeagueDraft>) => void
  onSubmit: () => void
  submitting: boolean
  error: string | null
}

/** '20:15' → ['8:15', 'pm'] for the stepper. */
function to12h(time: string): [string, 'am' | 'pm'] {
  const [h, m] = time.split(':').map(Number)
  return [`${h % 12 || 12}:${String(m).padStart(2, '0')}`, h < 12 ? 'am' : 'pm']
}

/** Moves 'HH:MM' by `minutes`, wrapping at midnight. */
function stepTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = (h * 60 + m + minutes + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function WhenStep({ draft, onChange, onSubmit, submitting, error }: Props) {
  const [display, suffix] = to12h(draft.time)
  // The text while the kick-off input is being edited; null when it shows the saved time.
  const [typed, setTyped] = useState<string | null>(null)
  const invalid = typed !== null && typed !== '' && parseKickoffInput(typed, suffix) === null

  function step(minutes: number) {
    setTyped(null)
    onChange({ time: stepTime(draft.time, minutes) })
  }

  function commit() {
    // Only an edited value is re-read; bare hours under 6 would otherwise flip to pm on blur.
    if (typed !== null && typed !== display) {
      const parsed = parseKickoffInput(typed, suffix)
      if (parsed) onChange({ time: parsed })
    }
    setTyped(null)
  }

  const stepperButton = 'flex items-center justify-center text-[#8ba4c4] transition-colors hover:bg-[#0c1728] hover:text-[#f4f9ff]'

  return (
    <StepShell
      eyebrow={<StepEyebrow n={3} />}
      title="When do you play?"
      sub={`Same slot every week. Your first match goes in the diary for the next ${draft.day}.`}
      action={
        <>
          <button type="button" className={PRIMARY_BUTTON} disabled={submitting} onClick={onSubmit}>
            {submitting ? 'Creating…' : 'Create league'}
          </button>
          {error && <p role="alert" className="mt-3 text-center font-inter-body text-[13px] text-[#e2686f]">{error}</p>}
        </>
      }
    >
      <p id="match-day-label" className="mb-2 font-inter-body text-sm text-[#8ba4c4]">Match day</p>
      <div role="group" aria-labelledby="match-day-label" className="grid grid-cols-7 gap-1.5">
        {DAYS.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={draft.day === d}
            onClick={() => onChange({ day: d })}
            className={cn(
              'h-11 rounded-lg border font-plex text-[10px] font-bold uppercase tracking-[.1em] transition-colors hover:border-[#38bdf8]',
              draft.day === d ? 'border-[#38bdf8] bg-[#082f49]/60 text-[#7dd3fc]' : 'border-[#1b2c46] bg-[#0a1421] text-[#8ba4c4]',
            )}
          >
            {d.slice(0, 3)}
          </button>
        ))}
      </div>

      <p id="kick-off-label" className="mb-2 mt-5 font-inter-body text-sm text-[#8ba4c4]">Kick-off</p>
      <div
        role="group"
        aria-labelledby="kick-off-label"
        className={cn(
          'grid h-[50px] grid-cols-[56px_1fr_56px] overflow-hidden rounded-lg border bg-[#0a1421]',
          invalid ? 'border-[#e2686f]/60' : 'border-[#1b2c46]',
        )}
      >
        <button type="button" aria-label="15 minutes earlier" onClick={() => step(-15)} className={cn(stepperButton, 'border-r border-[#1b2c46]')}>
          <Minus className="size-5" />
        </button>
        <div className="flex items-center justify-center gap-1">
          <input
            aria-label="Kick-off time"
            className="w-[68px] bg-transparent text-right font-plex text-lg font-bold text-[#f4f9ff] focus:outline-none"
            value={typed ?? display}
            onFocus={() => setTyped(display)}
            onChange={(e) => setTyped(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'ArrowUp') { e.preventDefault(); step(15) }
              if (e.key === 'ArrowDown') { e.preventDefault(); step(-15) }
            }}
          />
          <span className="font-plex text-[13px] font-bold text-[#8ba4c4]">{suffix}</span>
        </div>
        <button type="button" aria-label="15 minutes later" onClick={() => step(15)} className={cn(stepperButton, 'border-l border-[#1b2c46]')}>
          <Plus className="size-5" />
        </button>
      </div>
    </StepShell>
  )
}
