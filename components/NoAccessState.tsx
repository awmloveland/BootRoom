import Link from 'next/link'
import { ShieldOff } from 'lucide-react'

interface NoAccessStateProps {
  leagueSlug: string
  leagueName: string
  /** Name of the page they cannot see, e.g. 'Admin'. */
  page: string
}

/**
 * Shown to a signed-in visitor who reaches a page their role cannot see
 * (e.g. a member following an Admin link), with a way back to the league.
 */
export function NoAccessState({ leagueSlug, leagueName, page }: NoAccessStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="w-14 h-14 rounded-full bg-[#0a1421] border border-[#1b2c46] flex items-center justify-center">
        <ShieldOff size={22} className="text-[#6f88a8]" />
      </div>
      <div className="flex flex-col items-center gap-1">
        <p className="text-[#f4f9ff] font-semibold text-base">You don&apos;t have access to {page}</p>
        <p className="text-[#6f88a8] text-sm max-w-xs">Only league admins can see this page.</p>
      </div>
      <Link
        href={`/${leagueSlug}`}
        className="bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] text-sm font-bold px-5 py-2 rounded transition-colors"
      >
        Back to {leagueName}
      </Link>
    </div>
  )
}
