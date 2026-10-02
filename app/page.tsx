// app/page.tsx
export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/fetchers'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import { cookies, headers } from 'next/headers'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { LandingPage } from '@/components/landing/LandingPage'
import { cn, leagueLandingPath, VIEWPORT_COOKIE } from '@/lib/utils'

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_IDX: Record<string, number> = Object.fromEntries(MONTH_SHORT.map((m, i) => [m, i]))

function parseWeekDate(date: string): Date {
  const [d, m, y] = date.split(' ')
  return new Date(parseInt(y), MONTH_IDX[m], parseInt(d))
}

function formatWeekDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0')
  return `${d} ${MONTH_SHORT[date.getMonth()]} ${date.getFullYear()}`
}

function formatDisplayDate(weekDateStr: string): string {
  const date = parseWeekDate(weekDateStr)
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** Eyebrow above the page title, e.g. "Thursday · Matchday minus 1". */
function buildMatchdayEyebrow(nextDates: (string | null)[]): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const weekday = today.toLocaleDateString('en-GB', { weekday: 'long' })
  const daysAway = nextDates
    .filter((d): d is string => d !== null)
    .map((d) => Math.round((parseWeekDate(d).getTime() - today.getTime()) / 86_400_000))
    .filter((n) => n >= 0)
  if (daysAway.length === 0) return weekday
  const soonest = Math.min(...daysAway)
  return soonest === 0 ? `${weekday} · Matchday` : `${weekday} · Matchday minus ${soonest}`
}

/**
 * Compute the next match date for a league's home page card.
 * - If a scheduled (lineup-set) week exists, use its date.
 * - Otherwise, derive the recurring day-of-week from recent played weeks
 *   and find the next upcoming occurrence.
 * - Skip any cancelled dates, advancing by 7 days each time.
 */
function computeNextMatchDate(
  scheduledDate: string | null,
  lastPlayedDate: string | null,
  cancelledDates: Set<string>,
): string | null {
  let candidate: Date

  if (scheduledDate) {
    candidate = parseWeekDate(scheduledDate)
  } else if (lastPlayedDate) {
    const lastDate = parseWeekDate(lastPlayedDate)
    const dow = lastDate.getDay()
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    let daysUntil = (dow - today.getDay() + 7) % 7
    if (daysUntil === 0) daysUntil = 7
    candidate = new Date(today)
    candidate.setDate(today.getDate() + daysUntil)
  } else {
    return null
  }

  // Skip cancelled dates (up to 8 weeks ahead)
  for (let i = 0; i < 8; i++) {
    const dateStr = formatWeekDate(candidate)
    if (!cancelledDates.has(dateStr)) break
    candidate.setDate(candidate.getDate() + 7)
  }

  return formatWeekDate(candidate)
}

// Signed-in visitors with several leagues see their league list; everyone
// else gets the landing page (or is redirected) under the default title.
export async function generateMetadata(): Promise<Metadata> {
  return (await getUser()) ? { title: 'Your leagues' } : {}
}

