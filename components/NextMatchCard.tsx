'use client'

import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { getNextMatchDate, getNextWeekNumber, deriveSeason } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { Week, Winner } from '@/lib/types'

interface Props {
  gameId: string
  weeks: Week[]
  onResultSaved: () => void
  canEdit?: boolean
}

interface ParsedName {
  name: string
  known: boolean
}

interface ScheduledWeek {
  id: string
  week: number
  date: string
  format: string | null
  teamA: string[]
  teamB: string[]
}

type CardState = 'loading' | 'idle' | 'lineup'


function parseNames(text: string, roster: Set<string>): ParsedName[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ name, known: roster.has(name.toLowerCase()) }))
}

function randomiseSplit(names: string[]): [string[], string[]] {
  const shuffled = [...names].sort(() => Math.random() - 0.5)
  const mid = Math.ceil(shuffled.length / 2)
  return [shuffled.slice(0, mid), shuffled.slice(mid)]
}

function NameTags({ names }: { names: ParsedName[] }) {
  if (names.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {names.map((p, i) => (
        <span
          key={i}
          className={cn(
            'px-2 py-0.5 rounded text-xs font-medium',
            p.known
              ? 'bg-slate-700 text-slate-100'
              : 'bg-slate-800 border border-dashed border-slate-500 text-slate-400'
          )}
        >
          {p.name}
          {!p.known && <span className="ml-1 text-slate-500">?</span>}
        </span>
      ))}
    </div>
  )
}

