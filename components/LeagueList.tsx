import Link from 'next/link'
import { ChevronRight, Clock, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FormDots, FORM_COLOR } from '@/components/FormDots'
import { cn, ordinalSuffix } from '@/lib/utils'
import { DAY_SHORT, daysAwayLabel, parseWeekDate } from '@/lib/dates'
import type { lastGameResult } from '@/lib/standings'

export interface LeagueCardData {
  id: string
  href: string
  name: string
  /** Kick-off time and venue, e.g. '6:30pm · Riverside 3G'. */
  meta: string | null
  /** 'DD MMM YYYY', or null while no game day is known. */
  nextDate: string | null
  lineupsSet: boolean
  /** The viewer's side in the next line-up, when they are in it. */
  team: 'A' | 'B' | null
  /** Join requests and claims waiting on the viewer as an admin. */
  pendingCount: number
  hasResults: boolean
  isAdmin: boolean
  /** Null when the viewer has no linked player in this league. */
  you: {
    position: number | null
    quarterLabel: string
    form: string
    lastGame: ReturnType<typeof lastGameResult>
  } | null
}

const TAG_TONE = {
  muted: 'border-[#223a5c] text-[#8ba4c4]',
  sky: 'border-[#38bdf8]/40 bg-[#38bdf8]/12 text-[#7dd3fc]',
  violet: 'border-[#a78bfa]/40 bg-[#a78bfa]/12 text-[#c4b5fd]',
  lime: 'border-[#bef264]/40 bg-[#bef264]/10 text-[#bef264]',
  amber: 'border-[#fbbf24]/40 bg-[#fbbf24]/10 text-[#fbbf24]',
}

export function Tag({ tone = 'muted', children }: { tone?: keyof typeof TAG_TONE; children: React.ReactNode }) {
  return (
    <span className={cn('rounded border px-1.5 py-[3px] font-plex text-[8.5px] font-bold uppercase tracking-[.14em]', TAG_TONE[tone])}>
      {children}
    </span>
  )
}

export function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-3 py-2.5">
      <p className="font-plex text-[8px] font-bold uppercase tracking-[.16em] text-[#6f88a8]">{label}</p>
      <div className="mt-1.5 font-plex text-xs font-bold leading-none text-[#f4f9ff]">{children}</div>
    </div>
  )
}

const TILE = 'flex w-[54px] shrink-0 flex-col items-center justify-center rounded-lg'

