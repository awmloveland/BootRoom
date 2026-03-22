import { cn } from '@/lib/utils'
import { isFeatureEnabled } from '@/lib/features'
import { resolveVisibilityTier } from '@/lib/roles'
import { computeInForm, computeQuarterlyTable, computeTeamAB, QUARTER_GAME_COUNT } from '@/lib/sidebar-stats'
import { FormDots } from '@/components/FormDots'
import type { Player, Week, LeagueFeature, GameRole } from '@/lib/types'

interface StatsSidebarProps {
  players: Player[]
  weeks: Week[]
  features: LeagueFeature[]
  role: GameRole | null
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

// ─── Widget 1: Most In Form ───────────────────────────────────────────────────

function InFormWidget({ players }: { players: Player[] }) {
  const entries = computeInForm(players)
  return (
    <WidgetShell title="Most In Form">
      {entries.length === 0 ? (
        <EmptyState message="Not enough data yet" />
      ) : (
        <>
          {/* Hero: rank 1 */}
          <div className={cn(entries.length > 1 && 'border-b border-slate-700/50 pb-[10px] mb-[10px]')}>
            <p className="text-[9px] font-bold uppercase tracking-wide text-sky-300 mb-1">
              The Gaffer&apos;s Pick
            </p>
            <p className="text-[15px] font-bold text-slate-100 mb-2">{entries[0].name}</p>
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
            <div className="flex flex-col gap-[5px]">
              {entries.slice(1).map((e, i) => (
                <div key={e.name} className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-600 w-[14px] text-right shrink-0">
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

function QuarterlyTableWidget({ weeks }: { weeks: Week[] }) {
  const { quarterLabel, entries, lastChampion, lastQuarterLabel, gamesLeft } = computeQuarterlyTable(weeks)
  const fillPct = Math.round(((QUARTER_GAME_COUNT - gamesLeft) / QUARTER_GAME_COUNT) * 100)
  const showProgress = entries.length > 0 && gamesLeft > 0

  return (
    <div className="rounded-lg border border-slate-700 bg-transparent overflow-hidden">
      {/* Header with inline column labels */}
      <div className="px-3 py-1.5 border-b border-slate-700/40 flex items-center gap-1">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex-1">
          {quarterLabel}
        </span>
        <span className="text-[10px] font-semibold uppercase text-slate-700 w-[22px] text-center">P</span>
        <span className="text-[10px] font-semibold uppercase text-slate-500 w-[28px] text-right">Pts</span>
      </div>

      <div className="px-3 py-3">
        {entries.length === 0 ? (
          <EmptyState message="Quarter just started" />
        ) : (
          <div className="flex flex-col gap-[2px]">
            {entries.map((e, i) => (
              <div
                key={e.name}
                className={cn(
                  'flex items-center gap-1 px-1 py-[3px] rounded -mx-1',
                  i === 0 && 'bg-sky-400/[0.06]'
                )}
              >
                <span className={cn(
                  'text-[11px] w-[14px] text-right shrink-0',
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

        {/* Quarter progress bar */}
        {showProgress && (
          <div className="py-[7px] border-t border-b border-slate-700/40 my-2">
            <div className="flex justify-between items-baseline mb-[5px]">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                Quarter progress
              </span>
              <span className="text-[10px] text-slate-600">{gamesLeft} left</span>
            </div>
            <div className="h-1 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full rounded-full bg-slate-600" style={{ width: `${fillPct}%` }} />
            </div>
          </div>
        )}

        {/* Previous quarter champion */}
        {lastChampion && lastQuarterLabel && (
          <div className="flex items-center justify-between bg-amber-400/[0.07] border border-amber-400/[0.14] rounded-md px-[10px] py-[6px]">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wide text-amber-600 mb-0.5">
                {lastQuarterLabel} Champion
              </p>
              <p className="text-[13px] font-bold text-yellow-200">{lastChampion}</p>
            </div>
            <span className="text-lg leading-none">🏆</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Widget 3: Head to Head ───────────────────────────────────────────────

function TeamABWidget({ weeks }: { weeks: Week[] }) {
  const { teamAWins, draws, teamBWins, total, streakTeam, streakLength } = computeTeamAB(weeks)

  const streakDotClass =
    streakTeam === 'teamA' ? 'bg-blue-500' :
    streakTeam === 'teamB' ? 'bg-violet-500' :
    'bg-slate-500'

  const streakNameClass =
    streakTeam === 'teamA' ? 'text-blue-300' :
    streakTeam === 'teamB' ? 'text-violet-300' :
    'text-slate-400'

  const streakName =
    streakTeam === 'teamA' ? 'Team A' :
    streakTeam === 'teamB' ? 'Team B' :
    'Draw'

  return (
    <WidgetShell title="Head to Head">
      {total === 0 ? (
        <EmptyState message="No results yet" />
      ) : (
        <>
          {/* Scoreline */}
          <div className="flex justify-between items-baseline mb-[6px]">
            <div>
              <span className="text-[9px] font-bold uppercase tracking-wide text-blue-500">Team A</span>
              <span className="text-[16px] font-extrabold text-blue-300 ml-[5px]">{teamAWins}</span>
            </div>
            <span className="text-[11px] text-slate-700">{draws}D</span>
            <div>
              <span className="text-[16px] font-extrabold text-violet-300 mr-[5px]">{teamBWins}</span>
              <span className="text-[9px] font-bold uppercase tracking-wide text-violet-700">Team B</span>
            </div>
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

          {/* Streak */}
          {streakTeam !== null && (
            <div className="flex items-center gap-1.5 pt-2 border-t border-slate-700/40">
              <span className={cn('w-[7px] h-[7px] rounded-full shrink-0', streakDotClass)} />
              <span className={cn('text-[12px] font-semibold', streakNameClass)}>{streakName}</span>
              <span className="text-[11px] text-slate-500">on a {streakLength}-game streak</span>
            </div>
          )}
        </>
      )}
    </WidgetShell>
  )
}

// ─── StatsSidebar ─────────────────────────────────────────────────────────────

export function StatsSidebar({ players, weeks, features, role }: StatsSidebarProps) {
  const tier = resolveVisibilityTier(role)

  const showInForm    = isFeatureEnabled(features, 'stats_in_form',         tier)
  const showQuarterly = isFeatureEnabled(features, 'stats_quarterly_table', tier)
  const showTeamAB    = isFeatureEnabled(features, 'stats_team_ab',         tier)

  if (!showInForm && !showQuarterly && !showTeamAB) return null

  return (
    <div className="space-y-4">
      {showInForm    && <InFormWidget    players={players} />}
      {showQuarterly && <QuarterlyTableWidget weeks={weeks} />}
      {showTeamAB    && <TeamABWidget    weeks={weeks} />}
    </div>
  )
}
