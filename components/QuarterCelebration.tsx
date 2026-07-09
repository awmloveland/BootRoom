'use client'

import { useState } from 'react'
import Link from 'next/link'
import { cn, buildQuarterShareText, shareOrCopy } from '@/lib/utils'
import type { QuarterSummary } from '@/lib/sidebar-stats'

interface QuarterCelebrationProps {
  quarter: QuarterSummary
  leagueName: string
  leagueSlug: string
  variant: 'modal' | 'card'
}

export function QuarterCelebration({ quarter, leagueName, leagueSlug, variant }: QuarterCelebrationProps) {
  const [copied, setCopied] = useState(false)

  const champion = quarter.entries?.[0]
  const medals = (quarter.awards ?? []).filter(a => a.key !== 'champion')

  async function handleShare() {
    const text = buildQuarterShareText({ leagueName, leagueSlug, quarter })
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
      variant === 'card' && 'rounded-xl border border-slate-700 bg-slate-800',
    )}>
      {/* CSS-only celebratory sheen — decorative, non-interactive */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 15%, rgba(96,165,250,0.25) 0, transparent 40%), ' +
            'radial-gradient(circle at 80% 10%, rgba(167,139,250,0.22) 0, transparent 40%), ' +
            'radial-gradient(circle at 50% 0%, rgba(251,191,36,0.18) 0, transparent 45%)',
        }}
      />

      <div className="relative px-5 pt-5 pb-4 text-center">
        <div className="text-4xl leading-none">👑</div>
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          Q{quarter.q} {quarter.year} · {quarter.seasonName} Champion
        </p>
        <p className="mt-1 text-2xl font-extrabold text-amber-300">
          {champion?.name ?? '—'}
        </p>
        {record && <p className="mt-1 text-xs text-slate-400">{record}</p>}
      </div>

      {medals.length > 0 && (
        <div className="relative flex gap-2 overflow-x-auto border-t border-slate-700 px-3 py-2.5 scrollbar-hide">
          {medals.map(award => (
            <div
              key={award.key}
              className="flex-shrink-0 flex flex-col gap-0.5 bg-slate-700/50 border border-slate-600 rounded-lg px-2.5 py-2 min-w-[108px]"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-xs">{award.icon}</span>
                <span className="text-[10px] font-bold tracking-wide uppercase text-indigo-400">
                  {award.nickname}
                </span>
              </div>
              <span className="text-xs font-semibold text-slate-100">{award.player}</span>
              <span className="text-[10px] text-slate-500">{award.stat}</span>
            </div>
          ))}
        </div>
      )}

      <div className="relative border-t border-slate-700 px-4 py-3">
        <button
          type="button"
          onClick={handleShare}
          className="w-full px-3 py-2 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold transition-colors"
        >
          {copied ? 'Copied — go and brag 📣' : 'Share the glory'}
        </button>
        {variant === 'card' && (
          <Link
            href={`/${leagueSlug}/honours#q-${quarter.year}-${quarter.q}`}
            className="mt-2 block text-center text-xs font-medium text-slate-400 hover:text-slate-200"
          >
            See full standings →
          </Link>
        )}
      </div>
    </div>
  )
}
