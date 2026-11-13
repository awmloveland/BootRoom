// components/new-league/NameStep.tsx
'use client'

import { useState } from 'react'
import { cn, generateSlug } from '@/lib/utils'
import { FIELD, PRIMARY_BUTTON, SECONDARY_LINK, StepEyebrow, StepShell } from './StepShell'
import type { LeagueDraft } from './NewLeagueWizard'

interface Props {
  stepOffset: number
  draft: LeagueDraft
  onChange: (patch: Partial<LeagueDraft>) => void
  onNext: () => void
}

export function NameStep({ draft, onChange, onNext, stepOffset }: Props) {
  const [bioOpen, setBioOpen] = useState(false)
  // Derived, not initial state: a stored draft arrives after the first render.
  const showBio = bioOpen || draft.bio !== ''
  const base = generateSlug(draft.name)
  // The server rejects a name with no letters or digits, so stop it here, not two steps later.
  const canContinue = base !== ''
  // Once the league exists its address is fixed, whatever the name becomes.
  const slug = draft.created?.slug ?? (base && `${base}-${draft.code}`)

  return (
    <StepShell
      eyebrow={<StepEyebrow n={1} offset={stepOffset} />}
      title="What is your league called?"
      sub="This becomes your link too. It is set now and stays put if you rename the league later."
      action={<button type="button" className={PRIMARY_BUTTON} disabled={!canContinue} onClick={onNext}>Continue</button>}
      secondary={!showBio && <button type="button" className={SECONDARY_LINK} onClick={() => setBioOpen(true)}>Add a short bio</button>}
    >
      <input
        aria-label="League name"
        className={cn(FIELD, 'h-[54px] text-[17px] font-semibold')}
        placeholder="e.g. Hackney Thursdays"
        maxLength={80}
        value={draft.name}
        onChange={(e) => onChange({ name: e.target.value })}
        onKeyDown={(e) => { if (e.key === 'Enter' && canContinue) onNext() }}
        autoFocus
      />
      <p className="mt-3 text-center font-plex text-[11px] tracking-[.04em] text-[#4f688a]">
        craft-football.com/<span className="text-[#8ba4c4]">{slug}</span>
      </p>
      {showBio && (
        <textarea
          aria-label="Short bio"
          className={cn(FIELD, 'mt-5 h-auto py-3 text-sm')}
          rows={2}
          placeholder="A line or two about the game. Optional."
          value={draft.bio}
          onChange={(e) => { setBioOpen(true); onChange({ bio: e.target.value }) }}
        />
      )}
    </StepShell>
  )
}
