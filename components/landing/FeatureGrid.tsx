const FEATURES = [
  {
    num: '01',
    accent: '#38bdf8',
    title: 'Player records',
    body: 'Win rate, last-five form, caps, team splits and time in goal. Sortable every way your group argues about it.',
    href: '#feature-stats',
  },
  {
    num: '02',
    accent: '#a78bfa',
    title: 'Lineup Lab',
    body: "Weighs every record and splits tonight's group into two sides so even it is spooky.",
    href: '#feature-lineup',
  },
  {
    num: '03',
    accent: '#bef264',
    title: 'Honours',
    body: 'A champion every quarter, hot streaks, milestone caps from the 10th game to the 100th.',
    href: '#feature-honours',
  },
  {
    num: '04',
    accent: '#38bdf8',
    title: 'Results',
    body: 'A match card for every week: who played, who won, by how much, and what it was like out there.',
    href: '#feature-results',
  },
]

export function FeatureGrid() {
  return (
    <section id="features" className="max-w-[1200px] mx-auto px-5 sm:px-11 pt-16 lg:pt-[88px]">
      <div className="max-w-[620px]">
        <p className="font-plex text-[10px] font-bold tracking-[.2em] text-[#6f88a8]">THE PRODUCT</p>
        <h2 className="mt-3.5 text-4xl sm:text-[54px] leading-[.98] font-bold tracking-[-.04em] text-[#f4f9ff]">
          Four things,<br />done properly.
        </h2>
        <p className="mt-4 font-inter-body text-base leading-relaxed text-[#8ba4c4]">
          Stats, fair teams, honours, results: the whole life of your weekly game.
        </p>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-0.5 bg-[#17263c] border border-[#17263c] rounded-xl overflow-hidden mt-9">
        {FEATURES.map((feature) => (
          <a
            key={feature.num}
            href={feature.href}
            className="block bg-[#0a1421] hover:bg-[#0f2033] px-[22px] pt-[26px] pb-7 border-t-[3px] transition-colors"
            style={{ borderTopColor: feature.accent }}
          >
            <p className="font-plex text-[11px] font-bold tracking-[.16em]" style={{ color: feature.accent }}>
              {feature.num}
            </p>
            <p className="mt-4 text-[21px] font-bold tracking-[-.02em] text-[#f4f9ff]">{feature.title}</p>
            <p className="mt-[9px] font-inter-body text-[13px] leading-relaxed text-[#8ba4c4]">{feature.body}</p>
          </a>
        ))}
      </div>
    </section>
  )
}
