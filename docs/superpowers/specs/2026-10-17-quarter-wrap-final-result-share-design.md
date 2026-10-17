# Quarter wrap with the final result: design

**Date:** 2026-10-17
**Status:** Approved

## Problem

When an admin records the game that completes a quarter, `ResultModal` routes
to the `celebrate` step instead of the `share` step. The celebrate step only
shares the quarter wrap (champion, honours, final standings). The final game's
result, with its record breaks and highlights, can't be shared from the modal
at all; the admin has to find the match card on Results later and post a second
message.

## Decision

On the clinching game, share **one combined message**: the quarter wrap with
the final game folded in, using the signed **quarter** link (so it gets the
same preview image as the Honours quarter share).

Only quarters with a champion (`MIN_QUARTER_GAMES` = 5 or more played) clinch;
shorter quarters already fall through to the normal result share. No change
there.

## Message

```
🏁 That's a wrap on Q3 2026!
⚽ The Boot Room — Summer quarter
📅 03 Jul – 25 Sep · 12 games

🏆 Final game: Team A win! (+2 goals)
🔵 Dave, Ali, Steve, Sam, Tom, Ben
📈 Ali breaks the record for most wins (41)
🎖️ Steve played their 50th game tonight

👑 Your Summer champion: Dave 🎉

🎖️ Quarter honours
⚽ Iron Man — Steve (12 games)
...

📊 Final standings
1. Dave — 32pts (P12 W10 D2 L0)
...

🔗 <signed quarter link>
```

- The existing quarter text is unchanged; the **Final game block** is inserted
  after the three header lines, separated by blank lines.
- The block has no blank lines inside it:
  - Win: `🏆 Final game: Team {A|B} win! (+N goal[s])`, then `🔵`/`🟣` and the
    winners' names.
  - Draw: `🤝 Final game: Draw!`, no team line.
  - DNF: `⚠️ Final game: called off (DNF)`, no team line, no highlights.
  - Then the highlight lines: `findRecordBreaks` lines first, then the
    `computeResultHighlights` items (win streaks, ended unbeaten runs, upset,
    milestone games). The result message's quarter table and "In form" line
    are left out: the final standings and honours cover them.
- No week number, date or format: the date range ends on the final game.

## Modal

The celebrate step gains a **Final game** block above the champion hero:
label, headline, winners' names (Team A/B accent), highlight lines. Below it,
the champion hero and honours reel as today. The single **Share the glory**
button shares the combined message; Done closes.

## DNF final game

Today the DNF save path goes straight to `share` and never checks whether the
quarter completed, so a quarter ending on a called-off game gets no
celebration. The DNF path now goes through `routeAfterSave` with the DNF week
in the "after" weeks. A DNF week counts as settled, so the quarter completes.

## Unchanged

- The Results tab champion card and the Honours share keep the quarter-only
  text (no `finalGame`).
- Match-card re-shares keep the result-only text.
- The non-clinching result share step.

## Code

- **`lib/utils.ts`**
  - `FinalGameShare` type: `{ result: 'teamA' | 'teamB' | 'draw' | 'dnf';
    goalDifference: number; teamA: string[]; teamB: string[]; highlights:
    string[] }`.
  - `buildFinalGameLines(finalGame): string[]`, pure.
  - `buildResultShareText` also returns `highlightLines` (record lines plus
    highlight item lines) so the modal reuses them.
  - `buildQuarterShareText` takes an optional `finalGame` and inserts the block.
- **`components/QuarterCelebration.tsx`**: optional `finalGame` prop; renders the
  block and passes it to the share text.
- **`components/ResultModal.tsx`**: stores the final game when saving; DNF goes
  through `routeAfterSave`; the signed result link is only fetched when routing
  to `share`; passes `finalGame` to `QuarterCelebration`.

No feature flag: this only changes the share moment and its text.

## Tests

- `lib/__tests__/utils.quarterShare.test.ts`: unchanged output without
  `finalGame`; Team A win, Team B win, draw, DNF, no highlights.
- `lib/__tests__/sidebar-stats.quarters.test.ts`: `findNewlyCompletedQuarter`
  returns the quarter when the last week is recorded as a DNF.
