'use client'

import { useState } from 'react'
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

  async function removeMember(userId: string) {
    if (!confirm('Remove this member from the league?')) return
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

  return (
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
                      onClick={() => removeMember(member.user_id)}
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
  )
}
