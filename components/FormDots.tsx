import { cn } from '@/lib/utils'

export const FORM_COLOR: Record<string, string> = {
  W: 'text-sky-400',
  D: 'text-slate-400',
  L: 'text-red-400',
  '-': 'text-slate-700',
}

export function FormDots({ form }: { form: string }) {
  return (
    <span className="flex gap-1">
      {form.split('').map((char, i) => (
        <span key={i} className={cn('font-mono text-xs font-bold', FORM_COLOR[char] ?? 'text-slate-600')}>
          {char}
        </span>
      ))}
    </span>
  )
}
