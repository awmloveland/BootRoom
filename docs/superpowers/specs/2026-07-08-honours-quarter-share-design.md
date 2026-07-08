# Honours Quarter Share — Design

**Date:** 2026-07-08
**Status:** Approved

## Summary

Add a Share button to completed quarter cards on the Honours tab. It shares a
fun, emoji-led plain-text summary of the quarter — headline data, the quarter
awards, and the top-10 standings — using the same share mechanics as match
cards (native share sheet on small screens, clipboard copy on desktop).

## Behaviour

- The button appears **only on completed quarter cards** (`status ===
  'completed'` in `QuarterSummary`). This already encodes "the quarter has
  ended": the calendar quarter is over, every week is settled, and at least
  one week was played. In-progress and upcoming cards get no button.
- The Honours tab is already members-only (public visitors see
  `HonoursLoginPrompt`), so no additional auth gating is needed.
- Placement: a **full-width button** in its own footer row at the bottom of
  the expanded card body, below the standings table, separated by a
  `border-t border-slate-700`. Styling matches the match-card share button
  (`rounded-md bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold`)
  plus `w-full`.
- Label: **"Share the glory"**. After a successful desktop copy it reads
  **"Copied — go and brag 📣"** for 2 seconds, then reverts.
- Share mechanics are identical to `MatchCard.handleShare`:
  - `navigator.share({ text })` when `navigator.share` exists and
    `window.innerWidth < 768`
  - otherwise `navigator.clipboard.writeText(text)` + copied state
  - share-sheet cancellation/failure falls back to clipboard where possible,
    and all errors are swallowed silently (same as today).
- Clicks must not toggle the card's collapse state (the button lives inside
  `Collapsible.Content`, outside the trigger, so this is free — but the
  behaviour is a requirement).

## Message template

```
🏁 That's a wrap on Q2 2026!
⚽ The Boot Room — Spring quarter
📅 05 Apr – 28 Jun · 12 games

👑 Your Spring champion: Dave 🎉

🎖️ Quarter honours
⚽ Iron Man — Steve (14 games)
🏆 Win Machine — Dave (9 wins)
⚡ Sharp Shooter — Ali (2.4 PPG)
🎯 Clutch — Ali (71% win rate)
🛡️ Untouchable — Sam (5 games, 0 losses)
🔥 On Fire — Dave (6-game streak)

📊 Final standings
1. Dave — 32pts (P14 W10 D2 L2)
2. Ali — 29pts (P12 W9 D2 L1)
3. Steve — 24pts (P14 W7 D3 L4)
...

🔗 https://craft-football.com/the-boot-room
```

Rules:

- **Header block** (3 lines): `🏁 That's a wrap on Q{q} {year}!`, then
  `⚽ {leagueName} — {seasonName} quarter`, then
  `📅 {from} – {to} · {n} games`.
  - Date range comes from `QuarterSummary.dateRange`, reformatted without the
    year (e.g. `05 Apr – 28 Jun`) since the year is in the headline.
  - `{n} games` is the count of **played** weeks in the quarter; singular
    "1 game" when n = 1.
- **Champion headline**: `👑 Your {seasonName} champion: {name} 🎉` — sourced
  from the `champion` award / `entries[0]`.
- **🎖️ Quarter honours block**: one line per award in `QuarterSummary.awards`
  in their existing order, formatted `{icon} {nickname} — {player} ({stat})`.
  The **Champion award is excluded** (it is the headline). If no other awards
  exist, the whole block (header included) is omitted.
- **📊 Final standings block**: header `📊 Final standings`, then the top 10
  of `QuarterSummary.entries` (already sorted), one line each:
  `{rank}. {name} — {points}pts (P{played} W{won} D{drew} L{lost})`.
  Fewer than 10 entries → list them all; more than 10 → cut cleanly at 10
  with no overflow line.
- **Footer**: blank line then `🔗 https://craft-football.com/{leagueSlug}`.
- Blocks are separated by single blank lines, matching
  `buildResultShareText` output style.

## Architecture

- **`buildQuarterShareText(params)` in `lib/utils.ts`**, alongside
  `buildResultShareText`. Pure function:
  `{ leagueName: string; leagueSlug: string; quarter: QuarterSummary } → string`.
- **`QuarterSummary.gamesPlayed?: number`** added in `lib/sidebar-stats.ts`,
  populated for completed quarters in `computeAllQuarters` (count of
  `status === 'played'` weeks in the quarter).
- **`HonoursSection` gains `leagueName: string` and `leagueSlug: string`
  props**, supplied by `app/[slug]/honours/page.tsx` (`game.name` and `slug`,
  both already in scope). Threaded down to `CompletedCardBody`, which renders
  the footer row, owns the `copied` state, and calls the share helper.
- **Shared helper (targeted cleanup)**: extract the share-or-copy logic that
  is currently duplicated in `MatchCard.tsx` (two near-identical `handleShare`
  implementations at ~lines 215 and 510) into
  `shareOrCopy(text: string): Promise<'shared' | 'copied' | 'failed'>` in
  `lib/utils.ts`. The new quarter button and both MatchCard call sites use it.
  Behaviour is unchanged: `'copied'` drives the 2-second copied label.

## Feature flag

Ships **unflagged**, as an enhancement to the existing members-only Honours
surface — consistent with the match-card share button, which is also
unflagged. It exposes no data the viewer cannot already see on the card.
(If this is later revisited, the standard path is a `quarter_share`
`FeatureKey` + `DEFAULT_FEATURES` entry + `FeaturePanel` wiring + seed
migration.)

## Testing

Unit tests in `lib/__tests__` following the existing share-text test style
(`utils.winCopy.test.ts` et al.) for `buildQuarterShareText`:

- Full-data case matches the template above exactly (snapshot-style
  assertion).
- Champion award excluded from the 🎖️ block; champion headline present.
- Awards block omitted entirely when only the Champion award exists.
- Standings capped at 10; fewer than 10 renders all.
- Singular "1 game" in the header.
- Link uses the provided slug.

`shareOrCopy` extraction is covered by existing MatchCard behaviour remaining
green (manual check: match-card share still works on desktop and mobile).

## Out of scope

- No share button on in-progress or upcoming quarters.
- No image/OG-card share — plain text only, like match share.
- No feature flag (see above).
- No changes to the awards computation or standings maths.
