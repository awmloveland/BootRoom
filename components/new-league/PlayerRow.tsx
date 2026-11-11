// components/new-league/PlayerRow.tsx
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  name: ReactNode
  /** The creator's row: sky border and a YOU badge, never removable. */
  you?: boolean
  /** Right-hand control. */
  children?: ReactNode
  className?: string
}

/** One 50px roster row shared by the three roster screens. */
export function PlayerRow({ name, you = false, children, className }: Props) {
  return (
    <div
      className={cn(
        'flex h-[50px] items-center gap-3 rounded-lg border bg-[#0a1421] pl-4 pr-1.5',
        you ? 'border-[#38bdf8]/45' : 'border-[#1b2c46]',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 font-inter-body text-[15px] font-semibold text-[#f4f9ff]">
        {name}
        {you && (
          <span className="rounded-[3px] bg-[#38bdf8] px-1.5 py-[3px] font-plex text-[8px] font-bold uppercase tracking-[.14em] text-[#05101d]">
            You
          </span>
        )}
      </div>
      {children}
    </div>
  )
}
