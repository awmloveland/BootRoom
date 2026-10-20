'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { cn, gamesLabel, getInitials, initialPlaysAs, reviewProblem, timeAgo } from '@/lib/utils'
import type { PlayerAttribute, PlaysAs, ReviewItem } from '@/lib/types'

interface ReviewCardProps {
  leagueId: string
  item: ReviewItem
  /** Squad from GET /api/league/[id]/players. */
  roster: PlayerAttribute[]
  /** Called once the item has been approved or declined. */
  onDone: () => void
  /** Called when the server rejects a choice the roster said was fine (409). */
  onRosterStale?: () => void
}

const LABEL = 'font-plex text-[9px] font-bold uppercase tracking-[.16em] text-[#6f88a8]'
const LINK = 'font-inter-body text-xs text-[#38bdf8] hover:text-[#7dd3fc] transition-colors'

/** One join request or member claim: who they are, who they'll play as, Decline / Approve. */
export function ReviewCard({ leagueId, item, roster, onDone, onRosterStale }: ReviewCardProps) {
  const [playsAs, setPlaysAs] = useState<PlaysAs>(() => initialPlaysAs(item))
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<'approve' | 'decline' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)

  const person = item.kind === 'join'
    ? {
        userId: item.request.user_id,
        name: item.request.display_name,
        email: item.request.email,
        createdAt: item.request.created_at,
        note: item.request.message,
        pick: item.request.player_name,
      }
    : {
        userId: item.claim.user_id,
        name: item.claim.display_name || item.claim.email || 'Member',
        email: item.claim.email ?? '',
        createdAt: item.claim.created_at,
        note: null,
        pick: item.claim.player_name,
      }
  const saidNew = item.kind === 'join' && item.request.played_before === false
  const couldNotFind = item.kind === 'join' && item.request.played_before === true && !item.request.player_name

  const problem = reviewProblem(playsAs, roster, person.userId)
  const warn = problem?.kind === 'clash' || problem?.kind === 'linked'
  const base = `/api/league/${leagueId}`

  async function send(kind: 'approve' | 'decline') {
    if (kind === 'approve' && (problem || playsAs.mode === 'list')) return
    setBusy(kind)
    setError(null)
    const [url, body] = kind === 'approve'
      ? [
          item.kind === 'join' ? `${base}/join-requests/${item.request.id}/approve` : `${base}/player-claims/${item.claim.id}/approve`,
          { player_name: playsAs.mode === 'list' ? '' : playsAs.name.trim(), create_player: playsAs.mode === 'new' },
        ]
      : [
          item.kind === 'join' ? `${base}/join-requests/${item.request.id}/review` : `${base}/player-claims/${item.claim.id}/review`,
          { action: item.kind === 'join' ? 'declined' : 'rejected' },
        ]
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Something went wrong')
        if (res.status === 409) onRosterStale?.()
        return
      }
      onDone()
    } catch {
      setError('Something went wrong')
    } finally {
      setBusy(null)
    }
  }

  const query = search.trim().toLowerCase()
  const squad = query ? roster.filter((p) => p.name.toLowerCase().includes(query)) : roster

  return (
    <li className="px-4 py-4">
      {/* Who */}
      <div className="flex items-start gap-3">
        <div className="size-8 shrink-0 rounded-full bg-[#0c1728] border border-[#223a5c] flex items-center justify-center font-plex text-[10px] font-bold text-[#8ba4c4]">
          {getInitials(person.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="font-inter-body text-sm font-medium text-[#f4f9ff] truncate">{person.name}</p>
            <p className="ml-auto shrink-0 font-plex text-[10px] text-[#4f688a]">{timeAgo(person.createdAt)}</p>
          </div>
          {person.email && <p className="font-inter-body text-xs text-[#6f88a8] truncate">{person.email}</p>}
          {item.kind === 'claim' ? (
            <p className="mt-1 font-inter-body text-xs text-[#8ba4c4]">Wants to link to a player</p>
          ) : person.note ? (
            <button type="button" className="mt-1 w-full text-left" onClick={() => setNoteOpen((o) => !o)}>
              <p className={cn('font-inter-body text-xs italic text-[#8ba4c4]', !noteOpen && 'line-clamp-2')}>
                &ldquo;{person.note}&rdquo;
              </p>
            </button>
          ) : null}
        </div>
      </div>

      {/* Plays as */}
      <div className={cn('mt-3 ml-11 rounded-lg border bg-[#0c1728] px-3 py-2.5', warn ? 'border-[#fbbf24]/40' : 'border-[#1b2c46]')}>
        {playsAs.mode === 'existing' && (() => {
          const rosterPlayer = roster.find((p) => p.name === playsAs.name)
          return (
            <>
              <p className={LABEL}>Plays as</p>
              <div className="mt-1 flex items-baseline gap-2">
                <p className="font-inter-body text-sm">
                  <span className={cn('font-medium', warn ? 'text-[#fbbf24]' : 'text-[#f4f9ff]')}>{playsAs.name}</span>
                  {rosterPlayer && <span className="text-[#6f88a8]"> {`· ${gamesLabel(rosterPlayer.played ?? 0)}`}</span>}
                </p>
                {playsAs.name === person.pick && (
                  <span className="rounded border border-[#223a5c] px-1.5 font-plex text-[9px] uppercase tracking-[.12em] text-[#8ba4c4]">
                    Their pick
                  </span>
                )}
                <button type="button" onClick={() => { setSearch(''); setPlaysAs({ mode: 'list' }) }} className={cn(LINK, 'ml-auto')}>
                  Change
                </button>
              </div>
              {problem?.kind === 'linked' && (
                <p className="mt-1.5 font-inter-body text-xs text-[#fbbf24]">
                  {problem.player.name} is already linked to {problem.player.linked_display_name}.
                </p>
              )}
            </>
          )
        })()}

        {playsAs.mode === 'list' && (
          <>
            <p className={LABEL}>Plays as</p>
            {couldNotFind && (
              <p className="mt-1 font-inter-body text-[11px] text-[#8ba4c4]">
                They&apos;ve played before but couldn&apos;t find their name.
              </p>
            )}
            <input
              type="text"
              aria-label="Search the squad"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search the squad…"
              className="mt-2 w-full px-3 py-2 rounded-xl bg-[#0a1421] border border-[#1b2c46] font-inter-body text-sm text-[#f4f9ff] placeholder:text-[#4f688a] outline-none focus:border-[#2c4a72]"
            />
            <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-[#1b2c46] divide-y divide-[#17263c]">
              {squad.length === 0 ? (
                <p className="px-3 py-2 font-inter-body text-xs text-[#6f88a8]">No players match that search.</p>
              ) : (
                squad.map((p) => {
                  const linkedElsewhere = !!p.linked_user_id && p.linked_user_id !== person.userId
                  return (
                    <button
                      key={p.name}
                      type="button"
                      disabled={linkedElsewhere}
                      onClick={() => setPlaysAs({ mode: 'existing', name: p.name })}
                      className="flex w-full items-baseline gap-2 px-3 py-2 text-left font-inter-body text-sm text-[#cfe0f4] hover:bg-[#0a1421] disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                    >
                      {p.name}
                      <span className="text-xs text-[#6f88a8]">
                        {linkedElsewhere ? `Linked to ${p.linked_display_name}` : gamesLabel(p.played ?? 0)}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
            <button
              type="button"
              onClick={() => setPlaysAs({ mode: 'new', name: search.trim() || person.name })}
              className={cn(LINK, 'mt-2.5 inline-flex items-center gap-1')}
            >
              <Plus className="size-3" aria-hidden />
              Not in the list? Add as a new player
            </button>
          </>
        )}

        {playsAs.mode === 'new' && (
          <>
            <label htmlFor={`new-player-${person.userId}`} className={LABEL}>Plays as · new player</label>
            <input
              id={`new-player-${person.userId}`}
              type="text"
              aria-label="New player name"
              value={playsAs.name}
              onChange={(e) => setPlaysAs({ mode: 'new', name: e.target.value })}
              className={cn(
                'mt-1.5 w-full px-3 py-1.5 rounded bg-[#0a1421] border font-inter-body text-sm text-[#f4f9ff] outline-none',
                warn ? 'border-[#fbbf24]' : 'border-[#223a5c] focus:border-[#38bdf8]',
              )}
            />
            {problem?.kind === 'clash' ? (
              <>
                <p className="mt-2 font-inter-body text-xs text-[#fbbf24]">
                  There&apos;s already a {problem.player.name} in the squad.
                </p>
                {(!problem.player.linked_user_id || problem.player.linked_user_id === person.userId) && (
                  <button
                    type="button"
                    onClick={() => setPlaysAs({ mode: 'existing', name: problem.player.name })}
                    className={cn(LINK, 'mt-1.5')}
                  >
                    Link to {problem.player.name} instead
                  </button>
                )}
              </>
            ) : (
              <p className="mt-1.5 font-inter-body text-[11px] text-[#4f688a]">
                {saidNew ? "They said they're new. Added to the squad when you approve." : 'Added to the squad when you approve.'}
              </p>
            )}
            <button type="button" onClick={() => { setSearch(''); setPlaysAs({ mode: 'list' }) }} className={cn(LINK, 'mt-1.5 block')}>
              Already in the squad? Pick them
            </button>
          </>
        )}
      </div>

      {/* Decision */}
      <div className="mt-3 ml-11 flex items-center">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => send('decline')}
          className="text-xs font-medium text-[#6f88a8] hover:text-[#e2686f] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {busy === 'decline' ? '…' : 'Decline'}
        </button>
        <button
          type="button"
          disabled={busy !== null || problem !== null}
          onClick={() => send('approve')}
          className="ml-auto rounded bg-[#38bdf8] px-3 py-1.5 text-xs font-bold text-[#05101d] hover:bg-[#7dd3fc] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {busy === 'approve' ? '…' : 'Approve'}
        </button>
      </div>
      {error && <p role="alert" className="mt-2 ml-11 font-inter-body text-xs text-[#e2686f]">{error}</p>}
    </li>
  )
}
