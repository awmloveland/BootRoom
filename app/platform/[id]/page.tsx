// app/platform/[id]/page.tsx
// One league as the platform admins see it. Gated in the page, like /platform.
export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { getUser } from '@/lib/fetchers'
import { createServiceClient } from '@/lib/supabase/service'
import { formatDay, isPlatformAdmin, leagueStatus } from '@/lib/platform'
import { formatKickoffTime } from '@/lib/dates'
import { Cell, Tag } from '@/components/LeagueList'
import { WinnerBadge } from '@/components/WinnerBadge'
import { DeleteLeague } from '@/components/platform/DeleteLeague'
import { CARD, LABEL, NONE, Section, StatusTag } from '@/components/platform/ui'
import { cn } from '@/lib/utils'
import type { GameRole, PlatformLeague, WeekStatus, Winner } from '@/lib/types'

export const metadata: Metadata = { title: 'Platform' }

interface MemberRow { user_id: string; role: GameRole; joined_at: string }
interface ProfileRow { id: string; email: string; first_name: string | null; last_name: string | null; display_name: string | null }
interface WeekRow { id: string; date: string; status: WeekStatus; winner: Winner }

const ROLE_LABEL: Record<GameRole, string> = { creator: 'Creator', admin: 'Admin', member: 'Member' }

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <dt className={LABEL}>{label}</dt>
      <dd className="min-w-0 truncate font-inter-body text-[13px] text-[#f4f9ff]">{children}</dd>
    </div>
  )
}

export default async function PlatformLeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user || !isPlatformAdmin(user.id)) notFound()
  const { id } = await params

  const service = createServiceClient()
  // An id that is not a uuid makes the two table reads fail; the league is then not found below.
  const [leaguesRes, membersRes, weeksRes] = await Promise.all([
    service.rpc('platform_leagues'),
    service.from('game_members').select('user_id, role, joined_at').eq('game_id', id).order('joined_at'),
    service
      .from('weeks')
      .select('id, date, status, winner')
      .eq('game_id', id)
      .order('season', { ascending: false })
      .order('week', { ascending: false })
      .limit(5),
  ])
  if (leaguesRes.error) console.error('[platform] platform_leagues failed', leaguesRes.error)
  const league = ((leaguesRes.data ?? []) as PlatformLeague[]).find((l) => l.id === id)
  if (!league) notFound()

  const members = (membersRes.data ?? []) as MemberRow[]
  const weeks = (weeksRes.data ?? []) as WeekRow[]
  const { data: profileRows } = await service
    .from('profiles')
    .select('id, email, first_name, last_name, display_name')
    .in('id', members.map((m) => m.user_id))
  const profiles = new Map(((profileRows ?? []) as ProfileRow[]).map((p) => [p.id, p]))
  const kickoff = formatKickoffTime(league.kickoff_time)

  return (
    <main className="px-4 pb-14 pt-9 sm:px-6">
      <div className="mx-auto w-full max-w-2xl">
        <Link
          href="/platform"
          className="inline-flex items-center gap-1.5 font-plex text-[10px] font-bold uppercase tracking-[.14em] text-[#8ba4c4] hover:text-[#f4f9ff]"
        >
          <ArrowLeft className="size-3.5" />
          Platform
        </Link>
        <div className="mt-4 flex items-center gap-2.5">
          <h1 className="min-w-0 truncate text-[26px] font-bold leading-none tracking-[-.035em] text-[#f4f9ff]">{league.name}</h1>
          <StatusTag status={leagueStatus(league)} />
        </div>
        <Link
          href={`/${league.slug}`}
          className="mt-2.5 inline-flex items-center gap-1.5 font-inter-body text-[13px] text-[#38bdf8] hover:text-[#7dd3fc]"
        >
          craft-football.com/{league.slug}
          <ExternalLink className="size-3.5" />
        </Link>

        <div className={cn(CARD, 'mt-6 grid grid-cols-4 divide-x divide-[#17263c]')}>
          <Cell label="Members">{league.members}</Cell>
          <Cell label="Players">{league.players}</Cell>
          <Cell label="Results">{league.results}</Cell>
          <Cell label="Last activity">{league.last_activity ? formatDay(league.last_activity).slice(0, -5) : NONE}</Cell>
        </div>

        <Section title="Details">
          <dl className={cn(CARD, 'divide-y divide-[#17263c]')}>
            <Row label="Created">{formatDay(league.created_at)}</Row>
            <Row label="Creator">
              {[league.creator_name, league.creator_email].filter(Boolean).join(' · ') || 'Creator removed'}
            </Row>
            <Row label="Match day">{[league.day, kickoff].filter(Boolean).join(' · ') || 'Not set'}</Row>
            <Row label="Venue">{league.location ?? 'Not set'}</Row>
          </dl>
        </Section>

        <Section title="Members">
          <div className={cn(CARD, 'divide-y divide-[#17263c]')}>
            {members.length === 0 && <p className="px-4 py-2.5 font-inter-body text-[13px] text-[#8ba4c4]">No members.</p>}
            {members.map((m) => {
              const p = profiles.get(m.user_id)
              const name = [p?.first_name, p?.last_name].filter(Boolean).join(' ') || p?.display_name || p?.email || 'Unknown'
              return (
                <div key={m.user_id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-inter-body text-[13px] font-semibold text-[#f4f9ff]">{name}</p>
                    <p className="mt-0.5 truncate font-inter-body text-xs text-[#8ba4c4]">
                      {p?.email ?? 'No profile'} · joined {formatDay(m.joined_at)}
                    </p>
                  </div>
                  <Tag tone={m.role === 'member' ? 'muted' : 'sky'}>{ROLE_LABEL[m.role]}</Tag>
                </div>
              )
            })}
          </div>
        </Section>

        <Section title="Recent weeks">
          {weeks.length === 0 ? (
            <p className={cn(CARD, 'px-4 py-3 font-inter-body text-[13px] text-[#8ba4c4]')}>No weeks yet.</p>
          ) : (
            <div className={cn(CARD, 'divide-y divide-[#17263c]')}>
              {weeks.map((w) => (
                <div key={w.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="font-plex text-xs font-bold text-[#f4f9ff]">{w.date}</span>
                  {w.status === 'unrecorded' || w.status === 'scheduled' ? (
                    <Tag>{w.status === 'scheduled' ? 'Scheduled' : 'Awaiting result'}</Tag>
                  ) : (
                    <WinnerBadge winner={w.winner} cancelled={w.status === 'cancelled'} dnf={w.status === 'dnf'} />
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Danger zone">
          <DeleteLeague
            id={league.id}
            name={league.name}
            slug={league.slug}
            members={league.members}
            players={league.players}
            results={league.results}
          />
        </Section>
      </div>
    </main>
  )
}
