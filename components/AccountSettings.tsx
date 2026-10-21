'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import PlayerClaimPicker from '@/components/PlayerClaimPicker'
import type { AccountData } from '@/lib/fetchers'

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })} ${d.getFullYear()}`
}

function AccountHeader({ onBack }: { onBack: () => void }) {
  return (
    <div className="mb-6">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-[#8ba4c4] hover:text-[#dff1ff] transition-colors mb-3"
      >
        <ArrowLeft className="size-4" />
        Back
      </button>
      <h1 className="text-xl font-semibold text-[#f4f9ff]">Account</h1>
    </div>
  )
}

/**
 * The account page body. Profile fields are local state so typing is
 * immediate; leagues and claims come straight from the server and refresh
 * through router.refresh() after a claim is made or cancelled.
 */
export function AccountSettings({ account }: { account: AccountData }) {
  const router = useRouter()
  const { email, createdAt, leagues, claims } = account

  const [firstName, setFirstName] = useState(account.firstName)
  const [lastName, setLastName] = useState(account.lastName)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Which league's picker is open (no-claim state). Rejected claims use dismissedRejected instead.
  const [expandedLeague, setExpandedLeague] = useState<string | null>(null)
  // Rejected-claim leagues where the user has explicitly dismissed the auto-shown picker.
  const [dismissedRejected, setDismissedRejected] = useState<Set<string>>(new Set())
  const [claimSubmitting, setClaimSubmitting] = useState<string | null>(null)
  const [claimErrors, setClaimErrors] = useState<Record<string, string>>({})
  const [cancellingLeague, setCancellingLeague] = useState<string | null>(null)

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to save')
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteAccount() {
    setDeleting(true)
    try {
      const res = await fetch('/api/auth/account', { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to delete account')
      }
      window.location.href = '/sign-in'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete account')
      setDeleting(false)
      setConfirmDelete(false)
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
      setExpandedLeague(null)
      // The server page re-reads the claim row, which the Cancel button needs.
      router.refresh()
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
      const res = await fetch(`/api/league/${leagueId}/player-claims/${claim.id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) throw new Error('Failed to cancel claim')
      router.refresh()
    } catch {
      // Cancellation errors are non-critical; the user can retry.
    } finally {
      setCancellingLeague(null)
    }
  }

  return (
    <main className="max-w-xl mx-auto px-4 sm:px-6 py-8">
      <AccountHeader onBack={() => router.back()} />

      {/* ── Account info card (read-only) ──────────────────────────────── */}
      <div className="rounded-xl bg-[#0a1421] border border-[#1b2c46] overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-[#1b2c46]">
          <p className="text-sm font-medium text-[#dff1ff]">Account info</p>
        </div>
        <div className="divide-y divide-[#1b2c46]">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-[#6f88a8]">Email</p>
              <p className="text-sm text-[#cfe0f4]">{email}</p>
            </div>
            <p className="text-xs text-[#4f688a]">To change your email, contact your league admin.</p>
          </div>
          {createdAt && (
            <div className="px-4 py-3 flex items-center justify-between">
              <p className="text-xs text-[#6f88a8]">Member since</p>
              <p className="text-sm text-[#cfe0f4]">{formatDate(createdAt)}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Profile card (editable) ─────────────────────────────────────── */}
      <div className="rounded-xl bg-[#0a1421] border border-[#1b2c46] overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-[#1b2c46]">
          <p className="text-sm font-medium text-[#dff1ff]">Profile</p>
        </div>
        <form onSubmit={saveProfile} className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="firstName" className="block text-xs text-[#8ba4c4] mb-1.5">
                First name
              </label>
              <input
                id="firstName"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Alex"
                className="w-full px-3 py-2 rounded bg-[#0c1728] border border-[#1b2c46] text-[#f4f9ff] text-sm focus:outline-none focus:ring-0 focus:border-[#38bdf8]"
              />
            </div>
            <div>
              <label htmlFor="lastName" className="block text-xs text-[#8ba4c4] mb-1.5">
                Last name
              </label>
              <input
                id="lastName"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Smith"
                className="w-full px-3 py-2 rounded bg-[#0c1728] border border-[#1b2c46] text-[#f4f9ff] text-sm focus:outline-none focus:ring-0 focus:border-[#38bdf8]"
              />
            </div>
          </div>
          {error && <p className="text-sm text-[#e2686f]">{error}</p>}
          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={saving}
              className={cn(
                'px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50',
                saved ? 'bg-[#1b2c46] text-[#7dd3fc]' : 'bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d]'
              )}
            >
              {saving ? 'Saving…' : saved ? 'Saved' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>

      {/* ── League identity section ──────────────────────────────────────── */}
      {leagues.length > 0 && (
        <>
          <h2 className="text-xl font-semibold text-[#f4f9ff] mb-4">Linked Leagues</h2>
          <div className="space-y-3 mb-12">
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
                  className="rounded-xl bg-[#0a1421] border border-[#1b2c46] overflow-hidden"
                >
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-[#f4f9ff] mb-1">{league.name}</p>
                      {status === null && (
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#2c4a72] shrink-0" />
                          <span className="text-xs text-[#8ba4c4]">No player profile linked</span>
                        </div>
                      )}
                      {status === 'pending' && (
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#f5c04a] shrink-0" />
                          <span className="text-xs text-[#8ba4c4]">
                            Pending, claimed as{' '}
                            <span className="text-[#cfe0f4]">{claim.player_name}</span>
                          </span>
                        </div>
                      )}
                      {status === 'approved' && (
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#bef264] shrink-0" />
                          <span className="text-xs text-[#8ba4c4]">
                            Linked as{' '}
                            <span className="text-[#cfe0f4]">{effectiveName}</span>
                          </span>
                        </div>
                      )}
                      {status === 'rejected' && (
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#e2686f] shrink-0" />
                          <span className="text-xs text-[#8ba4c4]">Claim not approved</span>
                        </div>
                      )}
                    </div>
                    {status === null && !isExpanded && (
                      <button
                        type="button"
                        onClick={() => setExpandedLeague(league.id)}
                        className="px-3 py-1.5 rounded bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] text-xs font-bold transition-colors shrink-0"
                      >
                        Claim profile
                      </button>
                    )}
                    {status === null && isExpanded && (
                      <button
                        type="button"
                        onClick={() => setExpandedLeague(null)}
                        className="px-3 py-1.5 rounded-lg border border-[#223a5c] text-[#8ba4c4] text-xs hover:border-[#2c4a72] transition-colors shrink-0"
                      >
                        Cancel
                      </button>
                    )}
                    {status === 'pending' && (
                      <button
                        type="button"
                        disabled={isCancelling}
                        onClick={() => handleCancelClaim(league.id)}
                        className="px-3 py-1.5 rounded-lg border border-[#e2686f]/40 text-[#e2686f] text-xs hover:border-[#e2686f]/40 disabled:opacity-50 transition-colors shrink-0"
                      >
                        {isCancelling ? 'Cancelling…' : 'Cancel claim'}
                      </button>
                    )}
                  </div>
                  {(isExpanded || (status === 'rejected' && !dismissedRejected.has(league.id))) && (
                    <>
                      {claimErrors[league.id] && (
                        <p className="px-4 pb-2 text-xs text-[#e2686f]">{claimErrors[league.id]}</p>
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

      {/* ── Danger zone ──────────────────────────────────────────────────── */}
      <h2 className="text-xl font-semibold text-[#f4f9ff] mb-4">Danger zone</h2>
      <div className="rounded-xl bg-[#0a1421] border border-[#1b2c46] overflow-hidden mb-8">
        <div className="px-4 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-[#cfe0f4]">Delete account</p>
            <p className="text-xs text-[#6f88a8] mt-0.5">
              Permanently removes your account and all associated data. This cannot be undone.
            </p>
          </div>
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="px-3 py-1.5 rounded-lg border border-[#e2686f]/40 text-[#e2686f] text-xs font-medium hover:bg-[#e2686f]/20 transition-colors shrink-0"
            >
              Delete account
            </button>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="px-3 py-1.5 rounded-lg border border-[#223a5c] text-[#8ba4c4] text-xs hover:border-[#2c4a72] disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="px-3 py-1.5 rounded-lg bg-[#e2686f]/10 hover:bg-[#e2686f]/20 text-[#e2686f] text-xs font-medium disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
