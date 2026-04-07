'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'

interface ClaimOnboardingBannerProps {
  leagueId: string
}

export function ClaimOnboardingBanner({ leagueId }: ClaimOnboardingBannerProps) {
  const storageKey = `dismissed-claim-banner-${leagueId}`
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(storageKey)) {
      setVisible(true)
    }
  }, [storageKey])

  function dismiss() {
    localStorage.setItem(storageKey, '1')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="rounded-lg border border-sky-700 bg-sky-900/30 px-4 py-3 mb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-sky-200">
            Have you played in this league before?
          </p>
          <p className="mt-0.5 text-xs text-sky-300/70">
            Link your account to your player profile to see your stats and match history.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="text-sky-400/60 hover:text-sky-300 transition-colors shrink-0 mt-0.5"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-2.5 flex items-center gap-3">
        <Link
          href="/settings"
          className="text-xs font-medium text-sky-300 hover:text-sky-200 transition-colors"
        >
          Claim my profile →
        </Link>
        <button
          type="button"
          onClick={dismiss}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
