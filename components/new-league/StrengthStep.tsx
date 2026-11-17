// components/new-league/StrengthStep.tsx
'use client'

import type { Strength } from '@/lib/types'
import { StrengthPills } from '@/components/ui/StrengthPills'
import { PRIMARY_BUTTON, StepEyebrow, StepShell } from './StepShell'
import { PlayerRow } from './PlayerRow'
import type { RosterPlayer } from './RosterWizard'

interface Props {
  players: RosterPlayer[]
  onChange: (id: string, strength: Strength) => void
  onSubmit: () => void
  submitting: boolean
  error: string | null
}

export function StrengthStep({ players, onChange, onSubmit, submitting, error }: Props) {
  return (
    <StepShell
      eyebrow={<StepEyebrow n={6} />}
      title="Who is above or below average?"
      sub="A gut call to seed the first lineups. It fades out over each player's first ten games. Members can see it, so keep it fair."
      action={
        <>
          <button type="button" className={PRIMARY_BUTTON} disabled={submitting} onClick={onSubmit}>
            {submitting ? 'Saving…' : 'Continue'}
          </button>
          {error && <p role="alert" className="mt-3 text-center font-inter-body text-[13px] text-[#e2686f]">{error}</p>}
        </>
      }
    >
      <ul className="flex flex-col gap-2">
        {players.map((p) => (
          <li key={p.id}>
            <PlayerRow name={<span className="truncate">{p.name}</span>} you={p.you}>
              <StrengthPills size="lg" value={p.strength} onChange={(s) => onChange(p.id, s)} ariaLabel={`Strength of ${p.name}`} />
            </PlayerRow>
          </li>
        ))}
      </ul>
    </StepShell>
  )
}
