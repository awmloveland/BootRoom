const TEAM_A = ['Will Loveland 🧤', 'Alex Miller', 'Rav Singh', 'Sam Okafor']
const TEAM_B = ['Jordan Taylor 🧤', 'Ben Carter', 'Ollie Wright', 'Priya Nair']

const HERO_STATS = [
  { value: '400+', label: 'MATCHES RECORDED' },
  { value: '60+', label: 'PLAYERS TRACKED' },
  { value: '2022', label: 'KEEPING SCORE SINCE' },
]

const FORM_BARS = ['#38bdf8', '#38bdf8', '#3d5578', '#38bdf8', '#e2686f']

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#060b14]">
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none bg-[radial-gradient(#16283f_1.4px,transparent_1.4px)] bg-[length:24px_24px] [mask-image:linear-gradient(180deg,#000_0%,rgba(0,0,0,.45)_55%,transparent_92%)]"
      />
      <div className="relative max-w-[1200px] mx-auto px-5 sm:px-11 pt-14 lg:pt-[72px] pb-16 lg:pb-[84px] grid lg:grid-cols-[1.02fr_.98fr] gap-[52px] items-center">
        <div>
          <span className="inline-flex items-center gap-[9px] font-plex text-[10px] font-bold tracking-[.2em] text-[#bef264]">
            <span className="w-[22px] h-0.5 bg-[#bef264]" />
            PRIVATE BETA · 5, 6 &amp; 7-A-SIDE
          </span>
          <h1 className="mt-5 text-5xl sm:text-6xl lg:text-[82px] leading-[.94] font-bold tracking-[-.035em] text-[#f4f9ff]">
            Results, stats<br />and fair teams.
          </h1>
          <p className="mt-4 text-2xl lg:text-[34px] leading-none font-bold tracking-[-.03em] text-[#38bdf8]">
            For your weekly game.
          </p>
          <p className="mt-6 max-w-[470px] font-inter-body text-base leading-relaxed text-[#8ba4c4] text-pretty">
            The group chat has opinions. The table has facts. Craft Football records every match
            your group plays and turns it into results history, player records, honours boards and
            auto-picked teams.
          </p>
          <div className="flex items-center gap-3.5 mt-[30px]">
            <a
              href="#waitlist"
              className="inline-flex items-center h-[52px] px-[26px] bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] rounded text-[15px] font-bold transition-colors"
            >
              Register your interest
            </a>
          </div>
          <div className="flex items-end gap-6 sm:gap-[34px] mt-11 pt-[26px] border-t border-[#17263c]">
            {HERO_STATS.map((stat, i) => (
              <span key={stat.label} className="flex items-end gap-6 sm:gap-[34px]">
                {i > 0 && <span className="w-px h-[38px] bg-[#17263c]" />}
                <span>
                  <p className="font-plex text-[34px] font-bold tracking-[-.03em] text-[#f4f9ff] leading-none">{stat.value}</p>
                  <p className="mt-1.5 font-plex text-[9px] font-semibold tracking-[.18em] text-[#6f88a8]">{stat.label}</p>
                </span>
              </span>
            ))}
          </div>
        </div>
        <div className="relative pb-[76px]">
          <div className="border border-[#1b2c46] bg-[#0a1421] rounded-[14px] overflow-hidden shadow-[0_34px_80px_rgba(0,0,0,.6)]">
            <div className="flex items-center justify-between px-5 py-3.5 bg-[#0c1728] border-b border-[#1b2c46]">
              <span className="font-plex text-[10px] font-semibold tracking-[.16em] text-[#7f97b5]">WEEK 14 · 25 MAR 2026 · 7-A-SIDE</span>
              <span className="font-plex text-[10px] font-bold tracking-[.16em] text-[#bef264]">FULL TIME</span>
            </div>
            <div className="px-6 pt-7 pb-[22px] grid grid-cols-[1fr_auto_1fr] items-center gap-5">
              <p className="text-[15px] font-bold tracking-[.02em] text-[#7dd3fc]">TEAM A</p>
              <p className="font-plex text-5xl sm:text-[66px] font-bold leading-[.9] tracking-[-.04em] text-[#f4f9ff] tabular-nums whitespace-nowrap">
                6<span className="text-[#2f4a70]">-</span>4
              </p>
              <p className="text-right text-[15px] font-bold tracking-[.02em] text-[#c4b5fd]">TEAM B</p>
            </div>
            <div className="px-6 pb-5 grid grid-cols-2 gap-5">
              <div className="flex flex-col gap-[5px]">
                {TEAM_A.map((name) => (
                  <div key={name} className="font-inter-body text-xs font-semibold px-[11px] py-2 rounded bg-[rgba(8,47,73,.55)] border-l-2 border-[#38bdf8] text-[#dff1ff]">
                    {name}
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-[5px]">
                {TEAM_B.map((name) => (
                  <div key={name} className="font-inter-body text-xs font-semibold px-[11px] py-2 rounded bg-[rgba(46,16,101,.45)] border-l-2 border-[#a78bfa] text-[#efeaff]">
                    {name}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between px-6 py-[13px] border-t border-[#1b2c46] bg-[#0c1728] font-plex text-[10px] font-semibold tracking-[.14em] text-[#7f97b5]">
              <span>LINEUP LAB · Δ 0.024 BALANCED</span>
              <span className="text-[#bef264]">MARGIN +2</span>
            </div>
          </div>
          <div className="absolute left-0 sm:-left-[30px] bottom-0 box-border w-[290px] -rotate-2 border border-[#1b2c46] bg-[#101d31] rounded-[10px] px-4 py-3.5 shadow-[0_22px_50px_rgba(0,0,0,.6)]">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-inter-body text-[13px] font-bold text-[#f4f9ff]">Will Loveland</p>
                <p className="mt-[3px] font-plex text-[9px] tracking-[.14em] text-[#6f88a8]">42 CAPS · KEEPER</p>
              </div>
              <p className="font-plex text-2xl font-bold leading-none tracking-[-.03em] text-[#38bdf8]">
                66.7<span className="text-[13px]">%</span>
              </p>
            </div>
            <div className="flex gap-1 mt-3">
              {FORM_BARS.map((color, i) => (
                <span key={i} className="w-[26px] h-2 rounded-sm" style={{ backgroundColor: color }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
