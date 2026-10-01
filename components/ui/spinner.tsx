import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Small spinning indicator for short waits inside an existing card or dialog.
 * Whole pages and panels use skeletons instead (components/ui/skeleton.tsx).
 */
export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" className="inline-flex">
      <Loader2 aria-hidden className={cn('size-4 animate-spin text-[#38bdf8] motion-reduce:animate-none', className)} />
      <span className="sr-only">{label}</span>
    </span>
  )
}
