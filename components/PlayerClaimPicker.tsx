'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

const SETTINGS_FOOTER =
  "Can't find your name? Ask your league admin to add you as a player first, then come back here to link your account."

interface Props {
  leagueId: string
  onClaim: (playerName: string) => void
  onCancel: () => void
  /** Override the footer copy — defaults to the settings-page version. */
  footerText?: string
  submitting?: boolean
  /**
   * When true, clicking a name in the list calls onClaim immediately.
   * The Submit button is hidden; Cancel is still shown.
   * Used in the join dialog where submission happens via the parent form.
   */
  selectionOnly?: boolean
}

export default function PlayerClaimPicker({
  leagueId,
  onClaim,
  onCancel,
  footerText = SETTINGS_FOOTER,
  submitting = false,
  selectionOnly = false,
}: Props) {
  const [players, setPlayers] = useState<string[]>([])
  const [loadError, setLoadError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/league/${leagueId}/player-claims`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load')
        return r.json()
      })
      .then((data) => setPlayers(data.players ?? []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [leagueId])

  const filtered = search
    ? players.filter((p) => p.toLowerCase().includes(search.toLowerCase()))
    : players

  return (
    <div className="border-t border-slate-700 p-4 bg-slate-900/40">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search player names…"
        className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm placeholder:text-slate-500 outline-none focus:border-slate-500 mb-3"
      />

      {loading ? (
        <p className="text-sm text-slate-500 mb-3">Loading…</p>
      ) : loadError ? (
        <p className="text-sm text-red-400 mb-3">Failed to load player names.</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-slate-500 mb-3">
          {search ? 'No players match that search.' : 'No unclaimed players found.'}
        </p>
      ) : (
        <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-700 mb-3">
          {filtered.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => selectionOnly ? onClaim(name) : setSelected(name)}
              className={cn(
                'w-full text-left px-3 py-2 text-sm border-b border-slate-800 last:border-0 transition-colors',
                selected === name
                  ? 'bg-sky-900/40 text-sky-300'
                  : 'text-slate-300 hover:bg-slate-800'
              )}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 mb-3">
        {!selectionOnly && (
          <button
            type="button"
            disabled={!selected || submitting}
            onClick={() => selected && onClaim(selected)}
            className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Submitting…' : 'Submit claim'}
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 text-sm hover:border-slate-600 transition-colors"
        >
          Cancel
        </button>
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">{footerText}</p>
    </div>
  )
}
