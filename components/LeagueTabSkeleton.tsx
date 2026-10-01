import { cn } from '@/lib/utils'
import { LeagueTabNav } from '@/components/LeagueTabNav'

function Block({ className }: { className?: string }) {
  return <div className={cn('rounded bg-[#17263c] animate-pulse', className)} />
}

/** Collapsed MatchCard shape: week title and meta line, result pill on the right. */
function CardSkeleton() {
  return (
    <div className="rounded-xl border border-[#1b2c46] bg-[#0a1421] px-[18px] py-3 flex items-center justify-between gap-3">
      <div>
        <Block className="h-3.5 w-20" />
        <Block className="mt-2 h-2.5 w-32" />
      </div>
      <Block className="h-5 w-16" />
    </div>
  )
}

/** StatsSidebar widget shape: header band over a body of rows. */
function WidgetSkeleton({ rows }: { rows: number }) {
  return (
    <div className="rounded-xl border border-[#1b2c46] bg-[#0a1421] overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-[#17263c] bg-[#0c1728]">
        <Block className="h-2.5 w-24 my-[1px]" />
      </div>
      <div className="p-3.5 flex flex-col gap-2.5">
        {Array.from({ length: rows }, (_, i) => (
          <Block key={i} className="h-3 w-full" />
        ))}
      </div>
    </div>
  )
}

/**
 * Placeholder for LeaguePageHeader while the league layout streams in on a
 * full page load. Spacing matches the real header so the tab bar lands where
 * the real one does. The tab bar itself is the real, clickable nav.
 */
export function LeagueHeaderSkeleton({ leagueSlug }: { leagueSlug: string }) {
  return (
    <div className="mb-[18px]" aria-busy="true">
      <div className="flex items-start justify-between gap-3.5">
        <div>
          <div className="flex items-center gap-2 h-6">
            <span className="h-0.5 w-[18px] bg-[#bef264]" />
            <Block className="h-2.5 w-20" />
          </div>
          <Block className="mt-2 h-[26px] sm:h-[30px] w-52" />
          <div className="mt-2 flex h-[15px] items-center">
            <Block className="h-2.5 w-44" />
          </div>
        </div>
        <div className="shrink-0 pt-[22px]">
          <Block className="h-8 w-28" />
        </div>
      </div>
      <div className="mt-3.5 space-y-2.5">
        <div className="flex flex-wrap gap-1.5">
          <Block className="h-6 w-28" />
          <Block className="h-6 w-24" />
          <Block className="h-6 w-20" />
        </div>
        <div className="flex h-[19px] items-center">
          <Block className="h-3 w-56" />
        </div>
      </div>
      <LeagueTabNav leagueSlug={leagueSlug} />
    </div>
  )
}

/** Placeholder for the desktop StatsSidebar, same visibility rule as SidebarSticky. */
export function LeagueSidebarSkeleton() {
  return (
    <div className="hidden lg:flex w-72 shrink-0 flex-col gap-3" aria-busy="true">
      <WidgetSkeleton rows={10} />
      <WidgetSkeleton rows={5} />
    </div>
  )
}

/**
 * Placeholder for a league tab's content while the page renders. The header,
 * tab bar and sidebar live in the league layout and stay on screen during tab
 * switches, so only the content column is replaced.
 *
 * The skeleton starts invisible and fades in after a short delay via
 * `@starting-style` (Tailwind's `starting:` variant). Fast navigations swap
 * straight to content with no skeleton flash; slow ones still get the
 * placeholder. Browsers without `@starting-style` show it immediately.
 */
export function LeagueTabSkeleton() {
  return (
    <div
      className="flex flex-col gap-3 opacity-100 starting:opacity-0 transition-opacity duration-300 delay-200"
      aria-busy="true"
    >
      {Array.from({ length: 5 }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  )
}
