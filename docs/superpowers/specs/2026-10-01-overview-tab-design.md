# Overview tab (mobile and tablet) — design

**Date:** 2026-10-01

**Design source:** `design_handoff_overview_tab/README.md` and
`Craft Football App Restyle.dc.html` (Overview screen, Mobile viewport). The
handoff README is the visual source of truth: every colour, size, spacing value
and string in it applies as written. This spec covers what the handoff leaves
open, where it disagrees with the app, and how the feature is built.

## Summary

Below `lg` (1024px) the stats sidebar is hidden behind the "Stats" floating
button. This adds an **Overview** tab, visible only below `lg`, that becomes
the landing page for a league on small screens. It stacks five cards: next
game, the viewer's own stats, last result plus the quarterly table, most in
form, and head to head. Large screens keep landing on Results with the sidebar.

## Decisions (settled during brainstorming)

1. **No feature flag.** Overview ships to everyone who can see the league, the
   same as Honours and the stats sidebar. This is a deliberate exception to the
   feature flag standard, agreed on 2026-10-01. No migration, no
   `FeaturePanel` row.
2. **Match actions follow Results.** Build Teams, Cancel Game, Edit Lineups
   and Result Game show to whoever the `match_entry` flag allows for their
   tier (admins always), not to admins only as drawn. Overview and Results
   never disagree about who can act.
3. **League table shows the top 10**, matching the sidebar today (the handoff
   says 8). If the linked viewer is ranked below 10th, their highlighted row is
   appended with its true rank.
4. **Landing rule is decided on the server by user agent**, with a client
   guard as a fallback. See Routing.
5. **The Overview next game card is a variant of `NextMatchCard`**, not a new
   component. See Next game card.

## Review findings: where the handoff and the app differ

| Handoff says | App reality | Resolution |
|---|---|---|
| Action buttons are admin only | Results gates them on `match_entry` per tier | Decision 2 |
| "Show the top 8 as the sidebar does" | Sidebar shows 10 | Decision 3 |
| Buttons "call the same handlers as `NextMatchCard`" | The handlers, the team builder, the cancel dialog and `ResultModal` all live inside one 1,087-line client component | Decision 5 |
| Only "lineups set" and "not built" are drawn | The card also has building, cancelled and awaiting-result states | Reuse the existing rendering for those states |
| Data is "already fetched in the layout" | True, but member-mode `NextMatchCard` re-fetches the scheduled week on the client and renders nothing until it returns | Seed the card from the server on Overview so it is in the first paint |
| Not mentioned | Only the Results page creates the `unrecorded` row when a game day passes with no result. Week numbers and "games left" depend on it | Overview runs the same step, via a shared helper |
| Position `1st`, `JOINT TOP` | `computeQuarterlyTable` keeps only the top 10 and exposes no rank lookup | New helper, see Data |
| Last result is a win or a draw | The latest result can be a DNF | DNF variant, see card 3 |
| Card 2 has three variants | Signed-in non-members, pending or rejected claims, and unlinked admins also exist | See card 2 |
| Default redirect is the only entry point | Home page, invite accept, navbar sign-in and legacy id routes link straight to `/results` | Point them at the league root |

## Routing

### League root: `app/[slug]/page.tsx`

Reads the `user-agent` request header and redirects:

- phone or Android tablet (`/Mobi|Android/i`) → `/[slug]/overview`
- anything else → `/[slug]/results`

The test lives in a pure helper, `leagueLandingPath(slug, userAgent)`, in
`lib/utils.ts`.

Why not send everyone to `/overview` and bounce large screens on the client:
that costs every desktop visitor a wasted render and a second navigation, with
a skeleton flash, on the most common entry URL.

Known limit: iPadOS Safari reports a desktop user agent, so an iPad in portrait
lands on Results. Overview is the first tab, one tap away.

### Entry points that currently hard-code `/results`

These change to the league root, `/[slug]`, so the rule above applies:

