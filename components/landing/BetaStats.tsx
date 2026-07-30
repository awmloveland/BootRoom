import { cn } from '@/lib/utils'

const BETA_STATS = [
  { value: '60+', label: 'PLAYERS TRACKED', accent: true },
  { value: '400+', label: 'MATCHES RECORDED', accent: false },
  { value: '14', label: 'WEEKS THIS SEASON', accent: false },
]

export function BetaStats() {
  return (
    <section className="mt-16 lg:mt-[88px] py-[52px] px-5 sm:px-11 bg-[#0a1421] border-y border-[#17263c]">
      <div className="max-w-[1112px] mx-auto flex flex-col sm:flex-row sm:items-end sm:justify-between gap-10">
        <div className="max-w-[420px]">
          <p className="font-plex text-[10px] font-bold tracking-[.2em] text-[#6f88a8]">THE BETA SO FAR</p>
          <h2 className="mt-3 text-3xl leading-[1.05] font-bold tracking-[-.03em] text-[#f4f9ff]">
            Small on purpose,<br />already keeping score.
          </h2>
        </div>
        <div className="flex flex-wrap items-end gap-8 sm:gap-11">
          {BETA_STATS.map((stat) => (
            <div key={stat.label}>
              <p className={cn('font-plex text-4xl sm:text-[52px] font-bold leading-[.9] tracking-[-.04em]', stat.accent ? 'text-[#38bdf8]' : 'text-[#f4f9ff]')}>
                {stat.value}
              </p>
              <p className="mt-2.5 font-plex text-[9px] font-semibold tracking-[.18em] text-[#6f88a8]">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
