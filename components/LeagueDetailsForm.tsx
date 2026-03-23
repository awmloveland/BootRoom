'use client'

import { useState } from 'react'
import LeagueInfoBar from '@/components/LeagueInfoBar'
import type { LeagueDetails } from '@/lib/types'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const TIMES = ['5:00pm', '5:30pm', '6:00pm', '6:30pm', '7:00pm', '7:30pm', '8:00pm', '8:30pm', '9:00pm']

interface LeagueDetailsFormProps {
  leagueId: string
  initialDetails: LeagueDetails
  playerCount: number
}

export default function LeagueDetailsForm({
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
  const [success, setSuccess] = useState(false)

  const previewDetails: LeagueDetails = {
    location: location || null,
    day: day || null,
    kickoff_time: kickoffTime || null,
    bio: bio || null,
    player_count: playerCount,
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSuccess(false)
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
        setSuccess(true)
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
              onChange={(e) => setLocation(e.target.value)}
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
                onChange={(e) => setDay(e.target.value)}
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
              <select
                value={kickoffTime}
                onChange={(e) => setKickoffTime(e.target.value)}
                className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400"
              >
                <option value="">Select time</option>
                {TIMES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Players (read-only) */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              Players in league
            </label>
            <p className="text-sm text-slate-500">{playerCount} players registered</p>
          </div>

          {/* Bio */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              Bio
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="A short description of your league..."
              rows={3}
              className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-slate-400 resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
          {success && <p className="text-sm text-slate-400">Saved.</p>}
        </div>

        {/* Footer with full-width button */}
        <div className="border-t border-slate-700 p-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-white disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save details'}
          </button>
        </div>
      </div>
    </div>
  )
}
