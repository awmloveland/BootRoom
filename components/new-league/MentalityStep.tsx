// components/new-league/MentalityStep.tsx
'use client'

import type { Mentality } from '@/lib/types'
import { MentalityControl } from '@/components/ui/MentalityControl'
import { PRIMARY_BUTTON, StepEyebrow, StepShell } from './StepShell'
import { PlayerRow } from './PlayerRow'
import type { RosterPlayer } from './RosterWizard'

interface Props {
  players: RosterPlayer[]
  onChange: (id: string, mentality: Mentality) => void
  onNext: () => void
}

export function MentalityStep({ players, onChange, onNext }: Props) {
  return (
    <StepShell
      eyebrow={<StepEyebrow n={5} />}
      title="How does each of them play?"
      sub="GK is a dedicated keeper, in goal every game. Defensive, balanced and attacking help spread the shape across both sides."
      action={<button type="button" className={PRIMARY_BUTTON} onClick={onNext}>Continue</button>}
    >
      <ul className="flex flex-col gap-2">
        {players.map((p) => (
          <li key={p.id}>
            <PlayerRow name={<span className="truncate">{p.name}</span>} you={p.you}>
              <div role="group" aria-label={`Mentality of ${p.name}`}><MentalityControl size="lg" value={p.mentality} onChange={(m) => onChange(p.id, m)} /></div>
            </PlayerRow>
          </li>
        ))}
      </ul>
    </StepShell>
  )
}