- `app/page.tsx`: the single-league redirect and the league list links
- `app/app/league/[id]/page.tsx` and `app/results/[id]/page.tsx` (legacy id
  redirects)
- `app/invite/page.tsx`: the post-accept navigation
- `components/ui/navbar.tsx`: the two `AuthDialog` `redirect` props

Unchanged: the non-admin fallbacks in `proxy.ts` and
`app/[slug]/settings/page.tsx`, and the UUID redirect default in
`app/[slug]/layout.tsx`.

### New route: `app/[slug]/(tabs)/overview/`

- `page.tsx`: server component, `force-dynamic`, same fetch batch as the other
  tabs.
- `loading.tsx`: renders the existing `LeagueTabSkeleton`.

### Large-screen guard

The Overview tab is hidden at `lg`, so `/overview` must not be a dead end
there (shared link, or a tablet rotated to landscape).

- The page content is wrapped in `lg:hidden`. At `lg` and above the page
  shows `LeagueTabSkeleton` instead, so the cards never flash next to the
  sidebar.
- A small client component, `OverviewDesktopRedirect`, calls
  `router.replace('/[slug]/results')` when
  `matchMedia('(min-width: 1024px)')` matches, on mount and on change.

### Tab bar: `LeagueTabNav`

Overview is the first tab, `lg:hidden`, lucide `LayoutGrid` at 13px, same
recipe as the other tabs.

### Stats button: `MobileStatsFAB`

Returns nothing when the active segment is `overview`. It reads
`useSelectedLayoutSegment()`, the same hook `LeagueTabNav` uses. The FAB stays
on Results, Players, Honours and Lineup Lab. `SidebarSticky` is unchanged.

## Page: data and structure

`overview/page.tsx` fetches `getGameBySlug`, then in one batch
`getAuthAndRole`, `getFeatures`, `getPlayerStats`, `getWeeks` and
`getMyClaimInfo`. All are request-cached and shared with the tabs layout, so
the page adds no queries.

1. If `isLeagueHidden(features, tier)`, render `LeaguePrivateState`, as the
   other tabs do.
2. For non-public tiers, run the unrecorded-week step (below).
3. Render `OverviewDesktopRedirect`, `BfcacheRefresh`, then the five cards in
   a `flex flex-col gap-3` column.

`ClaimOnboardingBanner` is not rendered on Overview. Card 2 does that job.

### Shared helper: unrecorded week

The block in `results/page.tsx` that calls `create_unrecorded_week` moves into
`ensureUnrecordedWeek(leagueId, weeks, leagueDayIndex)` in `lib/fetchers.ts`
and returns the weeks list with the new row appended when one was created.
Results and Overview both call it. Behaviour on Results is unchanged.

## Card 1: next game

### Architecture

`NextMatchCard` owns the card state machine (`idle`, `building`, `lineup`,
`cancelled`), every write handler, the cancel dialog, `AddPlayerModal` and
`ResultModal`. The Overview card needs all of that with a different look for
two states. So:

- `NextMatchCard` gains `variant?: 'results' | 'overview'` (default
  `'results'`) and an `overview` prop carrying `linkedPlayerName`, `location`
  and `kickoffTime`.
- With `variant="overview"`, the `idle` and `lineup` states render two new
  presentational components from `components/overview/NextGameCard.tsx`:
  `NextGameIdle` and `NextGameLineup`. They take plain props and callbacks and
  hold no state.
- `building` and `cancelled` render exactly as they do on Results. The team
  builder opens inline in the card.
- With `variant="results"` nothing changes.

Alternatives considered:

- **Extract a `useNextMatch` hook and build a separate Overview card.** The
  cleanest end state, but it means restructuring a large component with thin
  test coverage, for no user-visible gain in this change.
- **Make the Overview card read-only and link to Results for actions.**
  Simplest, but the handoff is explicit that the card is not a link and the
  buttons act in place.

### First paint

On Overview the card must not pop in, because it is the first thing on the
landing page. A new pure helper, `getNextMatchSeed(weeks)` in `lib/utils.ts`,
mirrors the client-side `load()` rules in `NextMatchCard`:

