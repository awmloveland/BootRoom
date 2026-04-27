# DNF share button + ratings preservation — design

**Date:** 2026-04-27
**Status:** Approved
**Supersedes (partially):** `2026-04-27-dnf-result-type-design.md` line 110 ("No share button")
**Amends:** `supabase/migrations/20260427000001_dnf_status.sql` — `record_result` and `edit_week` should preserve `team_a_rating` / `team_b_rating` for DNF, not null them.

## Problem

Two related issues with the DNF (Did Not Finish) result type as shipped:

1. **No share button** — admins have no in-app way to communicate a DNF to the league chat.
2. **Team ratings wiped on DNF** — both `record_result` (`p_dnf=true`) and `edit_week` (`p_status='dnf'`) explicitly set `team_a_rating` and `team_b_rating` to NULL. The `DnfCard` component already passes these values to `TeamList`, so the UI is ready to render them; the data just isn't there. This is inconsistent with the same functions' decision to preserve `team_a` / `team_b` lineups for DNF — clearly the original intent was to keep the lineup-time state intact.

## Decision

- Add a Share button to the DNF card, mirroring the existing share affordance on the most recent played card.
- Add a new migration that updates `record_result` and `edit_week` to preserve `team_a_rating` / `team_b_rating` for DNF (alongside the lineups, which are already preserved).

Already-recorded DNF rows have NULL ratings and cannot be recovered. They display without ratings until manually edited; share text falls back to omitting the rating segment for those rows.

## Share text

Follows the existing lineup-share format (`buildShareText` in `lib/utils.ts`) with a DNF headline replacing the prediction line, and team ratings included on each team header to match lineup-share style:

```
⚽ {leagueName} — Week {N}
📅 {ShortDate} · {format}

⚠️ Game called off — DNF

🔵 Team A (3.4)
{name1}, {name2}, …

🟣 Team B (3.2)
{name1}, {name2}, …

{optional: notes block, only if week.notes is non-empty after trimming}

🔗 https://craft-football.com/{slug}
```

- `ShortDate` follows existing convention: `Mon 27 Apr` (day-of-week + DD MMM).
- `· {format}` is appended only when `week.format` is set.
- A blank line sits between the date/format line and the DNF headline (visually separates header from result).
- Team ratings (e.g. `(3.4)`) appear on the team header line when the rating is a finite number, matching `buildShareText` formatting (`.toFixed(1)`). When a rating is null (legacy DNF rows recorded before the migration fix), the parenthetical is omitted entirely — `🔵 Team A`.
- The notes block, when present, sits as its own paragraph — no emoji prefix, just the trimmed notes string.
- Win-probability copy from `buildShareText` is intentionally omitted — DNFs have no result to predict against.

## Code shape

**Migration: `supabase/migrations/20260427000002_dnf_preserve_ratings.sql`** (sorts immediately after the existing `20260427000001_dnf_status.sql`)

`CREATE OR REPLACE` for both `record_result` and `edit_week` with the same bodies as the previous migration but with the `team_a_rating` / `team_b_rating` columns left untouched (or `COALESCE`'d to existing) for the DNF branches:

- `record_result` (p_dnf=true branch): drop the `team_a_rating = NULL, team_b_rating = NULL` lines so existing values are preserved.
- `edit_week` (p_status='dnf' branch): same — drop the rating-null lines.

Other branches (played, cancelled, unrecorded) are unchanged.

The grant statements are not re-emitted (signatures unchanged).

**New function: `buildDnfShareText(params)` in `lib/utils.ts`**

Mirrors `buildShareText`. Takes ratings as nullable so legacy DNF rows render cleanly.

Signature:
```ts
buildDnfShareText(params: {
  leagueName: string
  leagueSlug: string
  week: number
  date: string                  // 'DD MMM YYYY'
  format: string                // '' when absent — function omits the "· {format}" segment
  teamA: string[]
  teamB: string[]
  teamARating: number | null    // null/undefined → no parenthetical
  teamBRating: number | null
  notes: string                 // '' when absent — function omits the notes paragraph
}): string
```

Returns the assembled share text (one string, `\n`-joined).

**Component changes (`components/MatchCard.tsx`)**

`DnfCard` gains optional props `leagueName?: string` and `leagueSlug?: string`.

When both are present, the bottom action row renders a Share button alongside the existing admin Edit Result button. The bottom row is shown if any of (a) admin, (b) share-eligible (i.e. both `leagueName` and `leagueSlug` are set) is true.

The Share button uses the same handler shape as `PlayedCard.handleShare`:
1. Build the share text via `buildDnfShareText`, passing `week.team_a_rating`/`week.team_b_rating` through.
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

1. Full data — leagueName, slug, week, date, format, teamA, teamB, ratings, notes → produces the canonical multi-line string with the notes paragraph and rating parentheticals.
2. Null ratings (`teamARating: null, teamBRating: null`) → team headers render without parentheticals; rest of message intact.
3. No notes (`notes: ''`) → notes paragraph omitted, no extra blank lines around the omission.
4. No format (`format: ''`) → date line omits the `· {format}` segment cleanly.
5. ShortDate formatting — `'27 Apr 2026'` → `'Mon 27 Apr'` line in output.
6. Blank line between date/format line and DNF headline is present.

No new component tests — the click handler mirrors an existing tested handler (`PlayedCard.handleShare`) and adds no new branching.

No new SQL/RPC tests — the migration is a CREATE OR REPLACE on existing functions; existing record_result / edit_week behaviour for played, cancelled, unrecorded remains identical.

## What does not change

- `DnfCard` collapsed-state visuals (week label + DNF badge).
- DNF route through `MatchCard` (`status === 'dnf'` → `DnfCard`).
- The DNF spec sections on badge styling, edit modal UI, or recording flow.
- Server-side data — DNF rows are already fetched by `getWeeks` (after the `lib/fetchers.ts` fix shipped earlier today).
- `record_result` / `edit_week` behaviour for played, cancelled, or unrecorded statuses.
