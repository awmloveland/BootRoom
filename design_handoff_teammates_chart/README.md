# Handoff: Win % with teammates chart

## Overview
A new stat, **Win % with teammates**, shown as a vertical bar chart in three places: the expanded Player card on the Players tab, the Your Stats card on the Overview tab, and a new widget in the desktop stats sidebar. For a given player it lists every teammate they have played **at least 5 games on the same side with**, sorted strongest to weakest by the pair's win %. The strongest pairing is highlighted cyan, the weakest red.

Repo: `awmloveland/BootRoom`, branch `main`. Builds on `design_handoff_app_restyle/` (same tokens and recipes; this README only adds what is new).

## About the design files
`Craft Football App Restyle.dc.html` is a **design reference built in HTML**, not production code. Recreate it in the existing Next.js + Tailwind v4 codebase using the existing components (`PlayerCard`, `StatsSidebar`, `OverviewYourStats`), fonts and data layer. All pairing numbers in the prototype are generated sample data.

Open the file in a browser. Use the chrome to switch to **Players** (expand Jamie Ellis) or **Overview** (Mobile), and **Desktop** for the sidebar. The **Big squad** tweak simulates 22 players so the trimmed state (best 5 / worst 5) can be seen.

## Fidelity
High-fidelity. Colours, type, spacing and radii are final and come from the restyle token set.

## Data

### Computation (new, in `lib/sidebar-stats.ts` or a new `lib/teammates.ts`)
One pass over `weeks` where `status === 'played'`:

```ts
interface TeammateStat { name: string; played: number; won: number; winRate: number }  // winRate 0–100, rounded

function computeTeammates(playerName: string, weeks: Week[], minGames = 5): TeammateStat[]
```
- For each played week, find the side containing `playerName` (`teamA` or `teamB`). Every other name on that side gets `played += 1`; `won += 1` when `winner` matches that side. Draws count as played, not won. Skip `cancelled`, `unrecorded`, `scheduled`, `dnf`.
- Keep pairs with `played >= minGames`.
- Sort by `winRate` desc, then `played` desc.
- Reuse for the Player card (any player) and for the linked player (Overview + sidebar). Compute server-side where `getPlayerStats` runs, or in a `useMemo` in the component from the `weeks` prop (`PlayerCard` already receives `weeks`).

### Display rules
- Label under each bar is the **first name** (`name.split(' ')[0]`).
- `strongest` = index 0, `weakest` = last index, only when there are 2 or more entries.
- **More than 10 qualifiers**: show the **best 5** and **worst 5** only, with a vertical dashed divider column between the two groups and `BEST 5` / `WORST 5` group labels under the respective groups. 10 or fewer: show everyone, no divider, no group labels.
- Tooltip (`title`) on each bar: `"{Full name} · {won} wins from {played} together"`. On the divider: `"{n − 10} more teammates in the middle"`.
- Empty state (Player card only): `Nobody has played 5 games with {First} yet.`

## Placements

### 1. Player card (`components/PlayerCard.tsx`)
New **Section 4** after Team Split, same section recipe: `border-t border-[#1b2c46] pt-3.5`.

Section header: flex row, `justify-between`, `items-baseline`, `flex-wrap`, `gap 4px 12px`, `margin-bottom 10px`.
- Left: `WIN % WITH TEAMMATES` in `STAT_LABEL_CLASS` (Plex Mono 9px 700 `.18em` uppercase `#6f88a8`).
- Right: `MIN 5 TOGETHER`, Plex Mono 8.5px `.14em` uppercase `#4f688a`.

Then the **large chart** (below), or the empty state: `padding 16px 12px`, `border 1px dashed #223a5c`, `radius 4px`, centred, Inter 12px `#6f88a8`.

### 2. Overview Your Stats card (`OverviewYourStats`)
Appended to the bottom of the existing card as a third section, under Recent Form.
- Section header row: `padding 12px 16px 0`, `border-top 1px solid #1b2c46`, flex `justify-between` `items-center` `gap 12px`. Left `WIN % WITH TEAMMATES` Plex Mono 8.5px 700 `.16em` `#6f88a8` (same as the `RECENT FORM` label). Right `MIN 5 TOGETHER` Plex Mono 8.5px `.14em` `#4f688a` nowrap.
- Body: `padding 16px 16px 14px`, contains the **large chart**.
- Only rendered when the account is linked (the card itself already has this gate). No empty state here: hide the section when there are no qualifiers.

### 3. Stats sidebar (`components/StatsSidebar.tsx`)
New widget directly after `YourStatsWidget`, before the quarterly table. Uses `WidgetShell` (so `WIDGET_CLASS` + the `#0c1728` header).
- Title: `YOUR TEAMMATES · WIN %` (`WIDGET_TITLE_CLASS`, nowrap).
- `headerRight`: `MIN 5 TOGETHER`, Plex Mono 8px `.12em` uppercase `#4f688a`.
- Body padding `14px 14px 14px 12px`, contains the **small chart**.
- Same gate as Your Stats: render only when `linkedPlayerName` resolves to a player, and hide entirely when no teammates qualify.

