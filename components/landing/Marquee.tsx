const MARQUEE_WORDS = ['STATS', 'FAIR TEAMS', 'HONOURS', 'RESULTS']

export function Marquee() {
  return (
    <div className="bg-[#38bdf8] overflow-hidden py-4">
      <div className="flex w-max animate-[cf-tick_40s_linear_infinite] motion-reduce:animate-none text-2xl sm:text-[30px] font-bold tracking-[-.02em] text-[#05101d]">
        {/* Even number of copies keeps the -50% loop seamless; six ensures one half
            of the strip always exceeds the viewport width, even on ultrawide screens. */}
        {[0, 1, 2, 3, 4, 5].map((copy) => (
          <span key={copy} aria-hidden={copy > 0} className="flex">
            {MARQUEE_WORDS.map((word) => (
              <span key={word} className="flex">
                <span className="px-[22px]">{word}</span>
                <span className="px-[22px] opacity-45">·</span>
              </span>
            ))}
          </span>
        ))}
      </div>
    </div>
  )
}
