# Results year tabs — design

**Date:** 2026-10-01

**Design source:** `.context/mockups/year-tabs.html`, variant C (soft pills,
tinted active). Reference: a sports app's second row of pill tabs under its
main tab bar.

## Summary

The Results tab gets a second row of tabs, one per year the league has games
in. Picking a year filters the match list down to that year. The row defaults
to the current year and does not render at all when the league only has one
year.

## Decisions (settled during brainstorming)

- **Style:** variant C. Rounded-full pills; active pill uses the Team A sky
  tint, inactive pills are outlined on the card background.
- **Next Match card:** only shown on the default (current) year. Past years
  show results only.
- **No "All" tab.** One year is always selected. Year dividers no longer
  appear in the list because only one year is ever on screen.
- **URL:** the selected year lives in `?year=YYYY`. The default year leaves
  the URL clean.
- **No feature flag.** Ships to everyone (admins, members, public) at once.
  This is a deliberate exception to the CLAUDE.md flag standard, agreed with
  the product owner.

## Behaviour

### Which years appear

`seasons` = the distinct `week.season` values across all weeks the page
already loads (any status: played, cancelled, dnf, unrecorded, scheduled),
sorted newest first, e.g. `['2026', '2025', '2024']`.

- `seasons.length <= 1` → the row is not rendered and the page behaves
  exactly as it does today.
- Otherwise the row renders one pill per season, newest on the left.

### Default year

The default year is `seasons[0]`, the newest season with any week row. In
practice this is the current calendar year. In early January, before any row
exists for the new year, it is the previous year.

### Selected year

`resolveSelectedYear(seasons, param)`:

- `param` is one of `seasons` → that year.
- Otherwise (missing, malformed, a year the league has no games in) → the
  default year.

The server page reads `searchParams.year`, resolves it, and passes the result
down as `initialYear`, so the first render shows the right year with no flash.

### Switching years

- Clicking a pill updates client state immediately. No refetch: all weeks are
  already on the client.
- The URL is updated with `window.history.replaceState`: `?year=2025` for a
  past year, the bare path for the default year. Other query params are
  preserved.
- The open card resets to the most recent played or DNF result in the newly
  selected year, the same rule used on first load today.

### What the list shows for a selected year

- Only weeks whose `season` matches the selected year are rendered as cards.
- Month dividers work as today. Year dividers never trigger, because adjacent
  cards always share a season.
- The quarter champion card still renders above its quarter's first result.
  It only appears in the year it belongs to, since its quarter's weeks only
  exist in that year.
- **Share and "most recent" treatment still follow the league-wide latest
  result.** The list components keep receiving the full `weeks` array for
  `isMostRecent`, share text and edit modals. The season only decides which
  cards render. A past year's last game does not gain a Share button.

### Next Match card

Rendered only when the selected year is the default year. This applies to
`NextMatchCard` (members and admins) and `PublicMatchEntrySection` (public).

### Empty year

If the selected year has no cards (only possible for the default year when
the sole week is a scheduled one), the list shows the existing "No results
yet." / "No match data available yet." copy.

## Visual spec (variant C)

Row container: `flex gap-2 overflow-x-auto` with the hidden scrollbar
utilities used in `LeagueTabNav`
(`[scrollbar-width:none] [&::-webkit-scrollbar]:hidden`). It sits at the top
of the results content, inside the existing `flex flex-col gap-3` stack, so it
is spaced from the tab bar and the first card by the stack's gap. If the claim
onboarding banner shows, the row sits below it.

Pill (all states):
`h-8 px-4 shrink-0 rounded-full border font-plex text-[10px] font-bold
uppercase tracking-[.14em] transition-colors`

| State | Classes |
|---|---|
| Active | `bg-[#38bdf8]/12 border-[#38bdf8]/50 text-[#7dd3fc]` |
| Inactive | `bg-[#0a1421] border-[#1b2c46] text-[#8ba4c4] hover:border-[#2c4a72] hover:text-[#f4f9ff]` |

Labels are the four-digit year. No icons.

## Accessibility

- Container: `role="tablist"`, `aria-label="Season"`.
- Each pill: `<button type="button" role="tab" aria-selected={active}>`.
- No `aria-controls`: the list below is not a discrete tab panel in the DOM
  sense, and the row is a filter. Arrow-key roving focus is out of scope.
  Pills are normal tab stops.

## Code shape

### `lib/utils.ts`

