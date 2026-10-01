import { cn } from '@/lib/utils'

/**
 * Delayed fade-in for a loading placeholder. It starts invisible and fades in
 * via `@starting-style` (Tailwind's `starting:` variant), so fast loads swap
 * straight to content with no skeleton flash and slow ones still get it.
 * Browsers without `@starting-style` show it immediately.
 */
export const SKELETON_FADE_IN = 'opacity-100 starting:opacity-0 transition-opacity duration-300 delay-200'

/** A pulsing placeholder block. Size and shape come from `className`. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('rounded bg-[#17263c] animate-pulse', className)} />
}

/** Card with a header band over a body of rows, the shape most panels share. */
export function SkeletonCard({ rows, className }: { rows: number; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-[#1b2c46] bg-[#0a1421] overflow-hidden', className)}>
      <div className="px-3.5 py-2.5 border-b border-[#17263c] bg-[#0c1728]">
        <Skeleton className="h-2.5 w-24 my-[1px]" />
      </div>
      <div className="p-3.5 flex flex-col gap-2.5">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-3 w-full" />
        ))}
      </div>
    </div>
  )
}

/** Bordered list of rows, the shape of the picker lists in settings dialogs. */
export function SkeletonList({ rows, className }: { rows: number; className?: string }) {
  return (
    <div className={cn('rounded-lg border border-[#1b2c46]', SKELETON_FADE_IN, className)} aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="px-3 py-2.5 border-b border-[#17263c] last:border-0">
          <Skeleton className={cn('h-3', i % 2 === 0 ? 'w-36' : 'w-28')} />
        </div>
      ))}
    </div>
  )
}
