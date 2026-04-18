interface Props {
  year: string
}

export function YearDivider({ year }: Props) {
  return (
    <div id={`year-${year}`} className="flex items-center gap-3 px-1 py-2">
      <div className="h-px flex-1 bg-slate-700" />
      <span className="text-xs font-semibold tracking-widest text-slate-500 uppercase">
        {year}
      </span>
      <div className="h-px flex-1 bg-slate-700" />
    </div>
  )
}
