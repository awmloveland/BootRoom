'use client'

import { useState } from 'react'
import { Lock } from 'lucide-react'
import { AuthDialog } from '@/components/AuthDialog'
import { JoinRequestDialog } from '@/components/JoinRequestDialog'

interface LineupLabLoginPromptProps {
  leagueId: string
  leagueSlug: string
  leagueName: string
}

export function LineupLabLoginPrompt({ leagueId, leagueSlug, leagueName }: LineupLabLoginPromptProps) {
  const [signInOpen, setSignInOpen] = useState(false)
  const [signUpOpen, setSignUpOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="w-14 h-14 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
        <Lock size={22} className="text-slate-500" />
      </div>
      <div className="flex flex-col items-center gap-1">
        <p className="text-slate-100 font-semibold text-base">Sign in to use Lineup Lab</p>
        <p className="text-slate-500 text-sm max-w-xs">
          Build and save lineups for your league matches.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSignInOpen(true)}
          className="bg-slate-700 border border-slate-600 hover:bg-slate-600 text-slate-100 text-sm font-medium px-5 py-2 rounded-md transition-colors"
        >
          Log in
        </button>
        <button
          onClick={() => setSignUpOpen(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-5 py-2 rounded-md transition-colors"
        >
          Join league
        </button>
      </div>

      <AuthDialog
        open={signInOpen}
        onOpenChange={setSignInOpen}
        redirect={`/${leagueSlug}/lineup-lab`}
        signinOnly
      />

      <AuthDialog
        open={signUpOpen}
        onOpenChange={setSignUpOpen}
        redirect={`/${leagueSlug}/lineup-lab`}
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
