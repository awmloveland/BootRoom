'use client'

import { useState } from 'react'
import { Lock } from 'lucide-react'
import { AuthDialog } from '@/components/AuthDialog'

interface HonoursLoginPromptProps {
  leagueSlug: string
  leagueName: string
  /** Tab route segment the sign-in returns to. Shared by Seasons, Records and Admin. */
  tab?: 'honours' | 'records' | 'admin'
}

const COPY = {
  honours: {
    title: 'Sign in to view Seasons',
    body: 'See quarterly champions and standings for your league.',
  },
  records: {
    title: 'Sign in to view Records',
    body: 'See all-time records, streaks and titles for your league.',
  },
  admin: {
    title: 'Sign in to view Admin',
    body: 'League admins track pitch fees and payments here.',
  },
}

export function HonoursLoginPrompt({ leagueSlug, leagueName, tab = 'honours' }: HonoursLoginPromptProps) {
  const [signInOpen, setSignInOpen] = useState(false)
  const [signUpOpen, setSignUpOpen] = useState(false)
  // Admin is for existing admins, so there is nothing to join from there.
  const showJoin = tab !== 'admin'

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="w-14 h-14 rounded-full bg-[#0a1421] border border-[#1b2c46] flex items-center justify-center">
        <Lock size={22} className="text-[#6f88a8]" />
      </div>
      <div className="flex flex-col items-center gap-1">
        <p className="text-[#f4f9ff] font-semibold text-base">{COPY[tab].title}</p>
        <p className="text-[#6f88a8] text-sm max-w-xs">{COPY[tab].body}</p>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSignInOpen(true)}
          className="bg-[#1b2c46] border border-[#223a5c] hover:bg-[#223a5c] text-[#f4f9ff] text-sm font-medium px-5 py-2 rounded-md transition-colors"
        >
          Log in
        </button>
        {showJoin && (
          <button
            onClick={() => setSignUpOpen(true)}
            className="bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] text-sm font-bold px-5 py-2 rounded transition-colors"
          >
            Join league
          </button>
        )}
      </div>

      <AuthDialog
        open={signInOpen}
        onOpenChange={setSignInOpen}
        redirect={`/${leagueSlug}/${tab}`}
        signinOnly
      />

      {showJoin && (
        <AuthDialog
          open={signUpOpen}
          onOpenChange={setSignUpOpen}
          redirect={`/${leagueSlug}/${tab}?open_join=1`}
          initialMode="signup"
          leagueName={leagueName}
        />
      )}
    </div>
  )
}
