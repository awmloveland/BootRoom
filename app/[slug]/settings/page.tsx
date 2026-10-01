'use client'

import { Suspense, useEffect, useState, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Check, Copy, Info, RefreshCw, Settings2, UserCog, Users } from 'lucide-react'
import { fetchGames } from '@/lib/data'
import { AdminMemberTable } from '@/components/AdminMemberTable'
import { FeaturePanel } from '@/components/FeaturePanel'
import { LeagueDetailsForm } from '@/components/LeagueDetailsForm'
import { PlayerRosterPanel } from '@/components/PlayerRosterPanel'
import { PlayerClaimsTable } from '@/components/PlayerClaimsTable'
import { cn } from '@/lib/utils'
import { Skeleton, SkeletonCard, SKELETON_FADE_IN } from '@/components/ui/skeleton'
import type { LeagueMember, LeagueFeature, LeagueDetails, PlayerAttribute, PendingJoinRequest, PlayerClaim } from '@/lib/types'
import { PendingRequestsTable } from '@/components/PendingRequestsTable'

type Section = 'details' | 'members' | 'features' | 'players'

function TabInitialiser({ onTab }: { onTab: (tab: Section) => void }) {
  const searchParams = useSearchParams()
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab === 'details' || tab === 'members' || tab === 'features' || tab === 'players') {
      onTab(tab)
    }
  }, [searchParams, onTab])
  return null
}

/** Placeholder for a settings panel: one card per entry, with that many rows. */
function PanelSkeleton({ cards }: { cards: number[] }) {
  return (
    <div className={cn('flex flex-col gap-3', SKELETON_FADE_IN)} aria-busy="true">
      {cards.map((rows, i) => (
        <SkeletonCard key={i} rows={rows} />
      ))}
    </div>
  )
}

function formatExpiry(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `Expires ${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })} ${d.getFullYear()}`
}

