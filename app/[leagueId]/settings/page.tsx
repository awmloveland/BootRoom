'use client'

import { Suspense, useEffect, useState, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Check, Copy, Info, RefreshCw, Settings2, Users } from 'lucide-react'
import { fetchGames } from '@/lib/data'
import { AdminMemberTable } from '@/components/AdminMemberTable'
import { FeaturePanel } from '@/components/FeaturePanel'
import { LeagueDetailsForm } from '@/components/LeagueDetailsForm'
import { cn } from '@/lib/utils'
import type { LeagueMember, LeagueFeature, LeagueDetails } from '@/lib/types'

type Section = 'details' | 'members' | 'features'

function TabInitialiser({ onTab }: { onTab: (tab: Section) => void }) {
  const searchParams = useSearchParams()
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab === 'details' || tab === 'members' || tab === 'features') {
      onTab(tab)
    }
  }, [searchParams, onTab])
  return null
}

function formatExpiry(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `Expires ${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })} ${d.getFullYear()}`
}

export default function LeagueSettingsPage() {
  const params = useParams()
  const router = useRouter()
  const leagueId = (params?.leagueId as string) ?? ''

  const [section, setSection] = useState<Section>('details')
  const [leagueName, setLeagueName] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  // League details state
  const [leagueDetails, setLeagueDetails] = useState<LeagueDetails | null>(null)
  const [playerCount, setPlayerCount] = useState(0)
  const [detailsLoading, setDetailsLoading] = useState(false)

  // Members state
  const [members, setMembers] = useState<LeagueMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)

  // Invite links state
  const [memberLink, setMemberLink] = useState<string | null>(null)
  const [adminLink, setAdminLink] = useState<string | null>(null)
  const [memberExpiry, setMemberExpiry] = useState<string | null>(null)
  const [adminExpiry, setAdminExpiry] = useState<string | null>(null)
  const [loadingRole, setLoadingRole] = useState<'member' | 'admin' | null>(null)
  const [copiedRole, setCopiedRole] = useState<'member' | 'admin' | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)

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
          router.replace(`/${leagueId}/results`)
          return
        }
        setIsAdmin(true)
      } catch {
        router.replace('/')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [leagueId, router])

  const loadDetails = useCallback(async () => {
    setDetailsLoading(true)
    try {
      const [detailsRes, membersRes] = await Promise.all([
        fetch(`/api/league/${leagueId}/details`, { credentials: 'include' }),
        fetch(`/api/league/${leagueId}/members`, { credentials: 'include' }),
      ])
      const detailsData = await detailsRes.json()
      const membersData = await membersRes.json()
      if (detailsRes.ok) {
        setLeagueDetails({
          location: detailsData.location ?? null,
          day: detailsData.day ?? null,
          kickoff_time: detailsData.kickoff_time ?? null,
          bio: detailsData.bio ?? null,
        })
      }
      if (membersRes.ok && Array.isArray(membersData)) {
        setPlayerCount(membersData.length)
      }
    } catch {
      setLeagueDetails({ location: null, day: null, kickoff_time: null, bio: null })
    } finally {
      setDetailsLoading(false)
    }
  }, [leagueId])

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

  async function fetchInviteLink(role: 'member' | 'admin') {
    setLoadingRole(role)
    setInviteError(null)
    try {
      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: leagueId, role }),
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create invite')
      if (role === 'member') {
        setMemberLink(data.link)
        setMemberExpiry(data.expiresAt ?? null)
      } else {
        setAdminLink(data.link)
        setAdminExpiry(data.expiresAt ?? null)
      }
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoadingRole(null)
    }
  }

  async function copyLink(link: string, role: 'member' | 'admin') {
    await navigator.clipboard.writeText(link)
    setCopiedRole(role)
    setTimeout(() => setCopiedRole(null), 2000)
  }

  const loadFeatures = useCallback(async () => {
    setFeaturesLoading(true)
    try {
      const res = await fetch(`/api/league/${leagueId}/features`, { credentials: 'include' })
      const data = await res.json()
      setFeatures(Array.isArray(data) ? data : [])
    } finally {
      setFeaturesLoading(false)
    }
  }, [leagueId])

  useEffect(() => {
    if (!isAdmin) return
    if (section === 'details') loadDetails()
    if (section === 'members') {
      loadMembers()
      // Auto-create both invite links on members tab mount
      fetchInviteLink('member')
      fetchInviteLink('admin')
    }
    if (section === 'features') loadFeatures()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, isAdmin, loadDetails, loadMembers, loadFeatures])

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <p className="text-slate-400">Loading…</p>
      </div>
    )
  }

  const NAV: { id: Section; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'details',  label: 'League Details', Icon: Info },
    { id: 'members',  label: 'Members',        Icon: Users },
    { id: 'features', label: 'Features',       Icon: Settings2 },
  ]

  return (
    <main className="max-w-xl mx-auto px-4 sm:px-6 py-8">
      <Suspense fallback={null}>
        <TabInitialiser onTab={setSection} />
      </Suspense>
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors mb-3"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>
        <h1 className="text-xl font-semibold text-slate-100">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">{leagueName}</p>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-700">
        {NAV.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              section === id
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── LEAGUE DETAILS ── */}
      {section === 'details' && (
        <div>
          {detailsLoading ? (
            <p className="text-slate-400 text-sm">Loading…</p>
          ) : (
            <LeagueDetailsForm
              leagueId={leagueId}
              initialDetails={leagueDetails ?? { location: null, day: null, kickoff_time: null, bio: null }}
              playerCount={playerCount}
            />
          )}
        </div>
      )}

      {/* ── MEMBERS ── */}
      {section === 'members' && (
        <div className="space-y-6">

          {/* Invite Links card */}
          <div className="rounded-lg bg-slate-800 border border-slate-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/60">
              <p className="text-sm font-medium text-slate-200">Invite Links</p>
            </div>
            <div className="divide-y divide-slate-700/40">
              {inviteError && (
                <div className="px-4 py-2 text-xs text-red-400">{inviteError}</div>
              )}
              {(
                [
                  { role: 'member', label: 'Member link', sub: 'accepted user joins as member', link: memberLink, expiry: memberExpiry },
                  { role: 'admin',  label: 'Admin link',  sub: 'accepted user joins as admin',  link: adminLink,  expiry: adminExpiry },
                ] as const
              ).map(({ role, label, sub, link, expiry }) => (
                <div key={role} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm text-slate-300">{label}</span>
                    <span className="text-xs text-slate-500 ml-2">{sub}</span>
                    {expiry && (
                      <span className="text-xs text-slate-500 ml-2">· {formatExpiry(expiry)}</span>
                    )}
                    {!link && !expiry && loadingRole === role && (
                      <span className="text-xs text-slate-500 ml-2">Generating…</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => link && copyLink(link, role)}
                      disabled={!link || loadingRole === role}
                      className="flex items-center gap-1 text-xs font-medium text-sky-400 hover:text-sky-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {copiedRole === role ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                      {copiedRole === role ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      onClick={() => fetchInviteLink(role)}
                      disabled={loadingRole === role}
                      className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <RefreshCw className={cn('size-3.5', loadingRole === role && 'animate-spin')} />
                      Regenerate
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Member list */}
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">League Members</p>
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
        </div>
      )}

      {/* ── FEATURES ── */}
      {section === 'features' && (
        <div>
          {featuresLoading ? (
            <p className="text-slate-400 text-sm">Loading…</p>
          ) : (
            <FeaturePanel
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
