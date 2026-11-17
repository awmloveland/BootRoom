# Handoff: League creation and onboarding

## Overview
A "Create a league" flow that doubles as onboarding. One question per screen, centred, nothing else on the page. A signed-out visitor signs up first, then names the league, picks where and when it plays, adds the roster, sets mentality and strength, optionally imports past results, and lands on a celebration screen whose main job is getting the invite link into the group chat.

Repo: `awmloveland/BootRoom`, branch `main`. Grounded in the feasibility brief of 2026-10-13 (branch `awmloveland/bootroom-league-creation-review`) and its decisions. Builds on `design_handoff_app_restyle/` for tokens and shell; this README only adds what is new.

## About the design files
`Craft Football League Setup v3.dc.html` is a **design reference built in HTML**, not production code. Recreate it in the existing Next.js + Tailwind v4 + Supabase codebase using the existing components (`AuthDialog`, `StrengthPills`, `MentalityControl`, `LineupLab` pieces, `AddRosterPlayerModal`, `ResultChip`), fonts and data layer. All names, venues and results in the prototype are sample data.

Open the file in a browser. The sticky bar at the top is **prototype chrome, not part of the design**: Screen jumps between steps, User toggles new visitor / signed in, Viewport toggles desktop / 390px mobile. Inline styles carry exact values.

`Craft Football League Setup v2.dc.html` is the earlier, denser version. Keep it only for its **Entry** screen (four entry-point surfaces) and **Flow map** screen (per-step gotchas); the step designs themselves are superseded by v3.

## Fidelity
High-fidelity. Colours, type, spacing and radii are final and come from the restyle token set. Copy is final unless marked.

## Decisions already made (do not re-open)
1. Sign-up before league details. No draft is held across the OTP round-trip.
2. Weekly only. No frequency field. No league-level format (5/6/7); format stays per match, derived from squad sizes.
3. The creator is always a player. Their name is pre-filled from the profile, added to the roster and an approved `player_claims` row is written.
4. Past results are optional; ask for as many as they have. Imported weeks must not show as fee debt.
5. The URL slug is set at creation and **no longer regenerates on rename** (`app/api/league/[id]/details/route.ts:58-64` must change).
6. Everyone with an account can create a league. No rollout gate.
7. Sequence after PRs #143 to #145 (team builder) and #154 (sign-in pages).

## Routing
Each step is its own URL so the browser back button works (the design has no back button). Suggested:

```
/new                         account (redirects to /new/name when signed in)
/new/name
/new/where
/new/when                    → POST creates the league, then
/new/[slug]/players
/new/[slug]/mentality
/new/[slug]/strength
/new/[slug]/results
/new/[slug]/live
```

The league is created on leaving **When** (so the slug exists for the rest). Steps after creation write to the league directly; abandoning the flow leaves a valid league the admin can finish in Settings. `LeagueInfoBar` already nudges admins when details are empty.

Entry points (see v2 Entry screen): "Your leagues" empty state CTA (`app/page.tsx:191`), a "Create a league" row in the multi-league list, a navbar avatar-menu item (`components/ui/navbar.tsx:296-319`), a link in `/settings` Linked leagues, and the landing page primary CTA ("Start your league", waitlist demoted to a text link).

## Shared page shell
Every step uses the same frame. Content column `max-width 520px`, centred, `padding 72px 24px 72px` (mobile `36px 16px`). Page bg `#060b14`; a dot grid behind the top 420px (`radial-gradient(#16283f 1.4px, transparent 1.4px)`, `24px` cells, masked to transparent by 100%). No app header on these pages.

