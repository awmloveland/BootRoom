'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import * as Collapsible from '@radix-ui/react-collapsible'
import { ArrowRight, ChevronDown, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { pillClassName } from '@/components/YearTabs'
import type { LeagueRecord, RecordBadge, RecordsData, RivalryRecord, TitleRow } from '@/lib/types'

interface RecordsSectionProps {
  data: RecordsData
  leagueSlug: string
}

const GROUPS = [
  { id: 'career', pill: 'Career', title: 'Career records' },
  { id: 'streaks', pill: 'Streaks', title: 'Streaks' },
  { id: 'cabinet', pill: 'Cabinet', title: 'Trophy cabinet' },
  { id: 'duos', pill: 'Duos', title: 'Partnerships & rivalries' },
  { id: 'milestones', pill: 'Milestones', title: 'Milestones' },
  { id: 'matches', pill: 'Matches', title: 'Match records' },
] as const

type GroupId = (typeof GROUPS)[number]['id']

/** A group counts as active once its top is this close to the viewport top. */
const SPY_OFFSET = 120
/** How long the scroll-spy stays quiet after a pill tap, so the smooth scroll doesn't flick through pills. */
const SPY_PAUSE_MS = 900
const MAX_TROPHIES = 5

const LABEL = 'font-plex text-[8.5px] font-bold uppercase tracking-[.16em]'
const NOTE = 'font-plex text-[9px] uppercase tracking-[.1em] text-[#6f88a8]'
const VALUE = 'text-2xl font-bold tracking-[-.03em] tabular-nums'

// ── Group pills ───────────────────────────────────────────────────────────────

function GroupPills({ active, onSelect }: { active: GroupId; onSelect: (id: GroupId) => void }) {
  const rowRef = useRef<HTMLDivElement>(null)

  // Keep the active pill in view as the scroll-spy moves along the row.
  useEffect(() => {
    const row = rowRef.current
    const pill = row?.querySelector<HTMLElement>(`[data-group="${active}"]`)
    if (!row || !pill) return
    if (pill.offsetLeft < row.scrollLeft) {
      row.scrollLeft = pill.offsetLeft - 16
    } else if (pill.offsetLeft + pill.offsetWidth > row.scrollLeft + row.clientWidth) {
      row.scrollLeft = pill.offsetLeft + pill.offsetWidth - row.clientWidth + 16
    }
  }, [active])

  return (
    <div
      ref={rowRef}
      role="tablist"
      aria-label="Record groups"
      className="relative mt-5 -mx-4 px-4 sm:mx-0 sm:px-0 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {GROUPS.map((g) => (
        <button
          key={g.id}
          type="button"
          role="tab"
          data-group={g.id}
          aria-selected={g.id === active}
          onClick={() => onSelect(g.id)}
          className={pillClassName(g.id === active)}
        >
          {g.pill}
        </button>
      ))}
    </div>
  )
}

// ── Group shell ───────────────────────────────────────────────────────────────

function Group({
  id,
  meta,
  footnote,
  children,
}: {
  id: GroupId
  meta: string
  footnote?: string
  children: React.ReactNode
}) {
  const title = GROUPS.find((g) => g.id === id)!.title
  return (
    <section id={`records-${id}`} data-records-group={id} aria-label={title} className="scroll-mt-4">
      <div className="flex items-baseline justify-between px-1 mb-2.5">
        <h2 className="text-[17px] font-bold tracking-[-.02em] text-[#f4f9ff]">{title}</h2>
        <span className="font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#6f88a8]">{meta}</span>
      </div>
      <div className="rounded-xl border border-[#1b2c46] bg-[#0a1421] overflow-hidden">{children}</div>
      {footnote && (
        <p className="mx-1 mt-2 font-inter-body text-[11px] leading-normal text-[#6f88a8]">{footnote}</p>
      )}
    </section>
  )
}

// ── Badge ─────────────────────────────────────────────────────────────────────

const BADGE_LABELS: Record<RecordBadge, string> = { tied: 'Tied', live: 'Live', iron_man: 'Iron man' }