export default function LeagueSettingsPage() {
  const params = useParams()
  const router = useRouter()
  const slug = (params?.slug as string) ?? ''
  const [leagueId, setLeagueId] = useState('')

  const [section, setSection] = useState<Section>('details')
  const [leagueName, setLeagueName] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  // League details state
  const [leagueDetails, setLeagueDetails] = useState<LeagueDetails | null>(null)
  const [playerCount, setPlayerCount] = useState(0)
  // Section loading flags start true so a panel never renders once with
  // empty data before its first fetch kicks off.
  const [detailsLoading, setDetailsLoading] = useState(true)

  // Members state
  const [members, setMembers] = useState<LeagueMember[]>([])
  const [membersLoading, setMembersLoading] = useState(true)

  // Pending join requests state
  const [pendingRequests, setPendingRequests] = useState<PendingJoinRequest[]>([])
  const [pendingLoading, setPendingLoading] = useState(true)

  // Player claims state
  const [pendingClaims, setPendingClaims] = useState<PlayerClaim[]>([])

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
  const [featuresLoading, setFeaturesLoading] = useState(true)

  // Players state
  const [players, setPlayers] = useState<PlayerAttribute[]>([])
  const [playersLoading, setPlayersLoading] = useState(true)

  useEffect(() => {
    async function init() {
      try {
        const games = await fetchGames()
        const game = games.find((g) => g.slug === slug)
        if (!game) { router.replace('/'); return }
        setLeagueId(game.id)
        setLeagueName(game.name)
        const adminRoles = ['creator', 'admin']
        if (!adminRoles.includes(game.role)) {
          router.replace(`/${slug}/results`)
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
  }, [slug, router])

  const loadDetails = useCallback(async () => {
    setDetailsLoading(true)
    try {
      const detailsRes = await fetch(`/api/league/${leagueId}/details`, { credentials: 'include' })
      const detailsData = await detailsRes.json()
      if (detailsRes.ok) {
        setLeagueDetails({
          location: detailsData.location ?? null,
          day: detailsData.day ?? null,
          kickoff_time: detailsData.kickoff_time ?? null,
          bio: detailsData.bio ?? null,
        })
        setPlayerCount(detailsData.player_count ?? 0)
      }
    } catch {
      setLeagueDetails({ location: null, day: null, kickoff_time: null, bio: null })
    } finally {
      setDetailsLoading(false)
    }
  }, [leagueId])

  const loadMembers = useCallback(async () => {
    setMembersLoading(true)
    setPendingLoading(true)
    try {
      const [membersRes, pendingRes, claimsRes] = await Promise.all([
        fetch(`/api/league/${leagueId}/members`, { credentials: 'include' }),
        fetch(`/api/league/${leagueId}/join-requests`, { credentials: 'include' }),
        fetch(`/api/league/${leagueId}/player-claims/all`, { credentials: 'include' }),
      ])
      const [membersData, pendingData, claimsData] = await Promise.all([
        membersRes.json(),
        pendingRes.ok ? pendingRes.json() : Promise.resolve([]),
        claimsRes.ok ? claimsRes.json() : Promise.resolve([]),
      ])
      setMembers(Array.isArray(membersData) ? membersData : [])
      setPendingRequests(Array.isArray(pendingData) ? pendingData : [])

      const allClaims: PlayerClaim[] = Array.isArray(claimsData) ? claimsData : []
      setPendingClaims(allClaims.filter((c) => c.status === 'pending'))
    } catch {
      setMembers([])
      setPendingRequests([])
      setPendingClaims([])
    } finally {
      setMembersLoading(false)
      setPendingLoading(false)
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

  const loadPlayers = useCallback(async () => {
    setPlayersLoading(true)
    try {
      const res = await fetch(`/api/league/${leagueId}/players`, { credentials: 'include' })
      const data = await res.json()
      setPlayers(Array.isArray(data) ? data : [])
    } finally {
      setPlayersLoading(false)
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
    if (section === 'players') loadPlayers()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, isAdmin, loadDetails, loadMembers, loadFeatures, loadPlayers])

  const NAV: { id: Section; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'details',  label: 'League Details', Icon: Info },
    { id: 'members',  label: 'Members',        Icon: Users },
    { id: 'players',  label: 'Players',        Icon: UserCog },
    { id: 'features', label: 'Features',       Icon: Settings2 },
  ]

  return (
    <main className="max-w-[624px] mx-auto px-4 sm:px-6 pt-7 pb-14">
      <Suspense fallback={null}>
        <TabInitialiser onTab={setSection} />
      </Suspense>
      <div>
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-[7px] font-plex text-[9.5px] font-bold uppercase tracking-[.16em] text-[#8ba4c4] hover:text-[#f4f9ff] transition-colors"
        >
          <ArrowLeft className="size-[13px]" strokeWidth={2.2} />
          Back
        </button>
        <h1 className="mt-3.5 text-[26px] sm:text-[30px] leading-none font-bold tracking-[-.035em] text-[#f4f9ff]">Settings</h1>
        {loading ? (
          <div className="mt-2 flex h-[15px] items-center" aria-busy="true">
            <Skeleton className="h-2.5 w-32" />
          </div>
        ) : (
          <p className="mt-2 font-plex text-[10px] uppercase tracking-[.14em] text-[#6f88a8]">{leagueName}</p>
        )}
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 mt-[22px] mb-6 overflow-x-auto border-b border-[#17263c] -mx-4 px-4 sm:mx-0 sm:px-0 touch-pan-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {NAV.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={(e) => {
              setSection(id)
              router.replace(`?tab=${id}`)
              e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
            }}
            className={cn(
              'flex shrink-0 items-center gap-2 px-3 pb-[11px] font-plex text-[10.5px] font-bold uppercase tracking-[.14em] whitespace-nowrap transition-colors border-b-2 -mb-px',
              section === id
                ? 'border-[#38bdf8] text-[#f4f9ff]'
                : 'border-transparent text-[#8ba4c4] hover:text-[#f4f9ff]'
            )}
          >
            <Icon className="size-[13px]" />
            {label}
          </button>
        ))}
      </div>

      {/* ── LEAGUE DETAILS ── */}
      {section === 'details' && (
        <div>
          {loading || detailsLoading ? (
            <PanelSkeleton cards={[6]} />
          ) : (
            <LeagueDetailsForm
              leagueId={leagueId}
              leagueSlug={slug}
              initialDetails={leagueDetails ?? { location: null, day: null, kickoff_time: null, bio: null }}
              playerCount={playerCount}
              leagueName={leagueName}
              onNameSaved={setLeagueName}
            />
          )}
        </div>
      )}

      {/* ── MEMBERS ── */}
      {section === 'members' && (
        <div className="space-y-6">

          {/* Invite Links card */}
          <div className="rounded-xl bg-[#0a1421] border border-[#1b2c46] overflow-hidden shadow-[0_18px_44px_rgba(0,0,0,.42)]">
            <div className="px-[18px] py-3 bg-[#0c1728] border-b border-[#1b2c46]">
              <p className="font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#8ba4c4]">Invite Links</p>
            </div>
            <div className="divide-y divide-[#17263c]">
              {inviteError && (
                <div className="px-[18px] py-2 font-inter-body text-xs text-[#e2686f]">{inviteError}</div>
              )}
              {(
                [
                  { role: 'member', label: 'Member link', sub: 'Joins as member', link: memberLink, expiry: memberExpiry },
                  { role: 'admin',  label: 'Admin link',  sub: 'Joins as admin',  link: adminLink,  expiry: adminExpiry },
                ] as const
              ).map(({ role, label, sub, link, expiry }) => (
                <div key={role} className="flex flex-wrap items-center justify-between gap-x-3.5 gap-y-2 px-[18px] py-[13px]">
                  <div className="min-w-0">
                    <p className="font-inter-body text-[13px] font-semibold text-[#f4f9ff]">{label}</p>
                    <p className="mt-[3px] font-plex text-[9px] uppercase tracking-[.12em] text-[#6f88a8]">
                      {sub}
                      {expiry && <span> · {formatExpiry(expiry)}</span>}
                      {!link && !expiry && loadingRole === role && <span> · Generating…</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => link && copyLink(link, role)}
                      disabled={!link || loadingRole === role}
                      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded border border-[#38bdf8]/40 bg-[#38bdf8]/10 font-plex text-[9.5px] font-bold uppercase tracking-[.12em] text-[#7dd3fc] hover:bg-[#38bdf8]/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {copiedRole === role ? <Check className="size-3" /> : <Copy className="size-3" />}
                      {copiedRole === role ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      onClick={() => fetchInviteLink(role)}
                      disabled={loadingRole === role}
                      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded border border-[#223a5c] font-plex text-[9.5px] font-bold uppercase tracking-[.12em] text-[#8ba4c4] hover:border-[#38bdf8] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <RefreshCw className={cn('size-3', loadingRole === role && 'animate-spin')} />
                      Regenerate
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pending join requests */}
          {pendingLoading ? (
            <PanelSkeleton cards={[2]} />
          ) : pendingRequests.length > 0 ? (
            <PendingRequestsTable
              leagueId={leagueId}
              initialRequests={pendingRequests}
              pendingClaims={pendingClaims}
            />
          ) : (
            <p className="font-inter-body text-[13px] text-[#6f88a8]">No pending requests.</p>
          )}

          {/* Player identity claims — only those not attached to a pending join request */}
          {(() => {
            const pendingRequestUserIds = new Set(pendingRequests.map((r) => r.user_id))
            const standaloneClaims = pendingClaims.filter(
              (c) => !pendingRequestUserIds.has(c.user_id),
            )
            return standaloneClaims.length > 0 ? (
              <PlayerClaimsTable
                leagueId={leagueId}
                initialClaims={standaloneClaims}
                onChanged={loadMembers}
              />
            ) : null
          })()}

          {/* Member list */}
          <div>
            <p className="font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#6f88a8] mb-3">League Members</p>
            {membersLoading ? (
              <PanelSkeleton cards={[6]} />
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
          {loading || featuresLoading ? (
            <PanelSkeleton cards={[2, 2, 2, 2]} />
          ) : (
            <FeaturePanel
              leagueId={leagueId}
              features={features}
              onChanged={loadFeatures}
            />
          )}
        </div>
      )}

      {/* ── PLAYERS ── */}
      {section === 'players' && (
        <div>
          {loading || playersLoading ? (
            <PanelSkeleton cards={[8]} />
          ) : (
            <PlayerRosterPanel
              leagueId={leagueId}
              initialPlayers={players}
            />
          )}
        </div>
      )}
    </main>
  )
}