Top to bottom:
1. **Logo tile**, centred, `margin-bottom 28px`: 64×64, radius 16px, `linear-gradient(160deg,#0e2a44 0%,#0a1628 55%,#081020 100%)`, `1px solid #223a5c`, shadow `0 14px 36px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.08)`; a 60px sky radial highlight at top-right (`rgba(56,189,248,.45)` → transparent, offset −22px); the ball logo 36px, `filter: brightness(1.5) drop-shadow(0 4px 10px rgba(0,0,0,.5))`.
2. **Step eyebrow**, centred: 18×2px lime bar + `STEP 3/9`, Plex Mono 9.5px 700 `.18em` `#bef264`. Count is 9 for a visitor, 8 for a signed-in user (Account is skipped). Not shown on Live.
3. **H1**, `margin-top 28px`, centred, Space Grotesk 28px (mobile 24px) 700 `-0.03em` `#f4f9ff`, `line-height 1.15`, `text-wrap: pretty`.
4. **Sub**, `margin-top 10px`, centred, Inter 14.5px `#8ba4c4`, `line-height 1.5`.
5. **Control**, `margin-top 32px`.
6. **Primary button**, `margin-top 28px`: full width, `height 50px`, radius 8px, bg `#38bdf8` (hover `#7dd3fc`), text `#05101d` Space Grotesk 15px 700. Disabled = `opacity .4`, not greyed.
7. **Secondary link** where present, `margin-top 18px`, centred, Inter 13.5px 600 `#8ba4c4` (hover `#f4f9ff`).

Inputs: `height 50px`, radius 8px, bg `#0a1421`, `1px solid #1b2c46`, focus border `#38bdf8`, Inter 15px `#f4f9ff`, placeholder `#4f688a`, `padding 0 16px`.

## Screens

### 1. Account (visitors only)
Reuse `components/AuthDialog.tsx` logic inline (not as a modal). Two modes toggled by the secondary button.

**Create account**: H1 "First, who are you?", sub "You will be the admin of this league. Use the name your teammates know you by; it becomes your player." Inputs: First name + Last name in a 2-col grid (`gap 12px`, stacks under 560px), Email. Helper under inputs, `margin-top 12px`, centred Inter 12.5px `#6f88a8`: "No password. We email you a 6-digit code." Primary "Send code" (disabled until email contains `@` and both names present). Then an **or divider** (`margin-top 18px`: 1px `#1b2c46` rules either side of "or" Inter 12.5px `#6f88a8`), then an outline button `height 50px`, radius 8px, `1px solid #223a5c`, `#cfe0f4` 15px 700 (hover border `#38bdf8`): "I already have an account".

**I have an account**: H1 "Welcome back", sub "Sign in and we will pick up where you left off.", Email only, same button pair with "Create an account instead".

**Code**: H1 "Check your email", sub "Enter the 6-digit code we sent to {email}" (email in `#dff1ff`). Code input `height 64px`, border `#38bdf8`, Plex Mono 26px 700 `.5em` centred, digits only, max 6. Primary "Continue" (disabled until 6 digits). Links row: "Resend code" · "Change email".

Gotcha: `claim_profile` writes `display_name` only; copy `first_name`/`last_name` into `profiles` so the roster pre-fill works.

### 2. League name
H1 "What is your league called?", sub "This becomes your link too. It is set now and stays put if you rename the league later." Input `height 54px`, Inter 17px 600, placeholder "e.g. Hackney Thursdays", `maxLength 80`. Under it, `margin-top 12px`, centred Plex Mono 11px `.04em`: `craft-football.com/` in `#4f688a` + live slug in `#8ba4c4` (`lib/slug.ts resolveUniqueSlug`; show the resolved one, e.g. `-2` suffix, if taken). Primary "Continue" (disabled while empty). Secondary link "Add a short bio" reveals a 2-row textarea (`margin-top 20px`, radius 8px, Inter 14px, placeholder "A line or two about the game. Optional.") and hides the link.

### 3. Where
H1 "Where do you play?", sub "Search for the pitch or venue. We save the name so it reads well on your league page."

Search field: `height 50px`, lucide `search` 16px `#6f88a8` left, input, and when a place is chosen a "Change" link (Inter 12.5px 600 `#6f88a8`) right. Border turns `#38bdf8` while typing with no selection.

Suggestions dropdown (absolute, `top 56px`, bg `#0c1728`, `1px solid #223a5c`, radius 8px, shadow `0 18px 44px rgba(0,0,0,.55)`): up to 4 rows, each `padding 12px 14px`, lucide `map-pin` 15px, name Inter 14px 600 `#f4f9ff`, address Inter 12px `#6f88a8`, hover `rgba(56,189,248,.08)`, rows divided by `1px #17263c`. Last row always: lucide `plus` + "Just use" + the typed text in `#f4f9ff` 600 (saves free text).

