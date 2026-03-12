interface MonthDividerProps {
  label: string // e.g. 'March 2026'
}

export function MonthDivider({ label }: MonthDividerProps) {
  return (
    <div className="flex items-center gap-3 px-1 py-1">
      <div className="h-px flex-1 bg-slate-800" />
      <span className="text-xs font-medium tracking-wider text-slate-600 uppercase">
        {label}
      </span>
      <div className="h-px flex-1 bg-slate-800" />
    </div>
  )
}
