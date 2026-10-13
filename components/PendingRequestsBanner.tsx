import Link from 'next/link'
import { UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { pendingRequestsBannerText } from '@/lib/utils'
import type { PendingRequestSummary } from '@/lib/types'

interface PendingRequestsBannerProps {
  leagueSlug: string
  requests: PendingRequestSummary
}

/**
 * Admin-only prompt above the league tabs while join requests or player
 * claims are waiting. Not dismissible: it goes once they've been reviewed.
 */
export function PendingRequestsBanner({ leagueSlug, requests }: PendingRequestsBannerProps) {
  const text = pendingRequestsBannerText(requests)
  if (!text) return null

  return (
    <div className="mt-3.5 flex items-center gap-3 rounded-lg border border-[#38bdf8]/50 bg-[#38bdf8]/8 px-4 py-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#38bdf8]/15 text-[#7dd3fc]">
        <UserPlus className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[#dff1ff]">{text.title}</p>
        <p className="mt-0.5 truncate font-inter-body text-xs text-[#7dd3fc]/70">{text.detail}</p>
      </div>
      <Button asChild size="xs" className="shrink-0">
        <Link href={`/${leagueSlug}/settings?tab=members`}>Review</Link>
      </Button>
    </div>
  )
}
