# Result Share — Design Spec

**Date:** 2026-04-10
**Branch:** awmloveland/result-share-stats

---

## Overview

After a result is saved, any league member can share the game outcome with their group via a single tap. The share delivers a rich narrative — result, teams, player streaks, upsets, milestones, and current standings — as formatted text in any messaging app. A share button also lives permanently on every played `MatchCard` for retrospective sharing.

---

## Scope

- Two share entry points: immediate post-save success panel, and persistent share button on played `MatchCard`
- Highlights (streaks, milestones, table, in-form) computed at result-save time and stored in the existing `notes` field
- Retrospective sharing shows result + teams + upset flag + stored notes/highlights
- No new DB columns; no new API routes; no image generation

---

## Share Entry Points

### A — Immediate: `ResultSuccessPanel`

After a result is saved, `NextMatchCard` closes the `ResultModal` and renders a `ResultSuccessPanel` dialog. It shows:

- Result headline (winner + goal margin)
- Both team lineups
- Computed highlights block
- Q2 standings (top 5)
- In-form callout
- Share button + Done button

Dismissing the panel calls `onResultSaved()` which triggers `router.refresh()`.

### B — Retrospective: `MatchCard` share button

Every played `MatchCard` has a share button in its expanded footer. It builds a simpler share text from the week's stored data (no live stat recomputation). Two new props thread down from page → `WeekList` → `MatchCard`: `leagueName?: string` and `gameId?: string`. The button only renders when both are present.

---

## Data Storage

No new columns. At result-save time, highlights are computed and appended to the `notes` field before writing to the DB:

```
[user-typed notes]\n\n[computed highlights]
```

If the user typed no notes, only the highlights are stored (no leading newline). The `MatchCard` notes display renders the full string — the user notes and highlights are separated by a visual divider in the UI.

Pre-existing weeks with no highlights are unaffected.

---

## Share Text Formats

### Immediate (full narrative)

```
⚽ {leagueName} — Week {n}
📅 {day} {date} · {format}

🏆 {winner}! (+{n} goals)

🔵 Team A
{player1}, {player2}, ...

🟣 Team B
{player1}, {player2}, ...

🔥 {player} on a {n}-game winning streak
💔 {player}'s {n}-game unbeaten run is over
😱 Upset! Team B were stronger on paper ({rating} vs {rating})
🎖️ {player} played their {n}th game tonight

📊 {quarterLabel} standings
1. {player} — {n}pts
2. {player} — {n}pts
3. {player} — {n}pts
4. {player} — {n}pts
5. {player} — {n}pts

⚡ In form: {player} ({ppg} PPG)

🔗 https://craft-football.com/{leagueId}
```

Highlight lines are omitted entirely when their condition isn't met. Sections with no content (e.g. no streaks, no milestones) are skipped — no empty headers.

Draw result: `🤝 Draw!` with no goal margin line.

### Retrospective (from MatchCard)

```
⚽ {leagueName} — Week {n}
📅 {day} {date} · {format}

🏆 {winner}! (+{n} goals)

🔵 Team A
{player1}, {player2}, ...

🟣 Team B
{player1}, {player2}, ...

😱 Upset! Team B were stronger on paper ({rating} vs {rating})

{week.notes}    ← contains user notes + baked-in highlights from save time

🔗 https://craft-football.com/{leagueId}
```

Upset flag is recomputed live from `week.team_a_rating` and `week.team_b_rating`. Notes block is omitted if `week.notes` is null or empty.

---

## New Utility: `buildResultShareText()`

Added to `lib/utils.ts`. Pure function, no side effects. Returns two strings.

```ts
export function buildResultShareText(params: {
  leagueName: string
  leagueId: string
  week: number
  date: string           // 'DD MMM YYYY'
  format: string
  teamA: string[]
  teamB: string[]
  winner: Winner
  goalDifference: number
  teamARating: number
  teamBRating: number
  players: Player[]      // full roster with recentForm — used for streaks, milestones, in-form
  weeks: Week[]          // full history including the week just played (synthetic Week appended by caller) — used for table
}): { shareText: string; highlightsText: string }
```

`shareText` — full message for sharing via `navigator.share` / clipboard.
`highlightsText` — highlights block only, for appending to `notes` before DB write.

---

## Highlight Computation Rules

### Win streak (≥3 games)

For each player on the winning team, walk the `weeks` array (sorted most-recent first) counting consecutive games that player won. If total ≥ 3, emit the line. Using the full `weeks` array (rather than the 5-character `recentForm` string) allows accurate detection of streaks longer than 5 games.

Example: player on winning team, last 3 weeks all wins (including tonight) → streak = 3. Emit.

### Unbeaten streak broken (≥5 games)

For each player on the losing team (non-draw), walk the `weeks` array **excluding tonight's game** (i.e. `weeks.slice(0, -1)`, since the synthetic week for tonight is always appended last by the caller). Count consecutive games that player did not lose. If that count ≥ 5, the run has just ended. Emit.

Example: player on losing team, last 5 prior weeks all non-losses → unbeaten run of 5 broken. Emit.

### Upset

If `winner === 'teamA'` and `teamBRating > teamARating`, or `winner === 'teamB'` and `teamARating > teamBRating`: emit upset line. No upset line on a draw. Ratings equal → no upset line.

### Milestones

For each player in tonight's lineup, compute `newPlayed = player.played + 1`. Emit if `newPlayed` is in the milestone set: `{10, 25, 50, 100, 150, 200, 250, …}` (50 and every 50 thereafter).

