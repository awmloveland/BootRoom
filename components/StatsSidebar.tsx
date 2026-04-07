import { cn } from '@/lib/utils'
import { isFeatureEnabled } from '@/lib/features'
import { resolveVisibilityTier } from '@/lib/roles'
import { computeInForm, computeQuarterlyTable, computeTeamAB } from '@/lib/sidebar-stats'
import { FormDots } from '@/components/FormDots'
import type { Player, Week, LeagueFeature, GameRole } from '@/lib/types'

interface StatsSidebarProps {
  players: Player[]
  weeks: Week[]
  features: LeagueFeature[]
  role: GameRole | null
  leagueDayIndex?: number
  linkedPlayerName?: string | null
}

function WidgetShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-transparent overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-700/40 text-xs font-semibold text-slate-500 uppercase tracking-widest">
        {title}
      </div>
      <div className="px-3 py-3">{children}</div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return <p className="text-sm text-slate-500 text-center py-4">{message}</p>
}

// ─── Widget 0: Your Stats ─────────────────────────────────────────────────────

function YourStatsWidget({ players, linkedPlayerName }: { players: Player[]; linkedPlayerName?: string | null }) {
  if (!linkedPlayerName) return null
  const player = players.find(p => p.name === linkedPlayerName)
  if (!player) return null

  return (
    <div className="rounded-lg border border-slate-700 bg-transparent overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-700/40 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Your Stats</span>
        <span className="text-[8px] font-bold uppercase tracking-[0.08em] text-sky-400 bg-sky-400/[0.08] border border-sky-400/25 rounded px-[5px] py-px">
          All Time
        </span>
      </div>
      <div className="px-3 py-3">
        {/* Hero: name + win rate */}
        <div className="flex items-end justify-between mb-[10px]">
          <div>
            <p className="text-[15px] font-bold text-slate-100 uppercase tracking-wide leading-tight">
              {player.name}
            </p>
            <p className="text-[11px] text-slate-600 font-medium mt-1">
              {player.won}W &nbsp;·&nbsp; {player.drew}D &nbsp;·&nbsp; {player.lost}L
            </p>
          </div>
          <div className="text-right ml-2">
            <p className="text-[32px] font-black text-sky-300 leading-none">
              {Math.round(player.winRate)}<span className="text-[14px] font-bold text-sky-400">%</span>
            </p>
            <p className="text-[8px] uppercase tracking-widest text-sky-400 mt-0.5">Win Rate</p>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-700/40 my-[10px]" />

        {/* Bottom: form + played */}
        <div className="flex items-center justify-between">
          <FormDots form={player.recentForm} />
          <p className="text-[10px] text-slate-600">
            <span className="text-slate-400 font-semibold">{player.played}</span> played
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Widget 1: Most In Form ───────────────────────────────────────────────────

function InFormWidget({ players, weeks }: { players: Player[]; weeks: Week[] }) {
  const entries = computeInForm(players, weeks)
  return (
    <WidgetShell title="Most In Form">
      {entries.length === 0 ? (
        <EmptyState message="Not enough data yet" />
      ) : (
        <>
          {/* Hero: rank 1 */}
          <div className={cn(entries.length > 1 && 'border-b border-slate-700/50 pb-[10px] mb-[10px]')}>
            <p className="text-xs font-bold uppercase tracking-wide text-sky-300 mb-0">
              The Gaffer&apos;s Pick
            </p>
            <p className="text-[15px] font-bold text-slate-100 uppercase mb-0">{entries[0].name}</p>
            <div className="flex items-end justify-between">
              <FormDots form={entries[0].recentForm} />
              <div className="text-right">
                <p className="text-[22px] font-extrabold text-sky-300 leading-none">
                  {entries[0].ppg.toFixed(1)}
                </p>
                <p className="text-[9px] uppercase tracking-wide text-sky-400 mt-0.5">pts / game</p>
              </div>
            </div>
          </div>

          {/* Ranked list: ranks 2–5 */}
          {entries.length > 1 && (
            <div className="flex flex-col gap-[0.8rem]">
              {entries.slice(1).map((e, i) => (
                <div key={e.name} className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-600 w-[14px] text-left shrink-0">
                    {i + 2}
                  </span>
                  <span className="text-[13px] text-slate-300 flex-1 truncate">{e.name}</span>
                  <FormDots form={e.recentForm} />
                  <span className="text-[10px] font-semibold px-[7px] py-px rounded-full bg-slate-700/40 text-slate-500 shrink-0">
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
  const { quarterLabel, entries, lastChampion, lastQuarterLabel, gamesLeft, isHoldover } = computeQuarterlyTable(weeks, new Date(), leagueDayIndex)
  const showGamesLeft = entries.length > 0 && gamesLeft > 0

  return (
    <div className="rounded-lg border border-slate-700 bg-transparent overflow-hidden">
      {/* Header with inline column labels */}
      <div className="px-3 py-2 border-b border-slate-700/40 flex items-center gap-1">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 shrink-0">
            {quarterLabel}
          </span>
          {isHoldover && (
            <span className="text-[10px] font-semibold text-slate-400 bg-slate-800 border border-slate-700 rounded px-[5px] py-[1px]">Final</span>
          )}
          {showGamesLeft && (
            <span className="text-[10px] font-semibold text-slate-400 bg-slate-800 border border-slate-700 rounded px-[5px] py-[1px]">
              {gamesLeft} games left
            </span>
          )}
        </div>
        <span className="text-[10px] font-semibold uppercase text-slate-700 w-[22px] text-center">P</span>
        <span className="text-[10px] font-semibold uppercase text-slate-700 w-[18px] text-center">W</span>
        <span className="text-[10px] font-semibold uppercase text-slate-700 w-[18px] text-center">D</span>
        <span className="text-[10px] font-semibold uppercase text-slate-700 w-[18px] text-center">L</span>
        <span className="text-[10px] font-semibold uppercase text-slate-500 w-[28px] text-right">Pts</span>
      </div>

      <div className="px-3 py-3">
        {entries.length === 0 ? (
          <EmptyState message={isHoldover ? 'No data yet' : 'Quarter just started'} />
        ) : (
          <div className="flex flex-col gap-[2px]">
            {entries.map((e, i) => (
              <div
                key={e.name}
                className={cn(
                  'flex items-center gap-1 py-[3px]',
                  i === 0 ? '-mx-3 px-3 bg-sky-400/[0.06]' : '-mx-1 px-1'
                )}
              >
                <span className={cn(
                  'text-[11px] w-[14px] text-left shrink-0',
                  i === 0 ? 'font-bold text-sky-400' : 'text-slate-600'
                )}>
                  {i + 1}
                </span>
                <span className={cn(
                  'text-[13px] flex-1 truncate',
                  i === 0 ? 'font-semibold text-slate-100' : 'text-slate-400'
                )}>
                  {e.name}
                </span>
                <span className="text-[11px] text-slate-600 w-[22px] text-center shrink-0">
                  {e.played}
                </span>
                <span className="text-[11px] text-slate-600 w-[18px] text-center shrink-0">
                  {e.won}
                </span>
                <span className="text-[11px] text-slate-600 w-[18px] text-center shrink-0">
                  {e.drew}
                </span>
                <span className="text-[11px] text-slate-600 w-[18px] text-center shrink-0">
                  {e.lost}
                </span>
                <span className={cn(
                  'text-[12px] font-bold w-[28px] text-right shrink-0',
                  i === 0 ? 'text-sky-300' : 'text-slate-300'
                )}>
                  {e.points}
                </span>
              </div>
            ))}
          </div>
        )}


        {/* Previous quarter champion */}
        {lastChampion && lastQuarterLabel && (
          <>
            <div className="border-t border-slate-700/40 mt-2 mb-3" />
            <div className="flex items-center justify-between bg-amber-400/[0.07] border border-amber-400/[0.14] rounded-md px-[10px] py-[6px]">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-amber-600 mb-0">
                  {lastQuarterLabel} Champion
                </p>
                <p className="text-[13px] font-bold text-yellow-200 uppercase">{lastChampion}</p>
              </div>
              <span className="text-lg leading-none">🏆</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Widget 3: Head to Head ───────────────────────────────────────────────

function TeamABWidget({ weeks }: { weeks: Week[] }) {
  const { teamAWins, draws, teamBWins, total } = computeTeamAB(weeks)

  return (
    <WidgetShell title="Head to Head">
      {total === 0 ? (
        <EmptyState message="No results yet" />
      ) : (
        <>
          {/* Scoreline */}
          <div className="flex items-baseline mb-[6px]">
            <span className="flex-1 text-xs font-bold uppercase tracking-wide text-blue-500">Team A</span>
            <span className="text-[16px] font-extrabold text-blue-300 mr-[6px]">{teamAWins}</span>
            <span className="text-[13px] font-semibold text-slate-600 mx-[4px]">{draws}D</span>
            <span className="text-[16px] font-extrabold text-violet-300 ml-[6px]">{teamBWins}</span>
            <span className="flex-1 text-right text-xs font-bold uppercase tracking-wide text-violet-700">Team B</span>
          </div>

          {/* Gradient bar */}
          <div className="flex gap-0.5 rounded-md overflow-hidden h-3 mb-[10px]">
            {teamAWins > 0 && (
              <div
                className="bg-gradient-to-r from-blue-900 to-blue-500"
                style={{ flex: teamAWins }}
              />
            )}
            {draws > 0 && (
              <div className="bg-slate-800" style={{ flex: draws }} />
            )}
            {teamBWins > 0 && (
              <div
                className="bg-gradient-to-r from-violet-700 to-violet-900"
                style={{ flex: teamBWins }}
              />
            )}
          </div>

        </>
      )}
    </WidgetShell>
  )
}

// ─── StatsSidebar ─────────────────────────────────────────────────────────────

export function StatsSidebar({ players, weeks, features, role, leagueDayIndex, linkedPlayerName }: StatsSidebarProps) {
  const tier = resolveVisibilityTier(role)
  const showStatsSidebar = isFeatureEnabled(features, 'stats_sidebar', tier)
  if (!showStatsSidebar) return null

  return (
    <div className="space-y-3">
      <YourStatsWidget players={players} linkedPlayerName={linkedPlayerName} />
      <InFormWidget    players={players} weeks={weeks} />
      <QuarterlyTableWidget weeks={weeks} leagueDayIndex={leagueDayIndex} />
      <TeamABWidget    weeks={weeks} />
    </div>
  )
}
