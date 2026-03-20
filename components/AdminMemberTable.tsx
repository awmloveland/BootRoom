'use client'

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LeagueMember, GameRole } from '@/lib/types'

interface AdminMemberTableProps {
  leagueId: string
  members: LeagueMember[]
  onChanged: () => void
}

const ROLE_BADGE: Record<GameRole, string> = {
  creator: 'bg-amber-900/50 text-amber-300 border-amber-700',
  admin:   'bg-sky-900/50 text-sky-300 border-sky-700',
  member:  'bg-slate-700 text-slate-300 border-slate-600',
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

  const confirmName = confirmRemove?.display_name || confirmRemove?.email || 'this member'

  return (
    <>
      <div className="space-y-2">
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="rounded-lg border border-slate-700 overflow-hidden">
          {members.map((member, i) => {
            const isLocked = member.role === 'creator'
            return (
              <div
                key={member.user_id}
                className={cn(
                  'flex items-center justify-between px-4 py-3 gap-3',
                  i > 0 && 'border-t border-slate-700/60'
                )}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">
                    {member.display_name || member.email}
                  </p>
                  {member.display_name && (
                    <p className="text-xs text-slate-500 truncate">{member.email}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isLocked && (
                    <span className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
                      ROLE_BADGE[member.role]
                    )}>
                      {ROLE_LABEL[member.role]}
                    </span>
                  )}
                  {!isLocked && (
                    <>
                      <div className="flex rounded-md border border-slate-600 overflow-hidden text-xs">
                        {(['member', 'admin'] as const).map((r) => (
                          <button
                            key={r}
                            onClick={() => member.role !== r && setRole(member.user_id, r)}
                            disabled={!!busy || member.role === r}
                            className={cn(
                              'px-2.5 py-1 font-medium transition-colors capitalize',
                              member.role === r
                                ? 'bg-sky-600 text-white cursor-default'
                                : 'bg-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                            )}
                          >
                            {busy === `role-${member.user_id}` && member.role !== r ? '…' : r.charAt(0).toUpperCase() + r.slice(1)}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => setConfirmRemove(member)}
                        disabled={!!busy}
                        className="ml-2 text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-slate-600">
          {members.length} member{members.length !== 1 ? 's' : ''} total
        </p>
      </div>

      {/* Remove member confirmation modal */}
      <Dialog.Root
        open={!!confirmRemove}
        onOpenChange={(open) => { if (!open) setConfirmRemove(null) }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/70 z-[999]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] w-full max-w-sm rounded-xl bg-slate-800 border border-slate-700 p-6 shadow-xl focus:outline-none">
            <Dialog.Title className="text-lg font-semibold text-slate-100 mb-3">
              Remove member?
            </Dialog.Title>
            <Dialog.Description className="text-sm text-slate-300 leading-relaxed mb-6">
              <span className="text-slate-100 font-medium">{confirmName}</span> will lose access to this league immediately.
            </Dialog.Description>
            <div className="flex gap-2 justify-end">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-4 py-2 rounded border border-slate-600 text-slate-300 text-sm hover:border-slate-500 transition-colors"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={confirmAndRemove}
                className="px-4 py-2 rounded bg-red-900 hover:bg-red-800 border border-red-700 text-red-200 text-sm font-medium transition-colors"
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