- take the highest-numbered week with status `scheduled`, `cancelled` or
  `unrecorded`
- `unrecorded`, or past the 20:00 deadline → `null` (card is idle)
- otherwise → that week as a `ScheduledWeek`

The Overview page passes the result as `initialScheduledWeek`. With
`variant="overview"` the card initialises its state from that prop on first
render and skips the client fetch, in member and public mode alike. It still
re-syncs when the prop changes after `router.refresh()`. Results keeps its
current client fetch.

### Wiring

A thin client wrapper, `components/overview/OverviewNextGame.tsx`, renders
`NextMatchCard` with:

- `canEdit`: `isAdmin || isFeatureEnabled(features, 'match_entry', tier)`
- `publicMode`: `tier === 'public'` (writes go through the public API routes,
  as on Results)
- `canAutoPick`: true, with `allPlayers`
- `onResultSaved`: `router.refresh()` for members and admins,
  `window.location.reload()` for the public tier, as on Results

The card always renders, for every tier. This differs from Results, where a
member without `match_entry` sees no next match card at all; on Overview they
get the read-only card.

### States

**Lineups set** (`lineup`): as the handoff. Notes:

- `YOUR TEAM` and `YOU` appear when `linkedPlayerName` is in `teamA` or
  `teamB`. Team B uses the violet variants.
- No team ratings and no keeper glove. Share sits in the action row, with the
  same text and signed lineup link as Results.
- Footer left: `location · format`. Footer right: weekday and day-month from
  the week date, then ` · kickoff_time`, for example `Thu 08 Apr · 8pm`,
  uppercased by CSS. Any missing part is omitted along with its separator; an
  empty side is not rendered.
- The action band (Edit Lineups, Result Game) shows when `canEdit`.
- If the page is still open after the 20:00 deadline, the badge reads
  `Awaiting Result` using the existing recipe, as on Results.

**Not built** (`idle`): as the handoff. The note reads
`Pick who is playing and we will balance the teams.` when `canEdit`, otherwise
`Teams are usually posted the day before.` Cancel Game and Build Teams show
when `canEdit`. Cancel Game opens the existing confirmation dialog.

**Building**: the existing team builder, unchanged.

**Cancelled**: the existing row (week, date, Cancelled badge, Reactivate when
`canEdit`), unchanged.

## Card 2: your stats, or a prompt

| Viewer | Card 2 |
|---|---|
| Not signed in | Sign-in card |
| Signed in, not a league member | Nothing (the header already shows Join or the pending state) |
| Member, claim status `none` | Link profile card |
| Member or admin, claim approved, player found in stats | Your stats |
| Claim pending or rejected | Nothing |
| Admin with no claim | Nothing (matches the existing banner rule, which is members only) |
| Claim approved but the player name is not in the stats list | Nothing |

**Sign-in card** (`OverviewSignInCard`, client): `Log in` opens `AuthDialog`
with `signinOnly` and `redirect` set to `/[slug]/overview`.

**Link profile card**: `Link profile` is a link to `/settings`, where the
claim picker lives. It is the same target as `ClaimOnboardingBanner`. The card
is not dismissible.

**Your stats** (`OverviewYourStats`, server): as the handoff.

- Record line: `28W · 4D · 10L`, prefixed `GK · ` when
  `mentality === 'goalkeeper'`.
- Tiles: win rate (rounded `winRate`), played, and points per game
  (`points / played` to one decimal, `0.0` when `played` is 0).
- Quarter position: from `getQuarterStanding` (below). Label
  `Q2 2026`, plus ` · Joint top` when tied for first. The whole position block
  is omitted when the viewer has no games in the displayed quarter.
- Recent form: `FormDots` with `player.recentForm`.

## Card 3: last result and league table

`OverviewTableCard`, server. Three bands in one card.

**Last result strip.** Shows the most recent week with status `played` or
`dnf`, by date. Rendered only when the viewer's tier has `match_history`
(admins always) and such a week exists; otherwise the card starts at the table
header.

