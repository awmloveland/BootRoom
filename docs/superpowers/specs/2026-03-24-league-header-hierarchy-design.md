# League Header Visual Hierarchy — Design Spec

**Date:** 2026-03-24
**Status:** Approved
**Scope:** `components/LeaguePageHeader.tsx` and `components/LeagueInfoBar.tsx`

---

## Problem

The league header (title → progress → info bar → tabs) had uniform visual weight throughout. Nothing dominated, so the eye had no clear entry point. Everything competed equally for attention.

## Goal

Establish a clear typographic hierarchy: the league name is the dominant element; all supporting information steps progressively back using size, weight, and colour — no new structural elements or colours.

---

## Design Decisions

### Title
- Size: `text-3xl` (30px)
- Weight: `font-extrabold` (800)
- Tracking: `tracking-tight`
- Colour: `text-slate-100` (unchanged)

### Progress text (`X of Y weeks · Z% complete`)
- Size: `text-xs` (11–12px)
- Colour: `text-slate-500`
- Format: change `(35% complete)` to `· 35% complete` (dot separator, no parens)

### Settings gear icon
- Colour: `text-slate-500` (was `text-slate-400` implicitly via ghost button)

### Info bar — pills
- Size: `text-xs`
- Text colour: `text-slate-400`
- Background: `bg-slate-800`
- Border: `border-slate-800` (matches bg — subtle edge definition only)
- Corner radius: `rounded` (4px — tag-like, not capsule)
- Icons: Lucide stroke icons at 11×11px in place of emoji
  - Location → `MapPin`
  - Day/time → `Calendar` (combined into one pill, e.g. "Mondays 19:00")
  - Player count → `Users`
- **Day and kick-off time are merged into a single pill** — reduces pill count from 4 to 3

### Info bar — bio text
- Size: `text-xs`
- Colour: `text-slate-500`

### Tab bar
- Tab font size: `text-xs` (12px), `font-medium`
- Tab icons: `size-3` (12px — reduced from `size-4` to match the smaller text)
- Inactive colour: `text-slate-700`, hover `hover:text-slate-400`
- Active colour: `text-slate-200`, `border-slate-200` underline
- Border separator: `border-slate-700` (unchanged)

---

## Changes Required

### `components/LeaguePageHeader.tsx`
1. Increase title from `text-2xl font-semibold` → `text-3xl font-extrabold tracking-tight`
2. Update progress text: size `text-sm` → `text-xs`; colour `text-slate-500` (unchanged); format `(X% complete)` → `· X% complete`
3. Update gear icon colour: add `text-slate-500 hover:text-slate-400` to the `<Button>` wrapper — this sets both the resting and hover colour explicitly, preventing the ghost variant's default hover cascade from overriding it. The `<Settings>` icon inherits via `currentColor` and needs no additional class.
4. Reduce tab link size from `text-base` → `text-xs`; tab icons from `size-4` → `size-3`; inactive colour `text-slate-400` → `text-slate-700` with `hover:text-slate-400`; active colour `text-slate-100` → `text-slate-200`

### `components/LeagueInfoBar.tsx`
`buildLeagueInfoFacts` returns `string[]` with emoji baked in and is incompatible with Lucide icon requirements. It also only emits the day/time fact when *both* `day` and `kickoff_time` are set, whereas this design requires the pill to appear when *either* is set. For both reasons, **do not use `buildLeagueInfoFacts` for the filled state.** Instead, inline the pill rendering directly in `LeagueInfoBar.tsx`:

1. Import `MapPin`, `Calendar`, `Users` from `lucide-react`
2. Build pills inline from `details` props:
   - Location pill (`MapPin`): render if `details.location` is set
   - Day/time pill (`Calendar`): render if `details.day` or `details.kickoff_time` is set
     - Both set → `"${details.day} ${details.kickoff_time}"`
     - Day only → `details.day`
     - Kick-off only → `details.kickoff_time`
   - Player count pill (`Users`): render if `details.player_count` is set; label as `"${details.player_count} players"`
3. Pill styles: `inline-flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800 border border-slate-800 rounded px-2 py-0.5`
   - Note: `border-slate-800` matches `bg-slate-800` — this is intentional; the border provides no visible edge but satisfies the border box model consistently
4. Icons: `className="size-[11px]"` on each Lucide icon
5. Bio text: `text-xs text-slate-500` (was `text-sm text-slate-400`)
6. `buildLeagueInfoFacts` and `isLeagueDetailsFilled` remain in `lib/utils.ts` unchanged — the former is simply no longer called from `LeagueInfoBar`, the latter is still used for the empty-state guard
7. `isLeagueDetailsFilled` does not check `player_count` — this is intentional and correct. A league with only `player_count` set (no location, day, kickoff, or bio) correctly renders the empty-state admin prompt, not a single player-count pill.
8. `buildLeagueInfoFacts` retains a known gap: it only emits the day/time fact when *both* fields are set. This is accepted — the function is no longer called from `LeagueInfoBar` and no other caller renders pills, so the gap has no user-facing impact.

### `lib/utils.ts`
No changes required.

---

## What Is Not Changing

- Page layout, max-width, spacing between sections
- Tab bar structure (underline indicator style kept, just colour/size adjusted)
- Admin empty-state prompt in `LeagueInfoBar`
- Feature flag gating — no behaviour changes, purely visual
