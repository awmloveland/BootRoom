'use client'

import { useState } from 'react'
import { ReviewCard } from '@/components/ReviewCard'
import { buildReviewItems } from '@/lib/utils'
import type { PendingJoinRequest, PlayerAttribute, PlayerClaim, ReviewItem } from '@/lib/types'

interface PendingReviewListProps {
  leagueId: string
  requests: PendingJoinRequest[]
  /** Pending player claims. Ones from people with a pending request are left out. */
  claims: PlayerClaim[]
  roster: PlayerAttribute[]
  /** Called after any item is approved or declined. */
  onChanged?: () => void
  /** Called when the server says the roster has moved on (409). */
  onRosterStale?: () => void
}

function itemKey(item: ReviewItem): string {
  return item.kind === 'join' ? `join:${item.request.id}` : `claim:${item.claim.id}`
}

/** Settings → Members: everything waiting for an admin, one card each. */
export function PendingReviewList({ leagueId, requests, claims, roster, onChanged, onRosterStale }: PendingReviewListProps) {
  const [done, setDone] = useState<Set<string>>(new Set())
  const items = buildReviewItems(requests, claims).filter((i) => !done.has(itemKey(i)))

  if (items.length === 0) {
    return <p className="font-inter-body text-[13px] text-[#6f88a8]">No pending requests.</p>
  }

  return (
    <div className="rounded-xl border border-[#1b2c46] bg-[#0a1421] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1b2c46] bg-[#0c1728]">
        <p className="text-sm font-medium text-[#f4f9ff]">
          Waiting for you <span className="text-[#6f88a8] font-normal">({items.length})</span>
        </p>
      </div>
      <ul className="divide-y divide-[#17263c]">
        {items.map((item) => {
          const key = itemKey(item)
          return (
            <ReviewCard
              key={key}
              leagueId={leagueId}
              item={item}
              roster={roster}
              onRosterStale={onRosterStale}
              onDone={() => {
                setDone((prev) => new Set(prev).add(key))
                onChanged?.()
              }}
            />
          )
        })}
      </ul>
    </div>
  )
}
