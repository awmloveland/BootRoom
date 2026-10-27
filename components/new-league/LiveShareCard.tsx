// components/new-league/LiveShareCard.tsx
'use client'

import { useState } from 'react'
import { Share2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { OUTLINE_BUTTON, PRIMARY_BUTTON } from './StepShell'

interface Props {
  leagueName: string
  /** The public league page. Never expires and admits nobody without approval. */
  url: string
  /** Roster names not yet linked to an account (the creator is excluded). */
  names: string[]
  /** Full day name, or null when the league has none. */
  day: string | null
}

function initials(name: string): string {
  return name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()
}

export function LiveShareCard({ leagueName, url, names, day }: Props) {
  const [copied, setCopied] = useState(false)
  const matchDay = day ?? 'match day'

  async function copy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  async function share() {
    if (typeof navigator.share === 'function') {
      await navigator.share({ title: leagueName, url }).catch(() => {})
    } else {
      await copy()
    }
  }

  return (
    <section className="rounded-[14px] border border-[#38bdf8]/45 p-5 shadow-[0_18px_44px_rgba(0,0,0,.42),0_0_0_6px_rgba(56,189,248,.06)]">
      <p className="font-plex text-[9px] font-bold uppercase tracking-[.2em] text-[#7dd3fc]">One thing left</p>
      <h2 className="mt-2 text-xl font-bold tracking-[-.02em] text-[#f4f9ff]">Get your players in</h2>
      <p className="mt-2 font-inter-body text-sm leading-[1.5] text-[#8ba4c4]">
        {names.length === 0
          ? `Just you so far. One link to the group chat and your players pick their names, see the table and get picked for ${matchDay}.`
          : `${names.length} ${names.length === 1 ? 'player' : 'players'} on your roster, none of them in yet. One link to the group chat and they pick their name, see the table and get picked for ${matchDay}.`}
      </p>
      {names.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {names.map((n) => (
            <li key={n} className="flex h-[30px] items-center gap-2 rounded-full border border-dashed border-[#2c4a72] pl-1 pr-3 font-inter-body text-xs text-[#cfe0f4]">
              <span className="flex size-[22px] items-center justify-center rounded-full bg-[#1b2c46] font-plex text-[9px] font-bold text-[#f4f9ff]">{initials(n)}</span>
              {n.split(' ')[0]}
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={share} className={cn(PRIMARY_BUTTON, 'mt-5 h-[52px] gap-2')}>
        <Share2 className="size-4" />
        Share with the group
      </button>
      <div className="mt-3 flex gap-2">
        <code className="flex h-11 min-w-0 flex-1 items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border border-[#1b2c46] bg-[#0c1728] px-3 font-plex text-xs text-[#8ba4c4]">
          {url}
        </code>
        <button type="button" onClick={copy} className={cn(OUTLINE_BUTTON, 'h-11 w-auto min-w-[88px] px-3 text-[13px]')}>
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      <p className="mt-3 font-inter-body text-[12.5px] leading-[1.5] text-[#6f88a8]">
        Anyone with the link can ask to join and pick their name. You approve them in one tap, and their stats follow them. You can share it any time from Settings.
      </p>
    </section>
  )
}
