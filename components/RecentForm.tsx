interface RecentFormProps {
  form: string // 5-char string e.g. 'WWDLW' or '--WLW'
}

const CHAR_CLASS: Record<string, string> = {
  W: 'text-green-400',
  D: 'text-slate-400',
  L: 'text-red-400',
  '-': 'text-slate-600',
}

export function RecentForm({ form }: RecentFormProps) {
  return (
    <span className="flex gap-1.5">
      {[...form].reverse().map((char, i) => (
        <span
          key={i}
          className={`font-mono text-sm font-bold tracking-wide ${CHAR_CLASS[char] ?? 'text-slate-500'}`}
        >
          {char}
        </span>
      ))}
    </span>
  )
}
