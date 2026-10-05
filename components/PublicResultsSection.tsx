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
  canEditMatchEntry: boolean
  showMatchHistory: boolean
  canShareImage: boolean
  celebration: ResultsCelebration | null
}

/** Public results: year tabs, the next match on the current year, then the selected year's results. */
export function PublicResultsSection({
  gameId,
  leagueSlug,
  leagueName,
  weeks,
  nextWeek,
  canEditMatchEntry,
  showMatchHistory,
  canShareImage,
  celebration,
}: Props) {
  const { seasons, year, isDefaultYear, selectYear } = useResultsYear(weeks)

  return (
    <>
      {showMatchHistory && <YearTabs years={seasons} selected={year} onSelect={selectYear} />}
      {nextWeek && (
        // Hidden rather than unmounted on past years, so a half-built line-up survives a year switch.
        <div hidden={showMatchHistory && !isDefaultYear}>
          <PublicMatchEntrySection
            gameId={gameId}
            leagueSlug={leagueSlug}
            weeks={weeks}
            initialScheduledWeek={nextWeek}
            canEdit={canEditMatchEntry}
            leagueName={leagueName}
            canShareImage={canShareImage}
          />
        </div>
      )}
      {showMatchHistory && (
        <section>
          {/* Keyed by year so the open card resets to that year's latest result. */}
          <PublicMatchList
            key={year}
            weeks={weeks}
            season={year}
            celebration={celebration}
            leagueName={leagueName}
            leagueSlug={leagueSlug}
          />
        </section>
      )}
    </>
  )
}
