// components/new-league/NewLeagueWizard.tsx
'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { NameStep } from './NameStep'
import { WhereStep } from './WhereStep'
import { WhenStep } from './WhenStep'

const STEPS = ['name', 'where', 'when'] as const
type Step = (typeof STEPS)[number]

export interface LeagueDraft {
  name: string
  bio: string
  location: string
  /** Full day name, as games.day stores it. */
  day: string
  /** 'HH:MM', as games.kickoff_time stores it. */
  time: string
}

const EMPTY: LeagueDraft = { name: '', bio: '', location: '', day: 'Thursday', time: '20:00' }

function stepFromPath(pathname: string): Step {
  const last = pathname.split('/').pop() ?? ''
  return (STEPS as readonly string[]).includes(last) ? (last as Step) : 'name'
}

function postLeague(d: LeagueDraft) {
  return fetch('/api/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: d.name, bio: d.bio, location: d.location, day: d.day, kickoff_time: d.time }),
  })
}

/**
 * Name, Where and When, before the league exists. The answers live here;
 * each step gets its own URL through pushState, which Next syncs to
 * usePathname, so the browser's back button steps backwards. A refresh
 * starts again at Name.
 */
export function NewLeagueWizard() {
  const pathname = usePathname()
  const router = useRouter()
  const [draft, setDraft] = useState<LeagueDraft>(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A hard load of a later step has nothing to continue from: show Name now
  // and move the URL back through the router.
  const step = draft.name ? stepFromPath(pathname) : 'name'
  useEffect(() => {
    if (pathname !== '/new/name' && pathname !== '/new' && !draft.name) router.replace('/new/name')
  }, [pathname, draft.name, router])

  const go = (next: Step) => window.history.pushState(null, '', `/new/${next}`)
  const update = (patch: Partial<LeagueDraft>) => setDraft((d) => ({ ...d, ...patch }))

  async function create() {
    setSubmitting(true)
    setError(null)
    let res: Response
    try {
      res = await postLeague(draft)
      // The server re-resolves the slug, so one retry clears a race on the name.
      if (res.status === 409) res = await postLeague(draft)
    } catch {
      setError('Could not create the league. Check your connection and try again.')
      setSubmitting(false)
      return
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      // Only validation messages are written for people; anything else gets the generic line.
      setError(res.status === 400 && typeof data.error === 'string' ? data.error : 'Could not create the league. Try again.')
      setSubmitting(false)
      return
    }
    router.push(`/new/${data.slug}/players`)
  }

  if (step === 'where') return <WhereStep draft={draft} onChange={update} onNext={() => go('when')} />
  if (step === 'when') return <WhenStep draft={draft} onChange={update} onSubmit={create} submitting={submitting} error={error} />
  return <NameStep draft={draft} onChange={update} onNext={() => go('where')} />
}