Selected card, `margin-top 12px`, radius 8px, `1px solid #1b2c46`: 150px map preview (static map image or embed, centre pin 12px `#38bdf8` with `0 0 0 6px rgba(56,189,248,.2)` halo) over a row with name (Inter 14.5px 600) and address (12.5px `#6f88a8`). Primary "Continue" (disabled until a place is chosen).

Implementation: Google Places Autocomplete (or Mapbox) with a session token; store `location` as the place **name** (fits the existing `games.location text`). Address and coordinates would need new columns (`location_address text`, `location_lat/lng numeric`) and are optional for v1. The prototype uses a hard-coded list of London venues.

### 4. When
H1 "When do you play?", sub "Same slot every week. Your first match goes in the diary for the next {Thursday}." (day updates live).

Label "Match day" (`margin 32px 0 8px`, Inter 14px `#8ba4c4`), then 7 pills in a grid (`gap 6px`), each `height 44px`, radius 8px, Plex Mono 10px 700 `.1em` `MON`…`SUN`; unselected bg `#0a1421` border `#1b2c46` text `#8ba4c4`; selected bg `rgba(8,47,73,.6)` border `#38bdf8` text `#7dd3fc`; hover border `#38bdf8`.

Label "Kick-off" (`margin 20px 0 8px`), then a single 50px bar, radius 8px, bg `#0a1421`, `1px solid #1b2c46`, grid `56px 1fr 56px`: minus button (22px glyph `#8ba4c4`, hover `#fff` + bg `#0c1728`, right border `1px #1b2c46`), centre text input showing `8:00` (Plex Mono 18px 700 `#f4f9ff`, right-aligned, 68px wide) with `pm` suffix (Plex Mono 13px 700 `#8ba4c4`), plus button mirrored. Steps are **15 minutes**; arrow keys also step; typed input accepts `8`, `8:15`, `20:15`, `8pm`, `8.30pm`; bare hours under 6 are treated as pm; invalid text turns the bar border `rgba(226,104,111,.6)` and reverts on blur. Store `HH:MM` in `games.kickoff_time` (the API currently accepts 30-minute steps only; relax to 15).

Primary **"Create league"**. On click: POST `/api/games` → rewritten `create_game` (see Backend), then route to `/new/[slug]/players`.

### 5. Who plays
H1 "Who plays?", sub "Add the regulars by name. They do not need an account yet."

List, `gap 8px`, `margin-top 32px`:
- **Creator row**, fixed first, not removable: `height 50px`, bg `#0a1421`, `1px solid rgba(56,189,248,.45)`, name Inter 15px 600, `YOU` badge (Plex Mono 8px 700 `.14em`, `padding 3px 6px`, radius 3px, bg `#38bdf8`, text `#05101d`).
- **Player rows**: `height 50px`, `1px solid #1b2c46`, `padding 0 6px`; the name is an inline-editable input (transparent until focus, then bg `#0c1728` border `#38bdf8`, radius 6px, 38px tall); a 38px `x` button right (`#4f688a`, hover `#e2686f` + `rgba(226,104,111,.1)`).
- **Add row**, dashed `1px #223a5c`: input placeholder "Add a player and press Enter", "Add" button `height 38px` sky. Enter adds and clears. Case-insensitive duplicate check.
- Paste mode (via the secondary link "Paste a list instead" / "Add one at a time instead"): the add row becomes a 5-row textarea in a `rgba(56,189,248,.45)` bordered box, placeholder "One name per line, or separated by commas", with a full-width "Add N players" button. Splits on newline, comma, `&`, `and`, `/`.

Counter under the list, `margin-top 12px`, centred Plex Mono 9.5px `.14em`: `7 PLAYERS · 10 FILLS TWO SIDES OF FIVE` in `#4f688a`, switching to `… · ENOUGH FOR TWO SIDES` in `#bef264` at 10+. Primary "Continue" (disabled below 2 players).

Nothing is written yet; the roster is held in client state and written once at the end of Strength (one `promote_roster` call).

### 6. Mentality
H1 "How does each of them play?", sub "GK is a dedicated keeper, in goal every game. Defensive, balanced and attacking help spread the shape across both sides."

