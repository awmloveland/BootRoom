// components/new-league/RosterWizard.tsx
'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { Mentality, Strength } from '@/lib/types'
import { PlayersStep } from './PlayersStep'
import { MentalityStep } from './MentalityStep'
import { StrengthStep } from './StrengthStep'

const STEPS = ['players', 'mentality', 'strength'] as const
type Step = (typeof STEPS)[number]

export interface RosterPlayer {
  id: string
  name: string
  /** The creator: fixed first, not removable. */
  you?: boolean
  mentality: Mentality
  strength: Strength
}

interface Props {
  leagueId: string
  slug: string
  /** The creator's player name, from their approved claim. */
  you: string
  /** Names already in player_attributes, used only for the duplicate check. */
  existingNames: string[]
}

function stepFromPath(pathname: string): Step {
  const last = pathname.split('/').pop() ?? ''
  return (STEPS as readonly string[]).includes(last) ? (last as Step) : 'players'
}

const newPlayer = (name: string): RosterPlayer => ({ id: crypto.randomUUID(), name, mentality: 'balanced', strength: 'average' })

/**
 * Who plays, Mentality and Strength. The roster lives here and is written
 * once, at the end of Strength. Step URLs change through pushState like the
 * pre-creation wizard; a hard load with only the creator goes back to players.
 */
export function RosterWizard({ leagueId, slug, you, existingNames }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [players, setPlayers] = useState<RosterPlayer[]>([{ ...newPlayer(you), id: 'you', you: true }])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const step = players.length < 2 ? 'players' : stepFromPath(pathname)

  useEffect(() => {
    if (players.length < 2 && stepFromPath(pathname) !== 'players') router.replace(`/new/${slug}/players`)
  }, [pathname, players.length, router, slug])

  const go = (next: Step) => window.history.pushState(null, '', `/new/${slug}/${next}`)
  const patch = (id: string, change: Partial<RosterPlayer>) =>
    setPlayers((ps) => ps.map((p) => (p.id === id ? { ...p, ...change } : p)))

  async function save() {
    setSubmitting(true)
    setError(null)
    let res: Response
    try {
      res = await fetch(`/api/league/${leagueId}/roster`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ players: players.map(({ name, strength, mentality }) => ({ name, strength, mentality })) }),
      })
    } catch {
      setError('Could not save the roster. Check your connection and try again.')
      setSubmitting(false)
      return
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(res.status === 400 && typeof data.error === 'string' ? data.error : 'Could not save the roster. Try again.')
      setSubmitting(false)
      return
    }
    router.push(`/new/${slug}/live`)
  }

  if (step === 'mentality') {
    return <MentalityStep players={players} onChange={(id, mentality) => patch(id, { mentality })} onNext={() => go('strength')} />
  }
  if (step === 'strength') {
    return <StrengthStep players={players} onChange={(id, strength) => patch(id, { strength })} onSubmit={save} submitting={submitting} error={error} />
  }
  return (
    <PlayersStep
      players={players}
      existingNames={existingNames}
      onAdd={(names) => setPlayers((ps) => [...ps, ...names.map(newPlayer)])}
      onRename={(id, name) => patch(id, { name })}
      onRemove={(id) => setPlayers((ps) => ps.filter((p) => p.id !== id))}
      onNext={() => go('mentality')}
    />
  )
}