- Team A won: sky wash, `Team A won` in `#7dd3fc`.
- Team B won: violet wash, `Team B won` in `#c4b5fd`.
- Draw: no wash, `Drawn` in `#8ba4c4`, no margin block.
- DNF: no wash, `Did not finish` in `#8ba4c4`, no margin block.
- Margin block: `+N` over `Goals` (`Goal` when N is 1). Hidden when
  `goal_difference` is null or 0.
- Meta line: week date, then ` · format` when the week has one.

**Table.** Uses `computeQuarterlyTable`, so it inherits the sidebar's quarter
logic, including holdover (showing the previous quarter until the new one has
a played game).

- Title: `League table · Q2 2026` (four-digit year on Overview; the sidebar
  keeps `Q2 26`).
- Rows: top 10. The rank column is the row's place in the sorted table, as in
  the sidebar.
- Highlight: the linked viewer's row only, with the `YOU` tag. Nobody is
  highlighted for guests or unlinked viewers. First place is not highlighted.
- If the linked viewer is ranked below 10th, their row is appended after the
  tenth with its true rank and the same highlight.
- Empty state: the sidebar's `Quarter just started` or `No data yet`.
- Footer line: the sidebar's progress line (`1 of 13 played`,
  `12 games left`, or `Final`).

**Previous champion box.** As the sidebar, plus the champion's points
(`28 pts`). Shown only when the previous quarter has data.

## Card 4: most in form

The sidebar widget at content width, with a `Last 5 games` tag in the header.
Same `computeInForm` data and empty state.

## Card 5: head to head

The sidebar widget at content width. Linked viewers get the extra line
`You have played N for A · M for B`, from the player's `timesTeamA` and
`timesTeamB`. Omitted for everyone else.

## Sharing code with the sidebar

Cards 3 to 5 repeat markup that lives in `components/StatsSidebar.tsx`. To
avoid two copies drifting apart:

- `WidgetShell` gains a `size?: 'sidebar' | 'page'` prop for the 14px versus
  16px padding.
- `InFormWidget` and `TeamABWidget` are exported and take the optional extras
  above (header tag; linked player counts). The sidebar passes neither, so its
  output is unchanged.
- The table rows, progress footer and champion box become small exported
  components in `components/QuarterTable.tsx`, used by the sidebar widget
  (highlight first place) and by `OverviewTableCard` (highlight the viewer).

The sidebar's rendered output does not change.

## Data: `lib/sidebar-stats.ts`

- `computeQuarterlyTable` result gains:
  - `allEntries`: the full sorted table (`entries` stays the top 10)
  - `displayQ`, `displayYear`: numbers, for the four-digit label
  - `lastChampionPoints`: points of the previous-quarter champion, or `null`
- `getQuarterStanding(allEntries, name)` returns
  `{ rank, position, jointTop, entry }` or `null` when the player has no row.
  - `rank`: 1-based place in the sorted table (what the rank column shows).
  - `position`: players level on every ranking key share a position, so
    `position` is 1 plus the number of players strictly ahead. The keys are
    the table's own order from `compareStandings` in `lib/utils.ts`: points,
    then goal difference, then fewer games played, then wins. This is what
    the Your stats card shows.
  - `jointTop`: `position === 1` and at least one other player shares it.
- `getLastResult(weeks)` returns the most recent `played` or `dnf` week, or
  `null`.

`lib/utils.ts` gains `leagueLandingPath` and `getNextMatchSeed` (both above),
plus `ordinalSuffix(n)` if the existing private `ordinal` helper cannot be
reused as is.

## Addendum: goal difference (2026-10-01)

PR #131 landed on `main` while this was in review. It added a GD column to the
quarter tables and changed the ranking to points, GD, fewer games played, wins,
name (`computeStandings` in `lib/utils.ts`). After merging it in:

- The GD column lives in the shared `components/QuarterTable.tsx`, so the
  sidebar and the Overview table both show it. The Overview table header uses
  the same 4px gap as its rows so the six columns line up, not the 6px in the
  handoff, which predates the column.
