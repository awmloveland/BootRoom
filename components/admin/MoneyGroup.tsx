/** Titled card group on the Admin tab, matching the Records group recipe. */
export function MoneyGroup({
  title,
  meta,
  footnote,
  children,
}: {
  title: string
  meta: string
  footnote?: string
  children: React.ReactNode
}) {
  return (
    <section aria-label={title}>
      <div className="flex items-baseline justify-between gap-3 px-1 mb-2.5">
        <h2 className="text-[17px] font-bold tracking-[-.02em] text-[#f4f9ff]">{title}</h2>
        <span className="text-right font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#6f88a8]">{meta}</span>
      </div>
      <div className="rounded-xl border border-[#1b2c46] bg-[#0a1421] overflow-hidden">{children}</div>
      {footnote && (
        <p className="mx-1 mt-2 font-inter-body text-[11px] leading-normal text-[#6f88a8]">{footnote}</p>
      )}
    </section>
  )
}

/** '1 game' / '3 games', for counts written in copy. */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}
