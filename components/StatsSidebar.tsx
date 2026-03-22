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
  const { quarterLabel, entries, lastChampion, lastQuarterLabel } = computeQuarterlyTable(weeks)
  return (
    <WidgetShell title={quarterLabel}>
      {entries.length === 0 ? (
        <EmptyState message="Quarter just started" />
      ) : (
        <>
          <div className="space-y-1">
            {entries.map((e, i) => (
              <div key={e.name} className="flex items-center gap-2 text-sm">
                <span className="text-slate-600 w-4 shrink-0 text-right">{i + 1}</span>
                <span className="text-slate-200 flex-1 truncate">{e.name}</span>
                <span className="text-slate-500 text-xs w-6 text-center">{e.played}</span>
                <span className="text-xs w-6 text-center shrink-0 font-medium text-slate-300">{e.won}</span>
                <span className="text-xs w-6 text-center shrink-0 text-slate-500">{e.drew}</span>
                <span className="text-xs w-6 text-center shrink-0 text-slate-500">{e.lost}</span>
                <span className="text-xs w-8 text-right shrink-0 font-semibold text-slate-100">{e.points}</span>
              </div>
            ))}
          </div>
          {/* Column headers */}
          <div className="flex items-center gap-2 text-xs text-slate-600 mt-2 pt-2 border-t border-slate-700/60">
            <span className="w-4 shrink-0" />
            <span className="flex-1" />
            <span className="w-6 text-center shrink-0">P</span>
            <span className="w-6 text-center shrink-0">W</span>
            <span className="w-6 text-center shrink-0">D</span>
            <span className="w-6 text-center shrink-0">L</span>
            <span className="w-8 text-right shrink-0">Pts</span>
          </div>
          {lastChampion && (
            <div className="mt-3 pt-2 border-t border-slate-700/60 text-xs text-slate-500">
              <span className="text-slate-600">{lastQuarterLabel} Champion · </span>
              <span className="text-slate-400">{lastChampion}</span>
            </div>
          )}
        </>
      )}
    </WidgetShell>
  )
}

// ─── Widget 3: Team A vs Team B ───────────────────────────────────────────────

function TeamABWidget({ weeks }: { weeks: Week[] }) {
  const { teamAWins, draws, teamBWins, total, streakTeam, streakLength } = computeTeamAB(weeks)

  const streakLabel =
    streakTeam === 'teamA' ? `Team A · ${streakLength} in a row` :
    streakTeam === 'teamB' ? `Team B · ${streakLength} in a row` :
    streakTeam === 'draw'  ? `Draw · ${streakLength} in a row` :
    null

  return (
    <WidgetShell title="Team A vs Team B">
      {total === 0 ? (
        <EmptyState message="No results yet" />
      ) : (
        <>
          <div className="flex justify-between mb-1 text-sm font-semibold">
            <span className="text-blue-300">{teamAWins}</span>
            <span className="text-slate-400">{draws}</span>
            <span className="text-violet-300">{teamBWins}</span>
          </div>
          <div className="flex gap-0.5 rounded-full overflow-hidden h-3 mb-1">
            {teamAWins > 0 && (
              <div
                className="bg-blue-800"
                style={{ flex: teamAWins }}
              />
            )}
            {draws > 0 && (
              <div
                className="bg-slate-600"
                style={{ flex: draws }}
              />
            )}
            {teamBWins > 0 && (
              <div
                className="bg-violet-800"
                style={{ flex: teamBWins }}
              />
            )}
          </div>
          <div className="flex justify-between text-xs text-slate-600 mb-2">
            <span className="text-blue-400/70">Team A</span>
            <span>Draws</span>
            <span className="text-violet-400/70">Team B</span>
          </div>
          {streakLabel && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400 pt-2 border-t border-slate-700/60">
              <span
                className={cn(
                  'w-2 h-2 rounded-full shrink-0',
                  streakTeam === 'teamA' ? 'bg-blue-500' :
                  streakTeam === 'teamB' ? 'bg-violet-500' : 'bg-slate-500'
                )}
              />
              {streakLabel}
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
