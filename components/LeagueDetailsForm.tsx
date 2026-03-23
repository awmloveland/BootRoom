'use client'

import { useState } from 'react'
import { LeagueInfoBar } from '@/components/LeagueInfoBar'
import { cn } from '@/lib/utils'
import type { LeagueDetails } from '@/lib/types'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

interface LeagueDetailsFormProps {
  leagueId: string
  initialDetails: LeagueDetails
  playerCount: number
}

export function LeagueDetailsForm({
  leagueId,
  initialDetails,
  playerCount,
}: LeagueDetailsFormProps) {
  const [location, setLocation] = useState(initialDetails.location ?? '')
  const [day, setDay] = useState(initialDetails.day ?? '')
  const [kickoffTime, setKickoffTime] = useState(initialDetails.kickoff_time ?? '')
  const [bio, setBio] = useState(initialDetails.bio ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const previewDetails: LeagueDetails = {
    location: location || null,
    day: day || null,
    kickoff_time: kickoffTime || null,
    bio: bio || null,
    player_count: playerCount,
  }

  function markDirty() {
    setSaved(false)
    setError(null)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/league/${leagueId}/details`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: location || null,
          day: day || null,
          kickoff_time: kickoffTime || null,
          bio: bio || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Failed to save')
      } else {
        setSaved(true)
      }
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Preview */}
      <LeagueInfoBar details={previewDetails} leagueId={leagueId} isAdmin={false} />

      {/* Card */}
      <div className="rounded-lg border border-slate-700 bg-slate-800">
        {/* Card header */}
        <div className="border-b border-slate-700 px-4 py-3">
          <h3 className="text-sm font-medium text-slate-100">League details</h3>
          <p className="text-xs text-slate-400 mt-0.5">Visible to all members and the public.</p>
        </div>

        {/* Fields */}
        <div className="space-y-4 p-4">
          {/* Location */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              Location
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => { setLocation(e.target.value); markDirty() }}
              placeholder="e.g. Hackney Marshes"
              className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
          </div>

          {/* Day + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                Day
              </label>
              <select
                value={day}
                onChange={(e) => { setDay(e.target.value); markDirty() }}
                className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400"
              >
                <option value="">Select day</option>
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                Kick-off time
              </label>
              <input
                type="text"
                value={kickoffTime}
                onChange={(e) => { setKickoffTime(e.target.value); markDirty() }}
                placeholder="e.g. 7:30pm"
                className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>
          </div>

          {/* Players (read-only) */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              Players in league
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400">{playerCount} players</span>
              <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-400">auto</span>
            </div>
            <p className="text-xs text-slate-600">Counted automatically from the Players tab.</p>
          </div>

          {/* Bio */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              Bio
            </label>
            <textarea
              value={bio}
              onChange={(e) => { setBio(e.target.value); markDirty() }}
              placeholder="A short description of your league..."
              rows={3}
              className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-slate-400 resize-none"
            />
            <p className="text-xs text-slate-600">Keep it short — one or two sentences works best.</p>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        {/* Footer with full-width button */}
        <div className="border-t border-slate-700 p-4">
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className={cn(
              'w-full rounded-md px-4 py-2 text-sm font-medium transition-colors',
              saved
                ? 'bg-slate-700 text-slate-300 cursor-default'
                : 'bg-slate-100 text-slate-900 hover:bg-white disabled:opacity-50'
            )}
          >
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save details'}
          </button>
        </div>
      </div>
    </div>
  )
}
