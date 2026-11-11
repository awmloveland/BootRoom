'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { parseWeekDate } from '@/lib/dates'
import { ResultChip } from '@/components/WinnerBadge'
import { PRIMARY_BUTTON, SECONDARY_LINK, StepEyebrow, StepShell } from './StepShell'
import { ImportGameModal, type DraftGame } from './ImportGameModal'
import { lineupConfidence, nextDraftDate, sidesFormat } from './confidence'

interface Props {
  leagueId: string
  slug: string
  roster: string[]
  /** Played weeks already in the league, shown but not re-imported. */
  imported: DraftGame[]
  latestMatchDay: string
  stepOffset: number
}

const TONES = { muted: 'text-[#8ba4c4] bg-[#8ba4c4]/12 border-[#8ba4c4]/40', sky: 'text-[#38bdf8] bg-[#38bdf8]/12 border-[#38bdf8]/40', lime: 'text-[#bef264] bg-[#bef264]/12 border-[#bef264]/40' }
const FILLS = { muted: 'bg-[#8ba4c4]', sky: 'bg-[#38bdf8]', lime: 'bg-[#bef264]' }
const TICKS: [number, string][] = [[0, '0'], [3, '3 · useful'], [6, '6 · good'], [10, '10 · full']]
// Where each tick sits under the ten-segment bar, as a share of its width.
const TICK_POSITION: Record<number, string> = { 0: 'left-0', 3: 'left-[30%] -translate-x-1/2', 6: 'left-[60%] -translate-x-1/2', 10: 'right-0' }