function LeagueCard({ league }: { league: LeagueCardData }) {
  const { nextDate, you } = league
  const away = nextDate ? daysAwayLabel(nextDate) : null
  const [day, month] = nextDate?.split(' ') ?? []

  return (
    <Link
      href={league.href}
      className="block overflow-hidden rounded-xl border border-[#1b2c46] bg-[#0a1421] shadow-[0_18px_44px_rgba(0,0,0,.42)] transition-colors hover:border-[#38bdf8]"
    >
      <div className="flex items-stretch gap-3.5 p-3">
        {nextDate ? (
          <div className={cn(TILE, 'border border-[#2c4a72] bg-[#0c1728] py-2')}>
            <span className="font-plex text-[9px] font-bold uppercase tracking-[.16em] text-[#38bdf8]">
              {DAY_SHORT[parseWeekDate(nextDate).getDay()]}
            </span>
            <span className="mt-0.5 text-[22px] font-bold leading-none tracking-[-.03em] text-[#f4f9ff]">{parseInt(day, 10)}</span>
            <span className="mt-1 font-plex text-[8.5px] font-bold uppercase tracking-[.16em] text-[#6f88a8]">{month}</span>
          </div>
        ) : (
          <div className={cn(TILE, 'border border-dashed border-[#223a5c] py-2')}>
            <span className="font-plex text-[9px] font-bold uppercase tracking-[.16em] text-[#4f688a]">TBC</span>
          </div>
        )}

        <div className="min-w-0 flex-1 py-0.5">
          <p className="truncate text-base font-bold tracking-[-.02em] text-[#f4f9ff]">{league.name}</p>
          {(league.meta || !nextDate) && (
            <p className="mt-1 truncate font-inter-body text-xs text-[#8ba4c4]">
              {league.meta ?? 'No match scheduled yet'}
            </p>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 empty:hidden">
            {away && <Tag tone="sky">{away}</Tag>}
            {league.team && <Tag tone={league.team === 'A' ? 'sky' : 'violet'}>You&apos;re on Team {league.team}</Tag>}
            {league.lineupsSet && !league.team && <Tag tone="lime">Line-ups set</Tag>}
            {nextDate && !league.lineupsSet && <Tag>Line-ups not picked</Tag>}
            {league.pendingCount > 0 && (
              <Tag tone="sky">
                {league.pendingCount} {league.pendingCount === 1 ? 'request' : 'requests'} to review
              </Tag>
            )}
          </div>
        </div>

        <ChevronRight className="size-4 shrink-0 self-center text-[#6f88a8]" />
      </div>

      {you ? (
        <div className="grid grid-cols-3 divide-x divide-[#17263c] border-t border-[#17263c] bg-[#0c1728]/60">
          <Cell label={`${you.quarterLabel} table`}>
            {you.position ? (
              <>{you.position}<span className="text-[9px]">{ordinalSuffix(you.position)}</span></>
            ) : (
              <span className="text-[#4f688a]">·</span>
            )}
          </Cell>
          <Cell label="Your form">
            <FormDots form={you.form} className="text-xs" />
          </Cell>
          <Cell label="Last game">
            {you.lastGame ? (
              <span className={FORM_COLOR[you.lastGame.result]}>{you.lastGame.label}</span>
            ) : (
              <span className="text-[#4f688a]">·</span>
            )}
          </Cell>
        </div>
      ) : !league.hasResults && (
        <p className="border-t border-[#17263c] bg-[#0c1728]/60 px-3 py-2.5 font-inter-body text-xs text-[#8ba4c4]">
          {league.isAdmin ? 'No results yet. Record your first game to start the table.' : 'No results yet.'}
        </p>
      )}
    </Link>
  )
}

/** A league the viewer has asked to join and is still waiting on. */
export interface PendingLeague {
  id: string
  name: string
  href: string
}

function PendingCard({ league }: { league: PendingLeague }) {
  return (
    <Link
      href={league.href}
      className="flex items-stretch gap-3.5 rounded-xl border border-[#1b2c46] bg-[#0a1421] p-3 transition-colors hover:border-[#38bdf8]"
    >
      <span className={cn(TILE, 'border border-dashed border-[#223a5c] text-[#6f88a8]')}>
        <Clock className="size-5" />
      </span>
      <div className="min-w-0 flex-1 py-0.5">
        <p className="truncate text-base font-bold tracking-[-.02em] text-[#f4f9ff]">{league.name}</p>
        <p className="mt-1 truncate font-inter-body text-xs text-[#8ba4c4]">Waiting for an admin to let you in.</p>
        <div className="mt-2.5 flex">
          <Tag tone="amber">Request pending</Tag>
        </div>
      </div>
      <ChevronRight className="size-4 shrink-0 self-center text-[#6f88a8]" />
    </Link>
  )
}

/** The signed-in home page for anyone who is not in exactly one league. */
export function LeagueList({ leagues, pending = [] }: { leagues: LeagueCardData[]; pending?: PendingLeague[] }) {
  return (
    <main className="px-4 sm:px-6 pt-5 pb-14">
      <div className="mx-auto w-full max-w-xl pt-4">
        <h1 className="text-[26px] sm:text-[30px] leading-none font-bold tracking-[-.035em] text-[#f4f9ff]">
          Your leagues
        </h1>
        {leagues.length === 0 && pending.length === 0 ? (
          <>
            <p className="mt-2.5 font-inter-body text-[13px] text-[#8ba4c4]">You&apos;re not in a league yet.</p>
            <div className="relative mt-6 overflow-hidden rounded-xl border border-[#2c4a72] bg-[#0a1421] shadow-[0_18px_44px_rgba(0,0,0,.42)]">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(56,189,248,.16),transparent_45%),radial-gradient(circle_at_90%_100%,rgba(190,242,100,.1),transparent_40%)]"
              />
              <div className="relative p-5">
                <p className="font-plex text-[9px] font-bold uppercase tracking-[.2em] text-[#bef264]">Run your own game</p>
                <p className="mt-2.5 text-xl font-bold leading-tight tracking-[-.025em] text-[#f4f9ff]">
                  Create a league for your weekly game
                </p>
                <p className="mt-2 font-inter-body text-[13px] leading-[1.55] text-[#8ba4c4]">
                  Add your players and record each result. The table, form and stats build themselves.
                </p>
                <Button asChild className="mt-4 gap-2">
                  <Link href="/new">
                    <Plus className="size-4" />
                    Create a league
                  </Link>
                </Button>
              </div>
            </div>
            <p className="mt-5 font-inter-body text-xs leading-[1.55] text-[#6f88a8]">
              Joining someone else&apos;s league? Open the link they sent you and ask to join from there.
            </p>
          </>
        ) : (
          <>
            <div className="mt-6 flex flex-col gap-2.5">
              {leagues.map((league) => <LeagueCard key={league.id} league={league} />)}
              {pending.map((league) => <PendingCard key={league.id} league={league} />)}
            </div>
            <Link
              href="/new"
              className="mt-5 flex items-center gap-3.5 rounded-xl border border-dashed border-[#223a5c] p-3 transition-colors hover:border-[#38bdf8]"
            >
              <span className={cn(TILE, 'h-[54px] bg-[#38bdf8]/12 text-[#7dd3fc]')}>
                <Plus className="size-5" />
              </span>
              <span>
                <span className="block text-[15px] font-bold tracking-[-.02em] text-[#f4f9ff]">Create a league</span>
                <span className="mt-0.5 block font-inter-body text-xs text-[#8ba4c4]">
                  Set one up for your own game in a few minutes.
                </span>
              </span>
            </Link>
          </>
        )}
      </div>
    </main>
  )
}
