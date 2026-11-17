// app/platform/page.tsx
// The platform admin dashboard. Anyone not in PLATFORM_ADMIN_IDS gets the
// ordinary 404. The check lives in the page, not a layout, because a layout
// does not re-run on every navigation.
export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { getUser } from '@/lib/fetchers'
import { createServiceClient } from '@/lib/supabase/service'
import { countSince, daysAgo, formatDay, isPlatformAdmin, leagueStatus, platformMilestones } from '@/lib/platform'
import { Cell } from '@/components/LeagueList'
import { CARD, LABEL, NONE, Section, StatusTag } from '@/components/platform/ui'
import { cn } from '@/lib/utils'
import type { PlatformLeague } from '@/lib/types'

export const metadata: Metadata = { title: 'Platform' }

interface AuditEntry {
  id: string
  actor_email: string | null
  game_name: string | null
  game_slug: string | null
  created_at: string
}

function Total({ label, value, week, month }: { label: string; value: number; week: number; month: number }) {
  return (
    <div className={cn(CARD, 'p-4')}>
      <p className={LABEL}>{label}</p>
      <p className="mt-2 text-[32px] font-bold leading-none tracking-[-.035em] text-[#f4f9ff]">{value}</p>
      <p className="mt-2.5 font-plex text-[10px] font-bold text-[#8ba4c4]">
        <span className="text-[#bef264]">+{week}</span> in 7 days · <span className="text-[#bef264]">+{month}</span> in 30 days
      </p>
    </div>
  )
}

export default async function PlatformPage() {
  const user = await getUser()
  if (!user || !isPlatformAdmin(user.id)) notFound()

  const service = createServiceClient()
  const accounts = () => service.from('profiles').select('id', { count: 'exact', head: true })
  const [leaguesRes, accountsRes, accountsWeekRes, accountsMonthRes, logRes] = await Promise.all([
    // shortcut: PostgREST returns at most 1,000 rows, so this lists the newest 1,000 leagues; add paging before then
    service.rpc('platform_leagues'),
    accounts(),
    accounts().gte('created_at', daysAgo(7)),
    accounts().gte('created_at', daysAgo(30)),
    service
      .from('platform_audit_log')
      .select('id, actor_email, game_name, game_slug, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
  ])
  if (leaguesRes.error) console.error('[platform] platform_leagues failed', leaguesRes.error)
  if (logRes.error) console.error('[platform] audit log read failed', logRes.error)

  const leagues = (leaguesRes.data ?? []) as PlatformLeague[]
  const log = (logRes.data ?? []) as AuditEntry[]
  const created = leagues.map((l) => l.created_at)
  const statuses = leagues.map((l) => leagueStatus(l))
  const statusCount = (status: (typeof statuses)[number]) => statuses.filter((s) => s === status).length
  const milestones = platformMilestones(leagues)

  return (
    <main className="px-4 pb-14 pt-9 sm:px-6">
      <div className="mx-auto w-full max-w-2xl">
        <p className="font-plex text-[9px] font-bold uppercase tracking-[.2em] text-[#bef264]">Developers only</p>
        <h1 className="mt-2 text-[26px] font-bold leading-none tracking-[-.035em] text-[#f4f9ff] sm:text-[30px]">Platform</h1>

        {leaguesRes.error && (
          <p className="mt-6 rounded-xl border border-[#e2686f]/40 bg-[#0a1421] px-4 py-3 font-inter-body text-[13px] text-[#e2686f]">
            Could not load the leagues. Check that the platform migration has been applied.
          </p>
        )}

        <div className="mt-6 grid grid-cols-2 gap-2.5">
          <Total label="Leagues" value={leagues.length} week={countSince(created, 7)} month={countSince(created, 30)} />
          <Total
            label="Accounts"
            value={accountsRes.count ?? 0}
            week={accountsWeekRes.count ?? 0}
            month={accountsMonthRes.count ?? 0}
          />
        </div>
        <div className={cn(CARD, 'mt-2.5 grid grid-cols-3 divide-x divide-[#17263c]')}>
          <Cell label="Active">{statusCount('Active')}</Cell>
          <Cell label="Stalled">{statusCount('Stalled')}</Cell>
          <Cell label="Not started">{statusCount('Not started')}</Cell>
        </div>

        <Section title="Milestones">
          <div className={cn(CARD, 'divide-y divide-[#17263c]')}>
            {milestones.map((m) => (
              <div key={m.label} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-[150px] shrink-0 font-inter-body text-[13px] text-[#f4f9ff]">{m.label}</span>
                <progress
                  max={Math.max(leagues.length, 1)}
                  value={m.count}
                  aria-label={`${m.label}: ${m.count} of ${leagues.length} leagues`}
                  className="h-1.5 min-w-0 flex-1 appearance-none overflow-hidden rounded-full bg-[#17263c] [&::-moz-progress-bar]:bg-[#38bdf8] [&::-webkit-progress-bar]:bg-[#17263c] [&::-webkit-progress-value]:bg-[#38bdf8]"
                />
                <span className="w-6 text-right font-plex text-xs font-bold text-[#f4f9ff]">{m.count}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Leagues">
          {leagues.length === 0 ? (
            <p className={cn(CARD, 'px-4 py-3 font-inter-body text-[13px] text-[#8ba4c4]')}>No leagues yet.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {leagues.map((l, i) => (
                <Link key={l.id} href={`/platform/${l.id}`} className={cn(CARD, 'block transition-colors hover:border-[#38bdf8]')}>
                  <div className="flex items-center gap-3 p-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-base font-bold tracking-[-.02em] text-[#f4f9ff]">{l.name}</p>
                        <StatusTag status={statuses[i]} />
                      </div>
                      <p className="mt-1 truncate font-inter-body text-xs text-[#8ba4c4]">
                        /{l.slug} · {l.creator_name ?? l.creator_email ?? 'Creator removed'} · {formatDay(l.created_at)}
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-[#6f88a8]" />
                  </div>
                  <div className="grid grid-cols-4 divide-x divide-[#17263c] border-t border-[#17263c] bg-[#0c1728]/60">
                    <Cell label="Members">{l.members}</Cell>
                    <Cell label="Players">{l.players}</Cell>
                    <Cell label="Results">{l.results}</Cell>
                    <Cell label="Last activity">{l.last_activity ? formatDay(l.last_activity).slice(0, -5) : NONE}</Cell>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Section>

        <Section title="Audit log">
          <div className={cn(CARD, 'divide-y divide-[#17263c]')}>
            {log.length === 0 && <p className="px-4 py-2.5 font-inter-body text-[13px] text-[#8ba4c4]">Nothing yet.</p>}
            {log.map((entry) => (
              <p key={entry.id} className="px-4 py-2.5 font-inter-body text-[13px] text-[#8ba4c4]">
                {entry.actor_email ?? 'Someone'} deleted {entry.game_name} (/{entry.game_slug}) · {formatDay(entry.created_at)}
              </p>
            ))}
          </div>
        </Section>
      </div>
    </main>
  )
}
