interface MonthDividerProps {
  label: string // e.g. 'March 2026'
}

export function MonthDivider({ label }: MonthDividerProps) {
  return (
    <div className="flex items-center gap-3 px-1 py-1.5">
      <div className="h-px flex-1 bg-[#17263c]" />
      <span className="font-plex text-[9px] font-bold tracking-[.2em] text-[#4f688a] uppercase">
        {label}
      </span>
      <div className="h-px flex-1 bg-[#17263c]" />
    </div>
  )
}
