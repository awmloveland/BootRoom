// app/settings/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import PlayerClaimPicker from '@/components/PlayerClaimPicker'
import type { PlayerClaim } from '@/lib/types'

interface League {
  id: string
  name: string
}

export default function AccountSettingsPage() {
  // ── Account section ────────────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // ── League identity section ────────────────────────────────────────────────
  const [leagues, setLeagues] = useState<League[]>([])
  const [claims, setClaims] = useState<Record<string, PlayerClaim>>({})
  // Which league's picker is open (no-claim state). Rejected claims use dismissedRejected instead.
  const [expandedLeague, setExpandedLeague] = useState<string | null>(null)
  // Rejected-claim leagues where the user has explicitly dismissed the auto-shown picker.
  const [dismissedRejected, setDismissedRejected] = useState<Set<string>>(new Set())
  const [claimSubmitting, setClaimSubmitting] = useState<string | null>(null)
  const [claimErrors, setClaimErrors] = useState<Record<string, string>>({})
  const [cancellingLeague, setCancellingLeague] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      setEmail(user.email ?? '')

      const [profileRes, membershipsRes, claimsRes] = await Promise.all([
        supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
        supabase.from('game_members').select('game_id, games(id, name)').eq('user_id', user.id),
        supabase.from('player_claims').select('*').eq('user_id', user.id),
      ])

      setDisplayName(profileRes.data?.display_name ?? '')

      const leagueList = (membershipsRes.data ?? [])
        .map((m) => {
          const game = m.games as unknown as { id: string; name: string } | null
          return { id: game?.id ?? '', name: game?.name ?? '' }
        })
        .filter((l) => l.id)
      setLeagues(leagueList)

      const claimMap: Record<string, PlayerClaim> = {}
      for (const c of (claimsRes.data ?? [])) {
        claimMap[c.game_id] = c as PlayerClaim
      }
      setClaims(claimMap)

      // Rejected claims auto-show the picker; no explicit expansion needed

      setLoading(false)
    }
    load()
  }, [])

  async function saveDisplayName(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      const { error: err } = await supabase
        .from('profiles')
        .update({ display_name: displayName.trim() })
        .eq('id', user.id)
      if (err) throw err
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleClaim(leagueId: string, playerName: string) {
    setClaimSubmitting(leagueId)
    setClaimErrors((prev) => ({ ...prev, [leagueId]: '' }))
    try {
      const res = await fetch(`/api/league/${leagueId}/player-claims`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_name: playerName }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to submit claim')
      }
      // Refresh to get the real claim row (needed for cancel)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase
          .from('player_claims')
          .select('*')
          .eq('game_id', leagueId)
          .eq('user_id', user.id)
          .maybeSingle()
        if (data) {
          setClaims((prev) => ({ ...prev, [leagueId]: data as PlayerClaim }))
        }
      }
      setExpandedLeague(null)
    } catch (err) {
      setClaimErrors((prev) => ({
        ...prev,
        [leagueId]: err instanceof Error ? err.message : 'Failed to submit',
      }))
    } finally {
      setClaimSubmitting(null)
    }
  }

  async function handleCancelClaim(leagueId: string) {
    const claim = claims[leagueId]
    if (!claim?.id) return
    setCancellingLeague(leagueId)
    try {
      const res = await fetch(`/api/league/${leagueId}/player-claims/${claim.id}`, {
        method: 'DELETE',
      })
      if (!res.ok && res.status !== 204) throw new Error('Failed to cancel claim')
      setClaims((prev) => {
        const next = { ...prev }
        delete next[leagueId]
        return next
      })
    } catch {
      // Cancellation errors are non-critical; silently retry is fine
    } finally {
      setCancellingLeague(null)
    }
  }

  if (loading) return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <p className="text-slate-400">Loading…</p>
    </div>
  )

  return (
    <main className="max-w-md mx-auto px-4 sm:px-6 py-8">

      {/* ── Account section ─────────────────────────────────────────────────── */}
      <h1 className="text-xl font-semibold text-slate-100 mb-6">Account</h1>

      <div className="p-4 rounded-lg bg-slate-800 border border-slate-700 mb-4">
        <p className="text-xs text-slate-500 mb-1">Email</p>
        <p className="text-sm text-slate-300">{email}</p>
      </div>

      <form onSubmit={saveDisplayName} className="space-y-4 mb-12">
        <div>
          <label htmlFor="displayName" className="block text-sm text-slate-400 mb-1">
            Display name
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100"
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className={cn(
            'px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50',
            saved ? 'bg-slate-700 text-sky-300' : 'bg-sky-600 hover:bg-sky-500 text-white'
          )}
        >
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save changes'}
        </button>
      </form>

      {/* ── League identity section ──────────────────────────────────────────── */}
      {leagues.length > 0 && (
        <>
          <h2 className="text-xl font-semibold text-slate-100 mb-6">League identity</h2>
          <div className="space-y-3">
            {leagues.map((league) => {
              const claim = claims[league.id]
              const status = claim?.status ?? null
              const isExpanded = expandedLeague === league.id
              const isSubmitting = claimSubmitting === league.id
              const isCancelling = cancellingLeague === league.id
              const effectiveName = claim?.admin_override_name ?? claim?.player_name

              return (
                <div
                  key={league.id}
                  className="rounded-lg bg-slate-800 border border-slate-700 overflow-hidden"
                >
                  {/* Row header */}
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-100 mb-1">{league.name}</p>

                      {/* Status indicator */}
                      {status === null && (
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0" />
                          <span className="text-xs text-slate-400">No player profile linked</span>
                        </div>
                      )}
                      {status === 'pending' && (
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                          <span className="text-xs text-slate-400">
                            Pending — claimed as{' '}
                            <span className="text-slate-300">{claim.player_name}</span>
                          </span>
                        </div>
                      )}
                      {status === 'approved' && (
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                          <span className="text-xs text-slate-400">
                            Linked as{' '}
                            <span className="text-slate-300">{effectiveName}</span>
                          </span>
                        </div>
                      )}
                      {status === 'rejected' && (
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                          <span className="text-xs text-slate-400">Claim not approved</span>
                        </div>
                      )}
                    </div>

                    {/* Action button */}
                    {status === null && !isExpanded && (
                      <button
                        type="button"
                        onClick={() => setExpandedLeague(league.id)}
                        className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition-colors shrink-0"
                      >
                        Claim profile
                      </button>
                    )}
                    {status === null && isExpanded && (
                      <button
                        type="button"
                        onClick={() => setExpandedLeague(null)}
                        className="px-3 py-1.5 rounded-lg border border-slate-600 text-slate-400 text-xs hover:border-slate-500 transition-colors shrink-0"
                      >
                        Cancel
                      </button>
                    )}
                    {status === 'pending' && (
                      <button
                        type="button"
                        disabled={isCancelling}
                        onClick={() => handleCancelClaim(league.id)}
                        className="px-3 py-1.5 rounded-lg border border-red-900/60 text-red-400 text-xs hover:border-red-800 disabled:opacity-50 transition-colors shrink-0"
                      >
                        {isCancelling ? 'Cancelling…' : 'Cancel claim'}
                      </button>
                    )}
                    {/* approved: no action */}
                    {/* rejected: no button — picker handles it */}
                  </div>

                  {/* Inline picker — shown when explicitly expanded (no-claim) or auto-shown for rejected */}
                  {(isExpanded || (status === 'rejected' && !dismissedRejected.has(league.id))) && (
                    <>
                      {claimErrors[league.id] && (
                        <p className="px-4 pb-2 text-xs text-red-400">{claimErrors[league.id]}</p>
                      )}
                      <PlayerClaimPicker
                        leagueId={league.id}
                        submitting={isSubmitting}
                        onClaim={(name) => handleClaim(league.id, name)}
                        onCancel={() => {
                          setExpandedLeague(null)
                          if (status === 'rejected') {
                            setDismissedRejected((prev) => new Set([...prev, league.id]))
                          }
                          setClaimErrors((prev) => ({ ...prev, [league.id]: '' }))
                        }}
                      />
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </main>
  )
}
