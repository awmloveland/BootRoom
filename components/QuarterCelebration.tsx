'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Trophy } from 'lucide-react'
import { cn, buildQuarterShareText, buildResultHeadline, shareOrCopy, withShareLink } from '@/lib/utils'
import type { FinalGameShare } from '@/lib/utils'
import type { QuarterSummary } from '@/lib/sidebar-stats'

interface QuarterCelebrationProps {
  quarter: QuarterSummary
  leagueName: string
  leagueSlug: string
  variant: 'modal' | 'card'
  /** Signed link to this quarter; shares the plain Seasons link when absent. */
  shareUrl?: string | null
  /** The game that just completed the quarter, shown above the champion and shared with the wrap. */
  finalGame?: FinalGameShare | null
}

export function QuarterCelebration({ quarter, leagueName, leagueSlug, variant, shareUrl, finalGame }: QuarterCelebrationProps) {
  const [copied, setCopied] = useState(false)

  const champion = quarter.entries?.[0]
  const medals = (quarter.awards ?? []).filter(a => a.key !== 'champion')

  async function handleShare() {
    const text = withShareLink(buildQuarterShareText({ leagueName, leagueSlug, quarter, finalGame: finalGame ?? undefined }), shareUrl)
    const result = await shareOrCopy(text)
    if (result === 'copied') {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const record = champion
    ? [
        `${champion.points} pts`,
        `${champion.won} ${champion.won === 1 ? 'win' : 'wins'}`,
        champion.drew > 0 ? `${champion.drew} ${champion.drew === 1 ? 'draw' : 'draws'}` : null,
      ].filter(Boolean).join(' · ')
    : ''

  return (
    <div className={cn(
      'relative overflow-hidden',
      variant === 'card' && 'rounded-xl border border-[#1b2c46] bg-[#101d31] shadow-[0_18px_44px_rgba(0,0,0,.42)]',
    )}>
      {/* CSS-only celebratory sheen — decorative, non-interactive */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(190,242,100,.14)_0,transparent_42%),radial-gradient(circle_at_85%_0%,rgba(56,189,248,.14)_0,transparent_40%)]"
      />

      {finalGame && <FinalGameBlock game={finalGame} />}

      <div className="relative flex items-center justify-between gap-4 px-[22px] pt-5 pb-[18px]">
        <div>
          <p className="font-plex text-[9px] font-bold uppercase tracking-[.2em] text-[#bef264]">
            Q{quarter.q} {quarter.year} · {quarter.seasonName} Champion
          </p>
          <p className="mt-2 text-[26px] leading-none font-bold tracking-[-.03em] text-[#f4f9ff]">
            {champion?.name ?? '—'}
          </p>
          {record && (
            <p className="mt-[7px] font-plex text-[10px] uppercase tracking-[.14em] text-[#8ba4c4]">{record}</p>
          )}
        </div>
        <span
          aria-hidden
          className="inline-flex size-[52px] shrink-0 items-center justify-center rounded-full border border-[#bef264]/40 bg-[#bef264]/12 text-[#bef264]"
        >
          <Trophy className="size-6" strokeWidth={1.8} />
        </span>
      </div>

      {medals.length > 0 && (
        <div className="relative flex gap-2 overflow-x-auto border-t border-[#1b2c46] px-3.5 py-3 scrollbar-hide">
          {medals.map(award => (
            <div
              key={award.key}
              className="flex-shrink-0 flex flex-col gap-1 min-w-[124px] rounded-lg border border-[#1b2c46] bg-[#0a1421] px-3 py-2.5"
            >
              <span className="font-plex text-[8.5px] font-bold uppercase tracking-[.16em] text-[#a78bfa]">
                {award.nickname}
              </span>
              <span className="font-inter-body text-xs font-bold text-[#f4f9ff]">{award.player}</span>
              <span className="font-plex text-[9px] uppercase tracking-[.08em] text-[#6f88a8]">{award.stat}</span>
            </div>
          ))}
        </div>
      )}

      <div className="relative border-t border-[#1b2c46] px-4 py-3.5">
        <button
          type="button"
          onClick={handleShare}
          className="w-full h-[38px] rounded bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] text-[13px] font-bold transition-colors"
        >
          {copied ? 'Copied. Go and brag' : 'Share the glory'}
        </button>
        {variant === 'card' && (
          <Link
            href={`/${leagueSlug}/honours#q-${quarter.year}-${quarter.q}`}
            className="mt-2.5 block text-center font-plex text-[9.5px] font-bold uppercase tracking-[.14em] text-[#8ba4c4] hover:text-[#f4f9ff]"
          >
            See full standings →
          </Link>
        )}
      </div>
    </div>
  )
}

function FinalGameBlock({ game }: { game: FinalGameShare }) {
  const winners = game.result === 'teamA' ? game.teamA : game.result === 'teamB' ? game.teamB : null
  const headline = game.result === 'dnf'
    ? buildResultHeadline(null, 0, true)
    : buildResultHeadline(game.result, game.goalDifference, false)

  return (
    <div className="relative border-b border-[#1b2c46] px-[22px] py-4">
      <p className="font-plex text-[8.5px] font-bold uppercase tracking-[.16em] text-[#6f88a8]">Final game</p>
      <p className="mt-1.5 text-[15px] font-bold tracking-[-.02em] text-[#f4f9ff]">{headline}</p>
      {winners && (
        <p className={cn(
          'mt-1 font-inter-body text-xs leading-relaxed',
          game.result === 'teamA' ? 'text-[#7dd3fc]' : 'text-[#c4b5fd]',
        )}>
          {winners.join(', ')}
        </p>
      )}
      {game.highlights.length > 0 && (
        <div className="mt-2.5 flex flex-col gap-1">
          {game.highlights.map((line) => (
            <p key={line} className="font-inter-body text-xs text-[#cfe0f4]">{line}</p>
          ))}
        </div>
      )}
    </div>
  )
}