One row per player (creator first, with `YOU` badge), `height 50px`, `padding 0 6px 0 16px`: name left, a 4-segment control right (`MentalityControl`): segments 46px wide, `height 38px`, `1px solid #223a5c` outer, radius 6px, `GK · DEF · BAL · ATT`, Plex Mono 9px 700 `.1em`; selected bg `rgba(8,47,73,.6)` text `#7dd3fc`, unselected text `#8ba4c4`. Default Balanced. Primary "Continue". No skip link (defaults are fine to leave).

### 7. Strength
H1 "Who is above or below average?", sub "A gut call to seed the first lineups. It fades out over each player's first ten games. Members can see it, so keep it fair." (Do **not** promise privacy: members can read `player_attributes`.)

Same rows; 3-segment control (`StrengthPills`), segments 58px: `BELOW · AVG · ABOVE`. Default Average. Primary "Continue" → writes the whole roster via `promote_roster(p_game_id, p_entries)` with `rating` 1/2/3 and `mentality`, plus the creator's `player_claims` row.

### 8. Past results (optional)
H1 "Any past results?", sub "Every game you add makes your first lineups fairer. After five games a player's rating stands on results, not your gut call. Four to six games is the sweet spot."

**Lineup confidence card**, `margin-top 32px`, `padding 16px`, radius 8px, `#0a1421`, `1px solid #1b2c46`:
- Left: "Lineup confidence" Inter 14px 600 `#f4f9ff`; under it one short line, Inter 12.5px `#8ba4c4`, by game count: 0 → "Optional. Every past result makes your first lineups fairer."; 1–2 → "Every game you add makes your first lineups fairer."; 3–5 → "Good start. More games, fairer lineups."; 6–9 → "Plenty to start with. Add more if you have them."; 10+ → "Full confidence. Lineups run on real results."
- Right: a pill `min-width 64px`, `height 44px`, radius 8px, Plex Mono 20px 700 showing `20%` (10% per game, capped 100). Colour `#8ba4c4` (0–4 games), `#38bdf8` (5–9), `#bef264` (10+); pill bg/border are the same colour at `.12` / `.4` alpha.
- Below, `margin-top 16px`: 10 segments in a grid (`gap 3px`, `height 8px`, radius 2px), filled ones in the same colour, empty `#1b2c46`.
- Tick labels, `margin-top 6px`, Plex Mono 9px 700 `.12em`: `0` left, `3 · USEFUL` at 30%, `6 · GOOD` at 60%, `10 · FULL` right; a label lights to `#f4f9ff` once reached, otherwise `#4f688a`.

**Saved games list**, `margin-top 12px`, `gap 8px`. Each row mirrors the Results tab's `PlayedCard` header: `padding 12px 18px`, radius 12px, `#0a1421`, `1px solid #1b2c46`, hover border `#2c4a72`; left "Game 1" Space Grotesk 14px 700 and `8 OCT 2026 · 4V3` (Plex Mono 9.5px `.14em` uppercase `#6f88a8`; `5-A-SIDE` when even); right the `ResultChip` (`height 28px`, radius 4px, `TEAM A` sky / `TEAM B` violet / `DRAWN` grey, with the lime `+2` margin). Tapping a row opens the game modal in edit mode. No delete on the row.

Below the list a dashed button `height 50px`, radius 8px, `1px dashed #223a5c`, `#8ba4c4` 14px 700, lucide `plus`: "Add a game" / "Add another game" → opens the game modal with a fresh draft. Footnote, `margin-top 12px`, centred Inter 12.5px `#6f88a8`: "Each new game starts a week earlier with the last lineups in place, so you only move who changed."

Primary: "Import N games and finish" (disabled with 0 games; label "Import games and finish"). Secondary link "Skip for now" → Live with no import.

#### Game modal
Dialog `max-width 440px`, radius 14px, `#0a1421`, `1px solid #1b2c46`, shadow `0 34px 80px rgba(0,0,0,.65)`, scrim `rgba(3,7,16,.8)`, body scrolls, header and footer sticky (bg `#0c1728`). Header: "Game 3" Space Grotesk 15px 700, close `x` right. Sections separated by `1px #17263c`, each `padding 14px 14px 16px` with a Plex Mono 9px 700 `.18em` `#6f88a8` label:

