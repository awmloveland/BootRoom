import { ClipboardList, Users, Trophy, FlaskConical } from 'lucide-react'
import { cn } from '@/lib/utils'

type LeagueTab = 'results' | 'players' | 'honours' | 'lineup-lab'

const TABS: { key: LeagueTab; label: string; Icon: typeof ClipboardList }[] = [
  { key: 'results', label: 'Results', Icon: ClipboardList },
  { key: 'players', label: 'Players', Icon: Users },
  { key: 'honours', label: 'Honours', Icon: Trophy },
  { key: 'lineup-lab', label: 'Lineup Lab', Icon: FlaskConical },
]

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
 * Placeholder for the four league tab pages. Mirrors the real page structure
 * (LeaguePageHeader, info pills, tab nav, match cards, desktop sidebar
 * widgets) so nothing shifts when the real content streams in. The tab nav is
 * real text with the active tab underlined, so a click visibly "lands" before
 * any data arrives.
 *
 * The skeleton starts invisible and fades in after a short delay via
 * `@starting-style` (Tailwind's `starting:` variant). Fast navigations swap
 * straight to content with no skeleton flash; slow ones still get the
 * placeholder. Browsers without `@starting-style` show it immediately.
 */
export function LeagueTabSkeleton({ tab }: { tab: LeagueTab }) {
  return (
    <main
      className="px-4 sm:px-6 pt-5 pb-14 opacity-100 starting:opacity-0 transition-opacity duration-300 delay-200"
      aria-busy="true"
    >
      <div className="flex justify-center gap-6 items-start">
        <div className="w-full max-w-xl shrink-0">
          {/* Header: season eyebrow, league name, meta line, join/share button */}
          <div className="mb-[18px]">
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
            <ul className="flex gap-1 overflow-x-auto border-b border-[#17263c] mt-5 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {TABS.map(({ key, label, Icon }) => (
                <li
                  key={key}
                  aria-current={tab === key ? 'page' : undefined}
                  className={cn(
                    '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 pb-[11px] font-plex text-[10.5px] font-bold uppercase tracking-[.14em] whitespace-nowrap',
                    tab === key
                      ? 'border-[#38bdf8] text-[#f4f9ff]'
                      : 'border-transparent text-[#8ba4c4]'
                  )}
                >
                  <Icon className="size-[13px]" />
                  {label}
                </li>
              ))}
            </ul>
          </div>

          {/* Content cards */}
          <div className="flex flex-col gap-3">
            {Array.from({ length: 5 }, (_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        </div>

        {/* Desktop sidebar, same visibility rule as SidebarSticky */}
        <div className="hidden lg:flex w-72 shrink-0 flex-col gap-3">
          <WidgetSkeleton rows={10} />
          <WidgetSkeleton rows={5} />
        </div>
      </div>
    </main>
  )
}
