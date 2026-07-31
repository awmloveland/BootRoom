'use client'

import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { LoginLink } from '@/components/landing/LoginLink'

/** Last-5 form per player, consistent with the other landing demos. */
const TEAM_A = [
  { name: 'Marcus Reid 🧤', form: 'WWDWL' },
  { name: 'Callum Shaw', form: 'WLWWW' },
  { name: 'Rav Singh', form: 'WWWDL' },
  { name: 'Sam Okafor', form: 'WWWWL' },
]
const TEAM_B = [
  { name: 'Jordan Taylor 🧤', form: 'LWDWW' },
  { name: 'Dylan Carter', form: 'WLLWD' },
  { name: 'Nathan Wright', form: 'DWLWW' },
  { name: 'Priya Nair', form: 'WWLDW' },
]

const BAR_A: Record<string, string> = { W: 'bg-[#38bdf8]', D: 'bg-[#3d5578]', L: 'bg-[#e2686f]' }
const BAR_B: Record<string, string> = { W: 'bg-[#a78bfa]', D: 'bg-[#4b4275]', L: 'bg-[#e2686f]' }

const HERO_STATS = [
  { value: '100+', label: 'MATCHES RECORDED' },
  { value: '60+', label: 'PLAYERS TRACKED' },
  { value: '2025', label: 'KEEPING SCORE SINCE' },
]

const QUARTER_BARS = [
  { height: '46%', label: 'Q1', accent: false },
  { height: '58%', label: 'Q2', accent: false },
  { height: '52%', label: 'Q3', accent: false },
  { height: '72%', label: 'Q4', accent: false },
  { height: '100%', label: 'Q1', accent: true },
]

/** Marcus Reid's last five (WWDWL) as margin bars for the player badge chart. */
const MARGIN_BARS = [
  { height: '74%', result: 'W' },
  { height: '100%', result: 'W' },
  { height: '34%', result: 'D' },
  { height: '58%', result: 'W' },
  { height: '46%', result: 'L' },
]
const MARGIN_COLORS: Record<string, { bar: string; label: string }> = {
  W: { bar: 'bg-[#38bdf8]', label: 'text-[#38bdf8]' },
  D: { bar: 'bg-[#3d5578]', label: 'text-[#8ba4c4]' },
  L: { bar: 'bg-[#e2686f]', label: 'text-[#e2686f]' },
}

const badgeClass =
  'flex-none lg:absolute snap-start box-border flex flex-col justify-between gap-3.5 border border-[#1b2c46] bg-[#101d31] rounded-[10px] p-[18px] lg:px-4 lg:py-3.5 shadow-[0_22px_50px_rgba(0,0,0,.6)] w-[min(240px,66vw)] sm:w-[min(262px,62vw)] lg:w-[min(274px,100%)]'

function FormBars({ form, palette }: { form: string; palette: Record<string, string> }) {
  return (
    <span className="flex gap-[3px] shrink-0">
      {form.split('').map((ch, i) => (
        <span key={i} className={cn('w-2.5 h-1.5 rounded-[2px]', palette[ch])} />
      ))}
    </span>
  )
}

function TeamSheet({
  rating,
  ratingClass,
  players,
  palette,
  chipClass,
}: {
  rating: string
  ratingClass: string
  players: { name: string; form: string }[]
  palette: Record<string, string>
  chipClass: string
}) {
  return (
    <div className="flex flex-col gap-[5px]">
      <div className="flex items-baseline justify-between gap-2.5 pb-2 border-b border-[#1b2c46]">
        <span className="font-plex text-[9px] font-semibold tracking-[.16em] text-[#6f88a8]">RATING</span>
        <span className={cn('font-plex text-[15px] font-bold', ratingClass)}>{rating}</span>
      </div>
      {players.map((player) => (
        <div
          key={player.name}
          className={cn(
            'flex items-center justify-between gap-2.5 font-inter-body text-xs font-semibold px-[11px] py-2 rounded',
            chipClass
          )}
        >
          <span>{player.name}</span>
          <FormBars form={player.form} palette={palette} />
        </div>
      ))}
    </div>
  )
}

function TrophyBadge() {
  return (
    <span className="inline-flex items-center justify-center w-[54px] h-[54px] lg:w-10 lg:h-10 shrink-0 rounded-full bg-[rgba(190,242,100,.12)] border border-[rgba(190,242,100,.4)] text-[#bef264]">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-[26px] h-[26px] lg:w-[19px] lg:h-[19px]"
      >
        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
        <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
        <path d="M4 22h16" />
        <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
        <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
        <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
      </svg>
    </span>
  )
}

