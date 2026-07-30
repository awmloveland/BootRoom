import { cn } from '@/lib/utils'

const RESULT_ROWS = [
  {
    week: 'WK14 · 25 MAR',
    score: ['6', '4'],
    badge: 'TEAM A WON',
    badgeClass: 'bg-[rgba(56,189,248,.12)] border-[rgba(56,189,248,.4)] text-[#7dd3fc]',
    cancelled: false,
    note: null,
  },
  {
    week: 'WK13 · 18 MAR',
    score: ['3', '5'],
    badge: 'TEAM B WON',
    badgeClass: 'bg-[rgba(167,139,250,.12)] border-[rgba(167,139,250,.4)] text-[#c4b5fd]',
    cancelled: false,
    note: null,
  },
  {
    week: 'WK12 · 11 MAR',
    score: ['4', '4'],
    badge: 'DRAWN',
    badgeClass: 'border-[#223a5c] text-[#8ba4c4]',
    cancelled: false,
    note: null,
  },
  {
    week: 'WK10 · 25 FEB',
    score: null,
    badge: 'CANCELLED',
    badgeClass: 'bg-[rgba(226,104,111,.12)] border-[rgba(226,104,111,.4)] text-[#e2686f]',
    cancelled: true,
    note: 'Waterlogged, called off at 6pm',
  },
]

export function ResultsShowcase() {
  return (
    <section
      id="feature-results"
      className="mt-16 lg:mt-[88px] py-16 lg:py-[88px] px-5 sm:px-11 bg-[#0a1421] border-y border-[#17263c]"
    >
      <div className="max-w-[1112px] mx-auto grid lg:grid-cols-[1.15fr_.85fr] gap-10 lg:gap-14 items-center">
        <div className="flex flex-col gap-px bg-[#17263c] border border-[#17263c] rounded-xl overflow-hidden order-2 lg:order-1">
          {RESULT_ROWS.map((row) => (
            <div
              key={row.week}
              className={cn(
                'grid grid-cols-[110px_1fr_auto] sm:grid-cols-[150px_1fr_auto] items-center gap-3 sm:gap-[18px] px-4 sm:px-6 py-[18px] bg-[#060b14]',
                row.cancelled && 'opacity-60'
              )}
            >
              <span className="font-plex text-[11px] tracking-[.14em] text-[#6f88a8]">{row.week}</span>
              {row.score ? (
                <span className="font-plex text-[26px] font-bold tracking-[-.02em] text-[#f4f9ff] tabular-nums whitespace-nowrap">
                  {row.score[0]}<span className="text-[#2f4a70]">-</span>{row.score[1]}
                </span>
              ) : (
                <span className="font-inter-body text-sm italic text-[#8ba4c4]">{row.note}</span>
              )}
              <span className={cn('font-plex text-[10px] font-bold tracking-[.14em] px-[11px] py-[5px] rounded border', row.badgeClass)}>
                {row.badge}
              </span>
            </div>
          ))}
        </div>
        <div className="order-1 lg:order-2">
          <p className="font-plex text-[10px] font-bold tracking-[.2em] text-[#38bdf8]">04 · RESULTS TRACKING</p>
          <h2 className="mt-3.5 text-4xl sm:text-[46px] leading-none font-bold tracking-[-.035em] text-[#f4f9ff]">
            Every week,<br />on the record.
          </h2>
          <p className="mt-4 font-inter-body text-[15px] leading-[1.65] text-[#8ba4c4] text-pretty">
            A match card for every week: who played, who won, by how much, and what it was like out
            there. Cancelled weeks included, because the history matters.
          </p>
        </div>
      </div>
    </section>
  )
}