export function ResultsStep({ leagueId, slug, roster: initialRoster, imported, latestMatchDay, stepOffset }: Props) {
  const router = useRouter()
  const [roster, setRoster] = useState(initialRoster)
  const [games, setGames] = useState<DraftGame[]>([])
  const [open, setOpen] = useState<{ draft: DraftGame; editing: boolean } | null>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Everything on the list: what the league already holds plus this visit's drafts.
  const all = [...imported, ...games]
  const sorted = [...all].sort((a, b) => parseWeekDate(b.date).getTime() - parseWeekDate(a.date).getTime())
  const importedIds = new Set(imported.map((g) => g.id))
  const { percent, line, tone } = lineupConfidence(all.length)

  function newDraft() {
    setOpen({
      editing: false,
      draft: { id: crypto.randomUUID(), date: nextDraftDate(all.map((g) => g.date), latestMatchDay), teamA: [], teamB: [], winner: null, goalDifference: 0 },
    })
  }

  function saveDraft(game: DraftGame) {
    setGames((gs) => (gs.some((g) => g.id === game.id) ? gs.map((g) => (g.id === game.id ? game : g)) : [...gs, game]))
    setOpen(null)
  }

  async function importAll() {
    setImporting(true)
    setError(null)
    let res: Response
    try {
      res = await fetch(`/api/league/${leagueId}/weeks/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ games: games.map(({ date, teamA, teamB, winner, goalDifference }) => ({ date, teamA, teamB, winner, goalDifference })) }),
      })
    } catch {
      setError('Could not import the games. Check your connection and try again.')
      setImporting(false)
      return
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(typeof data.error === 'string' ? data.error : 'Could not import the games. Try again.')
      setImporting(false)
      return
    }
    router.refresh()
    router.push(`/new/${slug}/live`)
  }

  const count = all.length
  const pending = games.length
  return (
    <StepShell
      eyebrow={<StepEyebrow n={7} offset={stepOffset} />}
      title="Any past results?"
      sub="Every game you add makes your first lineups fairer. After five games a player's rating stands on results, not your gut call. Four to six games is the sweet spot."
      action={
        <>
          {pending === 0 && imported.length > 0 ? (
            <button type="button" className={PRIMARY_BUTTON} onClick={() => router.push(`/new/${slug}/live`)}>Finish</button>
          ) : (
            <button type="button" className={PRIMARY_BUTTON} disabled={pending === 0 || importing} onClick={importAll}>
              {importing ? 'Importing…' : pending === 0 ? 'Import games and finish' : `Import ${pending} ${pending === 1 ? 'game' : 'games'} and finish`}
            </button>
          )}
          {error && <p role="alert" className="mt-3 text-center font-inter-body text-[13px] text-[#e2686f]">{error}</p>}
        </>
      }
      secondary={<button type="button" className={SECONDARY_LINK} onClick={() => router.push(`/new/${slug}/live`)}>Skip for now</button>}
    >
      <section className="rounded-lg border border-[#1b2c46] bg-[#0a1421] p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-inter-body text-sm font-semibold text-[#f4f9ff]">Lineup confidence</p>
            <p className="mt-0.5 font-inter-body text-[12.5px] text-[#8ba4c4]">{line}</p>
          </div>
          <span className={cn('flex h-11 min-w-16 items-center justify-center rounded-lg border px-2 font-plex text-xl font-bold', TONES[tone])}>{percent}%</span>
        </div>
        <div className="mt-4 grid grid-cols-10 gap-[3px]" aria-hidden>
          {Array.from({ length: 10 }, (_, i) => <span key={i} className={cn('h-2 rounded-sm', i < count ? FILLS[tone] : 'bg-[#1b2c46]')} />)}
        </div>
        <div className="relative mt-1.5 h-3 font-plex text-[9px] font-bold uppercase tracking-[.12em]">
          {TICKS.map(([at, text]) => (
            <span key={at} className={cn('absolute', count >= at ? 'text-[#f4f9ff]' : 'text-[#4f688a]', TICK_POSITION[at])}>
              {text}
            </span>
          ))}
        </div>
      </section>

      {sorted.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {sorted.map((g, i) => (
            <li key={g.id}>
              {/* Imported games are the Results tab's to edit; only this visit's drafts open the modal. */}
              <button
                type="button"
                disabled={importedIds.has(g.id)}
                onClick={() => setOpen({ draft: g, editing: true })}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#1b2c46] bg-[#0a1421] px-[18px] py-3 text-left transition-colors enabled:hover:border-[#2c4a72] disabled:cursor-default"
              >
                <span>
                  <span className="block text-sm font-bold text-[#f4f9ff]">Game {sorted.length - i}</span>
                  <span className="mt-0.5 block font-plex text-[9.5px] uppercase tracking-[.14em] text-[#6f88a8]">
                    {parseInt(g.date, 10)} {g.date.slice(3)} · {sidesFormat(g.teamA.length, g.teamB.length)}{importedIds.has(g.id) && ' · imported'}
                  </span>
                </span>
                <ResultChip winner={g.winner} goalDifference={g.goalDifference} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={newDraft} className="mt-3 flex h-[50px] w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#223a5c] text-sm font-bold text-[#8ba4c4] transition-colors hover:border-[#38bdf8] hover:text-[#f4f9ff]">
        <Plus className="size-4" />
        {count === 0 ? 'Add a game' : 'Add another game'}
      </button>
      <p className="mt-3 text-center font-inter-body text-[12.5px] text-[#6f88a8]">Each new game starts a week before the earliest one on the list.</p>

      {open && (
        <ImportGameModal
          key={open.draft.id}
          leagueId={leagueId}
          number={open.editing ? sorted.length - sorted.findIndex((g) => g.id === open.draft.id) : null}
          draft={open.draft}
          editing={open.editing}
          roster={roster}
          latestMatchDay={latestMatchDay}
          takenDates={all.filter((g) => g.id !== open.draft.id).map((g) => g.date)}
          onRosterAdd={(name) => setRoster((r) => [...r, name].sort())}
          onSave={saveDraft}
          onDelete={() => { setGames((gs) => gs.filter((g) => g.id !== open.draft.id)); setOpen(null) }}
          onClose={() => setOpen(null)}
        />
      )}
    </StepShell>
  )
}
