'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Check, Copy, Link as LinkIcon, Users, Settings2 } from 'lucide-react'
import { fetchGames } from '@/lib/data'
import { AdminMemberTable } from '@/components/AdminMemberTable'
import { AdminFeaturePanel } from '@/components/AdminFeaturePanel'
import { cn } from '@/lib/utils'
import type { LeagueMember, LeagueFeature } from '@/lib/types'

type Section = 'links' | 'members' | 'features'

export default function LeagueSettingsPage() {
  const params = useParams()
  const router = useRouter()
  const leagueId = params?.id as string

  const [section, setSection] = useState<Section>('links')
  const [leagueName, setLeagueName] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  // Links state
  const [publicEnabled, setPublicEnabled] = useState(false)
  const [publicToggling, setPublicToggling] = useState(false)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [copiedPublic, setCopiedPublic] = useState(false)
  const [copiedInvite, setCopiedInvite] = useState(false)

  // Members state
  const [members, setMembers] = useState<LeagueMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)

  // Features state
  const [features, setFeatures] = useState<LeagueFeature[]>([])
  const [featuresLoading, setFeaturesLoading] = useState(false)

  useEffect(() => {
    async function init() {
      try {
        const games = await fetchGames()
        const game = games.find((g) => g.id === leagueId)
        if (!game) { router.replace('/'); return }
        setLeagueName(game.name)
        const adminRoles = ['creator', 'admin']
        if (!adminRoles.includes(game.role)) {
          router.replace(`/league/${leagueId}`)
          return
        }
        setIsAdmin(true)

        // Load public status
        const pubRes = await fetch(`/api/league/${leagueId}/public`)
        const pubData = await pubRes.json()
        setPublicEnabled(pubData.public_results_enabled ?? false)
      } catch {
        router.replace('/')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [leagueId, router])

  const loadMembers = useCallback(async () => {
    setMembersLoading(true)
    try {
      const res = await fetch(`/api/league/${leagueId}/members`, { credentials: 'include' })
      const data = await res.json()
      setMembers(Array.isArray(data) ? data : [])
    } catch {
      setMembers([])
    } finally {
      setMembersLoading(false)
    }
  }, [leagueId])

  const loadFeatures = useCallback(async () => {
    setFeaturesLoading(true)
    try {
      const res = await fetch(`/api/league/${leagueId}/features`, { credentials: 'include' })
      const data = await res.json()
      setFeatures(Array.isArray(data) ? data : [])
    } catch {
      setFeatures([])
    } finally {
      setFeaturesLoading(false)
    }
  }, [leagueId])

  useEffect(() => {
    if (!isAdmin) return
    if (section === 'members') loadMembers()
    if (section === 'features') loadFeatures()
  }, [section, isAdmin, loadMembers, loadFeatures])

  async function togglePublicResults() {
    setPublicToggling(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { error } = await supabase
        .from('games')
        .update({ public_results_enabled: !publicEnabled })
        .eq('id', leagueId)
      if (!error) setPublicEnabled((v) => !v)
    } finally {
      setPublicToggling(false)
    }
  }

  async function generateInviteLink() {
    setInviteLoading(true)
    setInviteError(null)
    try {
      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: leagueId }),
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create invite')
      setInviteLink(data.link)
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setInviteLoading(false)
    }
  }

  async function copy(text: string, which: 'public' | 'invite') {
    await navigator.clipboard.writeText(text)
    if (which === 'public') {
      setCopiedPublic(true)
      setTimeout(() => setCopiedPublic(false), 2000)
    } else {
      setCopiedInvite(true)
      setTimeout(() => setCopiedInvite(false), 2000)
    }
  }

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <p className="text-slate-400">Loading…</p>
      </div>
    )
  }

  const publicUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/results/${leagueId}`
    : `/results/${leagueId}`

  const NAV: { id: Section; label: string; icon: React.ReactNode }[] = [
    { id: 'links',    label: 'Links',    icon: <LinkIcon className="size-4" /> },
    { id: 'members',  label: 'Members',  icon: <Users className="size-4" /> },
    { id: 'features', label: 'Features', icon: <Settings2 className="size-4" /> },
  ]

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-100">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">{leagueName}</p>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-700">
        {NAV.map((nav) => (
          <button
            key={nav.id}
            onClick={() => setSection(nav.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              section === nav.id
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            )}
          >
            {nav.icon}
            {nav.label}
          </button>
        ))}
      </div>

      {/* ── LINKS ── */}
      {section === 'links' && (
        <div className="space-y-4">

          {/* Public results link */}
          <div className="p-4 rounded-lg bg-slate-800 border border-slate-700">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <p className="text-sm font-medium text-slate-200">Public Results Page</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Anyone with this link can view match results without signing in.
                  {publicEnabled && ' People who sign up via this link will join as members.'}
                </p>
              </div>
              <button
                onClick={togglePublicResults}
                disabled={publicToggling}
                className={cn(
                  'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-50',
                  publicEnabled ? 'bg-sky-600' : 'bg-slate-600'
                )}
                role="switch"
                aria-checked={publicEnabled}
              >
                <span
                  className={cn(
                    'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200',
                    publicEnabled ? 'translate-x-4' : 'translate-x-0'
                  )}
                />
              </button>
            </div>

            {publicEnabled && (
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs text-slate-300 bg-slate-900 rounded px-2 py-1.5 truncate">
                  {publicUrl}
                </code>
                <button
                  onClick={() => copy(publicUrl, 'public')}
                  className="flex items-center gap-1.5 text-xs font-medium text-sky-400 hover:text-sky-300 transition-colors shrink-0"
                >
                  {copiedPublic ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  {copiedPublic ? 'Copied' : 'Copy'}
                </button>
              </div>
            )}
          </div>

          {/* Invite link */}
          <div className="p-4 rounded-lg bg-slate-800 border border-slate-700">
            <div className="mb-3">
              <p className="text-sm font-medium text-slate-200">Admin Invite Link</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Share with people you want to give admin access. Valid for 7 days.
              </p>
            </div>

            {inviteError && <p className="text-sm text-red-400 mb-2">{inviteError}</p>}

            {inviteLink ? (
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs text-slate-300 bg-slate-900 rounded px-2 py-1.5 truncate">
                  {inviteLink}
                </code>
                <button
                  onClick={() => copy(inviteLink, 'invite')}
                  className="flex items-center gap-1.5 text-xs font-medium text-sky-400 hover:text-sky-300 transition-colors shrink-0"
                >
                  {copiedInvite ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  {copiedInvite ? 'Copied' : 'Copy'}
                </button>
              </div>
            ) : (
              <button
                onClick={generateInviteLink}
                disabled={inviteLoading}
                className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {inviteLoading ? 'Generating…' : 'Generate invite link'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── MEMBERS ── */}
      {section === 'members' && (
        <div>
          {membersLoading ? (
            <p className="text-slate-400 text-sm">Loading members…</p>
          ) : (
            <AdminMemberTable
              leagueId={leagueId}
              members={members}
              onChanged={loadMembers}
            />
          )}
        </div>
      )}

      {/* ── FEATURES ── */}
      {section === 'features' && (
        <div>
          {featuresLoading && features.length === 0 ? (
            <p className="text-slate-400 text-sm">Loading features…</p>
          ) : (
            <AdminFeaturePanel
              leagueId={leagueId}
              features={features}
              onChanged={loadFeatures}
            />
          )}
        </div>
      )}
    </main>
  )
}
