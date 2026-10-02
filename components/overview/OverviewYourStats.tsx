import { ordinalSuffix } from '@/lib/utils'
import { computeTeammates, type QuarterStanding } from '@/lib/sidebar-stats'
import type { Player, Week } from '@/lib/types'
import { FormDots } from '@/components/FormDots'
import { AllTimeChip } from '@/components/StatsSidebar'
import { TeammatesChart } from '@/components/TeammatesChart'

interface OverviewYourStatsProps {
  player: Player
  /** The player's place in the displayed quarter, or null when they have no games in it. */
  standing: QuarterStanding | null
  /** e.g. 'Q2 2026' */
  quarterLabel: string
  weeks: Week[]
}

function StatTile({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <div className="rounded-lg border border-[#1b2c46] bg-[#060b14]/60 px-3 py-2.5">
      <p className="font-plex text-xl font-bold leading-none tracking-[-.03em] text-[#f4f9ff]">
        {value}
        {unit && <span className="text-[11px]">{unit}</span>}
      </p>
      <p className="mt-1.5 font-plex text-[8px] font-bold uppercase tracking-[.16em] text-[#6f88a8]">{label}</p>
    </div>
  )
}

/** Overview card 2 for a viewer with a linked player. */
export function OverviewYourStats({ player, standing, quarterLabel, weeks }: OverviewYourStatsProps) {
  const record = `${player.mentality === 'goalkeeper' ? 'GK · ' : ''}${player.won}W · ${player.drew}D · ${player.lost}L`
  const pointsPerGame = player.played > 0 ? player.points / player.played : 0
  const teammates = computeTeammates(player.name, weeks)

  return (
    <div className="relative overflow-hidden rounded-xl border border-[#1b2c46] bg-[#101d31] shadow-[0_18px_44px_rgba(0,0,0,.42)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(56,189,248,.16),transparent_45%),radial-gradient(circle_at_90%_100%,rgba(190,242,100,.1),transparent_40%)]"
      />
      <div className="relative">
        <div className="flex items-center justify-between border-b border-[#1b2c46] px-4 py-2.5">
          <span className="font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#8ba4c4]">Your stats</span>
          <AllTimeChip />
        </div>

        <div className="px-4 pt-4 pb-3.5">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xl font-bold leading-none tracking-[-.025em] text-[#f4f9ff]">{player.name}</p>
              <p className="mt-[5px] font-plex text-[9.5px] uppercase tracking-[.12em] text-[#8ba4c4]">{record}</p>
            </div>
            {standing && (
              <div className="shrink-0 text-right">
                <p className="font-plex text-[32px] font-bold leading-none tracking-[-.04em] text-[#38bdf8]">
                  {standing.position}
                  <span className="text-sm tracking-normal">{ordinalSuffix(standing.position)}</span>
                </p>
                <p className="mt-[5px] font-plex text-[9.5px] uppercase tracking-[.12em] text-[#8ba4c4]">
                  {quarterLabel}{standing.jointTop ? ' · Joint top' : ''}
                </p>
              </div>
            )}
          </div>

          <div className="mt-3.5 grid grid-cols-3 gap-2">
            <StatTile value={String(Math.round(player.winRate))} unit="%" label="Win rate" />
            <StatTile value={String(player.played)} label="Played" />
            <StatTile value={pointsPerGame.toFixed(1)} label="Pts / game" />
          </div>

          <div className="mt-3.5 flex items-center justify-between">
            <span className="font-plex text-[8.5px] font-bold uppercase tracking-[.16em] text-[#6f88a8]">Recent form</span>
            <FormDots form={player.recentForm} className="gap-1.5 text-xs" />
          </div>
        </div>

        {teammates.length > 0 && (
          <>
            <div className="flex items-center justify-between gap-3 border-t border-[#1b2c46] px-4 pt-3">
              <span className="font-plex text-[8.5px] font-bold uppercase tracking-[.16em] text-[#6f88a8]">Win % with teammates</span>
              <span className="whitespace-nowrap font-plex text-[8.5px] uppercase tracking-[.14em] text-[#4f688a]">Min 5 together</span>
            </div>
            <div className="px-4 pt-4 pb-3.5">
              <TeammatesChart playerName={player.name} teammates={teammates} size="large" />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
