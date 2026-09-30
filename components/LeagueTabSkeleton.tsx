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
  return <div className={cn('rounded-md bg-slate-800 animate-pulse', className)} />
}

/**
 * Placeholder for the four league tab pages. Mirrors the real page structure
 * (header, info bar, tab nav, content cards, desktop sidebar) so nothing
 * shifts when the real content streams in. The tab nav is real text with the
 * active tab underlined, so a click visibly "lands" before any data arrives.
 *
 * The skeleton starts invisible and fades in after a short delay via
 * `@starting-style` (Tailwind's `starting:` variant). Fast navigations swap
 * straight to content with no skeleton flash; slow ones still get the
 * placeholder. Browsers without `@starting-style` show it immediately.
 */
export function LeagueTabSkeleton({ tab }: { tab: LeagueTab }) {
  return (
    <main
      className="px-4 sm:px-6 pt-4 pb-8 opacity-100 starting:opacity-0 transition-opacity duration-300 delay-200"
      aria-busy="true"
    >
      <div className="flex justify-center gap-6 items-start">
        <div className="w-full max-w-xl shrink-0">
          {/* Header: title + subtitle on the left, join/share button on the right */}
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <div>
                <Block className="h-8 w-48" />
                <Block className="mt-2 h-3 w-40" />
              </div>
              <Block className="h-9 w-20" />
            </div>
            <div className="mt-3">
              <Block className="h-10 w-full rounded-lg" />
            </div>
            <ul className="flex gap-6 overflow-x-auto border-b border-slate-700 pt-5 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {TABS.map(({ key, label, Icon }) => (
                <li
                  key={key}
                  aria-current={tab === key ? 'page' : undefined}
                  className={cn(
                    '-mb-px flex shrink-0 items-center gap-2 border-b-2 pb-2 text-sm font-medium whitespace-nowrap',
                    tab === key
                      ? 'border-slate-200 text-slate-200'
                      : 'border-transparent text-slate-400'
                  )}
                >
                  <Icon className="size-3.5" />
                  {label}
                </li>
              ))}
            </ul>
          </div>

          {/* Content cards */}
          <div className="flex flex-col gap-3">
            <Block className="h-24 rounded-lg" />
            <Block className="h-24 rounded-lg" />
            <Block className="h-24 rounded-lg" />
          </div>
        </div>

        {/* Desktop sidebar — same visibility rule as SidebarSticky */}
        <div className="hidden lg:block w-72 shrink-0 space-y-3">
          <Block className="h-40 rounded-lg" />
          <Block className="h-56 rounded-lg" />
        </div>
      </div>
    </main>
  )
}