export function Hero() {
  const railRef = useRef<HTMLDivElement>(null)
  const [activeCard, setActiveCard] = useState(0)

  function handleRailScroll() {
    const el = railRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    if (max <= 0) return
    setActiveCard(Math.min(2, Math.round((el.scrollLeft / max) * 2)))
  }

  return (
    <section className="relative overflow-hidden bg-[#060b14]">
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none bg-[radial-gradient(#16283f_1.4px,transparent_1.4px)] bg-[length:24px_24px] [mask-image:linear-gradient(180deg,#000_0%,rgba(0,0,0,.45)_55%,transparent_92%)]"
      />
      <div className="relative max-w-[1200px] mx-auto px-5 sm:px-11 pt-10 sm:pt-14 lg:pt-[72px] pb-[52px] sm:pb-[68px] lg:pb-[84px] grid lg:grid-cols-[1.02fr_.98fr] gap-[30px] sm:gap-10 min-[1200px]:gap-[52px] lg:items-center">
        <div>
          <span className="inline-flex items-center gap-[9px] font-plex text-[10px] font-bold tracking-[.2em] text-[#bef264]">
            <span className="w-[22px] h-0.5 bg-[#bef264]" />
            PRIVATE BETA · 5, 6 &amp; 7-A-SIDE
          </span>
          <h1 className="mt-5 text-[34px] min-[421px]:text-[42px] sm:text-[60px] lg:text-[68px] min-[1200px]:text-[82px] leading-[.94] font-bold tracking-[-.035em] text-[#f4f9ff]">
            Results, stats <br className="hidden lg:inline" />and fair teams.
          </h1>
          <p className="mt-4 text-2xl sm:text-[30px] lg:text-[34px] leading-none font-bold tracking-[-.03em] text-[#38bdf8]">
            For your weekly game.
          </p>
          <p className="mt-6 lg:max-w-[470px] font-inter-body text-base leading-relaxed text-[#8ba4c4] text-pretty">
            The group chat has opinions. The table has facts. Craft Football records every match
            your group plays and turns it into results history, player records, honours boards and
            auto-picked teams.
          </p>
          <div className="flex flex-col md:flex-row items-stretch gap-3.5 mt-[30px]">
            <a
              href="#waitlist"
              className="inline-flex items-center justify-center w-full md:w-auto box-border h-[52px] px-[26px] bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] rounded text-[15px] font-bold transition-colors"
            >
              Register your interest
            </a>
            <LoginLink className="inline-flex items-center justify-center w-full md:w-auto box-border h-[52px] px-[22px] border border-[#223a5c] hover:border-[#38bdf8] rounded text-[#cfe0f4] hover:text-white text-[15px] font-semibold transition-colors cursor-pointer">
              Log in
            </LoginLink>
          </div>
          <div className="grid grid-cols-3 items-end gap-3 sm:flex sm:flex-wrap sm:gap-[34px] lg:gap-5 min-[1200px]:gap-[34px] mt-11 pt-[26px] border-t border-[#17263c]">
            {HERO_STATS.map((stat, i) => (
              <div key={stat.label} className="contents">
                {i > 0 && <div className="hidden sm:block w-px h-[38px] bg-[#17263c]" />}
                <div>
                  <p className="font-plex text-[26px] sm:text-[34px] font-bold tracking-[-.03em] text-[#f4f9ff] leading-none">
                    {stat.value}
                  </p>
                  <p className="mt-1.5 font-plex text-[9px] font-semibold tracking-[.18em] text-[#6f88a8]">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="min-w-0">
          <div className="flex lg:hidden items-center justify-between gap-3 mb-3">
            <span className="font-plex text-[9px] font-bold tracking-[.18em] text-[#6f88a8]">A WEEK IN THE APP</span>
            <span className="inline-flex items-center gap-[7px] font-plex text-[9px] font-bold tracking-[.18em] text-[#38bdf8]">
              SWIPE
              <svg
                viewBox="0 0 24 24"
                width="13"
                height="13"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14" />
                <path d="m13 6 6 6-6 6" />
              </svg>
            </span>
          </div>
          <div
            ref={railRef}
            onScroll={handleRailScroll}
            className="relative flex lg:block items-stretch gap-3.5 lg:gap-0 overflow-x-auto lg:overflow-visible scrollbar-hide snap-x snap-proximity pb-[26px] lg:pt-20 lg:pb-[84px]"
          >
            {/* Champion badge — floats bottom-right on desktop, second rail card on mobile */}
            <div className={cn(badgeClass, 'order-2 lg:order-none lg:left-[268px] lg:top-[448px] lg:rotate-2 z-[2]')}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-plex text-[9px] font-bold tracking-[.18em] text-[#bef264]">Q1 2026 CHAMPION</p>
                  <p className="mt-[7px] font-inter-body text-xl lg:text-[13px] font-bold tracking-[-.02em] text-[#f4f9ff]">Sam Okafor</p>
                  <p className="mt-[3px] font-plex text-[9px] tracking-[.14em] text-[#6f88a8]">71% WIN RATE · 24 CAPS</p>
                </div>
                <TrophyBadge />
              </div>
              <div className="flex lg:hidden flex-1 min-h-0 flex-col justify-end gap-2.5">
                <p className="font-plex text-[9px] font-semibold tracking-[.16em] text-[#6f88a8]">WIN RATE BY QUARTER</p>
                <div className="flex items-end gap-2 h-[132px]">
                  {QUARTER_BARS.map((bar, i) => (
                    <div key={i} className="flex-1 flex flex-col justify-end gap-[7px] h-full">
                      <span
                        className={cn('rounded-[2px]', bar.accent ? 'bg-[#bef264]' : i === 3 ? 'bg-[#2f5c85]' : 'bg-[#22405f]')}
                        style={{ height: bar.height }}
                      />
                      <span
                        className={cn(
                          'font-plex text-[8.5px] tracking-[.1em] text-center',
                          bar.accent ? 'font-bold text-[#bef264]' : 'text-[#6f88a8]'
                        )}
                      >
                        {bar.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex lg:hidden flex-col gap-[9px] pt-[13px] border-t border-[#1b2c46]">
                <div className="flex items-baseline justify-between gap-2.5">
                  <span className="font-inter-body text-xs text-[#8ba4c4]">Runner-up</span>
                  <span className="font-inter-body text-xs font-semibold text-[#dff1ff]">Sofia Marsh</span>
                </div>
                <div className="flex items-baseline justify-between gap-2.5">
                  <span className="font-inter-body text-xs text-[#8ba4c4]">Longest streak</span>
                  <span className="font-inter-body text-xs font-semibold text-[#dff1ff]">5 wins</span>
                </div>
                <div className="flex items-baseline justify-between gap-2.5">
                  <span className="font-inter-body text-xs text-[#8ba4c4]">Milestone</span>
                  <span className="font-inter-body text-xs font-semibold text-[#dff1ff]">R. Singh · 50th</span>
                </div>
                <p className="mt-1 font-plex text-[9px] font-semibold tracking-[.16em] text-[#6f88a8]">CROWNED EVERY QUARTER</p>
              </div>
            </div>
            {/* Match card — the centrepiece; first rail card on mobile */}
            <div className="order-1 lg:order-none flex-none lg:flex-initial snap-start w-[min(390px,90vw)] sm:w-[min(486px,84vw)] lg:w-auto flex flex-col border border-[#1b2c46] bg-[#0a1421] rounded-[14px] overflow-hidden shadow-[0_34px_80px_rgba(0,0,0,.6)]">
              <div className="flex items-center justify-between px-5 py-3.5 bg-[#0c1728] border-b border-[#1b2c46]">
                <span className="font-plex text-[10px] font-semibold tracking-[.16em] text-[#7f97b5]">WEEK 14 · 25 MAR 2026 · 7-A-SIDE</span>
                <span className="font-plex text-[10px] font-bold tracking-[.16em] text-[#bef264]">FULL TIME</span>
              </div>
              <div className="px-6 pt-[26px] pb-[22px] grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                <p className="text-[13px] font-bold tracking-[.02em] text-[#7dd3fc]">TEAM A</p>
                <div className="flex items-center gap-[22px]">
                  <p className="font-plex text-[40px] sm:text-[56px] font-bold leading-[.9] tracking-[-.04em] text-[#f4f9ff] tabular-nums">6</p>
                  <span className="w-px h-12 bg-[#1b2c46]" />
                  <p className="font-plex text-[40px] sm:text-[56px] font-bold leading-[.9] tracking-[-.04em] text-[#f4f9ff] tabular-nums">4</p>
                </div>
                <p className="text-right text-[13px] font-bold tracking-[.02em] text-[#c4b5fd]">TEAM B</p>
              </div>
              <div className="relative mx-6 mb-5 flex-1 lg:flex-none min-h-0 overflow-hidden">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <TeamSheet
                    rating="4.012"
                    ratingClass="text-[#7dd3fc]"
                    players={TEAM_A}
                    palette={BAR_A}
                    chipClass="bg-[rgba(8,47,73,.55)] border-l-2 border-[#38bdf8] text-[#dff1ff]"
                  />
                  <TeamSheet
                    rating="3.988"
                    ratingClass="text-[#c4b5fd]"
                    players={TEAM_B}
                    palette={BAR_B}
                    chipClass="bg-[rgba(46,16,101,.45)] border-l-2 border-[#a78bfa] text-[#efeaff]"
                  />
                </div>
                <div className="block sm:hidden absolute inset-x-0 bottom-0 h-14 bg-[linear-gradient(180deg,rgba(10,20,33,0),#0a1421_82%)] pointer-events-none" />
              </div>
              <div className="flex items-center justify-between px-6 py-[13px] border-t border-[#1b2c46] bg-[#0c1728] font-plex text-[10px] font-semibold tracking-[.14em] text-[#7f97b5]">
                <span>LINEUP LAB · Δ 0.024 BALANCED</span>
                <span className="text-[#bef264]">MARGIN +2</span>
              </div>
            </div>
            {/* Player badge — floats top-left on desktop, third rail card on mobile */}
            <div className={cn(badgeClass, 'order-3 lg:order-none lg:-left-[30px] lg:top-0 lg:-rotate-2')}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-inter-body text-xl lg:text-[13px] font-bold tracking-[-.02em] text-[#f4f9ff]">Marcus Reid</p>
                  <p className="mt-1 font-plex text-[9px] tracking-[.14em] text-[#6f88a8]">42 CAPS · KEEPER</p>
                </div>
                <p className="font-plex text-[32px] lg:text-2xl font-bold leading-none tracking-[-.03em] text-[#38bdf8]">
                  66.7<span className="text-[13px]">%</span>
                </p>
              </div>
              <div className="flex lg:hidden flex-1 min-h-0 flex-col justify-end gap-2.5">
                <p className="font-plex text-[9px] font-semibold tracking-[.16em] text-[#6f88a8]">LAST FIVE · MARGIN</p>
                <div className="flex items-end gap-2 h-[132px]">
                  {MARGIN_BARS.map((bar, i) => (
                    <div key={i} className="flex-1 flex flex-col justify-end gap-[7px] h-full">
                      <span className={cn('rounded-[2px]', MARGIN_COLORS[bar.result].bar)} style={{ height: bar.height }} />
                      <span className={cn('font-plex text-[9px] font-bold text-center', MARGIN_COLORS[bar.result].label)}>
                        {bar.result}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="hidden lg:flex gap-1 mt-3">
                  {'WWDWL'.split('').map((ch, i) => (
                    <span key={i} className={cn('flex-1 h-2 rounded-[2px]', BAR_A[ch])} />
                  ))}
                </div>
                <div className="flex lg:hidden flex-col gap-[9px] pt-[13px] border-t border-[#1b2c46]">
                  <div className="flex items-baseline justify-between gap-2.5">
                    <span className="font-inter-body text-xs text-[#8ba4c4]">Played</span>
                    <span className="font-plex text-xs font-bold text-[#dff1ff]">42</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2.5">
                    <span className="font-inter-body text-xs text-[#8ba4c4]">Won · drawn · lost</span>
                    <span className="font-plex text-xs font-bold text-[#dff1ff]">28 · 4 · 10</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2.5">
                    <span className="font-inter-body text-xs text-[#8ba4c4]">Time in goal</span>
                    <span className="font-plex text-xs font-bold text-[#dff1ff]">61%</span>
                  </div>
                  <p className="mt-1 font-plex text-[9px] font-semibold tracking-[.16em] text-[#6f88a8]">EVERY APPEARANCE COUNTED</p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex lg:hidden gap-1.5 mt-4">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={cn('w-[22px] h-1 rounded-[2px] transition-colors', activeCard === i ? 'bg-[#38bdf8]' : 'bg-[#1b2c46]')}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
