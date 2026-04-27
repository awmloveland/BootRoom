# DNF share button — design

**Date:** 2026-04-27
**Status:** Approved
**Supersedes (partially):** `2026-04-27-dnf-result-type-design.md` line 110 ("No share button")

## Problem

The DNF (Did Not Finish) result type ships without a share button. After recording a DNF, league admins have no way to communicate the outcome to the wider group from the app — the most natural next step (a quick message to the league chat) requires a manual write-up.

## Decision

Add a Share button to the DNF card, mirroring the existing share affordance on the most recent played card.

## Share text

Follows the existing lineup-share format (`buildShareText` in `lib/utils.ts`) with a DNF headline replacing the prediction line:

```
⚽ {leagueName} — Week {N}
📅 {ShortDate} · {format}
⚠️ Game called off — DNF

🔵 Team A
{name1}, {name2}, …

🟣 Team B
{name1}, {name2}, …

{optional: notes block, only if week.notes is non-empty after trimming}

🔗 https://craft-football.com/{slug}
```

- `ShortDate` follows existing convention: `Mon 27 Apr` (day-of-week + DD MMM).
- `· {format}` is appended only when `week.format` is set.
- The notes block, when present, sits as its own paragraph — no emoji prefix, just the trimmed notes string. (Notes already capture the "why" of the DNF and are written by the admin who recorded it.)
- Win-probability copy from `buildShareText` is intentionally omitted — DNFs have no result to predict against.

## Code shape

**New function: `buildDnfShareText(params)` in `lib/utils.ts`**

Mirrors `buildShareText` but does not take ratings, players, or other weeks (no stats / highlights needed).

Signature:
```ts
buildDnfShareText(params: {
  leagueName: string
  leagueSlug: string
  week: number
  date: string         // 'DD MMM YYYY'
  format: string       // '' when absent — function omits the "· {format}" segment
  teamA: string[]
  teamB: string[]
  notes: string        // '' when absent — function omits the notes paragraph
}): string
```

Returns the assembled share text (one string, `\n`-joined).

**Component changes (`components/MatchCard.tsx`)**

`DnfCard` gains optional props `leagueName?: string` and `leagueSlug?: string`.

When both are present, the bottom action row renders a Share button alongside the existing admin Edit Result button. The bottom row is shown if any of (a) admin, (b) share-eligible (i.e. both `leagueName` and `leagueSlug` are set) is true.

The Share button uses the same handler shape as `PlayedCard.handleShare`:
1. Build the share text.
2. On mobile (`window.innerWidth < 768`) and `navigator.share` available: use the Web Share API; on `AbortError` (user cancel), do nothing; on any other error, fall back to clipboard.
3. Otherwise: write to clipboard, show "Copied!" feedback for 2s.

`MatchCard` (the public wrapper) threads `leagueName` and `leagueSlug` through to `DnfCard` (it already receives them for the played path).

**WeekList plumbing (`components/WeekList.tsx`)**

`mostRecent` currently looks at played weeks only:
```ts
const playedWeeks = getPlayedWeeks(weeks)
const mostRecent = sortWeeks(playedWeeks)[0] ?? null
```

Widen this to include DNF weeks so the most recent finished-or-DNF'd week receives the share props:
```ts
const recentEligible = sortWeeks(weeks.filter((w) => w.status === 'played' || w.status === 'dnf'))
const mostRecent = recentEligible[0] ?? null
```

The existing prop-passing line (`week.week === mostRecent?.week ? leagueName : undefined`) needs no change — it just now resolves true for the most recent DNF week when there is one.

## Visibility

- Share button shown only on the most recent finished-or-DNF'd week, consistent with the played-card share pattern.
- Visible to all visibility tiers (admin, member, public). The share text contains nothing private — it's the same lineup data already publicly visible on the league page.

## Tests

New tests added to `lib/__tests__/utils.winCopy.test.ts` (which already covers `buildShareText`) covering `buildDnfShareText`:

1. Full data — leagueName, slug, week, date, format, teamA, teamB, notes → produces the canonical multi-line string with the notes paragraph.
2. No notes (`notes: ''`) → notes paragraph omitted, no extra blank lines around the omission.
3. No format (`format: ''`) → date line omits the `· {format}` segment cleanly.
4. ShortDate formatting — `'27 Apr 2026'` → `'Mon 27 Apr'` line in output.

No new component tests — the click handler mirrors an existing tested handler (`PlayedCard.handleShare`) and adds no new branching.

## What does not change

- `DnfCard` collapsed-state visuals (week label + DNF badge).
- DNF route through `MatchCard` (`status === 'dnf'` → `DnfCard`).
- The DNF spec sections on RPC behaviour, badge styling, edit modal, or recording flow.
- Server-side data — DNF rows are already fetched by `getWeeks` (after the `lib/fetchers.ts` fix shipped earlier today).
