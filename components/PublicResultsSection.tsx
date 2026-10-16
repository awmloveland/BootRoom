'use client'

import { PublicMatchEntrySection } from '@/components/PublicMatchEntrySection'
import { PublicMatchList } from '@/components/PublicMatchList'
import { YearTabs, useResultsYear } from '@/components/YearTabs'
import type { ResultsCelebration } from '@/lib/sidebar-stats'
import type { ScheduledWeek, Week } from '@/lib/types'

interface Props {
  gameId: string
  leagueSlug: string
  leagueName: string
  weeks: Week[]
  nextWeek: ScheduledWeek | null
  celebration: ResultsCelebration | null
  resultShareUrl: string | null     // signed link for the most recent result's Share button
  kickoffTime: string | null        // league kick-off time, when a scheduled game starts awaiting its result
}

/** Public results: year tabs, the next match on the current year, then the selected year's results. */
export function PublicResultsSection({
  gameId,
  leagueSlug,
  leagueName,
  weeks,
  nextWeek,
  celebration,
  resultShareUrl,
  kickoffTime,
}: Props) {
  const { seasons, year, isDefaultYear, selectYear } = useResultsYear(weeks)

  return (
    <>
      <YearTabs years={seasons} selected={year} onSelect={selectYear} />
      {nextWeek && (
        <div hidden={!isDefaultYear}>
          <PublicMatchEntrySection
            gameId={gameId}
            leagueSlug={leagueSlug}
            weeks={weeks}
            initialScheduledWeek={nextWeek}
            leagueName={leagueName}
            kickoffTime={kickoffTime}
          />
        </div>
      )}
      <section>
        {/* Keyed by year so the open card resets to that year's latest result. */}
        <PublicMatchList
          key={year}
          weeks={weeks}
          season={year}
          celebration={celebration}
          leagueName={leagueName}
          leagueSlug={leagueSlug}
          resultShareUrl={resultShareUrl}
          kickoffTime={kickoffTime}
        />
      </section>
    </>
  )
}