- **DATE**: a 44px stepper (`44px 1fr 44px` grid, bg `#060b14`): chevrons either side, centre shows `8 Oct 2026` (Plex Mono 13px 700) over `THURSDAY` (8.5px `#4f688a`). Steps are **one week** on the league's match day; forward is disabled (`opacity .3`) past the most recent match day before today. A fresh draft starts one week before the oldest saved game (or the last match day if none).
- **LINEUPS**: the Lineup Lab pitch (bg `#060b14`, centre line + circle stroked `#132339`), two columns `gap 14px`, headers `TEAM A` `#7dd3fc` / `TEAM B` `#c4b5fd` with counts. Chips `padding 7px 10px`, radius 4px, left border 2px in the team colour, bg `rgba(8,47,73,.55)` / `rgba(46,16,101,.45)`, Inter 12px 600, a `×` to remove. Tap a chip to swap sides; chips are draggable between columns (column shows a dashed border in its colour while hovered: `rgba(56,189,248,.6)` / `rgba(167,139,250,.6)`). Empty column shows a dashed box "TAP A NAME BELOW".
- **PLAYERS** (right-aligned hint `TAP TO PICK · DRAG BETWEEN TEAMS`): the roster as 30px pills, radius 4px, Inter 12px 600, alphabetical; unassigned bg `#0a1421` border `#1b2c46` text `#cfe0f4`; in Team A sky tint, Team B violet tint. Tap toggles (adds to the smaller side, removes if assigned); draggable. Goalkeepers show a 🧤 after the name (as in Lineup Lab). Last pill is dashed "+ Add player" → opens `AddRosterPlayerModal` (name, strength, mentality, duplicate check) stacked above; the new player joins the roster and the smaller side.
- **RESULT**: three buttons `height 38px`, radius 4px, "Team A" / "Draw" / "Team B" (selected tints as above). Under them a 48px boxed row (`#0c1728`, `1px solid #1b2c46`): label left ("Pick a winner first" / "Team A won by" / "Margin · draw"), `− 2 +` stepper right (32px buttons). Dimmed to `.35` until a winner is picked; margin 1–20, 0 for a draw.
- **Footer**: "Save game" (`height 44px`, radius 6px, `1px solid #38bdf8`, bg `rgba(56,189,248,.12)`, `#7dd3fc` 14px 700; label becomes "Pick both teams to save" / "Pick a result to save" while disabled, "Save changes" when editing). When editing, "Delete game" sits to its left (`1px solid rgba(226,104,111,.4)`, `#e2686f`, hover `rgba(226,104,111,.12)`), 1fr 1fr.

Saving closes the modal and adds the row. Each new draft carries the previous game's lineups.

### 9. Live
No step eyebrow. Elements rise in sequence (`cfRise`: 14px up → 0, `.6s cubic-bezier(.2,.7,.2,1)`, delays .1/.2/.3/.4s). A one-shot confetti burst (42 pieces, 5–11px, brand colours `#bef264 #38bdf8 #a78bfa #f4f9ff #7dd3fc`, radiating from behind the logo over 1.4–2.3s, fading out) plays once on mount; respect `prefers-reduced-motion`.

- Pill, centred: `LEAGUE CREATED` with a pulsing 6px lime dot (lime border/tint as the restyle pills).
- H1, `margin-top 24px`, 38px 700 `-0.04em`, two lines: league name, then "is live." in `#bef264`.
- Sub: "{N games imported. }Week {N+1} is in the diary for Thursday 30 Oct."
- **Invite card**, `margin-top 32px`, radius 14px, `1px solid rgba(56,189,248,.45)`, shadow `0 18px 44px rgba(0,0,0,.42), 0 0 0 6px rgba(56,189,248,.06)`: eyebrow `ONE THING LEFT` (Plex Mono 9px `.2em` `#7dd3fc`), title "Get your players in" (20px 700), sub "{N} players on your roster, none of them in yet. One link to the group chat and they claim their names, see the table and get picked for Thursday."; the roster as dashed avatar chips (30px, `1px dashed #2c4a72`, 22px initials circle `#1b2c46`, first names); primary **"Share with the group"** `height 52px` with lucide `share` (uses `navigator.share` with the invite URL, falls back to copy); below it the invite URL in a mono box with an outline "Copy link" button (`min-width 88px`, label "Copied" for 1.6s); footnote "Anyone with the link joins, picks their name and their stats follow them. You can resend it any time from Settings."
- Outline button, `margin-top 20px`: "Go to {league name}" → `leagueLandingPath(slug)`.