### Quarter table top 5

Always emitted. Computed via `computeQuarterlyTable(weeks)` — uses the updated `weeks` array (including tonight's result) so the table reflects the new standings.

### In-form

Computed via `computeInForm(players, weeks)`. Filtered to players who played tonight. Show top result only if PPG ≥ 1.5 (i.e. averaging better than a draw). If no qualifying player from tonight's game, omit section.

---

## Component Changes

### `ResultModal`

Two new props: `weeks: Week[]` and `leagueName: string`.

On save success:
1. Construct a synthetic `Week` object from the just-saved result (`scheduledWeek` + `winner` + `goalDifference`) and append it to `weeks` to get `weeksWithResult`
2. Call `buildResultShareText({ ..., weeks: weeksWithResult, players: allPlayers, leagueName, leagueId: gameId })` to get `{ shareText, highlightsText }`
3. Combine notes: `notes.trim() ? notes.trim() + '\n\n' + highlightsText : highlightsText`; write to DB
4. Call `onSaved({ winner, goalDifference, shareText, highlightsText })`

`onSaved` signature: `onSaved(result: { winner: Winner; goalDifference: number; shareText: string; highlightsText: string })`

**Why weeks in ResultModal:** ResultModal has all the inputs needed to call `buildResultShareText()` in one place and passes the results upward. `NextMatchCard` does not need to call `buildResultShareText()` a second time — it receives the pre-computed `shareText` via `onSaved`.

**Synthetic Week construction:**
```ts
const syntheticWeek: Week = {
  week: scheduledWeek.week,
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
```

### `NextMatchCard`

- New state: `savedResult: { winner: Winner; goalDifference: number; shareText: string } | null`
- `onSaved` handler: receives `{ winner, goalDifference, shareText }` from `ResultModal`; sets `savedResult`; closes `ResultModal`
- Renders `<ResultSuccessPanel>` when `savedResult !== null`
- `ResultSuccessPanel` `onDismiss`: clears `savedResult`, calls `onResultSaved()` → triggers `router.refresh()`

### `ResultSuccessPanel` (new component)

Props:
```ts
interface Props {
  week: number
  date: string
  winner: Winner
  goalDifference: number
  teamA: string[]
  teamB: string[]
  highlightsText: string    // pre-formatted highlights block
  shareText: string
  onDismiss: () => void
}
```

- Radix `Dialog.Root` pattern, same as `ResultModal`
- Parses `highlights` string into individual lines for display
- Share button: same `navigator.share` / clipboard fallback as lineup share; "Result copied!" toast on desktop (2s)
- "Done" button calls `onDismiss`

### `MatchCard`

Two new optional props: `leagueName?: string`, `gameId?: string`

Share button added to expanded card footer (right side, alongside goal margin display). Rendered only when `week.status === 'played'` and both `leagueName` and `gameId` are present.

Builds retrospective share text inline (no utility function needed — simple enough to inline or extract to a small `buildRetroShareText()` helper).

### `WeekList`

Threads `leagueName?: string` and `gameId?: string` down to `MatchCard`.

### `ResultsRefresher`

Threads `leagueName` prop down (already passes `gameId`).

---

## Share Mechanism

Identical to the lineup share pattern established in `NextMatchCard`:

```ts
if (navigator.share && window.innerWidth < 768) {
  await navigator.share({ text })
} else {
  await navigator.clipboard.writeText(text)
  // show "Result copied!" toast for 2s
}
```

---

## Files Affected

| File | Change |
|---|---|
| `lib/utils.ts` | Add `buildResultShareText()` |
| `lib/__tests__/utils.winCopy.test.ts` | Add tests for `buildResultShareText()` |
| `components/ResultModal.tsx` | Add `weeks`, `leagueName` props; compute + store highlights on save; update `onSaved` signature |
| `components/NextMatchCard.tsx` | Add `savedResult` state; handle updated `onSaved`; render `ResultSuccessPanel` |
| `components/ResultSuccessPanel.tsx` | New component |
| `components/MatchCard.tsx` | Add `leagueName?`, `gameId?` props; share button in expanded footer |
| `components/WeekList.tsx` | Thread `leagueName`, `gameId` down to `MatchCard` |
| `components/ResultsRefresher.tsx` | Thread `leagueName` prop |

---

## Testing

`buildResultShareText()` unit tests cover:

- Win streak exactly at threshold (2 games → no line, 3 games → line)
- Unbeaten streak exactly at threshold (4 games → no line, 5 games → line)
- Upset detection: lower-rated team wins → line; equal ratings → no line; draw → no line
- Milestone thresholds: `played = 9` → no badge, `played = 10` → badge, `played = 49` → no badge, `played = 50` → badge, `played = 99` → no badge, `played = 100` → badge
- Notes concatenation: user notes present → `notes + "\n\n" + highlights`; user notes absent → highlights only
- Empty highlights (no streaks, no milestones, no upset, no in-form) → `highlightsText` is empty string; share text omits those sections
- `recentForm` with `-` padding handled correctly

---

## What Is Not In Scope

- Image or graphic generation
- Team A vs B all-time head-to-head record in share text
- Historical stat reconstruction for retrospective shares (streaks/table as of that date)
- Share button on cancelled or unrecorded weeks
- Per-player rating display in share text
- Shareable permalink for a specific result