function Badge({ badge }: { badge: RecordBadge }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded border px-[7px] py-[3px] font-plex text-[8px] font-bold uppercase leading-none tracking-[.14em]',
        badge === 'live'
          ? 'border-[#38bdf8]/40 bg-[#38bdf8]/12 text-[#7dd3fc]'
          : 'border-[#223a5c] text-[#8ba4c4]'
      )}
    >
      {badge === 'live' && (
        <span className="size-[5px] rounded-full bg-[#38bdf8] animate-cf-pulse motion-reduce:animate-none" />
      )}
      {BADGE_LABELS[badge]}
    </span>
  )
}

// ── Record row ────────────────────────────────────────────────────────────────

/** Label, holder and note: the left-hand block of every record row. */
function RecordSummary({ record, muted }: { record: LeagueRecord; muted: boolean }) {
  return (
    <div className="flex-1 min-w-0">
      <p className={cn(LABEL, muted ? 'text-[#4f688a]' : 'text-[#6f88a8]')}>{record.label}</p>
      <div className="mt-1 flex items-center gap-[7px] min-w-0">
        <span
          className={cn(
            'truncate text-sm font-bold tracking-[-.01em]',
            muted ? 'text-[#8ba4c4]' : 'text-[#f4f9ff]'
          )}
        >
          {record.holderLabel}
        </span>
        {record.badge && <Badge badge={record.badge} />}
      </div>
      {record.note && <p className={cn(NOTE, 'mt-[3px]')}>{record.note}</p>}
    </div>
  )
}

/** A record row that never expands: the banter row, empty records and Next to 50. */
function StaticRecordRow({
  record,
  muted = false,
  dashed = false,
  children,
}: {
  record: LeagueRecord
  muted?: boolean
  dashed?: boolean
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3.5 py-3 border-t first:border-t-0',
        dashed ? 'border-dashed border-[#223a5c]' : 'border-[#1b2c46]'
      )}
    >
      <RecordSummary record={record} muted={muted} />
      {children ?? (
        <span className={cn(VALUE, muted ? 'text-[#6f88a8]' : 'text-[#38bdf8]')}>{record.value}</span>
      )}
    </div>
  )
}

