// components/new-league/RosterWizard.tsx
'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { Mentality, Strength } from '@/lib/types'
import { rosterRenames } from '@/lib/playerUtils'
import { PlayersStep } from './PlayersStep'
import { MentalityStep } from './MentalityStep'
import { StrengthStep } from './StrengthStep'
import { rosterKey, useSessionState } from './useSessionState'

const STEPS = ['players', 'mentality', 'strength'] as const
type Step = (typeof STEPS)[number]

export interface RosterPlayer {
  /** The saved name for a player the league already holds; a UUID for a new row. */
  id: string
  name: string
  /** The creator: fixed first, not removable. */
  you?: boolean
  mentality: Mentality
  strength: Strength
}

interface RosterDraft {
  players: RosterPlayer[]
  /** Saved players taken off the list. Deleted on save; recorded, never inferred from a missing row. */
  removed: string[]
}

interface Props {
  leagueId: string
  slug: string
  /** The roster as saved so far: the creator first, then anyone already written. */
  initial: RosterPlayer[]
  stepOffset: number
}

function stepFromPath(pathname: string): Step {
  const last = pathname.split('/').pop() ?? ''
  return (STEPS as readonly string[]).includes(last) ? (last as Step) : 'players'
}

const newPlayer = (name: string): RosterPlayer => ({ id: crypto.randomUUID(), name, mentality: 'balanced', strength: 'average' })
const isNamed = (p: RosterPlayer) => p.name.trim() !== ''
const GENERIC = 'Could not save the roster. Try again.'

/**
 * Who plays, Mentality and Strength. The list lives in the tab's
 * sessionStorage until it is written at the end of Strength, so a refresh or
 * Back keeps it. It always ends in a blank row to type into; blank rows never
 * leave this component. Step URLs change through pushState like the
 * pre-creation wizard; a hard load with only the creator goes back to players.
 */
export function RosterWizard({ leagueId, slug, initial, stepOffset }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [roster, setRoster, { loaded, clear }] = useSessionState<RosterDraft>(rosterKey(slug), () => ({ players: [...initial, newPlayer('')], removed: [] }))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { players } = roster
  const named = players.filter(isNamed)
  // Names the league already holds; a server-seeded row's id is its saved name.
  const saved = initial.map((p) => p.id)
  // Once a save is under way the screen stays on Strength: edits made after Back would miss the write.
  const step = submitting ? 'strength' : named.length < 2 ? 'players' : stepFromPath(pathname)

  useEffect(() => {
    if (loaded && named.length < 2 && stepFromPath(pathname) !== 'players') router.replace(`/new/${slug}/players`)
  }, [loaded, pathname, named.length, router, slug])

  const go = (next: Step) => window.history.pushState(null, '', `/new/${slug}/${next}`)
  const setPlayers = (change: (ps: RosterPlayer[]) => RosterPlayer[]) => setRoster((r) => ({ ...r, players: change(r.players) }))
  const patch = (id: string, change: Partial<RosterPlayer>) => setPlayers((ps) => ps.map((p) => (p.id === id ? { ...p, ...change } : p)))

  async function save() {
    setSubmitting(true)
    setError(null)
    const fail = (message = GENERIC) => {
      setError(message)
      setSubmitting(false)
      // Some edits may have landed: reload the saved list so a retry applies only what is left.
      router.refresh()
    }
    const api = `/api/league/${leagueId}`
    const renames = rosterRenames(saved, named)
    // A removed name typed back in as a new row keeps its saved player. One taken by a rename does not.
    const retyped = named.filter((p) => !renames.includes(p)).map((p) => p.name.trim())
    try {
      // Deletes first, so a rename can take a removed player's name.
      for (const name of roster.removed.filter((n) => saved.includes(n) && !retyped.includes(n))) {
        const res = await fetch(`${api}/players/${encodeURIComponent(name)}`, { method: 'DELETE' })
        if (!res.ok && res.status !== 404) return fail()
        // Done: a retry must not delete whoever holds this name next.
        setRoster((r) => ({ ...r, removed: r.removed.filter((n) => n !== name) }))
      }
      for (const p of renames) {
        const name = p.name.trim()
        const res = await fetch(`${api}/players/${encodeURIComponent(p.id)}/rename`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ new_name: name }),
        })
        if (!res.ok) return fail(res.status === 409 ? `${name} is already on the list` : GENERIC)
        // The row now stands for the renamed player, so a retry does not rename again.
        patch(p.id, { id: name })
      }
      const res = await fetch(`${api}/roster`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ players: named.map(({ name, strength, mentality }) => ({ name, strength, mentality })) }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        return fail(res.status === 400 && typeof data.error === 'string' ? data.error : GENERIC)
      }
    } catch {
      return fail('Could not save the roster. Check your connection and try again.')
    }
    clear()
    // Back from Live reuses this page from the client cache, which still holds
    // the pre-save roster; refresh drops that entry so Back re-reads the saved list.
    router.refresh()
    router.push(`/new/${slug}/results`)
  }

  // A refresh on Mentality or Strength: wait for the stored list rather than flash Who plays.
  if (!loaded && stepFromPath(pathname) !== 'players') return null
  if (step === 'mentality') {
    return <MentalityStep stepOffset={stepOffset} players={named} onChange={(id, mentality) => patch(id, { mentality })} onNext={() => go('strength')} />
  }
  if (step === 'strength') {
    return <StrengthStep stepOffset={stepOffset} players={named} onChange={(id, strength) => { if (!submitting) patch(id, { strength }) }} onSubmit={save} submitting={submitting} error={error} />
  }
  return (
    <PlayersStep
      stepOffset={stepOffset}
      players={players}
      onAdd={(added) => setPlayers((ps) => [...ps.filter(isNamed), ...added.map(newPlayer), ...ps.filter((p) => !isNamed(p))])}
      onAddBlank={() => setPlayers((ps) => [...ps, newPlayer('')])}
      onRename={(id, name) => patch(id, { name })}
      onRemove={(id) => setRoster((r) => ({ players: r.players.filter((p) => p.id !== id), removed: saved.includes(id) ? [...r.removed, id] : r.removed }))}
      onNext={() => go('mentality')}
    />
  )
}