- `getSeasons(weeks: Week[]): string[]`: distinct seasons, newest first.
- `resolveSelectedYear(seasons: string[], param: string | null | undefined): string`:
  as above. With an empty `seasons` it returns the current calendar year
  string.
- `writeYearParam(year: string, defaultYear: string): void`: updates
  `?year` with `history.replaceState`, removing the param for the default
  year. Client-only.

### `components/YearTabs.tsx` (new)

`YearTabs` is presentational. Props: `years: string[]`, `selected: string`,
`onSelect: (year: string) => void`. Returns `null` when `years.length <= 1`.

The same file exports `useResultsYear(weeks, initialYear)`, shared by both
results sections. It returns `{ seasons, year, isDefaultYear, selectYear }`.
While the viewer is on the default year it stores no explicit pick, so if a
refresh brings in a newer season (an admin schedules the first game of a new
year), the view moves to it instead of stranding the viewer on last year with
Next Match hidden. A picked past year stays put. `selectYear` also calls
`writeYearParam`.

The year row only renders when match history is visible to the viewer.

### `components/WeekList.tsx` and `components/PublicMatchList.tsx`

New optional prop `season?: string`. When set, only weeks with that season are
rendered as cards; `mostRecent`, `isMostRecent`, the `weeks` passed to
`MatchCard`, and the default open week calculation keep using the full
`weeks` array as they do today. The default open week becomes the most recent
result *within the rendered weeks*, so a past year opens its own latest game.
`startsCelebratedQuarter` and the month/year divider checks run against the
rendered (filtered) list, since they compare neighbouring cards.

Both lists are keyed by season in their parent (`key={year}`) so internal
open-card state resets on year change. `WeekList` in controlled mode gets its
reset from `ResultsSection`.

### `components/ResultsSection.tsx`

- New props: `initialYear: string` and `showMatchEntry?: boolean` (default
  `true`).
- Gets `year` from `useResultsYear` and renders `YearTabs` first.
- Initial `openWeek` is the most recent played or DNF week in `initialYear`
  (today it is the league-wide latest, which is the same thing on the default
  year).
- On year change: set state, call `writeYearParam`, and set `openWeek` to
  that year's most recent played or DNF week (or `null`).
- Renders `NextMatchCard` only when `showMatchEntry && year === defaultYear`.
- Passes `season={year}` to `WeekList`.

The member read-only branch of the results page (match history visible, match
entry not) currently renders `WeekList` directly. It switches to
`ResultsSection` with `showMatchEntry={false}`, so there is one member-side
owner of the year state. Those members also start seeing the quarter champion
card, which the direct `WeekList` call previously left out.

Both list components currently compare only `week.week` for "most recent".
Week numbers restart each year, so this also changes them to compare season
and week.

### `components/PublicResultsSection.tsx` (new)

Client component for the public branch. It takes the props the page currently
passes to `PublicMatchEntrySection` and `PublicMatchList`, plus `initialYear`
and `showMatchHistory`. It uses `useResultsYear` the same way as
`ResultsSection`: it renders `YearTabs`, `PublicMatchEntrySection` (only on
the default year with a next week), and `PublicMatchList` with
`season={year}`. The "Sign in for full access" footer stays in the server
page.

### `app/[slug]/(tabs)/results/page.tsx`

- Accepts `searchParams: Promise<{ year?: string }>`.
- Computes `initialYear = resolveSelectedYear(getSeasons(weeks), year)` after
  `weeks` is resolved.
- Passes it to `ResultsSection` / `PublicResultsSection`.

## Out of scope

- Year filtering on Players, Honours, Overview or the stats sidebar.
- Arrow-key navigation within the pill row.
- Changing the league header's season eyebrow or week count.

## Testing

- Unit tests (`lib/__tests__`) for `getSeasons` (dedupe, newest first, mixed
  statuses, empty) and `resolveSelectedYear` (valid param, unknown year,
  malformed, missing, empty seasons).
- Component tests (`components/__tests__`):
  - `YearTabs`: renders nothing for 0 or 1 years; marks the selected pill
    `aria-selected`; calls `onSelect`.
  - `WeekList` / `PublicMatchList` with `season`: only that year's cards
    render; no year divider; Share stays on the league-wide latest result
    only.
  - `ResultsSection`: Next Match hidden on a past year; switching years
    opens that year's latest result.
- Manual check against the real league, browsing signed out at phone and
  desktop widths: row present, default year selected, `?year=` round-trips on
  refresh and back.