export function NextMatchCard({ gameId, weeks, onResultSaved, canEdit = true }: Props) {
  const [cardState, setCardState] = useState<CardState>('loading')
  const [scheduledWeek, setScheduledWeek] = useState<ScheduledWeek | null>(null)

  // Idle: single player list + randomised split
  const [playersText, setPlayersText] = useState('')
  const [randomisedA, setRandomisedA] = useState<string[]>([])
  const [randomisedB, setRandomisedB] = useState<string[]>([])
  const [format, setFormat] = useState('')

  // Result recording
  const [winner, setWinner] = useState<Winner>(null)
  const [notes, setNotes] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const roster = useMemo(() => {
    const names = new Set<string>()
    weeks.forEach((w) => {
      if (w.status === 'played') {
        w.teamA.forEach((n) => names.add(n.toLowerCase()))
        w.teamB.forEach((n) => names.add(n.toLowerCase()))
      }
    })
    return names
  }, [weeks])

  const nextDate = useMemo(() => getNextMatchDate(weeks), [weeks])
  const nextWeekNum = useMemo(() => getNextWeekNumber(weeks), [weeks])
  const season = useMemo(() => deriveSeason(weeks), [weeks])

  const parsedPlayers = useMemo(() => parseNames(playersText, roster), [playersText, roster])
  const hasRandomised = randomisedA.length > 0 || randomisedB.length > 0

  // Auto-derive format from player count: ceil(n/2)-a-side
  useEffect(() => {
    const n = parsedPlayers.length
    if (n === 0) { setFormat(''); return }
    setFormat(`${Math.ceil(n / 2)}-a-side`)
  }, [parsedPlayers.length])

  function handleRandomise() {
    const names = parsedPlayers.map((p) => p.name)
    if (names.length === 0) return
    const [a, b] = randomiseSplit(names)
    setRandomisedA(a)
    setRandomisedB(b)
  }

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('weeks')
        .select('id, week, date, format, team_a, team_b')
        .eq('game_id', gameId)
        .eq('status', 'scheduled')
        .order('week', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (data) {
        setScheduledWeek({
          id: data.id,
          week: data.week,
          date: data.date,
          format: data.format,
          teamA: data.team_a ?? [],
          teamB: data.team_b ?? [],
        })
        setCardState('lineup')
      } else {
        setCardState('idle')
      }
    }
    load()
  }, [gameId])

  async function handleSaveLineup() {
    const teamA = randomisedA.length > 0 ? randomisedA : []
    const teamB = randomisedB.length > 0 ? randomisedB : []
    if (teamA.length === 0 && teamB.length === 0) {
      setError('Randomise teams first')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data: weekId, error: err } = await supabase.rpc('save_lineup', {
        p_game_id: gameId,
        p_season: season,
        p_week: nextWeekNum,
        p_date: nextDate,
        p_format: format || null,
        p_team_a: teamA,
        p_team_b: teamB,
      })
      if (err) throw err
      setScheduledWeek({ id: weekId as string, week: nextWeekNum, date: nextDate, format, teamA, teamB })
      setCardState('lineup')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save lineup')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveResult() {
    if (!scheduledWeek || !winner) {
      setError('Select a result first')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const supabase = createClient()
      const { error: err } = await supabase.rpc('record_result', {
        p_week_id: scheduledWeek.id,
        p_winner: winner,
        p_notes: notes.trim() || null,
      })
      if (err) throw err
      setScheduledWeek(null)
      setCardState('idle')
      setWinner(null)
      setNotes('')
      onResultSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save result')
    } finally {
      setSaving(false)
    }
  }

  async function handleCancelScheduled() {
    if (!scheduledWeek) return
    const supabase = createClient()
    await supabase.rpc('cancel_lineup', { p_week_id: scheduledWeek.id })
    setScheduledWeek(null)
    setPlayersText('')
    setRandomisedA([])
    setRandomisedB([])
    setCardState('idle')
  }

  if (cardState === 'loading') return null

  return (
    <div className="rounded-lg border border-slate-600 bg-slate-800 mb-3">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <div>
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Next Match</span>
          <p className="text-sm font-semibold text-slate-100 mt-0.5">
            Week {cardState === 'lineup' && scheduledWeek ? scheduledWeek.week : nextWeekNum}
            {' · '}
            {cardState === 'lineup' && scheduledWeek ? scheduledWeek.date : nextDate}
            {cardState === 'lineup' && scheduledWeek?.format && (
              <span className="ml-2 text-xs font-normal text-slate-400">{scheduledWeek.format}</span>
            )}
          </p>
        </div>
        {cardState === 'lineup' && canEdit && (
          <button
            type="button"
            onClick={handleCancelScheduled}
            className="text-xs text-slate-500 hover:text-slate-300"
          >
            Reset
          </button>
        )}
      </div>

      <div className="px-4 py-3 space-y-4">
        {/* ── IDLE: single list + randomise ── */}
        {cardState === 'idle' && (
          canEdit ? (
            <>
              {format && (
                <p className="text-xs text-slate-400">
                  <span className="text-slate-100 font-medium">{format}</span>
                  {' · '}{parsedPlayers.length} players
                </p>
              )}

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Paste all attending players (one per line)
                </label>
                <textarea
                  value={playersText}
                  onChange={(e) => {
                    setPlayersText(e.target.value)
                    setRandomisedA([])
                    setRandomisedB([])
                  }}
                  rows={6}
                  placeholder={'Alice\nLuke\nJaff\nWill\nIan\nJunior\nMatt\nJoe R\nRoy\nEthon'}
                  className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100 text-xs font-mono placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-slate-500 resize-none"
                />
                <NameTags names={parsedPlayers} />
              </div>

              {/* Randomised preview */}
              {hasRandomised && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <p className="text-xs text-slate-400 mb-1.5">Team A</p>
                    <div className="flex flex-wrap gap-1">
                      {randomisedA.map((name) => (
                        <span key={name} className="px-2 py-0.5 rounded bg-blue-900/60 border border-blue-800 text-blue-200 text-xs">{name}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-1.5">Team B</p>
                    <div className="flex flex-wrap gap-1">
                      {randomisedB.map((name) => (
                        <span key={name} className="px-2 py-0.5 rounded bg-violet-900/60 border border-violet-800 text-violet-200 text-xs">{name}</span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {error && <p className="text-xs text-red-400">{error}</p>}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleRandomise}
                  disabled={parsedPlayers.length === 0}
                  className="px-4 py-2 rounded-lg border border-slate-600 hover:border-slate-500 text-slate-200 text-sm font-medium disabled:opacity-40"
                >
                  {hasRandomised ? 'Re-randomise' : 'Randomise Teams'}
                </button>
                {hasRandomised && (
                  <button
                    type="button"
                    onClick={handleSaveLineup}
                    disabled={saving}
                    className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm font-medium disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save Lineup'}
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">Lineup not yet set.</p>
          )
        )}

        {/* ── LINEUP SAVED: show teams + record result ── */}
        {cardState === 'lineup' && scheduledWeek && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-slate-400 mb-1.5">Team A</p>
                <div className="flex flex-wrap gap-1">
                  {scheduledWeek.teamA.map((name) => (
                    <span key={name} className="px-2 py-0.5 rounded bg-slate-700 text-slate-100 text-xs">{name}</span>
                  ))}
                  {scheduledWeek.teamA.length === 0 && <span className="text-xs text-slate-500">No players set</span>}
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1.5">Team B</p>
                <div className="flex flex-wrap gap-1">
                  {scheduledWeek.teamB.map((name) => (
                    <span key={name} className="px-2 py-0.5 rounded bg-slate-700 text-slate-100 text-xs">{name}</span>
                  ))}
                  {scheduledWeek.teamB.length === 0 && <span className="text-xs text-slate-500">No players set</span>}
                </div>
              </div>
            </div>

            {canEdit && <div className="border-t border-slate-700 pt-3">
              <p className="text-xs text-slate-400 mb-2">Record result</p>
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setWinner('teamA')}
                  className={cn(
                    'flex-1 py-2 rounded-lg border text-sm font-medium transition-colors',
                    winner === 'teamA'
                      ? 'bg-blue-900 border-blue-700 text-blue-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-blue-700 hover:text-blue-300'
                  )}
                >
                  Team A
                </button>
                <button
                  type="button"
                  onClick={() => setWinner('draw')}
                  className={cn(
                    'flex-1 py-2 rounded-lg border text-sm font-medium transition-colors',
                    winner === 'draw'
                      ? 'bg-slate-700 border-slate-600 text-slate-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                  )}
                >
                  Draw
                </button>
                <button
                  type="button"
                  onClick={() => setWinner('teamB')}
                  className={cn(
                    'flex-1 py-2 rounded-lg border text-sm font-medium transition-colors',
                    winner === 'teamB'
                      ? 'bg-violet-900 border-violet-700 text-violet-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-violet-700 hover:text-violet-300'
                  )}
                >
                  Team B
                </button>
              </div>

              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Optional notes (e.g. +3 goals, injuries…)"
                className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100 text-xs placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-slate-500 resize-none mb-3"
              />

              {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

              <button
                type="button"
                onClick={handleSaveResult}
                disabled={saving || !winner}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm font-medium disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save Result'}
              </button>
            </div>}
          </>
        )}
      </div>
    </div>
  )
}
