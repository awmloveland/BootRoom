'use client'

import { useState } from 'react'
import { Lock } from 'lucide-react'
import { AuthDialog } from '@/components/AuthDialog'
import { JoinRequestDialog } from '@/components/JoinRequestDialog'

interface HonoursLoginPromptProps {
  leagueId: string
  leagueSlug: string
  leagueName: string
}

export function HonoursLoginPrompt({ leagueId, leagueSlug, leagueName }: HonoursLoginPromptProps) {
  const [signInOpen, setSignInOpen] = useState(false)
  const [signUpOpen, setSignUpOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="w-14 h-14 rounded-full bg-[#0a1421] border border-[#1b2c46] flex items-center justify-center">
        <Lock size={22} className="text-[#6f88a8]" />
      </div>
      <div className="flex flex-col items-center gap-1">
        <p className="text-[#f4f9ff] font-semibold text-base">Sign in to view Honours</p>
        <p className="text-[#6f88a8] text-sm max-w-xs">
          See quarterly champions and standings for your league.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSignInOpen(true)}
          className="bg-[#1b2c46] border border-[#223a5c] hover:bg-[#223a5c] text-[#f4f9ff] text-sm font-medium px-5 py-2 rounded-md transition-colors"
        >
          Log in
        </button>
        <button
          onClick={() => setSignUpOpen(true)}
          className="bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] text-sm font-bold px-5 py-2 rounded transition-colors"
        >
          Join league
        </button>
      </div>

      <AuthDialog
        open={signInOpen}
        onOpenChange={setSignInOpen}
        redirect={`/${leagueSlug}/honours`}
        signinOnly
      />

      <AuthDialog
        open={signUpOpen}
        onOpenChange={setSignUpOpen}
        redirect={`/${leagueSlug}/honours`}
        initialMode="signup"
        leagueName={leagueName}
        onSignedUp={() => {
          setSignUpOpen(false)
          setJoinOpen(true)
        }}
      />

      <JoinRequestDialog
        leagueId={leagueId}
        leagueName={leagueName}
        open={joinOpen}
        onOpenChange={setJoinOpen}
        onSuccess={() => setJoinOpen(false)}
      />
    </div>
  )
}
