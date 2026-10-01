interface RecentFormProps {
  form: string // 5-char string e.g. 'WWDLW' or '--WLW'
}

const CHAR_CLASS: Record<string, string> = {
  W: 'text-[#38bdf8]',
  D: 'text-[#8ba4c4]',
  L: 'text-[#e2686f]',
  '-': 'text-[#4f688a]',
}

export function RecentForm({ form }: RecentFormProps) {
  return (
    <span className="flex gap-1.5">
      {[...form].reverse().map((char, i) => (
        <span
          key={i}
          className={`font-mono text-sm font-bold tracking-wide ${CHAR_CLASS[char] ?? 'text-[#6f88a8]'}`}
        >
          {char}
        </span>
      ))}
    </span>
  )
}
