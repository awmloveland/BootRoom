export function HonoursShowcase() {
  return (
    <section id="feature-honours" className="max-w-[1200px] mx-auto px-5 sm:px-11 pt-16 lg:pt-[88px]">
      <div className="grid lg:grid-cols-[.85fr_1.15fr] gap-10 lg:gap-14 items-center">
        <div>
          <p className="font-plex text-[10px] font-bold tracking-[.2em] text-[#bef264]">03 · HONOURS</p>
          <h2 className="mt-3.5 text-4xl sm:text-[46px] leading-none font-bold tracking-[-.035em] text-[#f4f9ff]">
            Silverware for<br />the regulars.
          </h2>
          <p className="mt-4 font-inter-body text-[15px] leading-[1.65] text-[#8ba4c4] text-pretty">
            A champion crowned every quarter, plus the player boards: hot streaks, most appearances,
            milestone caps from the 10th game to the 100th.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3.5">
          <div className="sm:col-span-2 border border-[#1b2c46] bg-[#0f2033] rounded-xl px-[26px] py-6 flex items-center justify-between">
            <div>
              <p className="font-plex text-[9px] font-bold tracking-[.2em] text-[#bef264]">Q1 2026 CHAMPION</p>
              <p className="mt-2.5 text-[32px] font-bold tracking-[-.03em] text-[#f4f9ff]">Sam Okafor</p>
              <p className="mt-1.5 font-plex text-[11px] tracking-[.12em] text-[#7f97b5]">71% WIN RATE · 24 CAPS</p>
            </div>
            <span className="inline-flex items-center justify-center w-[66px] h-[66px] rounded-full bg-[rgba(190,242,100,.12)] border border-[rgba(190,242,100,.4)] text-[#bef264] shrink-0">
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                <path d="M4 22h16" />
                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
              </svg>
            </span>
          </div>
          <div className="border border-[#1b2c46] bg-[#0a1421] rounded-xl px-[22px] py-5">
            <p className="font-plex text-[9px] font-bold tracking-[.2em] text-[#6f88a8]">MOST APPEARANCES</p>
            <p className="mt-2.5 text-xl font-bold tracking-[-.02em] text-[#f4f9ff]">Marcus Reid</p>
            <p className="mt-2 font-plex text-[26px] font-bold text-[#38bdf8] leading-none">
              42<span className="text-xs text-[#6f88a8] tracking-[.14em]"> GAMES</span>
            </p>
          </div>
          <div className="border border-[#1b2c46] bg-[#0a1421] rounded-xl px-[22px] py-5">
            <p className="font-plex text-[9px] font-bold tracking-[.2em] text-[#6f88a8]">IN FORM</p>
            <p className="mt-2.5 text-xl font-bold tracking-[-.02em] text-[#f4f9ff]">Sofia Marsh</p>
            <p className="mt-2 font-plex text-[26px] font-bold text-[#bef264] leading-none">
              3<span className="text-xs text-[#6f88a8] tracking-[.14em]"> ON THE SPIN</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
