import { cn } from '@/lib/utils'
import { computeInForm, computeQuarterlyTable, computeTeamAB, computeTeammates } from '@/lib/sidebar-stats'
import { FormDots } from '@/components/FormDots'
import { TeammatesChart } from '@/components/TeammatesChart'
import {
  ChampionBox,
  QuarterProgress,
  QuarterTableColumnLabels,
  QuarterTableRows,
  type WidgetSize,
} from '@/components/QuarterTable'
import type { Player, Week } from '@/lib/types'

interface StatsSidebarProps {
  players: Player[]
  weeks: Week[]
  leagueDayIndex?: number
  linkedPlayerName?: string | null
}

export const WIDGET_CLASS = 'rounded-xl border border-[#1b2c46] bg-[#0a1421] overflow-hidden shadow-[0_18px_44px_rgba(0,0,0,.42)]'
export const WIDGET_TITLE_CLASS = 'font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#6f88a8]'

export function AllTimeChip() {
  return (
    <span className="font-plex text-[8px] font-bold uppercase tracking-[.12em] text-[#7dd3fc] bg-[#38bdf8]/8 border border-[#38bdf8]/35 rounded-[3px] px-1.5 py-[3px]">
      All Time
    </span>
  )
}

function WidgetShell({
  title,
  headerRight,
  size = 'sidebar',
  className,
  bodyClassName,
  children,
}: {
  title: string
  headerRight?: React.ReactNode
  size?: WidgetSize
  className?: string
  bodyClassName?: string
  children: React.ReactNode
}) {
  const page = size === 'page'
  return (
    <div className={cn(WIDGET_CLASS, className)}>
      <div className={cn(
        'rounded-t-[11px] py-2.5 border-b border-[#17263c] bg-[#0c1728] flex items-center justify-between gap-2',
        page ? 'px-4' : 'px-3.5'
      )}>
        <span className={cn(WIDGET_TITLE_CLASS, 'whitespace-nowrap')}>{title}</span>
        {headerRight}
      </div>
      <div className={cn(page ? 'px-4 py-3.5' : 'p-3.5', bodyClassName)}>{children}</div>
    </div>
  )
}

export function EmptyState({ message }: { message: string }) {
  return <p className="font-inter-body text-xs text-[#6f88a8] text-center py-4">{message}</p>
}

// ─── Widget 0: Your Stats ─────────────────────────────────────────────────────

