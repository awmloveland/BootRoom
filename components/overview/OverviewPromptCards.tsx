'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AuthDialog } from '@/components/AuthDialog'

/** Overview card 2 for a signed-out visitor. */
export function OverviewSignInCard({ leagueSlug }: { leagueSlug: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex items-center justify-between gap-3.5 rounded-xl border border-[#1b2c46] bg-[#0a1421] px-4 py-[18px] shadow-[0_18px_44px_rgba(0,0,0,.42)]">
      <div className="min-w-0">
        <p className="text-base font-bold tracking-[-.02em] text-[#f4f9ff]">Sign in to see your stats</p>
        <p className="mt-1.5 font-inter-body text-xs text-[#8ba4c4]">Win rate, form and where you sit in the table.</p>
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-[34px] shrink-0 rounded border border-[#223a5c] px-3.5 text-xs font-bold whitespace-nowrap text-[#cfe0f4] transition-colors hover:border-[#38bdf8] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#38bdf8]"
      >
        Log in
      </button>
      <AuthDialog open={open} onOpenChange={setOpen} redirect={`/${leagueSlug}/overview`} signinOnly />
    </div>
  )
}

/** Overview card 2 for a member who has not claimed a player yet. */
export function OverviewLinkProfileCard() {
  return (
    <div className="flex items-center justify-between gap-3.5 rounded-xl border border-[#38bdf8]/35 bg-[#38bdf8]/6 p-4 shadow-[0_18px_44px_rgba(0,0,0,.42)]">
      <div className="min-w-0">
        <p className="text-[15px] font-bold tracking-[-.02em] text-[#f4f9ff]">Have you played in this league before?</p>
        <p className="mt-1.5 font-inter-body text-xs text-[#8ba4c4]">
          Link your account to your player profile to see your stats and match history.
        </p>
      </div>
      <Link
        href="/settings"
        className="inline-flex h-[34px] shrink-0 items-center rounded bg-[#38bdf8] px-3.5 text-xs font-bold whitespace-nowrap text-[#05101d] transition-colors hover:bg-[#7dd3fc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#38bdf8]"
      >
        Link profile
      </Link>
    </div>
  )
}
