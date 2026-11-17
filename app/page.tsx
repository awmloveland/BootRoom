// app/page.tsx
export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getMyClaimInfo, getPendingBadgeCount, getPlayerStats, getUser, getWeeks } from '@/lib/fetchers'
import { redirect } from 'next/navigation'
import { cookies, headers } from 'next/headers'
import { LandingPage } from '@/components/landing/LandingPage'
import { LeagueList, type LeagueCardData, type PendingLeague } from '@/components/LeagueList'
import { getNextMatchSeed, leagueLandingPath, VIEWPORT_COOKIE } from '@/lib/utils'
import { dayNameToIndex, formatKickoffTime, formatWeekDate, getNextMatchDate, leagueNow, parseWeekDate } from '@/lib/dates'
import { computeQuarterlyTable, getQuarterStanding } from '@/lib/sidebar-stats'
import { lastGameResult } from '@/lib/standings'
import type { Week } from '@/lib/types'

/**
 * The date on a league's card: the scheduled (line-up set) week if there is
 * one, otherwise the next game day, skipping weeks already cancelled. Null
 * while the league has neither a game day nor a played game to infer one from.
 */
function nextMatchDate(weeks: Week[], scheduledDate: string | null, dayIndex?: number): string | null {
  if (scheduledDate) return scheduledDate
  if (dayIndex === undefined && !weeks.some((w) => w.status === 'played')) return null
  const cancelled = new Set(weeks.filter((w) => w.status === 'cancelled').map((w) => w.date))
  const candidate = parseWeekDate(getNextMatchDate(weeks, dayIndex))
  for (let i = 0; i < 8 && cancelled.has(formatWeekDate(candidate)); i++) {
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
    const [{ data: memberships }, { data: requests }] = await Promise.all([
      supabase
        .from('game_members')
        .select('game_id, role, games(id, name, slug, location, day, kickoff_time)')
        .eq('user_id', user.id),
      // Leagues this user has asked to join. Service client, as in
      // getJoinRequestStatus, so the league's name resolves for a non-member.
      createServiceClient()
        .from('game_join_requests')
        .select('games(id, name, slug)')
        .eq('user_id', user.id)
        .eq('status', 'pending'),
    ])

    type GameRow = { id: string; name: string; slug: string; location: string | null; day: string | null; kickoff_time: string | null }
    const leagues = (memberships ?? []).flatMap((m) => {
      const game = m.games as unknown as GameRow | null
      return game ? [{ ...game, role: m.role }] : []
    })

    // Go straight to the league's landing tab rather than via /[slug], which
    // would cost another server redirect before the tab skeleton can show.
    const userAgent = (await headers()).get('user-agent')
    const viewport = (await cookies()).get(VIEWPORT_COOKIE)?.value
    if (leagues.length === 1) {
      redirect(leagueLandingPath(leagues[0].slug, userAgent, viewport))
    }

    // The same cached reads the league's own Overview tab makes.
    const cards = await Promise.all(leagues.map(async (league): Promise<LeagueCardData> => {
      const [weeks, players, claim, pendingCount] = await Promise.all([
        getWeeks(league.id),
        getPlayerStats(league.id),
        getMyClaimInfo(league.id),
        getPendingBadgeCount(league.id), // 0 for non-admins, no query
      ])
      const dayIndex = dayNameToIndex(league.day) ?? undefined
      const seed = getNextMatchSeed(weeks, league.kickoff_time)
      const scheduled = seed?.status === 'scheduled' ? seed : null
      const linked = claim.playerName ? players.find((p) => p.name === claim.playerName) ?? null : null
      const table = computeQuarterlyTable(weeks, leagueNow(), dayIndex)

      return {
        id: league.id,
        href: leagueLandingPath(league.slug, userAgent, viewport),
        name: league.name,
        meta: [formatKickoffTime(league.kickoff_time), league.location].filter(Boolean).join(' · ') || null,
        nextDate: nextMatchDate(weeks, scheduled?.date ?? null, dayIndex),
        lineupsSet: scheduled !== null,
        team: !scheduled || !linked ? null
          : scheduled.teamA.includes(linked.name) ? 'A'
          : scheduled.teamB.includes(linked.name) ? 'B'
          : null,
        pendingCount,
        hasResults: weeks.some((w) => w.status === 'played'),
        isAdmin: league.role === 'admin' || league.role === 'creator',
        you: linked && {
          position: getQuarterStanding(table.allEntries, linked.name)?.position ?? null,
          quarterLabel: `Q${table.displayQ}`,
          form: linked.recentForm,
          lastGame: lastGameResult(weeks, linked.name),
        },
      }
    }))

    const pending = (requests ?? []).flatMap((r): PendingLeague[] => {
      const game = r.games as unknown as Pick<GameRow, 'id' | 'name' | 'slug'> | null
      return game ? [{ id: game.id, name: game.name, href: leagueLandingPath(game.slug, userAgent, viewport) }] : []
    })

    return <LeagueList leagues={cards} pending={pending} />
  }

  // Unauthenticated: marketing landing page
  return <LandingPage />
}
