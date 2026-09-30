'use client'

import { useCallback, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'

interface ClaimOnboardingBannerProps {
  leagueId: string
}

export function ClaimOnboardingBanner({ leagueId }: ClaimOnboardingBannerProps) {
  const storageKey = `dismissed-claim-banner-${leagueId}`
  const [dismissed, setDismissed] = useState(false)

  const subscribe = useCallback(() => {
    // localStorage doesn't fire events within the same tab, so no-op
    return () => {}
  }, [])
  const getSnapshot = useCallback(() => localStorage.getItem(storageKey), [storageKey])
  const getServerSnapshot = useCallback(() => '1', [])

  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const visible = stored === null && !dismissed

  function dismiss() {
    localStorage.setItem(storageKey, '1')
    setDismissed(true)
  }

  if (!visible) return null

  return (
    <div className="rounded-lg border border-[#38bdf8]/50 bg-[#38bdf8]/8 px-4 py-3 mb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#dff1ff]">
            Have you played in this league before?
          </p>
          <p className="mt-0.5 text-xs text-[#7dd3fc]/70">
            Link your account to your player profile to see your stats and match history.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="text-[#38bdf8]/60 hover:text-[#7dd3fc] transition-colors shrink-0 mt-0.5"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-2.5 flex items-center gap-3">
        <Link
          href="/settings"
          className="text-xs font-medium text-[#7dd3fc] hover:text-[#dff1ff] transition-colors"
        >
          Claim my profile →
        </Link>
        <button
          type="button"
          onClick={dismiss}
          className="text-xs text-[#6f88a8] hover:text-[#cfe0f4] transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
