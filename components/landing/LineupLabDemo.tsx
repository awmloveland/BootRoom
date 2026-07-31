'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface Lineup {
  a: string[]
  b: string[]
  ra: string
  rb: string
  delta: string
}

const LINEUPS: Lineup[] = [
  {
    a: ['Marcus Reid 🧤', 'Callum Shaw', 'Rav Singh', 'Sofia Marsh', 'Sam Okafor'],
    b: ['Jordan Taylor 🧤', 'Dylan Carter', 'Nathan Wright', 'Priya Nair', 'Leon Brooks'],
    ra: '4.012',
    rb: '3.988',
    delta: '0.024',
  },
  {
    a: ['Jordan Taylor 🧤', 'Sofia Marsh', 'Sam Okafor', 'Harry Patel', 'Leon Brooks'],
    b: ['Marcus Reid 🧤', 'Callum Shaw', 'Rav Singh', 'Priya Nair', 'Dylan Carter'],
    ra: '3.941',
    rb: '3.966',
    delta: '0.025',
  },
]

/** Last-5 form per player, consistent with the stats demo where players overlap. */
const FORM: Record<string, string> = {
  'Marcus Reid': 'WWDWL',
  'Callum Shaw': 'WLWWW',
  'Rav Singh': 'WWWDL',
  'Sofia Marsh': 'WDWWW',
  'Sam Okafor': 'WWWWL',
  'Jordan Taylor': 'LWDWW',
  'Dylan Carter': 'WLLWD',
  'Nathan Wright': 'DWLWW',
  'Priya Nair': 'WWLDW',
  'Leon Brooks': 'LDWWL',
  'Harry Patel': 'WLWDL',
}

const BAR_CLASS: Record<string, string> = {
  W: 'bg-[#38bdf8]',
  D: 'bg-[#3d5578]',
  L: 'bg-[#e2686f]',
}

function TeamColumn({
  label,
  labelClass,
  rating,
  players,
  dealt,
  baseDelay,
  chipClass,
}: {
  label: string
  labelClass: string
  rating: string
  players: string[]
  dealt: boolean
  baseDelay: number
  chipClass: string
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between pb-2.5 border-b border-[#1b2c46]">
        <span className={cn('text-sm font-bold tracking-[.02em]', labelClass)}>{label}</span>
        <span
          className={cn(
            'font-plex text-base font-bold transition-opacity duration-[400ms] delay-[400ms] motion-reduce:transition-none',
            labelClass,
            dealt ? 'opacity-100' : 'opacity-0'
          )}
        >
          {rating}
        </span>
      </div>
      <div className="flex flex-col gap-1.5 mt-3">
        {players.map((name, i) => (
          <div
            key={name}
            className={cn(
              'flex items-center justify-between gap-3 font-inter-body text-[13px] font-semibold px-3 py-[9px] rounded border-l-2 transition-[opacity,transform] duration-[450ms] ease-[cubic-bezier(.2,.7,.3,1)] motion-reduce:transition-none',
              chipClass,
              dealt ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-[0.97]'
            )}
            style={{ transitionDelay: dealt ? `${(baseDelay + i * 0.06).toFixed(2)}s` : '0s' }}
          >
            <span className="truncate">{name}</span>
            <span className="flex gap-[3px] shrink-0">
              {(FORM[name.replace(' 🧤', '')] ?? '').split('').map((ch, j) => (
                <span key={j} className={cn('w-2 h-[5px] rounded-[1px]', BAR_CLASS[ch])} />
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function LineupLabDemo() {
  const [dealt, setDealt] = useState(false)
  const [lineupIndex, setLineupIndex] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lineup = LINEUPS[lineupIndex]

  useEffect(() => {
    timerRef.current = setTimeout(() => setDealt(true), 500)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  function shuffle() {
    if (timerRef.current) clearTimeout(timerRef.current)
    setDealt(false)
    timerRef.current = setTimeout(() => {
      setLineupIndex((i) => (i + 1) % LINEUPS.length)
      setDealt(true)
    }, 380)
  }

  return (
    <section
      id="feature-lineup"
      className="mt-16 lg:mt-[88px] py-16 lg:py-[88px] px-5 sm:px-11 bg-[#0a1421] border-y border-[#17263c]"
    >
      <div className="max-w-[1112px] mx-auto grid lg:grid-cols-[1.15fr_.85fr] gap-10 lg:gap-14 items-center">
        <div className="relative border border-[#1b2c46] bg-[#060b14] rounded-[14px] px-4 sm:px-[26px] pt-[26px] pb-[22px] overflow-hidden order-2 lg:order-1">
          <svg
            viewBox="0 0 600 340"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full"
            fill="none"
            stroke="#132339"
            strokeWidth="2"
          >
            <line x1="300" y1="0" x2="300" y2="340" />
            <circle cx="300" cy="170" r="78" />
          </svg>
          <div className="relative">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-plex text-[10px] font-semibold tracking-[.16em] text-[#7f97b5]">
                TONIGHT&apos;S DRAW · 5-A-SIDE · 10 IN
              </span>
              <span
                className={cn(
                  'font-plex text-[10px] font-bold tracking-[.14em] px-[11px] py-[5px] rounded bg-[rgba(190,242,100,.14)] border border-[rgba(190,242,100,.4)] text-[#bef264] transition-opacity duration-[400ms] delay-500 motion-reduce:transition-none',
                  dealt ? 'opacity-100' : 'opacity-0'
                )}
              >
                Δ {lineup.delta} BALANCED
              </span>
            </div>
            <div className="grid sm:grid-cols-2 gap-[26px] mt-[22px]">
              <TeamColumn
                label="TEAM A"
                labelClass="text-[#7dd3fc]"
                rating={lineup.ra}
                players={lineup.a}
                dealt={dealt}
                baseDelay={0.05}
                chipClass="bg-[rgba(8,47,73,.55)] border-[#38bdf8] text-[#dff1ff]"
              />
              <TeamColumn
                label="TEAM B"
                labelClass="text-[#c4b5fd]"
                rating={lineup.rb}
                players={lineup.b}
                dealt={dealt}
                baseDelay={0.11}
                chipClass="bg-[rgba(46,16,101,.45)] border-[#a78bfa] text-[#efeaff]"
              />
            </div>
            <div className="flex justify-center mt-5">
              <button
                type="button"
                onClick={shuffle}
                className="inline-flex items-center gap-[9px] h-[42px] px-5 bg-transparent border border-[#223a5c] hover:border-[#38bdf8] rounded text-[13px] font-bold text-[#cfe0f4] hover:text-white cursor-pointer transition-colors"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                  <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                  <path d="M8 16H3v5" />
                </svg>
                Shuffle teams
              </button>
            </div>
          </div>
        </div>
        <div className="order-1 lg:order-2">
          <p className="font-plex text-[10px] font-bold tracking-[.2em] text-[#a78bfa]">02 · LINEUP LAB</p>
          <h2 className="mt-3.5 text-4xl sm:text-[46px] leading-none font-bold tracking-[-.035em] text-[#f4f9ff]">
            Fair teams,<br />picked by the<br />numbers.
          </h2>
          <p className="mt-4 font-inter-body text-[15px] leading-[1.65] text-[#8ba4c4] text-pretty">
            Lineup Lab weighs every player&apos;s record, win rate, recent form and time in goal,
            then splits tonight&apos;s group into two sides so even it is spooky.
          </p>
        </div>
      </div>
    </section>
  )
}