## Chart recipe

Two sizes. Large (Player card, Overview) and small (sidebar). All values Plex Mono unless stated.

| | Large | Small |
| --- | --- | --- |
| Plot height | 110px | 90px |
| Tick positions (bottom) | 0 / 48 / 96px | 0 / 39 / 78px |
| Bar height | `max(2, round(pct × 0.96))px` | `max(2, round(pct × 0.78))px` |
| Bar max width | 28px | 22px |
| Column gap | 6px | 4px |
| Axis column width | 22px | 20px |
| Value label | 9px 700 | 8px 700 |
| Name label | 8.5px | 7.5px |
| Name row height | 34px | 30px |
| Tick font | 8.5px | 7.5px |

Structure (flex row, `gap 8px`):
1. **Y axis**: `position relative`, fixed width and plot height, text right, colour `#4f688a`. Ticks `100`, `50`, `0` absolutely positioned at `right 0` and the tick bottoms above, each `transform: translateY(50%)` so it centres on the gridline. No axis title.
2. **Plot** (`flex 1`, `min-width 0`):
   - Plot area: `position relative`, plot height, `border-bottom 1px solid #223a5c`, `display flex`, `align-items flex-end`, column gap. Two gridlines: absolute, `left 0 right 0`, `border-top 1px dashed #17263c` at the 50 and 100 tick bottoms.
   - One **column** per entry: `flex 1`, `min-width 0`, flex column, `align-items center`, `justify-content flex-end`, `gap 3px`. Contains the value label (rounded %, no symbol) then the bar: `width 100%`, `max-width` as above, `border-radius 2px 2px 0 0`.
   - **Divider column** (trimmed state only): `flex 0.6`, bar is `1px` wide and full plot height with `border-left 1px dashed #2c4a72`, no value label.
   - **Name row**: flex, same column gap, `margin-top 4px`. Each cell `flex 1` (divider `flex 0.6`), fixed row height, `position relative`. The name is absolutely positioned `top 2px; right 50%; transform-origin top right; transform rotate(-45deg) translateX(-4px)` (small: `-3px`), `white-space nowrap`, `line-height 1`, coloured like its bar. This angles names so full first names fit under narrow columns.
   - **Group row** (trimmed state only): flex, same gap, `margin-top 2px`. Three cells with flex `5 / 0.6 / 5`: `BEST 5` (`#7dd3fc`, `border-top 1px solid rgba(56,189,248,.45)`), empty spacer, `WORST 5` (`#e2686f`, `border-top 1px solid rgba(226,104,111,.45)`). Text 8px (small: 7px) 700 `.14em` uppercase centred, `padding-top 5px`.

Colours per entry:
- Strongest: bar `#38bdf8`, text `#7dd3fc`
- Weakest: bar `#e2686f`, text `#e2686f`
- Others: bar `#22405f`, text `#8ba4c4`

## Interactions
None beyond the native `title` tooltip. The Player card section lives inside the existing Collapsible content and animates with it. No sorting or year filter: the chart is always all-time, even when the card's year dropdown is set (if you want it to follow the year filter, pass the year-filtered weeks into `computeTeammates`).

## Tests to add
- `computeTeammates`: excludes pairs under 5 games; counts draws as played not won; ignores non-played weeks; sorts by win % then games; opponents on the other side are never counted.
- Trimming: 10 entries renders all, 11 renders 5 + divider + 5.

## Files
- `Craft Football App Restyle.dc.html` (reference; Players, Overview and Desktop sidebar screens)
- `assets/`, `fonts/`, `support.js` (needed to open the reference)

## Suggested Claude Code prompt

```
Read design_handoff_teammates_chart/README.md and implement the "Win % with teammates" chart in this Next.js + Tailwind codebase.

1. Add computeTeammates(playerName, weeks, minGames = 5) to lib/sidebar-stats.ts (or a new lib/teammates.ts) with the counting, filtering and sorting rules in the README, plus unit tests alongside the existing sidebar-stats tests.
2. Build one TeammatesChart component with a size prop ('large' | 'small') following the chart recipe exactly (plot heights, tick positions, bar scaling, rotated name labels, best 5 / worst 5 trimming with divider and group labels, colours). Use Tailwind arbitrary values with the existing font-plex / font-inter-body classes.
3. Mount it in three places: a fourth section in components/PlayerCard.tsx after Team Split (with the empty state), a third section at the bottom of OverviewYourStats, and a new sidebar widget after YourStatsWidget in components/StatsSidebar.tsx using WidgetShell. Follow the gating rules in the README.
Keep all copy in British English and do not use em dashes.
```
