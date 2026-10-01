'use client'

import Link from 'next/link'
import { useSelectedLayoutSegment } from 'next/navigation'
import { LayoutGrid, ClipboardList, Users, Trophy, FlaskConical, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ScrollTabIntoView } from '@/components/ScrollTabIntoView'

// Overview stands in for the stats sidebar, so it only exists below lg.
const TABS: { key: string; label: string; icon: LucideIcon; className?: string }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutGrid, className: 'lg:hidden' },
  { key: 'results', label: 'Results', icon: ClipboardList },
  { key: 'players', label: 'Players', icon: Users },
  { key: 'honours', label: 'Honours', icon: Trophy },
  { key: 'lineup-lab', label: 'Lineup Lab', icon: FlaskConical },
]

/**
 * League tab bar. Lives in the persistent league layout, so it reads the
 * active tab from the URL rather than a prop: the underline moves the moment
 * a tab is clicked, while the page below is still loading.
 */
export function LeagueTabNav({ leagueSlug }: { leagueSlug: string }) {
  const currentTab = useSelectedLayoutSegment()

  return (
    <nav className="relative flex gap-1 overflow-x-auto border-b border-[#17263c] mt-5 -mx-4 px-4 sm:mx-0 sm:px-0 touch-pan-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {TABS.map(({ key, label, icon: Icon, className }) => (
        <Link
          key={key}
          href={`/${leagueSlug}/${key}`}
          aria-current={currentTab === key ? 'page' : undefined}
          className={cn(
            '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 pb-[11px] font-plex text-[10.5px] font-bold uppercase tracking-[.14em] whitespace-nowrap transition-colors',
            currentTab === key
              ? 'border-[#38bdf8] text-[#f4f9ff]'
              : 'border-transparent text-[#8ba4c4] hover:text-[#f4f9ff]',
            className
          )}
        >
          <ScrollTabIntoView active={currentTab === key} />
          <Icon className="size-[13px]" />
          {label}
        </Link>
      ))}
    </nav>
  )
}
