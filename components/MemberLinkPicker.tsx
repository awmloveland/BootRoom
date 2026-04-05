'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { LeagueMember } from '@/lib/types'

interface Props {
  leagueId: string
  onLink: (userId: string, displayName: string) => void
  onCancel: () => void
  submitting?: boolean
}

export default function MemberLinkPicker({ leagueId, onLink, onCancel, submitting = false }: Props) {
  const [members, setMembers] = useState<LeagueMember[]>([])
  const [loadError, setLoadError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch(`/api/league/${leagueId}/members`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load')
        return r.json()
      })
      .then((data) => {
        const list: LeagueMember[] = Array.isArray(data) ? data : []
        setMembers(list.filter((m) => !m.linked_player_name))
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [leagueId])

  const filtered = search
    ? members.filter((m) => {
        const label = (m.display_name || m.email) ?? ''
        return label.toLowerCase().includes(search.toLowerCase())
      })
    : members

  return (
    <div className="border-t border-slate-700 p-4 bg-slate-900/40">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search members…"
        className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm placeholder:text-slate-500 outline-none focus:border-slate-500 mb-3"
      />

      {loading ? (
        <p className="text-sm text-slate-500 mb-3">Loading…</p>
      ) : loadError ? (
        <p className="text-sm text-red-400 mb-3">Failed to load members.</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-slate-500 mb-3">
          {search ? 'No members match that search.' : 'All members are already linked to a player.'}
        </p>
      ) : (
        <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-700 mb-3">
          {filtered.map((m) => {
            const label = m.display_name || m.email
            return (
              <button
                key={m.user_id}
                type="button"
                disabled={submitting}
                onClick={() => onLink(m.user_id, label)}
                className={cn(
                  'w-full text-left px-3 py-2 text-sm border-b border-slate-800 last:border-0 transition-colors',
                  'text-slate-300 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 text-sm hover:border-slate-600 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">
        Only members without a linked player are shown.
      </p>
    </div>
  )
}
