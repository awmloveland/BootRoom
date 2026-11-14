// components/new-league/WhereStep.tsx
'use client'

import { FIELD, PRIMARY_BUTTON, StepEyebrow, StepShell } from './StepShell'
import type { LeagueDraft } from './NewLeagueWizard'

interface Props {
  draft: LeagueDraft
  onChange: (patch: Partial<LeagueDraft>) => void
  onNext: () => void
}

// shortcut: free text only, Places autocomplete and the map preview arrive in slice 5
export function WhereStep({ draft, onChange, onNext }: Props) {
  const canContinue = draft.location.trim().length > 0
  return (
    <StepShell
      eyebrow={<StepEyebrow n={2} />}
      title="Where do you play?"
      sub="Name the pitch or venue. We save it so it reads well on your league page."
      action={<button type="button" className={PRIMARY_BUTTON} disabled={!canContinue} onClick={onNext}>Continue</button>}
    >
      <input
        aria-label="Venue"
        className={FIELD}
        placeholder="e.g. Mabley Green"
        maxLength={120}
        value={draft.location}
        onChange={(e) => onChange({ location: e.target.value })}
        onKeyDown={(e) => { if (e.key === 'Enter' && canContinue) onNext() }}
        autoFocus
      />
    </StepShell>
  )
}