Invite link comes from the existing open-invite API (`app/api/invites/route.ts`); create one at league creation so it is ready here.

## Backend
What exists and what to add (from the brief; nothing in `weeks`, `player_attributes`, `game_members`, `profiles` or `league_features` changes shape).

| Change | Type | Needed for |
|---|---|---|
| Rewrite `create_game(name, slug, location, day, kickoff_time, bio)` as SECURITY DEFINER: insert `games`, seed `league_features` from `lib/defaults.ts DEFAULT_FEATURES`, insert creator `game_members` (admin), create an open invite. The current one fails (no slug, stale flags) and nothing calls it. | RPC + `POST /api/games` | When |
| Stop regenerating the slug on rename | Route fix | Name |
| Batched roster write via existing `promote_roster` (+ `goalkeeper` boolean kept in sync with `mentality`) | None | Strength |
| Creator `player_claims` row (approved) | Insert | Strength |
| `import_weeks(p_game_id, p_weeks jsonb)` SECURITY DEFINER: validate, set `season` = year of date and `week` = 1..n per year in date order (renumber existing), insert `played` rows with `team_a/team_b` jsonb, `winner`, `goal_difference`, null ratings; upsert `player_attributes` for any new name | New RPC or service-role route | Results |
| Fees cut-off: `games.fees_from date` (set to creation date) and a filter in `lib/fees.ts` so imported weeks never show as debt | New column + filter | Results |
| `ensureUnrecordedWeek`: run import before the league's `day` is set, or delete stray `unrecorded` rows after import, so a backfilled quarter can complete | Ordering | Results |
| `get_unclaimed_players` to include roster-only names (so invited players can claim before the first game) | RPC tweak | Live |
| `claim_profile` to copy `first_name`/`last_name` | RPC fix | Account |
| 15-minute `kickoff_time` steps accepted by the details API | Validation | When |

## State
Client state across steps (post-creation steps can also re-read from the league):

```ts
{ step, authMode: 'new'|'existing', authStage: 'form'|'code', first, last, email, code,
  name, slug, bio, place: {name, address?} | null,
  day: 'Mon'…'Sun', time: 'HH:MM',
  players: { id, name, you?: boolean, m: Mentality, s: Strength }[],
  games: { id, date: 'YYYY-MM-DD', a: string[], b: string[], winner: 'A'|'B'|'D', margin: number }[],
  draft: same shape | null, editingId: string | null }
```

## Design tokens (used here)
Backgrounds `#030710` page, `#060b14` frame, `#0a1421` card, `#0c1728` raised, `#101d31` tile. Borders `#17263c` hairline, `#1b2c46` default, `#223a5c` control, `#2c4a72` hover. Text `#f4f9ff` primary, `#dff1ff` input, `#cfe0f4` secondary, `#8ba4c4` muted, `#6f88a8` helper, `#4f688a` faint. Accents: sky `#38bdf8` / `#7dd3fc`, lime `#bef264`, violet `#a78bfa` / `#c4b5fd`, red `#e2686f`, amber `#fbbf24`. Team tints: A `rgba(8,47,73,.6)`, B `rgba(46,16,101,.45)`. Radii 4 (chips, segments), 6 (inner controls), 8 (inputs, buttons, cards), 12 (game rows), 14 (dialogs), 16 (logo tile). Fonts: Space Grotesk (headings, buttons), Inter (body, inputs), IBM Plex Mono (labels, numbers).

## Files
- `Craft Football League Setup v3.dc.html` — the design (all 9 screens, both modals)
- `Craft Football League Setup v2.dc.html` — Entry points and Flow map screens only
- `assets/logo.png`, `fonts/` — as used by the prototype
- `support.js` — prototype runtime, not needed in the app