function RecordRow({
  record,
  isOpen,
  onToggle,
}: {
  record: LeagueRecord
  isOpen: boolean
  onToggle: () => void
}) {
  // Nobody qualifies yet: muted and static, like the banter row.
  if (record.top.length === 0) return <StaticRecordRow record={record} muted />

  return (
    <Collapsible.Root open={isOpen} onOpenChange={onToggle} className="border-t border-[#1b2c46] first:border-t-0">
      <Collapsible.Trigger asChild>
        <button
          type="button"
          className="w-full flex items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-[#0c1728] data-[state=open]:bg-[#0c1728] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#38bdf8]"
        >
          <RecordSummary record={record} muted={false} />
          <span className={cn(VALUE, 'text-[#38bdf8]')}>{record.value}</span>
          <ChevronDown
            className={cn(
              'size-[15px] shrink-0 text-[#6f88a8] transition-transform duration-200',
              isOpen && 'rotate-180'
            )}
          />
        </button>
      </Collapsible.Trigger>
      <Collapsible.Content className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
        <div className="bg-[#0c1728] border-t border-[#17263c] px-3.5 pt-1 pb-3">
          <div className={cn(LABEL, 'flex justify-between px-1 pt-2 pb-1.5 text-[#4f688a]')}>
            <span>Top {record.top.length}</span>
            <span>{record.unit}</span>
          </div>
          <ol className="flex flex-col gap-0.5">
            {record.top.map((entry, i) => (
              <li
                key={entry.name}
                className={cn('flex items-center gap-2 rounded px-1 py-[5px]', i === 0 && 'bg-[#38bdf8]/7')}
              >
                <span
                  className={cn(
                    'w-3.5 shrink-0 font-plex text-[10px] font-bold',
                    i === 0 ? 'text-[#38bdf8]' : 'text-[#4f688a]'
                  )}
                >
                  {i + 1}
                </span>
                <span
                  className={cn(
                    'flex-1 min-w-0 truncate font-inter-body text-[13px]',
                    i === 0 ? 'font-bold text-[#f4f9ff]' : 'font-medium text-[#8ba4c4]'
                  )}
                >
                  {entry.name}
                </span>
                {entry.sub && (
                  <span className="shrink-0 font-plex text-[9px] uppercase tracking-[.08em] text-[#4f688a]">
                    {entry.sub}
                  </span>
                )}
                <span
                  className={cn(
                    'w-10 shrink-0 text-right font-plex text-xs font-bold tabular-nums',
                    i === 0 ? 'text-[#38bdf8]' : 'text-[#dff1ff]'
                  )}
                >
                  {entry.value}
                </span>
              </li>
            ))}
          </ol>
          {record.foot && (
            <p className="mx-1 mt-2.5 font-inter-body text-[11px] leading-normal text-[#6f88a8]">{record.foot}</p>
          )}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}

// ── Bars ──────────────────────────────────────────────────────────────────────

/** Split bar weighted by count. Zero-count segments are dropped so no gap is left behind. */
function SplitBar({ segments }: { segments: { count: number; className: string }[] }) {
  const visible = segments.filter((s) => s.count > 0)
  if (visible.length === 0) return <div className="h-2 rounded-[3px] bg-[#1b2c46]" />
  return (
    <div className="flex h-2 gap-0.5 overflow-hidden rounded-[3px]">
      {visible.map((s, i) => (
        // Width is data, so it rides on flex-grow rather than a class.
        <div key={i} className={cn('h-full basis-0', s.className)} style={{ flexGrow: s.count }} />
      ))}
    </div>
  )
}

// ── Trophy cabinet ────────────────────────────────────────────────────────────

function Titles({ rows, quartersPlayed }: { rows: TitleRow[]; quartersPlayed: number }) {
  return (
    <>
      <div className={cn(LABEL, 'flex justify-between px-3.5 pt-3 pb-1')}>
        <span className="text-[#6f88a8]">Titles</span>
        <span className="text-[#4f688a]">{quartersPlayed === 1 ? '1 quarter' : `${quartersPlayed} quarters`}</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-3.5 pt-1 pb-3 font-inter-body text-[13px] text-[#6f88a8]">
          The first champion is crowned when a quarter finishes.
        </p>
      ) : (
        <ul className="px-3.5 pb-3">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center gap-3 py-2 border-t border-[#17263c] first:border-t-0">
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    'truncate font-inter-body text-[13px] font-bold',
                    row.shared ? 'text-[#8ba4c4]' : 'text-[#f4f9ff]'
                  )}
                >
                  {row.name}
                </p>
                <p className="mt-0.5 truncate font-plex text-[9px] uppercase tracking-[.12em] text-[#6f88a8]">
                  {row.quarters}
                </p>
              </div>
              <div
                className={cn('flex items-center gap-[3px] shrink-0', row.shared ? 'text-[#6f88a8]' : 'text-[#bef264]')}
                aria-label={row.count === 1 ? '1 title' : `${row.count} titles`}
              >
                {Array.from({ length: Math.min(row.count, MAX_TROPHIES) }, (_, i) => (
                  <Trophy key={i} className="size-[13px]" aria-hidden />
                ))}
                <span className="w-[22px] text-right font-plex text-[13px] font-bold">{row.count}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

// ── Rivalry ───────────────────────────────────────────────────────────────────

function Rivalry({ rivalry }: { rivalry: RivalryRecord }) {
  const { leader, trailer, draws, games } = rivalry
  return (
    <div className="border-t border-[#1b2c46] px-3.5 pt-3 pb-3.5">
      <p className={cn(LABEL, 'text-[#6f88a8]')}>Biggest rivalry</p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <span className="truncate text-sm font-bold tracking-[-.01em] text-[#f4f9ff]">
          {leader.name} v {trailer.name}
        </span>
        <span className={cn(VALUE, 'text-[#38bdf8]')}>{games}</span>
      </div>
      <p className={cn(NOTE, 'mt-[3px]')}>Games on opposite teams</p>
      <div className="mt-3">
        <SplitBar
          segments={[
            { count: leader.wins, className: 'bg-[#38bdf8]' },
            { count: draws, className: 'bg-[#1b2c46]' },
            { count: trailer.wins, className: 'bg-[#4f688a]' },
          ]}
        />
      </div>
      <div className="mt-2 flex justify-between gap-2 font-plex text-[9px] font-bold uppercase tracking-[.12em]">
        <span className="truncate text-[#7dd3fc]">{leader.name} {leader.wins}</span>
        <span className="shrink-0 text-[#6f88a8]">{draws === 1 ? '1 draw' : `${draws} draws`}</span>
        <span className="truncate text-[#8ba4c4]">{trailer.name} {trailer.wins}</span>
      </div>
    </div>
  )
}

// ── Milestones ────────────────────────────────────────────────────────────────

function MilestoneBadges({ milestones }: { milestones: RecordsData['milestones'] }) {
  return (
    <div className="p-3.5">
      <p className={cn(LABEL, 'mb-2.5 text-[#6f88a8]')}>Appearance badges</p>
      <div className="grid grid-cols-4 gap-2">
        {milestones.map(({ threshold, players }) => {
          const reached = players > 0
          return (
            <div
              key={threshold}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-lg border px-1.5 pt-3 pb-2.5',
                reached ? 'border-[#1b2c46] bg-[#0c1728]' : 'border-dashed border-[#223a5c] opacity-80'
              )}
            >
              <span
                className={cn(
                  'flex size-[38px] items-center justify-center rounded-full border text-[15px] font-bold',
                  reached ? 'border-[#38bdf8] text-[#7dd3fc]' : 'border-dashed border-[#223a5c] text-[#4f688a]'
                )}
              >
                {threshold}
              </span>
              <span
                className={cn(
                  'font-plex text-[8px] font-bold uppercase tracking-[.12em] text-center',
                  reached ? 'text-[#8ba4c4]' : 'text-[#4f688a]'
                )}
              >
                {reached ? (players === 1 ? '1 player' : `${players} players`) : 'Nobody yet'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────

export function RecordsSection({ data, leagueSlug }: RecordsSectionProps) {
  const [openKey, setOpenKey] = useState<string | null>('most_appearances')
  const [active, setActive] = useState<GroupId>('career')
  const pausedUntil = useRef(0)

  // Scroll-spy: the active group is the last one whose top has reached SPY_OFFSET.
  useEffect(() => {
    function onScroll() {
      if (Date.now() < pausedUntil.current) return
      const groups = document.querySelectorAll<HTMLElement>('[data-records-group]')
      let current: GroupId = GROUPS[0].id
      groups.forEach((el) => {
        if (el.getBoundingClientRect().top <= SPY_OFFSET) current = el.dataset.recordsGroup as GroupId
      })
      setActive(current)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  function handleSelect(id: GroupId) {
    const el = document.getElementById(`records-${id}`)
    if (!el) return
    setActive(id)
    pausedUntil.current = Date.now() + SPY_PAUSE_MS
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({
      top: el.getBoundingClientRect().top + window.scrollY - 16,
      behavior: reduceMotion ? 'auto' : 'smooth',
    })
  }

  function toggle(key: string) {
    setOpenKey((k) => (k === key ? null : key))
  }

  const rows = (records: LeagueRecord[]) =>
    records.map((r) => (
      <RecordRow key={r.key} record={r} isOpen={openKey === r.key} onToggle={() => toggle(r.key)} />
    ))

  if (data.totalGames === 0) {
    return (
      <div className="py-16 text-center">
        <p className="font-inter-body text-[13px] text-[#6f88a8]">Records start once the first game is played.</p>
      </div>
    )
  }

  const { teamAB, biggestWin, milestones } = data
  const tenPlus = milestones.find((m) => m.threshold === 10)?.players ?? 0

  return (
    <div>
      <GroupPills active={active} onSelect={handleSelect} />

      <div className="mt-6 flex flex-col gap-[26px]">
        <Group id="career" meta="All-time tables">
          {rows(data.career)}
        </Group>

        <Group id="streaks" meta="Runs and form">
          {rows(data.streaks)}
          {data.waitForWin && <StaticRecordRow record={data.waitForWin} muted dashed />}
        </Group>

        <Group
          id="cabinet"
          meta={data.quartersPlayed === 1 ? '1 quarter played' : `${data.quartersPlayed} quarters played`}
          footnote="Fills out as more quarters are played."
        >
          <Titles rows={data.titles} quartersPlayed={data.quartersPlayed} />
        </Group>

        <Group id="duos" meta="Team sheets">
          {rows(data.duos)}
          {data.rivalry && <Rivalry rivalry={data.rivalry} />}
        </Group>

        <Group id="milestones" meta={tenPlus === 1 ? '1 player with 10+' : `${tenPlus} players with 10+`}>
          <MilestoneBadges milestones={milestones} />
          {data.nextMilestone && (
            <div className="border-t border-[#1b2c46]">
              <StaticRecordRow record={data.nextMilestone} />
            </div>
          )}
        </Group>

        <Group id="matches" meta={data.totalGames === 1 ? '1 game' : `${data.totalGames} games`}>
          {biggestWin && (
            <div className="flex items-center gap-3 px-3.5 py-3">
              <div className="flex-1 min-w-0">
                <p className={cn(LABEL, 'text-[#6f88a8]')}>Biggest win</p>
                <p className="mt-1 truncate text-sm font-bold tracking-[-.01em] text-[#f4f9ff]">
                  {biggestWin.margin}-goal margin
                </p>
                <p className={cn(NOTE, 'mt-[3px]')}>
                  {biggestWin.date.replace(/^0/, '')} · Week {biggestWin.week}
                </p>
              </div>
              <Link
                href={`/${leagueSlug}/results?year=${biggestWin.season}#week-${biggestWin.season}-${biggestWin.week}`}
                className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded border border-[#223a5c] px-2.5 font-plex text-[9px] font-bold uppercase tracking-[.12em] text-[#8ba4c4] transition-colors hover:border-[#38bdf8] hover:text-white"
              >
                Match
                <ArrowRight className="size-3" aria-hidden />
              </Link>
            </div>
          )}
          <div className={cn('px-3.5 pt-3 pb-3.5', biggestWin && 'border-t border-[#1b2c46]')}>
            <p className={cn(LABEL, 'text-[#6f88a8]')}>Team A v Team B · All time</p>
            <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-baseline">
              <span className="text-[28px] font-bold tracking-[-.03em] tabular-nums text-[#f4f9ff]">{teamAB.teamA}</span>
              <span className="font-plex text-[9px] font-bold uppercase tracking-[.14em] text-[#6f88a8]">
                {teamAB.draws === 1 ? '1 draw' : `${teamAB.draws} draws`}
              </span>
              <span className="text-right text-[28px] font-bold tracking-[-.03em] tabular-nums text-[#f4f9ff]">{teamAB.teamB}</span>
            </div>
            <div className="mt-1.5">
              <SplitBar
                segments={[
                  { count: teamAB.teamA, className: 'bg-[#38bdf8]' },
                  { count: teamAB.draws, className: 'bg-[#1b2c46]' },
                  { count: teamAB.teamB, className: 'bg-[#a78bfa]' },
                ]}
              />
            </div>
            <div className="mt-2 flex justify-between font-plex text-[9px] font-bold uppercase tracking-[.12em]">
              <span className="text-[#7dd3fc]">Team A</span>
              <span className="text-[#c4b5fd]">Team B</span>
            </div>
          </div>
        </Group>
      </div>
    </div>
  )
}