export default async function HomePage() {
  const supabase = await createClient()
  const user = await getUser()

  if (user) {
    const { data: memberships } = await supabase
      .from('game_members')
      .select('game_id, role, games(id, name, slug)')
      .eq('user_id', user.id)

    const leagues = (memberships ?? []).map((m) => {
      const game = (m.games as unknown as { id: string; name: string; slug: string } | null)
      return {
        id: game?.id ?? '',
        slug: game?.slug ?? '',
        name: game?.name ?? '',
        role: m.role,
      }
    })

    // Go straight to the league's landing tab rather than via /[slug], which
    // would cost another server redirect before the tab skeleton can show.
    const userAgent = (await headers()).get('user-agent')
    const viewport = (await cookies()).get(VIEWPORT_COOKIE)?.value
    const validLeagues = leagues.filter((l) => l.id)
    if (validLeagues.length === 1) {
      redirect(leagueLandingPath(validLeagues[0].slug, userAgent, viewport))
    }

    const service = createServiceClient()
    const gameIds = validLeagues.map((l) => l.id)

    // Batch-fetch all relevant weeks for these leagues in 2 queries
    const [scheduledRes, playedRes, cancelledRes] = await Promise.all([
      service
        .from('weeks')
        .select('game_id, date, format')
        .in('game_id', gameIds)
        .eq('status', 'scheduled')
        .order('season', { ascending: true })
        .order('week', { ascending: true }),
      service
        .from('weeks')
        .select('game_id, date')
        .in('game_id', gameIds)
        .eq('status', 'played')
        .order('season', { ascending: false })
        .order('week', { ascending: false }),
      service
        .from('weeks')
        .select('game_id, date')
        .in('game_id', gameIds)
        .eq('status', 'cancelled'),
    ])

    // First scheduled date per league
    const scheduledByLeague: Record<string, string> = {}
    const scheduledFormatByLeague: Record<string, string | null> = {}
    for (const row of scheduledRes.data ?? []) {
      if (!scheduledByLeague[row.game_id]) {
        scheduledByLeague[row.game_id] = row.date
        scheduledFormatByLeague[row.game_id] = row.format ?? null
      }
    }

    // Most recent played date per league
    const lastPlayedByLeague: Record<string, string> = {}
    for (const row of playedRes.data ?? []) {
      if (!lastPlayedByLeague[row.game_id]) lastPlayedByLeague[row.game_id] = row.date
    }

    // Set of cancelled dates per league
    const cancelledByLeague: Record<string, Set<string>> = {}
    for (const row of cancelledRes.data ?? []) {
      if (!cancelledByLeague[row.game_id]) cancelledByLeague[row.game_id] = new Set()
      cancelledByLeague[row.game_id].add(row.date)
    }

    const leagueCards = leagues.map((league) => {
      const nextDate = computeNextMatchDate(
        scheduledByLeague[league.id] ?? null,
        lastPlayedByLeague[league.id] ?? null,
        cancelledByLeague[league.id] ?? new Set(),
      )
      // Format is only known when the next match is the scheduled (lineup-set) week
      const format = nextDate && nextDate === scheduledByLeague[league.id]
        ? scheduledFormatByLeague[league.id] ?? null
        : null
      return { league, nextDate, format }
    })

    return (
      <main className="px-4 sm:px-6 pt-5 pb-14">
        <div className="mx-auto w-full max-w-xl pt-4">
          <p className="inline-flex items-center gap-2 font-plex text-[9px] font-bold uppercase tracking-[.2em] text-[#bef264]">
            <span className="h-0.5 w-[18px] bg-[#bef264]" />
            {buildMatchdayEyebrow(leagueCards.map((c) => c.nextDate))}
          </p>
          <h1 className="mt-2.5 text-[26px] sm:text-[30px] leading-none font-bold tracking-[-.035em] text-[#f4f9ff]">
            Your leagues
          </h1>
          {leagues.length === 0 ? (
            <p className="mt-6 font-inter-body text-[13px] text-[#6f88a8]">You&apos;re not in any leagues yet.</p>
          ) : (
            <div className="mt-6 flex flex-col gap-2">
              {leagueCards.map(({ league, nextDate, format }) => (
                <Link
                  key={league.id}
                  href={leagueLandingPath(league.slug, userAgent, viewport)}
                  className={cn(
                    'flex items-center justify-between gap-4 px-[18px] py-4 rounded-xl border transition-colors hover:border-[#38bdf8]',
                    nextDate
                      ? 'border-[#1b2c46] bg-[#0a1421] shadow-[0_18px_44px_rgba(0,0,0,.42)]'
                      : 'border-dashed border-[#223a5c]'
                  )}
                >
                  <div>
                    <p className={cn(
                      'font-bold tracking-[-.02em]',
                      nextDate ? 'text-base text-[#f4f9ff]' : 'text-[15px] text-[#cfe0f4]'
                    )}>
                      {league.name}
                    </p>
                    {nextDate ? (
                      <p className="mt-1.5 font-plex text-[9.5px] uppercase tracking-[.14em] text-[#8ba4c4] whitespace-nowrap">
                        Next match <span className="text-[#38bdf8]">{formatDisplayDate(nextDate)}</span>
                        {format && ` · ${format}`}
                      </p>
                    ) : (
                      <p className="mt-1.5 font-plex text-[9.5px] uppercase tracking-[.14em] text-[#6f88a8]">No upcoming match</p>
                    )}
                  </div>
                  <ChevronRight className={cn('size-4 shrink-0', nextDate ? 'text-[#6f88a8]' : 'text-[#4f688a]')} />
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    )
  }

  // Unauthenticated: marketing landing page
  return <LandingPage />
}
