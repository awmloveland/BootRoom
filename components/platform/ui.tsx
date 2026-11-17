// components/platform/ui.tsx
// Presentational pieces shared by the two platform admin pages.
import { Tag } from '@/components/LeagueList'
import type { LeagueStatus } from '@/lib/platform'

export const CARD = 'overflow-hidden rounded-xl border border-[#1b2c46] bg-[#0a1421]'
export const LABEL = 'font-plex text-[8.5px] font-bold uppercase tracking-[.16em] text-[#6f88a8]'

const STATUS_TONE = { Active: 'lime', Stalled: 'amber', 'Not started': 'muted' } as const

export function StatusTag({ status }: { status: LeagueStatus }) {
  // The wrapper stops the tag wrapping when a long league name squeezes it.
  return (
    <span className="flex shrink-0">
      <Tag tone={STATUS_TONE[status]}>{status}</Tag>
    </span>
  )
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="font-plex text-[10px] font-bold uppercase tracking-[.18em] text-[#8ba4c4]">{title}</h2>
      <div className="mt-2.5">{children}</div>
    </section>
  )
}

/** A muted dot for a value that does not exist yet. */
export const NONE = <span className="text-[#4f688a]">·</span>
