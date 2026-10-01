'use client'

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import PlayerClaimPicker from '@/components/PlayerClaimPicker'
import type { LeagueMember, GameRole } from '@/lib/types'

interface AdminMemberTableProps {
  leagueId: string
  members: LeagueMember[]
  onChanged: () => void
}

const ROLE_LABEL: Record<GameRole, string> = {
  creator: 'Creator',
  admin:   'Admin',
  member:  'Member',
}

export function AdminMemberTable({ leagueId, members, onChanged }: AdminMemberTableProps) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<LeagueMember | null>(null)
  const [linkingUserId, setLinkingUserId] = useState<string | null>(null)
  const [assignSubmitting, setAssignSubmitting] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)

  async function setRole(userId: string, role: 'admin' | 'member') {
    setBusy(`role-${userId}`)
    setError(null)
    try {
      const res = await fetch(`/api/league/${leagueId}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_role', user_id: userId, role }),
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to update role')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(null)
    }
  }

  async function confirmAndRemove() {
    if (!confirmRemove) return
    const userId = confirmRemove.user_id
    setConfirmRemove(null)
    setBusy(`remove-${userId}`)
    setError(null)
    try {
      const res = await fetch(`/api/league/${leagueId}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', user_id: userId }),
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to remove member')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(null)
    }
  }

  async function assignPlayer(userId: string, playerName: string) {
    setAssignSubmitting(true)
    setAssignError(null)
    try {
      const res = await fetch(`/api/league/${leagueId}/player-claims/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, player_name: playerName }),
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to assign player')
      setLinkingUserId(null)
      onChanged()
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setAssignSubmitting(false)
    }
  }

  const confirmName = confirmRemove?.display_name || confirmRemove?.email || 'this member'

  return (
    <>
      <div>
        {error && <p className="mb-2 font-inter-body text-xs text-[#e2686f]">{error}</p>}
        <div className="rounded-xl border border-[#1b2c46] bg-[#0a1421] overflow-hidden shadow-[0_18px_44px_rgba(0,0,0,.42)]">
          {members.map((member, i) => {
            const isLocked = member.role === 'creator'
            const linkedName = member.linked_player_name
            const isLinking = linkingUserId === member.user_id
            return (
              <div
                key={member.user_id}
                className={cn(i > 0 && 'border-t border-[#17263c]')}
              >
                <div className="flex flex-wrap items-center justify-between px-[18px] py-3 gap-x-3 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-inter-body text-[13px] font-semibold text-[#f4f9ff] truncate">
                      {member.display_name || member.email}
                    </p>
                    {member.display_name && (
                      <p className="mt-0.5 font-plex text-[9.5px] tracking-[.06em] text-[#6f88a8] truncate">{member.email}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Player identity badge / link button */}
                    {linkedName ? (
                      <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded border border-[#bef264]/35 bg-[#bef264]/8 font-plex text-[8.5px] font-bold tracking-[.12em] text-[#bef264] whitespace-nowrap">
                        <span className="size-[5px] rounded-full bg-[#bef264] shrink-0" />
                        <span className="uppercase">Linked</span> · {linkedName}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setLinkingUserId(isLinking ? null : member.user_id)}
                        className="h-6 px-2 rounded border border-dashed border-[#223a5c] font-plex text-[8.5px] font-bold uppercase tracking-[.12em] text-[#6f88a8] hover:border-[#38bdf8] hover:text-white transition-colors"
                      >
                        + Link player
                      </button>
                    )}

                    {isLocked && (
                      <span className="inline-flex items-center h-6 px-2 rounded border border-[#bef264]/35 font-plex text-[8.5px] font-bold uppercase tracking-[.14em] text-[#bef264]">
                        {ROLE_LABEL[member.role]}
                      </span>
                    )}
                    {!isLocked && (
                      <>
                        <div className="inline-flex rounded border border-[#223a5c] overflow-hidden divide-x divide-[#223a5c]">
                          {(['member', 'admin'] as const).map((r) => (
                            <button
                              key={r}
                              onClick={() => member.role !== r && setRole(member.user_id, r)}
                              disabled={!!busy || member.role === r}
                              className={cn(
                                'h-6 px-[9px] font-plex text-[8.5px] font-bold uppercase tracking-[.14em] transition-colors',
                                member.role === r
                                  ? 'bg-[#38bdf8] text-[#05101d] cursor-default'
                                  : 'bg-transparent text-[#8ba4c4] hover:text-white'
                              )}
                            >
                              {busy === `role-${member.user_id}` && member.role !== r ? '…' : r.charAt(0).toUpperCase() + r.slice(1)}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => setConfirmRemove(member)}
                          disabled={!!busy}
                          aria-label="Remove member"
                          className="ml-1 inline-flex size-6 items-center justify-center text-[#e2686f] hover:text-[#f09aa0] disabled:opacity-50 transition-colors"
                        >
                          <Trash2 className="size-[13px]" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Inline player link picker */}
                {isLinking && (
                  <>
                    <PlayerClaimPicker
                      leagueId={leagueId}
                      submitting={assignSubmitting}
                      footerText="Select the player name to link to this member's account."
                      onClaim={(playerName) => assignPlayer(member.user_id, playerName)}
                      onCancel={() => { setLinkingUserId(null); setAssignError(null) }}
                    />
                    {assignError && (
                      <p className="px-[18px] pb-3 font-inter-body text-xs text-[#e2686f]">{assignError}</p>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
        <p className="mt-2.5 font-plex text-[9px] uppercase tracking-[.14em] text-[#4f688a]">
          {members.length} member{members.length !== 1 ? 's' : ''} total
        </p>
      </div>

      {/* Remove member confirmation modal */}
      <Dialog.Root
        open={!!confirmRemove}
        onOpenChange={(open) => { if (!open) setConfirmRemove(null) }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-[#030710]/80 z-[999]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] w-full max-w-[calc(100%-32px)] sm:max-w-sm rounded-[14px] bg-[#0a1421] border border-[#1b2c46] p-5 shadow-[0_34px_80px_rgba(0,0,0,.65)] focus:outline-none">
            <Dialog.Title className="text-base font-bold tracking-[-.02em] text-[#f4f9ff] mb-2.5">
              Remove member?
            </Dialog.Title>
            <Dialog.Description className="font-inter-body text-[13px] leading-[1.55] text-[#8ba4c4] mb-5">
              <span className="text-[#f4f9ff] font-semibold">{confirmName}</span> will lose access to this league immediately.
            </Dialog.Description>
            <div className="flex gap-2 justify-end">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="h-9 px-3.5 rounded border border-[#223a5c] text-[#cfe0f4] text-[13px] font-semibold hover:border-[#38bdf8] hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={confirmAndRemove}
                className="h-9 px-4 rounded border border-[#e2686f]/40 text-[#e2686f] text-[13px] font-bold hover:bg-[#e2686f]/10 transition-colors"
              >
                Remove
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