- `getQuarterStanding` ranks with `compareStandings`, the same comparator the
  table is sorted with, so the Your stats position can never disagree with the
  table. "Joint top" now needs level points, GD, games played and wins.

## Addendum: Stats button removed (2026-10-01)

Decided after the first build: with the Overview tab in place, the floating
Stats button and its bottom sheet are redundant on every tab, not just on
Overview. `components/MobileStatsFAB.tsx` is deleted and the tabs layout renders
the stats sidebar for large screens only. This supersedes the "Stats button"
section above. Below `lg`, the Overview tab is the only place the sidebar stats
appear.

## Files

New:

- `app/[slug]/(tabs)/overview/page.tsx`, `loading.tsx`
- `components/overview/OverviewNextGame.tsx` (client wrapper)
- `components/overview/NextGameCard.tsx` (`NextGameIdle`, `NextGameLineup`)
- `components/overview/OverviewYourStats.tsx`
- `components/overview/OverviewPromptCards.tsx` (sign-in, link profile)
- `components/overview/OverviewTableCard.tsx`
- `components/overview/OverviewDesktopRedirect.tsx`
- `components/QuarterTable.tsx`

Changed:

- `app/[slug]/page.tsx`, `app/page.tsx`, `app/app/league/[id]/page.tsx`,
  `app/results/[id]/page.tsx`, `app/invite/page.tsx`,
  `components/ui/navbar.tsx` (landing)
- `app/[slug]/(tabs)/results/page.tsx` (use `ensureUnrecordedWeek`)
- `components/LeagueTabNav.tsx`, `components/MobileStatsFAB.tsx`
- `components/NextMatchCard.tsx` (variant, server seed)
- `components/StatsSidebar.tsx` (exports, shared pieces)
- `lib/sidebar-stats.ts`, `lib/utils.ts`, `lib/fetchers.ts`

## Conventions

- Tailwind utilities only, arbitrary hex values from the restyle palette,
  `cn()` for conditional classes.
- Labels are written in normal case and uppercased with the `uppercase` class.
- British English, no em dashes in UI copy.
- Focus ring `2px solid #38bdf8` with 2px offset on the buttons and the link.
- Content column stays `max-w-xl`, as the tabs layout sets it.

## Testing

Unit (Jest):

- `getQuarterStanding`: clear leader, joint top, tie below first, level on
  points but not wins, player absent, rank below 10th.
- `computeQuarterlyTable`: `allEntries`, `lastChampionPoints`, display quarter
  during holdover.
- `getLastResult`: win, draw, DNF latest, no results.
- `getNextMatchSeed`: scheduled, cancelled, unrecorded, past deadline, none.
- `leagueLandingPath`: iPhone, Android phone, Android tablet, desktop, iPad,
  empty user agent.

Component (React Testing Library):

- `NextGameLineup`: `YOUR TEAM` and `YOU` on the right team; none without a
  linked player; action band only with `canEdit`; footer with missing parts.
- `NextGameIdle`: copy and buttons for `canEdit` true and false.
- Card 2: one test per row of the viewer table.
- `OverviewTableCard`: viewer highlighted, first place not; appended row when
  below 10th; strip variants (A, B, draw, DNF, hidden without
  `match_history`); margin singular and hidden.
- `LeagueTabNav`: Overview is first and carries `lg:hidden`.
- `MobileStatsFAB`: renders nothing on the `overview` segment.
- `StatsSidebar`: existing output unchanged after the extraction.

Manual, at 390px, 820px and 1280px, as guest, unlinked member, linked member
and admin: landing rule, large-screen guard, each next game state including
build, edit, result and cancel, and that Results behaves as before.

## Out of scope

- Any change to the desktop layout or the sidebar's appearance.
- A feature flag for Overview.
- Refactoring `NextMatchCard` beyond the variant and the server seed.
- An Overview-shaped loading skeleton.
- Player profile pages or a "full standings" link.
