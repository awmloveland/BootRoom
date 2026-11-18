'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Check, ChevronDown, ChevronsUpDown, LayoutList, Plus } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn, getInitials } from '@/lib/utils'
import type { NavSession } from '@/lib/types'

type League = NavSession['leagues'][number]

const LABEL = 'font-plex text-[9px] font-bold uppercase tracking-[.16em] text-[#6f88a8]'
const SHEET_ROW = 'flex items-center gap-2.5 rounded px-2 py-3'
const SHEET_ACTION = cn(SHEET_ROW, 'py-2.5 text-sm font-semibold text-[#8ba4c4]')

// shortcut: rows link to /[slug] and take its redirect to the landing tab;
// pass landing paths from the server if the extra hop becomes noticeable.
const leagueHref = (league: League) => `/${league.slug}`

function LeagueCrest({ name, active }: { name: string; active: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded border font-plex text-[10px] font-bold tracking-[.04em]',
        active ? 'border-[#38bdf8]/40 bg-[#38bdf8]/12 text-[#7dd3fc]' : 'border-[#223a5c] bg-[#0c1728] text-[#8ba4c4]'
      )}
    >
      {getInitials(name)}
    </span>
  )
}

function RowContent({ league, current }: { league: League; current: boolean }) {
  return (
    <>
      <LeagueCrest name={league.name} active={current} />
      <span className="min-w-0 flex-1 truncate font-inter-body text-[13px] font-semibold text-[#f4f9ff]">{league.name}</span>
      {league.role !== 'member' && (
        <span className="font-plex text-[8.5px] font-bold uppercase tracking-[.14em] text-[#6f88a8]">Admin</span>
      )}
      {current && <Check aria-hidden className="size-3.5 shrink-0 text-[#38bdf8]" />}
    </>
  )
}

interface RowsProps {
  leagues: League[]
  currentSlug?: string
  /** Called when a league is picked, so the sheet holding the rows can close. */
  onNavigate?: () => void
}

/** The viewer's leagues as tappable rows, for the mobile sheets. */
export function LeagueRows({ leagues, currentSlug, onNavigate }: RowsProps) {
  return (
    <ul>
      {leagues.map((league) => {
        const current = league.slug === currentSlug
        return (
          <li key={league.slug}>
            <Link
              href={leagueHref(league)}
              aria-current={current ? 'true' : undefined}
              onClick={onNavigate}
              className={cn(SHEET_ROW, current && 'bg-[#0c1728]')}
            >
              <RowContent league={league} current={current} />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

/** The viewer's leagues as dropdown items, for the desktop menus. */
export function LeagueMenuItems({ leagues, currentSlug }: Pick<RowsProps, 'leagues' | 'currentSlug'>) {
  return (
    <>
      <p className={cn(LABEL, 'px-2 py-1.5')}>Your leagues</p>
      {leagues.map((league) => {
        const current = league.slug === currentSlug
        return (
          <DropdownMenuItem key={league.slug} asChild className="gap-2.5 py-2">
            <Link href={leagueHref(league)} aria-current={current ? 'true' : undefined}>
              <RowContent league={league} current={current} />
            </Link>
          </DropdownMenuItem>
        )
      })}
    </>
  )
}

interface SwitcherProps {
  leagues: League[]
  current: League
}

/** Desktop navbar: the current league beside the logo, opening the league menu. */
export function NavLeagueSwitcher({ leagues, current }: SwitcherProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Switch league, currently ${current.name}`}
          className="flex min-w-0 items-center gap-2 rounded px-1.5 py-1 transition-colors hover:bg-[#101d31] focus-visible:bg-[#101d31] focus-visible:outline-none"
        >
          <LeagueCrest name={current.name} active />
          <span className="truncate text-sm font-bold tracking-[-.01em] text-[#f4f9ff]">{current.name}</span>
          <ChevronsUpDown aria-hidden className="size-3.5 shrink-0 text-[#6f88a8]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[290px]">
        <LeagueMenuItems leagues={leagues} currentSlug={current.slug} />
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/"><LayoutList className="size-4" />All leagues</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/new"><Plus className="size-4" />Create a league</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Mobile navbar: the current league beside the logo, opening a bottom sheet. */
export function MobileLeagueSwitcher({ leagues, current }: SwitcherProps) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={`Switch league, currently ${current.name}`}
          className="flex min-w-0 items-center gap-2 text-[#f4f9ff]"
        >
          <LeagueCrest name={current.name} active />
          <span className="truncate text-[15px] font-bold tracking-[-.02em]">{current.name}</span>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-[#6f88a8]" />
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl border-[#223a5c] bg-[#0a1421] px-3 pt-5 pb-5">
        <SheetTitle className={cn(LABEL, 'px-2 pb-2')}>Your leagues</SheetTitle>
        <LeagueRows leagues={leagues} currentSlug={current.slug} onNavigate={close} />
        <div className="mt-1 border-t border-[#17263c] pt-1">
          <Link href="/" onClick={close} className={SHEET_ACTION}><LayoutList className="size-4" />All leagues</Link>
          <Link href="/new" onClick={close} className={SHEET_ACTION}><Plus className="size-4" />Create a league</Link>
        </div>
      </SheetContent>
    </Sheet>
  )
}
