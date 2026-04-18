// components/ResultModal.tsx
'use client'

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { cn, ewptScore, buildResultShareText } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { Winner, ScheduledWeek, LineupMetadata, Player, Mentality, Week } from '@/lib/types'
import { EyeTestSlider } from '@/components/EyeTestSlider'
import { Toggle } from '@/components/ui/toggle'

interface Props {
  scheduledWeek: ScheduledWeek
  lineupMetadata: LineupMetadata | null
  allPlayers: Player[]
  gameId: string
  leagueSlug: string
  leagueName: string
  weeks: Week[]
  publicMode: boolean
  onSaved: (result: { winner: NonNullable<Winner>; goalDifference: number; shareText: string; highlightsText: string }) => void
  onClose: () => void
}

type ResultStep = 'winner' | 'review' | 'confirm'

interface GuestReviewState {
  name: string
  rating: number
  goalkeeper: boolean
  addToRoster: boolean
  rosterName: string
  nameError: string | null
}

interface NewPlayerReviewState {
  name: string
  rating: number
  mentality: Mentality
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5 px-5 py-2.5 bg-slate-900 border-b border-slate-700">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'w-1.5 h-1.5 rounded-full',
            i < current - 1 ? 'bg-green-500' : i === current - 1 ? 'bg-blue-500' : 'bg-slate-600'
          )}
        />
      ))}
      <span className="ml-1 text-[11px] text-slate-500">{current} of {total}</span>
    </div>
  )
}

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center border border-slate-700 rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        className={cn(
          'w-8 h-8 flex items-center justify-center bg-slate-800 text-slate-400 hover:text-slate-100 text-lg leading-none select-none',
          value <= 1 && 'opacity-40 cursor-not-allowed'
        )}
      >
        −
      </button>
      <span className="w-9 h-8 flex items-center justify-center bg-slate-900 text-slate-100 font-bold text-sm border-x border-slate-700">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(20, value + 1))}
        disabled={value >= 20}
        className={cn(
          'w-8 h-8 flex items-center justify-center bg-slate-800 text-slate-400 hover:text-slate-100 text-lg leading-none select-none',
          value >= 20 && 'opacity-40 cursor-not-allowed'
        )}
      >
        +
      </button>
    </div>
  )
}

