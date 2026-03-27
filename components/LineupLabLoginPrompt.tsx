import Link from 'next/link'
import { Lock } from 'lucide-react'

interface LineupLabLoginPromptProps {
  leagueId: string
}

export function LineupLabLoginPrompt({ leagueId }: LineupLabLoginPromptProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="w-14 h-14 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
        <Lock size={22} className="text-slate-500" />
      </div>
      <p className="text-slate-100 font-semibold text-sm">Sign in to use Lineup Lab</p>
      <p className="text-slate-500 text-sm max-w-xs">
        Build and save lineups for your league matches.
      </p>
      <Link
        href={`/sign-in?redirect=/${leagueId}/lineup-lab`}
        className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-5 py-2 rounded-md"
      >
        Sign in
      </Link>
    </div>
  )
}
