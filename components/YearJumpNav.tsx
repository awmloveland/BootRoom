'use client'

interface Props {
  years: string[]  // descending order, e.g. ['2026', '2025']
}

export function YearJumpNav({ years }: Props) {
  if (years.length <= 1) return null

  return (
    <div className="hidden lg:flex items-center gap-2 mb-3">
      <span className="text-[10px] text-slate-500 uppercase tracking-widest shrink-0">
        Jump to
      </span>
      {years.map((year) => (
        <button
          key={year}
          type="button"
          onClick={() =>
            document.getElementById(`year-${year}`)?.scrollIntoView({ behavior: 'smooth' })
          }
          className="text-xs px-2.5 py-1 rounded-full border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300 transition-colors"
        >
          {year}
        </button>
      ))}
    </div>
  )
}
