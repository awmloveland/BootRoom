'use client'

import { Fragment, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Week } from '@/lib/types'
import { sortWeeks, getPlayedWeeks, deriveSeason, getMonthKey, formatMonthYear } from '@/lib/utils'
import { fetchWeeks, fetchGames } from '@/lib/data'
import { MatchCard } from '@/components/MatchCard'
import { MonthDivider } from '@/components/MonthDivider'

export default function LeaguePage() {
  const params = useParams()
  const leagueId = (params?.id as string) ?? ''

  const [leagueName, setLeagueName] = useState('')
  const [weeks, setWeeks] = useState<Week[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openWeek, setOpenWeek] = useState<number | null>(null)
  const [hasAccess, setHasAccess] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const [games, weeksData] = await Promise.all([
          fetchGames(),
          fetchWeeks(leagueId),
        ])
        const game = games.find((g) => g.id === leagueId)
        if (!game) {
          // Check if this is a public league — if so, auto-join as member
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

        const displayWeeks = sortWeeks(weeksData)
        const playedWeeks = getPlayedWeeks(displayWeeks)
        const mostRecentPlayed =
          playedWeeks.length > 0
            ? playedWeeks.reduce((a, b) => (a.week > b.week ? a : b))
            : null

        setWeeks(displayWeeks)
        setOpenWeek(mostRecentPlayed?.week ?? null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [leagueId])

  const handleToggle = (weekNum: number) => {
    setOpenWeek((prev) => (prev === weekNum ? null : weekNum))
  }

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

  const season = deriveSeason(weeks)
  const SEASON_LENGTH = 52
  const totalWeeks = weeks.length
  const pctComplete = Math.round((totalWeeks / SEASON_LENGTH) * 100)

  return (
    <>
      <div className="bg-slate-800/50 border-b border-slate-700">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between">
          <Link href="/" className="text-xs text-slate-400 hover:text-slate-300">← Leagues</Link>
          <span className="text-xs text-slate-400">
            Season {season} · {totalWeeks} of {SEASON_LENGTH} Weeks ({pctComplete}% complete)
          </span>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
        <div className="flex gap-2 mb-4">
          <Link
            href={`/league/${leagueId}/players`}
            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium"
          >
            Players
          </Link>
        </div>
        <div className="flex flex-col gap-3">
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
