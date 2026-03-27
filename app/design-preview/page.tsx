'use client'

import { Settings, ClipboardList, Users, FlaskConical } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Shared mock data ────────────────────────────────────────────────────────

const MOCK = {
  leagueName: 'The Thursday Night Five',
  playedCount: 18,
  totalWeeks: 52,
  currentTab: 'results' as const,
  isAdmin: true,
  details: {
    location: 'Hackney Marshes',
    day: 'Thursday',
    kickoff_time: '19:30',
    bio: 'A long-running five-a-side league for the regulars. Competitive but friendly — all abilities welcome.',
    player_count: 14,
  },
}

function Tabs({ accentBlue = false }: { accentBlue?: boolean }) {
  const { currentTab } = MOCK
  return (
    <nav className="flex gap-6 border-b border-slate-700">
      {(['results', 'players', 'lineup-lab'] as const).map((tab) => {
        const active = currentTab === tab
        return (
          <button key={tab} className={cn(
            '-mb-px flex items-center gap-2 border-b-2 pb-2 text-sm font-medium',
            active
              ? accentBlue ? 'border-blue-400 text-blue-300' : 'border-slate-100 text-slate-100'
              : 'border-transparent text-slate-400'
          )}>
            {tab === 'results' && <ClipboardList className="size-4" />}
            {tab === 'players' && <Users className="size-4" />}
            {tab === 'lineup-lab' && <FlaskConical className="size-4" />}
            {tab === 'results' ? 'Results' : tab === 'players' ? 'Players' : 'Lineup Lab'}
          </button>
        )
      })}
    </nav>
  )
}

function GearButton() {
  return (
    <button className="shrink-0 p-1.5 rounded-md text-slate-600 hover:text-slate-400 hover:bg-slate-800 transition-colors">
      <Settings className="size-4" />
    </button>
  )
}

// ─── V1: Name big · bio prominent · facts whispered ──────────────────────────
// The bio gets the most visual weight after the name. Details are present
// but clearly secondary — one muted line at the bottom of the identity block.

function V1() {
  const { leagueName, playedCount, totalWeeks, isAdmin, details } = MOCK
  const facts: string[] = []
  if (details?.location) facts.push(`📍 ${details.location}`)
  if (details?.day && details?.kickoff_time) facts.push(`${details.day}s ${details.kickoff_time}`)
  if (details?.player_count !== undefined) facts.push(`${details.player_count} players`)
  facts.push(`${playedCount} of ${totalWeeks} weeks`)

  return (
    <div className="mb-6 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">{leagueName}</h1>
          {details?.bio && (
            <p className="text-sm text-slate-300 leading-relaxed">{details.bio}</p>
          )}
          {facts.length > 0 && (
            <p className="text-xs text-slate-600">{facts.join('  ·  ')}</p>
          )}
        </div>
        {isAdmin && <GearButton />}
      </div>
      <Tabs />
    </div>
  )
}

// ─── V2: Divided — identity above the line, details below ────────────────────
// A thin rule creates two clear zones: who you are (name + bio), and
// the practical details (location, schedule, squad). Tabs float below.

function V2() {
  const { leagueName, playedCount, totalWeeks, isAdmin, details } = MOCK

  return (
    <div className="mb-6 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">{leagueName}</h1>
          {details?.bio && (
            <p className="text-sm text-slate-300 leading-relaxed">{details.bio}</p>
          )}
        </div>
        {isAdmin && <GearButton />}
      </div>

      <div className="border-t border-slate-800 pt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {details?.location && (
          <span className="text-xs text-slate-500">
            <span className="text-slate-600 mr-1">📍</span>{details.location}
          </span>
        )}
        {details?.day && details?.kickoff_time && (
          <span className="text-xs text-slate-500">
            <span className="text-slate-600 mr-1">🕖</span>{details.day}s · {details.kickoff_time}
          </span>
        )}
        {details?.player_count !== undefined && (
          <span className="text-xs text-slate-500">
            <span className="text-slate-600 mr-1">👥</span>{details.player_count} players
          </span>
        )}
        <span className="text-xs text-slate-500">
          <span className="text-slate-600 mr-1">📅</span>{playedCount} of {totalWeeks} weeks
        </span>
      </div>

      <Tabs />
    </div>
  )
}

// ─── V3: Name + inline details on one line · bio gets its own space ───────────
// Compact header row (name left, details right as a tight cluster), then
// the bio gets a full line to breathe. Clean top-to-bottom read.

function V3() {
  const { leagueName, playedCount, totalWeeks, isAdmin, details } = MOCK

  return (
    <div className="mb-6 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-100">{leagueName}</h1>
        <div className="flex items-center gap-2 pt-1 shrink-0">
          <div className="text-right">
            {details?.location && (
              <p className="text-xs text-slate-500 leading-snug">{details.location}</p>
            )}
            {details?.day && details?.kickoff_time && (
              <p className="text-xs text-slate-500 leading-snug">{details.day}s · {details.kickoff_time}</p>
            )}
            {details?.player_count !== undefined && (
              <p className="text-xs text-slate-500 leading-snug">{details.player_count} players · {playedCount}/{totalWeeks} wks</p>
            )}
          </div>
          {isAdmin && <GearButton />}
        </div>
      </div>

      {details?.bio && (
        <p className="text-sm text-slate-300 leading-relaxed">{details.bio}</p>
      )}

      <Tabs accentBlue />
    </div>
  )
}

// ─── Preview page ─────────────────────────────────────────────────────────────

function Section({ label, sub, children }: { label: string; sub: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs font-bold uppercase tracking-widest text-slate-500 border border-slate-700 rounded px-2 py-0.5">{label}</span>
        <span className="text-sm text-slate-400">{sub}</span>
      </div>
      <div className="border border-slate-800 rounded-lg p-4 bg-slate-900">
        {children}
        <div className="h-24 rounded-md bg-slate-800/40 border border-dashed border-slate-800 flex items-center justify-center">
          <span className="text-slate-700 text-xs">page content</span>
        </div>
      </div>
    </div>
  )
}

export default function DesignPreviewPage() {
  return (
    <div className="min-h-screen bg-slate-900 py-12 px-4">
      <div className="max-w-xl mx-auto space-y-12">

        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-slate-500">Visual treatment — three approaches</p>
        </div>

        <Section label="1" sub="Bio prominent · details whispered on one muted line">
          <V1 />
        </Section>

        <Section label="2" sub="Rule divides name+bio from the practical details below">
          <V2 />
        </Section>

        <Section label="3" sub="Name left · details stacked right · bio full-width below">
          <V3 />
        </Section>

      </div>
    </div>
  )
}
