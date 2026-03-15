'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Week, GameRole, LeagueFeature } from '@/lib/types'
import { sortWeeks, getPlayedWeeks, getMonthKey, formatMonthYear } from '@/lib/utils'
import { fetchWeeks, fetchGames } from '@/lib/data'
import { isFeatureEnabled } from '@/lib/features'
import { resolveVisibilityTier } from '@/lib/roles'
import { MatchCard } from '@/components/MatchCard'
import { MonthDivider } from '@/components/MonthDivider'
import { NextMatchCard } from '@/components/NextMatchCard'

export default function LeaguePage() {
  const params = useParams()
  const leagueId = (params?.id as string) ?? ''

  const [leagueName, setLeagueName] = useState('')
  const [weeks, setWeeks] = useState<Week[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openWeek, setOpenWeek] = useState<number | null>(null)
  const [hasAccess, setHasAccess] = useState(false)
  const [userRole, setUserRole] = useState<GameRole>('member')
  const [features, setFeatures] = useState<LeagueFeature[]>([])

  const load = useCallback(async () => {
    try {
      const [games, weeksData] = await Promise.all([
        fetchGames(),
        fetchWeeks(leagueId),
      ])
      const game = games.find((g) => g.id === leagueId)
      if (!game) {
        try {
          const res = await fetch(`/api/league/${leagueId}/public`)
          const { public_results_enabled } = await res.json()
          if (public_results_enabled) {
            const { createClient } = await import('@/lib/supabase/client')
            const supabase = createClient()
            await supabase.rpc('join_public_league', { p_game_id: leagueId })
            window.location.reload()
            return
          }
        } catch {
          // fall through to access denied
        }
        setHasAccess(false)
        setLoading(false)
        return
      }

      setHasAccess(true)
      setLeagueName(game.name)
      setUserRole(game.role)

      const displayWeeks = sortWeeks(weeksData)
      const playedWeeks = getPlayedWeeks(displayWeeks)
      const mostRecentPlayed =
        playedWeeks.length > 0
          ? playedWeeks.reduce((a, b) => (a.week > b.week ? a : b))
          : null

      setWeeks(displayWeeks)
      setOpenWeek(mostRecentPlayed?.week ?? null)

      // Load feature flags
      try {
        const featRes = await fetch(`/api/league/${leagueId}/features`, { credentials: 'include' })
        if (featRes.ok) {
          const featData: LeagueFeature[] = await featRes.json()
          setFeatures(featData)
        }
      } catch {
        // Features failed to load — fall back to empty list (admins bypass; members see nothing)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [leagueId])

  useEffect(() => {
    load()
  }, [load])

  const handleToggle = (weekNum: number) => {
    setOpenWeek((prev) => (prev === weekNum ? null : weekNum))
  }

  const tier = resolveVisibilityTier(userRole)
  const isAdmin = tier === 'admin'
  const canSeeResults = isAdmin || isFeatureEnabled(features, 'match_history', tier)
  const canSeeMatchEntry = isAdmin || isFeatureEnabled(features, 'match_entry', tier)
  const showNextMatch = canSeeMatchEntry

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <p className="text-slate-400">Loading…</p>
      </div>
    )
  }

  if (!hasAccess) {
    return (
      <main className="max-w-md mx-auto px-4 sm:px-6 py-12 text-center">
        <h1 className="text-xl font-semibold text-slate-100 mb-2">League</h1>
        <p className="text-slate-400 text-sm mb-6">
          You need an invite to view this league. Ask an admin to send you an invite link.
        </p>
        <Link
          href="/"
          className="inline-block px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm font-medium"
        >
          Your leagues
        </Link>
      </main>
    )
  }

  if (error) {
    return (
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <p className="text-red-400 mb-4">{error}</p>
        <Link href="/" className="text-sky-400 hover:underline">Back to leagues</Link>
      </main>
    )
  }

  if (!canSeeResults) {
    return (
      <main className="max-w-md mx-auto px-4 sm:px-6 py-12 text-center">
        <h1 className="text-xl font-semibold text-slate-100 mb-2">Match History</h1>
        <p className="text-slate-400 text-sm mb-6">
          Match history has been disabled by your league admin.
        </p>
        <Link
          href="/"
          className="inline-block px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm font-medium"
        >
          Your leagues
        </Link>
      </main>
    )
  }

  return (
    <>
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
        <div className="flex flex-col gap-3">
          {showNextMatch && (
            <NextMatchCard
              gameId={leagueId}
              weeks={weeks}
              onResultSaved={load}
              canEdit={canSeeMatchEntry}
            />
          )}

          {weeks.length === 0 ? (
            <p className="text-slate-400 text-sm">No match data yet. Add game data to get started.</p>
          ) : (
            weeks.map((week, index) => {
              const monthChanged =
                index > 0 &&
                getMonthKey(week.date) !== getMonthKey(weeks[index - 1].date)
              return (
                <Fragment key={week.week}>
                  {monthChanged && <MonthDivider label={formatMonthYear(week.date)} />}
                  <MatchCard
                    week={week}
                    isOpen={openWeek === week.week}
                    onToggle={() => handleToggle(week.week)}
                  />
                </Fragment>
              )
            })
          )}
        </div>
      </main>
    </>
  )
}
