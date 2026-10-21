'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, Copy, Info, RefreshCw, Settings2, UserCog, Users } from 'lucide-react'
import { AdminMemberTable } from '@/components/AdminMemberTable'
import { FeaturePanel } from '@/components/FeaturePanel'
import { LeagueDetailsForm } from '@/components/LeagueDetailsForm'
import { PlayerRosterPanel } from '@/components/PlayerRosterPanel'
import { PendingReviewList } from '@/components/PendingReviewList'
import { buildReviewItems, cn } from '@/lib/utils'
import { DEFAULT_FEATURES } from '@/lib/defaults'
import type { LeagueMember, LeagueFeature, LeagueDetails, PlayerAttribute, PendingJoinRequest, PlayerClaim } from '@/lib/types'

export type SettingsSection = 'details' | 'members' | 'features' | 'players'

// The Features tab only appears while at least one feature is behind a flag.
const HAS_FEATURE_FLAGS = DEFAULT_FEATURES.length > 0

interface Props {
  leagueId: string
  leagueSlug: string
  leagueName: string
  initialSection: SettingsSection
  details: LeagueDetails
  playerCount: number
  members: LeagueMember[]
  roster: PlayerAttribute[]
  requests: PendingJoinRequest[]
  /** Pending claims only. */
  claims: PlayerClaim[]
  features: LeagueFeature[]
}

function formatExpiry(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `Expires ${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })} ${d.getFullYear()}`
}

/**
 * The league settings tabs. Every list is a prop from the server page; after
 * a mutation the panels call router.refresh(), which re-runs the page's
 * fetchers and re-renders this component with fresh props.
 */
export function LeagueSettings({
  leagueId,
  leagueSlug,
  leagueName: initialLeagueName,
  initialSection,
  details,
  playerCount,
  members,
  roster,
  requests,
  claims,
  features,
}: Props) {
  const router = useRouter()
  const [section, setSection] = useState<SettingsSection>(initialSection)
  const [leagueName, setLeagueName] = useState(initialLeagueName)

  // Invite links are created, not read, so they stay client-side.
  const [memberLink, setMemberLink] = useState<string | null>(null)
  const [adminLink, setAdminLink] = useState<string | null>(null)
  const [memberExpiry, setMemberExpiry] = useState<string | null>(null)
  const [adminExpiry, setAdminExpiry] = useState<string | null>(null)
  const [loadingRole, setLoadingRole] = useState<'member' | 'admin' | null>(null)
  const [copiedRole, setCopiedRole] = useState<'member' | 'admin' | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)

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

  // Both invite links are created when the Members tab is first shown.
  useEffect(() => {
    if (section !== 'members' || memberLink || adminLink) return
    fetchInviteLink('member')
    fetchInviteLink('admin')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section])

  const refresh = () => router.refresh()

  const pendingCount = buildReviewItems(requests, claims).length

  const NAV: { id: SettingsSection; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'details',  label: 'League Details', Icon: Info },
    { id: 'members',  label: 'Members',        Icon: Users },
    { id: 'players',  label: 'Players',        Icon: UserCog },
    ...(HAS_FEATURE_FLAGS ? [{ id: 'features' as const, label: 'Features', Icon: Settings2 }] : []),
  ]

  return (
    <main className="max-w-[624px] mx-auto px-4 sm:px-6 pt-7 pb-14">
      <div>
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-[7px] font-plex text-[9.5px] font-bold uppercase tracking-[.16em] text-[#8ba4c4] hover:text-[#f4f9ff] transition-colors"
        >
          <ArrowLeft className="size-[13px]" strokeWidth={2.2} />
          Back
        </button>
        <h1 className="mt-3.5 text-[26px] sm:text-[30px] leading-none font-bold tracking-[-.035em] text-[#f4f9ff]">Settings</h1>
        <p className="mt-2 font-plex text-[10px] uppercase tracking-[.14em] text-[#6f88a8]">{leagueName}</p>
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
            {id === 'members' && pendingCount > 0 && (
              <span
                aria-label={`${pendingCount} pending`}
                className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#e2686f] px-1 text-[9px] leading-none tracking-normal text-[#05101d]"
              >
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {section === 'details' && (
        <LeagueDetailsForm
          leagueId={leagueId}
          leagueSlug={leagueSlug}
          initialDetails={details}
          playerCount={playerCount}
          leagueName={leagueName}
          onNameSaved={setLeagueName}
        />
      )}

      {section === 'members' && (
        <div className="space-y-6">
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

          <PendingReviewList
            leagueId={leagueId}
            requests={requests}
            claims={claims}
            roster={roster}
            onChanged={refresh}
            onRosterStale={refresh}
          />

          <div>
            <p className="font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#6f88a8] mb-3">League Members</p>
            <AdminMemberTable leagueId={leagueId} members={members} onChanged={refresh} />
          </div>
        </div>
      )}

      {section === 'features' && (
        <FeaturePanel leagueId={leagueId} features={features} onChanged={refresh} />
      )}

      {section === 'players' && (
        <PlayerRosterPanel leagueId={leagueId} initialPlayers={roster} />
      )}
    </main>
  )
}
