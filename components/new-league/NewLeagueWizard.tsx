// components/new-league/NewLeagueWizard.tsx
'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { slugCode } from '@/lib/utils'
import { NameStep } from './NameStep'
import { WhereStep } from './WhereStep'
import { WhenStep } from './WhenStep'
import { DRAFT_KEY, useSessionState } from './useSessionState'

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
  /** The address suffix, picked once so the Name step's preview is the real address. */
  code: string
  /** Set once the league exists. From then on these steps edit it and never create another. */
  created?: { id: string; slug: string }
}

const EMPTY: LeagueDraft = { name: '', bio: '', location: '', day: 'Thursday', time: '20:00', code: '' }

function stepFromPath(pathname: string): Step {
  const last = pathname.split('/').pop() ?? ''
  return (STEPS as readonly string[]).includes(last) ? (last as Step) : 'name'
}

function send(url: string, method: 'POST' | 'PATCH', body: unknown) {
  return fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

interface Props {
  stepOffset: number
}

/**
 * Name, Where and When. The answers live in the tab's sessionStorage, so a
 * refresh or Back keeps them; each step gets its own URL through pushState,
 * which Next syncs to usePathname. Before the league exists, When creates it.
 * Afterwards (Back from Who plays) the same steps update it.
 */
export function NewLeagueWizard({ stepOffset }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [draft, setDraft, { loaded }] = useSessionState<LeagueDraft>(DRAFT_KEY, EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A hard load of a later step with nothing stored has nothing to continue
  // from: show Name and move the URL back through the router.
  const step = draft.name ? stepFromPath(pathname) : 'name'
  useEffect(() => {
    if (loaded && pathname !== '/new/name' && pathname !== '/new' && !draft.name) router.replace('/new/name')
  }, [loaded, pathname, draft.name, router])

  const go = (next: Step) => window.history.pushState(null, '', `/new/${next}`)
  const update = (patch: Partial<LeagueDraft>) => setDraft((d) => ({ ...d, ...patch, code: d.code || slugCode() }))

  async function submit() {
    const { created } = draft
    const verb = created ? 'save' : 'create'
    setSubmitting(true)
    setError(null)
    const details = { name: draft.name, bio: draft.bio, location: draft.location, day: draft.day, kickoff_time: draft.time }
    let res: Response
    try {
      res = created
        ? await send(`/api/league/${created.id}/details`, 'PATCH', details)
        : await send('/api/games', 'POST', { ...details, code: draft.code })
    } catch {
      setError(`Could not ${verb} the league. Check your connection and try again.`)
      setSubmitting(false)
      return
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      // The league was deleted, or someone else is signed in on this tab: the next press creates a new one.
      if (created && (res.status === 403 || res.status === 404)) setDraft((d) => ({ ...d, created: undefined }))
      // Only validation messages are written for people; anything else gets the generic line.
      setError(res.status === 400 && typeof data.error === 'string' ? data.error : `Could not ${verb} the league. Try again.`)
      setSubmitting(false)
      return
    }
    const slug = created?.slug ?? (data.slug as string)
    if (!created) setDraft((d) => ({ ...d, created: { id: data.id as string, slug } }))
    router.push(`/new/${slug}/players`)
  }

  // A refresh on Where or When: wait for the stored draft rather than flash Name.
  if (!loaded && stepFromPath(pathname) !== 'name') return null
  if (step === 'where') return <WhereStep stepOffset={stepOffset} draft={draft} onChange={update} onNext={() => go('when')} />
  if (step === 'when') return <WhenStep stepOffset={stepOffset} draft={draft} onChange={update} onSubmit={submit} submitting={submitting} editing={!!draft.created} error={error} />
  return <NameStep stepOffset={stepOffset} draft={draft} onChange={update} onNext={() => go('where')} />
}