function YourStatsWidget({ players, linkedPlayerName }: { players: Player[]; linkedPlayerName?: string | null }) {
  if (!linkedPlayerName) return null
  const player = players.find(p => p.name === linkedPlayerName)
  if (!player) return null

  return (
    <WidgetShell title="Your Stats" headerRight={<AllTimeChip />}>
      {/* Hero: name + win rate */}
      <div className="flex items-end justify-between gap-2.5">
        <div>
          <p className="text-base font-bold tracking-[-.02em] text-[#f4f9ff]">
            {player.name}
          </p>
          <p className="mt-[5px] font-plex text-[9.5px] tracking-[.12em] text-[#6f88a8]">
            {player.won}W · {player.drew}D · {player.lost}L
          </p>
        </div>
        <div className="text-right">
          <p className="font-plex text-[32px] font-bold leading-none tracking-[-.03em] text-[#38bdf8]">
            {Math.round(player.winRate)}<span className="text-sm">%</span>
          </p>
          <p className="mt-[5px] font-plex text-[8px] font-bold uppercase tracking-[.18em] text-[#6f88a8]">Win Rate</p>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-[#17263c] my-3" />

      {/* Bottom: form + played */}
      <div className="flex items-center justify-between">
        <FormDots form={player.recentForm} />
        <p className="font-plex text-[9.5px] uppercase tracking-[.12em] text-[#6f88a8]">
          <span className="text-[#f4f9ff] font-bold">{player.played}</span> played
        </p>
      </div>
    </WidgetShell>
  )
}

// ─── Widget 0b: Your Teammates ────────────────────────────────────────────────

function TeammatesWidget({ players, weeks, linkedPlayerName }: { players: Player[]; weeks: Week[]; linkedPlayerName?: string | null }) {
  if (!linkedPlayerName || !players.some(p => p.name === linkedPlayerName)) return null
  const teammates = computeTeammates(linkedPlayerName, weeks)
  if (teammates.length === 0) return null

  return (
    <WidgetShell
      title="Your teammates · Win %"
      headerRight={
        <span className="font-plex text-[8px] uppercase tracking-[.12em] text-[#4f688a] text-right">
          Min 5 together
        </span>
      }
      // The bar tooltip rises above the plot, so this widget must not clip
      className="overflow-visible"
      bodyClassName="pl-3"
    >
      <TeammatesChart teammates={teammates} size="small" />
    </WidgetShell>
  )
}

// ─── Widget 1: Most In Form ───────────────────────────────────────────────────

export function InFormWidget({
  players,
  weeks,
  size = 'sidebar',
  showWindowTag = false,
}: {
  players: Player[]
  weeks: Week[]
  size?: WidgetSize
  /** Overview tab: label the form window in the header. */
  showWindowTag?: boolean
}) {
  const entries = computeInForm(players, weeks)
  return (
    <WidgetShell
      title="Most In Form"
      size={size}
      headerRight={showWindowTag ? (
        <span className="font-plex text-[8px] font-bold uppercase tracking-[.12em] text-[#4f688a]">
          Last 5 games
        </span>
      ) : undefined}
    >
      {entries.length === 0 ? (
        <EmptyState message="Not enough data yet" />
      ) : (
        <>
          {/* Hero: rank 1 */}
          <div className={cn(entries.length > 1 && 'border-b border-[#17263c] pb-3 mb-3')}>
            <p className="font-plex text-[8.5px] font-bold uppercase tracking-[.18em] text-[#38bdf8]">
              The Gaffer&apos;s Pick
            </p>
            <p className="mt-1.5 text-base font-bold tracking-[-.02em] text-[#f4f9ff]">{entries[0].name}</p>
            <div className="mt-1.5 flex items-end justify-between">
              <FormDots form={entries[0].recentForm} />
              <div className="text-right">
                <p className="font-plex text-[22px] font-bold leading-none tracking-[-.03em] text-[#38bdf8]">
                  {entries[0].ppg.toFixed(1)}
                </p>
                <p className="mt-1 font-plex text-[8px] font-bold uppercase tracking-[.16em] text-[#6f88a8]">pts / game</p>
              </div>
            </div>
          </div>

          {/* Ranked list: ranks 2–5 */}
          {entries.length > 1 && (
            <div className="flex flex-col gap-2.5">
              {entries.slice(1).map((e, i) => (
                <div key={e.name} className="flex items-center gap-2">
                  <span className="font-plex text-[10px] text-[#4f688a] w-3.5 text-left shrink-0">
                    {i + 2}
                  </span>
                  <span className="font-inter-body text-[12.5px] text-[#cfe0f4] flex-1 truncate">{e.name}</span>
                  <FormDots form={e.recentForm} className="gap-1 text-[10px]" />
                  <span className="font-plex text-[9.5px] font-bold px-[7px] py-0.5 rounded-[3px] border border-[#1b2c46] text-[#8ba4c4] shrink-0">
                    {e.ppg.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </WidgetShell>
  )
}

// ─── Widget 2: Quarterly Table ────────────────────────────────────────────────

function QuarterlyTableWidget({ weeks, leagueDayIndex }: { weeks: Week[]; leagueDayIndex?: number }) {
  const { quarterLabel, entries, lastChampion, lastQuarterLabel, gamesLeft, gamesTotal, isHoldover } = computeQuarterlyTable(weeks, new Date(), leagueDayIndex)
  // Footer line replaces the old header pills: games left, or Final once the quarter is complete
  const showProgress = entries.length > 0 && (gamesLeft > 0 || isHoldover)

  return (
    <div className={WIDGET_CLASS}>
      {/* Header with inline column labels */}
      <div className="px-3.5 py-2.5 border-b border-[#17263c] bg-[#0c1728] flex items-center gap-1 font-plex text-[8.5px] font-bold uppercase tracking-[.16em] text-[#4f688a]">
        <span className={cn(WIDGET_TITLE_CLASS, 'flex-1 min-w-0 truncate')}>
          {quarterLabel}
        </span>
        <QuarterTableColumnLabels />
      </div>

      <div className="px-3.5 py-3">
        {entries.length === 0 ? (
          <EmptyState message={isHoldover ? 'No data yet' : 'Quarter just started'} />
        ) : (
          <QuarterTableRows
            rows={entries.map((entry, i) => ({ entry, rank: i + 1 }))}
            highlightName={entries[0].name}
          />
        )}

        {/* Quarter progress */}
        {showProgress && <QuarterProgress gamesLeft={gamesLeft} gamesTotal={gamesTotal} />}

        {/* Previous quarter champion */}
        {lastChampion && lastQuarterLabel && (
          <>
            <div className="h-px bg-[#17263c] mt-2.5 mb-3" />
            <ChampionBox label={`${lastQuarterLabel} Champion`} name={lastChampion} />
          </>
        )}
      </div>
    </div>
  )
}

// ─── Widget 3: Head to Head ───────────────────────────────────────────────

export function TeamABWidget({
  weeks,
  size = 'sidebar',
  linkedPlayer = null,
}: {
  weeks: Week[]
  size?: WidgetSize
  /** Overview tab: adds how often the viewer has played for each team. */
  linkedPlayer?: Player | null
}) {
  const { teamAWins, draws, teamBWins, total } = computeTeamAB(weeks)

  return (
    <WidgetShell title="Head to Head" size={size} headerRight={<AllTimeChip />}>
      {total === 0 ? (
        <EmptyState message="No results yet" />
      ) : (
        <>
          {/* Scoreline */}
          <div className="flex items-baseline mb-2 font-plex">
            <span className="flex-1 text-[9px] font-bold uppercase tracking-[.16em] text-[#7dd3fc]">Team A</span>
            <span className="text-lg font-bold text-[#7dd3fc]">{teamAWins}</span>
            <span className="mx-2.5 text-[11px] text-[#4f688a]">{draws}D</span>
            <span className="text-lg font-bold text-[#c4b5fd]">{teamBWins}</span>
            <span className="flex-1 text-right text-[9px] font-bold uppercase tracking-[.16em] text-[#c4b5fd]">Team B</span>
          </div>

          {/* Split bar */}
          <div className="flex gap-0.5 rounded-[3px] overflow-hidden h-2.5">
            {teamAWins > 0 && (
              <div className="bg-[#38bdf8]" style={{ flex: teamAWins }} />
            )}
            {draws > 0 && (
              <div className="bg-[#1b2c46]" style={{ flex: draws }} />
            )}
            {teamBWins > 0 && (
              <div className="bg-[#a78bfa]" style={{ flex: teamBWins }} />
            )}
          </div>

          {linkedPlayer && (
            <p className="mt-2.5 font-plex text-[8.5px] uppercase tracking-[.14em] text-[#6f88a8]">
              You have played{' '}
              <span className="font-bold text-[#7dd3fc]">{linkedPlayer.timesTeamA}</span>
              {' '}for A ·{' '}
              <span className="font-bold text-[#c4b5fd]">{linkedPlayer.timesTeamB}</span>
              {' '}for B
            </p>
          )}
        </>
      )}
    </WidgetShell>
  )
}

// ─── StatsSidebar ─────────────────────────────────────────────────────────────

export function StatsSidebar({ players, weeks, leagueDayIndex, linkedPlayerName }: StatsSidebarProps) {
  return (
    <div className="flex flex-col gap-3">
      <YourStatsWidget players={players} linkedPlayerName={linkedPlayerName} />
      <TeammatesWidget players={players} weeks={weeks} linkedPlayerName={linkedPlayerName} />
      <QuarterlyTableWidget weeks={weeks} leagueDayIndex={leagueDayIndex} />
      <InFormWidget    players={players} weeks={weeks} />
      <TeamABWidget    weeks={weeks} />
    </div>
  )
}
