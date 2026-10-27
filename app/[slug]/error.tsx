'use client'

import { CloudOff } from 'lucide-react'

/**
 * Shown when a league read fails (see readFailed in lib/fetchers.ts). The
 * failed read is not cached, so trying again re-reads from the database.
 */
export default function LeagueError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return (
    <main className="px-4 sm:px-6 pt-5 pb-14">
      <div className="mx-auto flex max-w-xl flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="w-14 h-14 rounded-full bg-[#0a1421] border border-[#1b2c46] flex items-center justify-center">
          <CloudOff size={22} className="text-[#6f88a8]" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <p className="text-[#f4f9ff] font-semibold text-base">Could not load the league</p>
          <p className="text-[#6f88a8] text-sm max-w-xs">
            The league data did not come back in time. Try again in a moment.
          </p>
        </div>
        <button
          onClick={() => unstable_retry()}
          className="bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] text-sm font-bold px-5 py-2 rounded transition-colors"
        >
          Try again
        </button>
      </div>
    </main>
  )
}
