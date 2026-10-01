'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { SkeletonList } from '@/components/ui/skeleton'
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
    <div className="border-t border-[#1b2c46] p-4 bg-[#0c1728]">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search members…"
        className="w-full px-3 py-2 rounded-xl bg-[#0a1421] border border-[#1b2c46] text-[#f4f9ff] text-sm placeholder:text-[#4f688a] outline-none focus:border-[#2c4a72] mb-3"
      />

      {loading ? (
        <SkeletonList rows={4} className="mb-3" />
      ) :  loadError ? (
        <p className="text-sm text-[#e2686f] mb-3">Failed to load members.</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[#6f88a8] mb-3">
          {search ? 'No members match that search.' : 'All members are already linked to a player.'}
        </p>
      ) : (
        <div className="max-h-40 overflow-y-auto rounded-lg border border-[#1b2c46] mb-3">
          {filtered.map((m) => {
            const label = m.display_name || m.email
            return (
              <button
                key={m.user_id}
                type="button"
                disabled={submitting}
                onClick={() => onLink(m.user_id, label)}
                className={cn(
                  'w-full text-left px-3 py-2 text-sm border-b border-[#17263c] last:border-0 transition-colors',
                  'text-[#cfe0f4] hover:bg-[#0a1421] disabled:opacity-50 disabled:cursor-not-allowed'
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
          className="px-3 py-1.5 rounded-lg border border-[#1b2c46] text-[#8ba4c4] text-sm hover:border-[#223a5c] transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>

      <p className="text-xs text-[#6f88a8] leading-relaxed">
        Only members without a linked player are shown.
      </p>
    </div>
  )
}
