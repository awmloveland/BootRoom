import { cn } from '@/lib/utils'

export const FORM_COLOR: Record<string, string> = {
  W: 'text-[#38bdf8]',
  D: 'text-[#8ba4c4]',
  L: 'text-[#e2686f]',
  '-': 'text-[#2f4a70]',
}

interface FormDotsProps {
  form: string
  /** Team B rows show wins in violet instead of sky. */
  team?: 'A' | 'B'
  className?: string
}

export function FormDots({ form, team = 'A', className }: FormDotsProps) {
  return (
    <span className={cn('flex gap-[5px] font-plex text-[11px] font-bold', className)}>
      {[...form].reverse().map((char, i) => (
        <span
          key={i}
          className={char === 'W' && team === 'B' ? 'text-[#a78bfa]' : FORM_COLOR[char] ?? 'text-[#4f688a]'}
        >
          {char === '-' ? '·' : char}
        </span>
      ))}
    </span>
  )
}