export function ResultModal({ scheduledWeek, lineupMetadata, allPlayers, gameId, leagueSlug, leagueName, weeks, publicMode, onSaved, onClose }: Props) {
  const guests = lineupMetadata?.guests ?? []
  const newPlayers = lineupMetadata?.new_players ?? []
  const hasReviewStep = guests.length > 0 || newPlayers.length > 0
  const totalSteps = hasReviewStep ? 3 : 1

  const [step, setStep] = useState<ResultStep>('winner')
  const [winner, setWinner] = useState<Winner>(null)
  const [notes, setNotes] = useState('')
  const [goalDifference, setGoalDifference] = useState<number>(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [guestStates, setGuestStates] = useState<GuestReviewState[]>(
    guests.map((g) => ({
      name: g.name,
      rating: g.rating,
      goalkeeper: g.goalkeeper ?? false,
      addToRoster: false,
      rosterName: '',
      nameError: null,
    }))
  )
  const [newPlayerStates, setNewPlayerStates] = useState<NewPlayerReviewState[]>(
    newPlayers.map((p) => ({
      name: p.name,
      rating: p.rating,
      mentality: p.mentality ?? (p.goalkeeper ? 'goalkeeper' : 'balanced'),
    }))
  )

  function updateGuestRating(i: number, rating: number) {
    setGuestStates((prev) => prev.map((g, idx) => idx === i ? { ...g, rating } : g))
  }
  function updateGuestRoster(i: number, addToRoster: boolean) {
    setGuestStates((prev) => prev.map((g, idx) => idx === i ? { ...g, addToRoster, nameError: null } : g))
  }
  function updateGuestRosterName(i: number, rosterName: string) {
    setGuestStates((prev) => prev.map((g, idx) => idx === i ? { ...g, rosterName, nameError: null } : g))
  }
  function updateNewPlayerRating(i: number, rating: number) {
    setNewPlayerStates((prev) => prev.map((p, idx) => idx === i ? { ...p, rating } : p))
  }
  function updateGuestGoalkeeper(i: number, goalkeeper: boolean) {
    setGuestStates((prev) => prev.map((g, idx) => idx === i ? { ...g, goalkeeper } : g))
  }
  function updateNewPlayerMentality(i: number, mentality: Mentality) {
    setNewPlayerStates((prev) => prev.map((p, idx) => idx === i ? { ...p, mentality } : p))
  }

  function validateReview(): boolean {
    let valid = true
    const updatedGuests = guestStates.map((g) => {
      if (!g.addToRoster) return g
      const trimmed = g.rosterName.trim()
      if (!trimmed) {
        valid = false
        return { ...g, nameError: 'Enter a name to add to the roster.' }
      }
      const collision = allPlayers.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())
      if (collision) {
        valid = false
        return { ...g, nameError: `A player named "${trimmed}" already exists.` }
      }
      return g
    })
    setGuestStates(updatedGuests)
    return valid
  }

  async function handleSave() {
    if (!winner) return
    setSaving(true)
    setError(null)

    // Compute frozen team strength scores to store alongside the result.
    const guestMap = new Map(guestStates.map((g) => [g.name, g]))
    const newPlayerMap = new Map(newPlayerStates.map((p) => [p.name, p]))

    function resolveTeam(names: string[]): Player[] {
      return names.map((name) => {
        const known = allPlayers.find((p) => p.name === name)
        if (known) return known
        const src = guestMap.get(name) ?? newPlayerMap.get(name)
        return {
          name,
          played: 0, won: 0, drew: 0, lost: 0,
          timesTeamA: 0, timesTeamB: 0,
          winRate: 0, qualified: false, points: 0,
          recentForm: '',
          mentality: 'balanced' as const,
          rating: src?.rating ?? 2,
          goalkeeper: src ? ('mentality' in src ? src.mentality === 'goalkeeper' : src.goalkeeper) : false,
        }
      })
    }

    const teamAScore = parseFloat(ewptScore(resolveTeam(scheduledWeek.teamA)).toFixed(3))
    const teamBScore = parseFloat(ewptScore(resolveTeam(scheduledWeek.teamB)).toFixed(3))

    try {
      // Construct synthetic week so highlights reflect tonight's result
      const syntheticWeek: Week = {
        week: scheduledWeek.week,
        season: scheduledWeek.season,
        date: scheduledWeek.date,
        status: 'played',
        format: scheduledWeek.format ?? undefined,
        teamA: scheduledWeek.teamA,
        teamB: scheduledWeek.teamB,
        winner,
        goal_difference: winner === 'draw' ? 0 : goalDifference,
        team_a_rating: teamAScore,
        team_b_rating: teamBScore,
      }
      const weeksWithResult = [...weeks, syntheticWeek]

      const { shareText, highlightsText } = buildResultShareText({
        leagueName,
        leagueSlug,
        week: scheduledWeek.week,
        date: scheduledWeek.date,
        format: scheduledWeek.format ?? '',
        teamA: scheduledWeek.teamA,
        teamB: scheduledWeek.teamB,
        winner,
        goalDifference: winner === 'draw' ? 0 : goalDifference,
        teamARating: teamAScore,
        teamBRating: teamBScore,
        players: allPlayers,
        weeks: weeksWithResult,
      })

      if (publicMode) {
        const res = await fetch(`/api/public/league/${gameId}/result`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            weekId: scheduledWeek.id,
            winner,
            notes: notes.trim() || null,
            goalDifference: winner === 'draw' ? 0 : goalDifference,
            teamARating: teamAScore,
            teamBRating: teamBScore,
          }),
        })
        if (!res.ok) {
          const d = await res.json()
          throw new Error(d.error ?? 'Failed to save result')
        }
      } else {
        const supabase = createClient()

        const { error: resultErr } = await supabase.rpc('record_result', {
          p_week_id: scheduledWeek.id,
          p_winner: winner,
          p_notes: notes.trim() || null,
          p_goal_difference: winner === 'draw' ? 0 : goalDifference,
          p_team_a_rating: teamAScore,
          p_team_b_rating: teamBScore,
        })
        if (resultErr) throw resultErr

        const entries = [
          ...newPlayerStates.map((p) => ({
            name: p.name,
            rating: p.rating,
            mentality: p.mentality,
            goalkeeper: p.mentality === 'goalkeeper',
          })),
          ...guestStates
            .filter((g) => g.addToRoster && g.rosterName.trim())
            .map((g) => ({ name: g.rosterName.trim(), rating: g.rating, goalkeeper: g.goalkeeper })),
        ]
        if (entries.length > 0) {
          const { error: promoteErr } = await supabase.rpc('promote_roster', {
            p_game_id: gameId,
            p_entries: entries,
          })
          if (promoteErr) throw promoteErr
        }
      }

      onSaved({ winner, goalDifference, shareText, highlightsText })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save result')
    } finally {
      setSaving(false)
    }
  }

  const currentStepNum = step === 'winner' ? 1 : step === 'review' ? 2 : 3

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 z-[999]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] w-full max-w-sm rounded-xl bg-slate-800 border border-slate-700 shadow-xl focus:outline-none overflow-hidden">

          {/* Header */}
          <div className="px-5 pt-4 pb-3 border-b border-slate-700">
            <Dialog.Title className="text-base font-semibold text-slate-100">
              Result — Week {scheduledWeek.week}
            </Dialog.Title>
            <Dialog.Description className="text-xs text-slate-400 mt-0.5">
              {scheduledWeek.date}
            </Dialog.Description>
          </div>

          {hasReviewStep && <StepIndicator current={currentStepNum} total={totalSteps} />}

          {/* ── Step: winner ── */}
          {step === 'winner' && (
            <>
              <div className="p-5">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Who won?</p>
                <div className="flex gap-2 mb-4">
                  {(['teamA', 'draw', 'teamB'] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        setWinner(opt)
                        if (opt !== 'draw') setGoalDifference(1)
                      }}
                      className={cn(
                        'flex-1 py-2 rounded border text-sm font-medium transition-colors',
                        opt === 'teamA' && (winner === 'teamA'
                          ? 'bg-blue-900 border-blue-700 text-blue-300'
                          : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-blue-700 hover:text-blue-300'),
                        opt === 'draw' && (winner === 'draw'
                          ? 'bg-slate-700 border-slate-600 text-slate-300'
                          : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300'),
                        opt === 'teamB' && (winner === 'teamB'
                          ? 'bg-violet-900 border-violet-700 text-violet-300'
                          : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-violet-700 hover:text-violet-300'),
                      )}
                    >
                      {opt === 'teamA' ? 'Team A' : opt === 'draw' ? 'Draw' : 'Team B'}
                    </button>
                  ))}
                </div>

                {winner && winner !== 'draw' && (
                  <div className="flex items-center justify-between bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 mb-4">
                    <div>
                      <p className="text-xs font-semibold text-slate-100">Margin of Victory</p>
                      <p className="text-[10px] text-slate-500 mt-px">
                        Goals {winner === 'teamA' ? 'Team A' : 'Team B'} won by
                      </p>
                    </div>
                    <Stepper value={goalDifference} onChange={setGoalDifference} />
                  </div>
                )}

                <textarea
                  name="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Optional notes (e.g. +3 goals, injuries…)"
                  className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100 text-xs placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-slate-500 resize-none"
                />
                {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
              </div>

              <div className="flex gap-2 justify-end px-5 pb-4">
                <button type="button" onClick={onClose} className="px-4 py-2 rounded border border-slate-600 text-slate-300 text-sm hover:border-slate-500">
                  Cancel
                </button>
                {hasReviewStep ? (
                  <button
                    type="button"
                    onClick={() => setStep('review')}
                    disabled={!winner || (winner !== 'draw' && (goalDifference < 1 || goalDifference > 20))}
                    className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-40"
                  >
                    Next →
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !winner || (winner !== 'draw' && (goalDifference < 1 || goalDifference > 20))}
                    className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Confirm Result'}
                  </button>
                )}
              </div>
            </>
          )}

          {/* ── Step: review ── */}
          {step === 'review' && (
            <>
              <div className="p-5 flex flex-col gap-4 max-h-[60vh] overflow-y-auto">
                <p className="text-xs text-slate-400 -mb-2">How did they actually play?</p>

                {newPlayerStates.map((p, i) => (
                  <div key={p.name} className="bg-slate-900 border border-slate-700 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-sm font-semibold text-slate-100">{p.name}</span>
                      <span className="text-[10px] font-semibold bg-blue-950 border border-blue-800 text-blue-300 rounded-full px-2 py-0.5">New player</span>
                    </div>
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">The Eye Test</p>
                    <EyeTestSlider value={p.rating} onChange={(v) => updateNewPlayerRating(i, v)} />

                    <div className="mt-3 pt-3 border-t border-slate-800">
                      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Mentality</p>
                      <div className="flex bg-slate-900 border border-slate-700 rounded-md overflow-hidden text-[10px] font-semibold">
                        {(
                          [
                            { value: 'goalkeeper', label: 'GK' },
                            { value: 'defensive',  label: 'DEF' },
                            { value: 'balanced',   label: 'BAL' },
                            { value: 'attacking',  label: 'ATT' },
                          ] as { value: Mentality; label: string }[]
                        ).map(({ value, label }, idx) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => { if (value !== p.mentality) updateNewPlayerMentality(i, value) }}
                            className={cn(
                              'flex-1 py-1.5 transition-colors',
                              idx < 3 && 'border-r',
                              value === p.mentality
                                ? 'bg-blue-950 text-blue-300 border-blue-800'
                                : 'text-slate-500 border-slate-700 hover:text-slate-300'
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}

                {guestStates.map((g, i) => (
                  <div key={g.name} className="bg-slate-900 border border-slate-700 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-sm font-semibold text-slate-100">{g.name}</span>
                      <span className="text-[10px] font-semibold bg-slate-800 border border-slate-600 text-slate-400 rounded-full px-2 py-0.5">Guest</span>
                    </div>
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">The Eye Test</p>
                    <EyeTestSlider value={g.rating} onChange={(v) => updateGuestRating(i, v)} />

                    <div className="mt-3 pt-3 border-t border-slate-800">
                      {/* Goalkeeper toggle */}
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div>
                          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Dedicated goalkeeper</p>
                          <p className="text-[11px] text-slate-400 leading-relaxed mt-px">Plays in goal all game, every game.</p>
                        </div>
                        <Toggle enabled={g.goalkeeper} onChange={(v) => updateGuestGoalkeeper(i, v)} />
                      </div>

                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <div
                          onClick={() => updateGuestRoster(i, !g.addToRoster)}
                          className={cn(
                            'w-8 rounded-full relative transition-colors cursor-pointer flex-shrink-0',
                            g.addToRoster ? 'bg-blue-600' : 'bg-slate-600'
                          )}
                          style={{ height: '18px' }}
                        >
                          <div className={cn(
                            'absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full shadow transition-all',
                            g.addToRoster ? 'left-[18px]' : 'left-0.5'
                          )} />
                        </div>
                        <span className="text-xs text-slate-300">
                          <span className="font-semibold">Add to the roster</span> — they&apos;re joining the league
                        </span>
                      </label>
                      {g.addToRoster && (
                        <div className="mt-2">
                          <input
                            type="text"
                            name="roster-name"
                            value={g.rosterName}
                            onChange={(e) => updateGuestRosterName(i, e.target.value)}
                            placeholder="Enter their name…"
                            autoFocus
                            className="w-full bg-slate-800 border border-blue-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          {g.nameError && <p className="text-xs text-red-400 mt-1">{g.nameError}</p>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 justify-end px-5 pb-4 border-t border-slate-700 pt-3">
                <button type="button" onClick={() => setStep('winner')} className="px-4 py-2 rounded border border-slate-600 text-slate-300 text-sm hover:border-slate-500">
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => { if (validateReview()) setStep('confirm') }}
                  className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold"
                >
                  Next →
                </button>
              </div>
            </>
          )}

          {/* ── Step: confirm ── */}
          {step === 'confirm' && (
            <>
              <div className="p-5 flex flex-col gap-2">
                <div className="flex justify-between items-center bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm">
                  <span className="text-slate-400">Winner</span>
                  <span className={cn(
                    'font-semibold',
                    winner === 'teamA' ? 'text-blue-300' : winner === 'teamB' ? 'text-violet-300' : 'text-slate-300'
                  )}>
                    {winner === 'teamA' ? 'Team A' : winner === 'teamB' ? 'Team B' : 'Draw'}
                  </span>
                </div>

                {winner && winner !== 'draw' && (
                  <div className="flex justify-between items-center bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm">
                    <span className="text-slate-400">Margin</span>
                    <span className="font-semibold text-slate-300">+{goalDifference} goals</span>
                  </div>
                )}

                {newPlayerStates.map((p) => (
                  <div key={p.name} className="flex justify-between items-center bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm">
                    <span className="text-slate-300 font-medium">{p.name}</span>
                    <span className="text-slate-500 text-xs">Added to roster · rating {p.rating}</span>
                  </div>
                ))}

                {guestStates.map((g) => (
                  <div key={g.name} className="flex justify-between items-center bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm">
                    <span className="text-slate-300 font-medium">
                      {g.addToRoster ? `${g.name} → ${g.rosterName.trim()}` : g.name}
                    </span>
                    <span className="text-slate-500 text-xs">
                      {g.addToRoster ? `Added to roster · rating ${g.rating}` : 'Guest only'}
                    </span>
                  </div>
                ))}

                {error && <p className="text-sm text-red-400 mt-1">{error}</p>}
              </div>

              <div className="flex gap-2 justify-end px-5 pb-4 border-t border-slate-700 pt-3">
                <button type="button" onClick={() => setStep('review')} className="px-4 py-2 rounded border border-slate-600 text-slate-300 text-sm hover:border-slate-500">
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 rounded bg-green-700 hover:bg-green-600 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save result'}
                </button>
              </div>
            </>
          )}

        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
