import { cn } from '@/lib/utils'
import { LeagueTabNav } from '@/components/LeagueTabNav'
import { Skeleton, SkeletonCard, SKELETON_FADE_IN } from '@/components/ui/skeleton'

/** Collapsed MatchCard shape: week title and meta line, result pill on the right. */
function CardSkeleton() {
  return (
    <div className="rounded-xl border border-[#1b2c46] bg-[#0a1421] px-[18px] py-3 flex items-center justify-between gap-3">
      <div>
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="mt-2 h-2.5 w-32" />
      </div>
      <Skeleton className="h-5 w-16" />
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
            <Skeleton className="h-2.5 w-20" />
          </div>
          <Skeleton className="mt-2 h-[26px] sm:h-[30px] w-52" />
          <div className="mt-2 flex h-[15px] items-center">
            <Skeleton className="h-2.5 w-44" />
          </div>
        </div>
        <div className="shrink-0 pt-[22px]">
          <Skeleton className="h-8 w-28" />
        </div>
      </div>
      <div className="mt-3.5 space-y-2.5">
        <div className="flex flex-wrap gap-1.5">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-20" />
        </div>
        <div className="flex h-[19px] items-center">
          <Skeleton className="h-3 w-56" />
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
      <SkeletonCard rows={10} />
      <SkeletonCard rows={5} />
    </div>
  )
}

/**
 * Placeholder for a league tab's content while the page renders. The header,
 * tab bar and sidebar live in the league layout and stay on screen during tab
 * switches, so only the content column is replaced.
 *
 * The skeleton fades in after a short delay (SKELETON_FADE_IN), so fast
 * navigations swap straight to content with no skeleton flash.
 */
export function LeagueTabSkeleton() {
  return (
    <div
      className={cn('flex flex-col gap-3', SKELETON_FADE_IN)}
      aria-busy="true"
    >
      {Array.from({ length: 5 }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  )
}
