interface Props {
  year: string
}

export function YearDivider({ year }: Props) {
  return (
    <div id={`year-${year}`} className="flex items-center gap-3 px-1 py-2">
      <div className="h-px flex-1 bg-[#1b2c46]" />
      <span className="font-plex text-[10px] font-bold tracking-[.2em] text-[#6f88a8] uppercase">
        {year}
      </span>
      <div className="h-px flex-1 bg-[#1b2c46]" />
    </div>
  )
}
