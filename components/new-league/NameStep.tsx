// components/new-league/NameStep.tsx
'use client'

import { useEffect, useState } from 'react'
import { cn, generateSlug } from '@/lib/utils'
import { FIELD, PRIMARY_BUTTON, SECONDARY_LINK, StepEyebrow, StepShell } from './StepShell'
import type { LeagueDraft } from './NewLeagueWizard'

interface Props {
  draft: LeagueDraft
  onChange: (patch: Partial<LeagueDraft>) => void
  onNext: () => void
}

export function NameStep({ draft, onChange, onNext }: Props) {
  const [showBio, setShowBio] = useState(draft.bio !== '')
  // The server's resolved address (adds -2 when the name is taken), keyed by
  // the name it was asked for so a stale answer never shows for a newer name.
  // The local slug stands in while it loads or if the request fails.
  const [server, setServer] = useState<{ name: string; slug: string } | null>(null)
  const slug = server?.name === draft.name ? server.slug : generateSlug(draft.name)
  const canContinue = draft.name.trim().length > 0

  useEffect(() => {
    const name = draft.name
    if (!generateSlug(name)) return
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      fetch(`/api/games/slug?name=${encodeURIComponent(name)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (typeof d?.slug === 'string') setServer({ name, slug: d.slug }) })
        .catch(() => {})
    }, 300)
    return () => { clearTimeout(timer); ctrl.abort() }
  }, [draft.name])

  return (
    <StepShell
      eyebrow={<StepEyebrow n={1} />}
      title="What is your league called?"
      sub="This becomes your link too. It is set now and stays put if you rename the league later."
      action={<button type="button" className={PRIMARY_BUTTON} disabled={!canContinue} onClick={onNext}>Continue</button>}
      secondary={!showBio && <button type="button" className={SECONDARY_LINK} onClick={() => setShowBio(true)}>Add a short bio</button>}
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
          onChange={(e) => onChange({ bio: e.target.value })}
        />
      )}
    </StepShell>
  )
}
