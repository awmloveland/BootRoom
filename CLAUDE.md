# Craft Football — Agent Context

This file is the source of truth for any AI agent working on this codebase.
Read it in full before writing or editing any code.

---

## Project overview

**Craft Football** is a read-only match history browser for a private 5-a-side
league called *The Boot Room*. It is a dark-mode-first web app built with
Next.js 14. All data is static — there is no backend, no database, and no API.

Current state: **Phase 1 complete** (match history browser only).

---

## Tech stack — do not deviate from these

| Concern | Choice |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v3 |
| Components | shadcn/ui conventions + Radix UI primitives |
| Accordion | `@radix-ui/react-collapsible` |
| Icons | `lucide-react` |
| Class utility | `clsx` + `tailwind-merge` via `cn()` in `lib/utils.ts` |
| Data | Static JSON import — `data/boot_room.json` |
| Package manager | npm |
| Node version | v20 |

No new UI libraries, CSS-in-JS, or state management libraries should be added
without discussion. Do not install Redux, Zustand, styled-components, Framer
Motion, or similar.

---

## Repository structure

```
craft-football/
├── app/
│   ├── globals.css        # Tailwind base import only
│   ├── layout.tsx         # Root layout — Inter font, dark <body>
│   └── page.tsx           # Single route: / (match history)
├── components/
│   ├── Header.tsx         # Sticky site header
│   ├── MatchCard.tsx      # Collapsible played card + muted cancelled card
│   ├── TeamList.tsx       # Player name list for one team
│   └── WinnerBadge.tsx    # Result pill badge
├── data/
│   └── boot_room.json     # Static data source — do not rename or move
├── lib/
│   ├── types.ts           # All shared TypeScript types (canonical)
│   └── utils.ts           # cn(), sortWeeks(), getPlayedWeeks(), deriveSeason()
├── public/                # Static assets
├── CLAUDE.md              # This file
├── next.config.js         # Plain .js — Next.js 14.x does not support .ts config
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

New components go in `components/`. New utility functions go in `lib/utils.ts`.
New types go in `lib/types.ts`. Do not create `src/` directories.

---

## TypeScript types — use these exactly

Defined in `lib/types.ts`. Never redefine or shadow them locally.

```ts
export type Winner = 'teamA' | 'teamB' | 'draw' | null;
export type WeekStatus = 'played' | 'cancelled';

export interface Week {
  week: number;
  date: string;        // 'DD MMM YYYY'
  status: WeekStatus;
  format?: string;     // e.g. '7-a-side' — absent on cancelled weeks
  teamA: string[];     // empty array on cancelled weeks
  teamB: string[];     // empty array on cancelled weeks
  winner: Winner;      // null on cancelled weeks
  notes?: string;
}
```

---

## Data layer

- Single source: `data/boot_room.json`
- Imported directly: `import bootRoomData from '@/data/boot_room.json'`
- Cast on import: `bootRoomData.weeks as Week[]`
- Filter out any `status: 'scheduled'` weeks before rendering
- The JSON also contains `players` and `config` arrays for future phases —
  do not delete or mutate them

Current data: **25 weeks** (22 played + 3 cancelled at weeks 9, 14, 15).
Season: **2025–26** (Sep 2025 – Mar 2026).

---

## Colour palette — dark-mode first

The app uses Tailwind's `slate` scale as its base. Never use light backgrounds.

| Role | Tailwind token |
|---|---|
| Page background | `bg-slate-900` |
| Card background | `bg-slate-800` |
| Card border (default) | `border-slate-700` |
| Card border (open) | `border-slate-600` |
| Subtitle bar | `bg-slate-800/50` |
| Primary text | `text-slate-100` |
| Secondary text | `text-slate-400` |
| Muted text | `text-slate-500` / `text-slate-600` |

### Winner badge colours

| Result | Background | Text | Border |
|---|---|---|---|
| Team A | `bg-blue-900` | `text-blue-300` | `border-blue-700` |
| Team B | `bg-violet-900` | `text-violet-300` | `border-violet-700` |
| Draw | `bg-slate-700` | `text-slate-300` | `border-slate-600` |
| Cancelled | `bg-red-950` | `text-red-400` | `border-red-900` |

**Do not use green, yellow, or orange** for any badge or status indicator —
these colours carry strong pass/warning/error connotations in UI.

---

## Component conventions

### MatchCard

- Played weeks: collapsible via `@radix-ui/react-collapsible`
- Cancelled weeks: rendered as a separate non-interactive `CancelledCard`
  component inside the same file — muted (`opacity-60`), no chevron, no toggle
- Accordion behaviour (only one card open at a time) is managed by
  `openWeek` state in `page.tsx`, not inside the card itself
- The card header always shows: week number, date, format tag, Winner label + badge
- The expanded body shows: Team A list, Team B list, notes (if present)
- Cancelled cards show: week number, date, Cancelled badge — no notes

### WinnerBadge

- Accepts `winner: Winner` and optional `cancelled?: boolean`
- Returns `null` when `winner` is `null` and `cancelled` is false
- All styling via the `BADGE_CLASSES` / `BADGE_LABELS` lookup objects — add
  new variants there, not inline

### TeamList

- Purely presentational — receives `label: string` and `players: string[]`
- Team B label is always **"Team B"** throughout the UI (never "Team B (ibs)"
  or any other suffix)

---

## Page layout

```
┌─────────────────────────────────────┐
│  Sticky header (h-14)               │  ← Header.tsx
├─────────────────────────────────────┤
│  Season 2025–26  │  X of 52 Weeks   │  ← Subtitle bar (flex, space-between)
├─────────────────────────────────────┤
│  max-w-2xl, px-4 sm:px-6, py-4     │
│  ┌───────────────────────────────┐  │
│  │ Week 25 · 09 Mar · 7-a-side  │  │  ← MatchCard (collapsed)
│  │                Winner [Bdg] ⌄ │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │ Week 24 …                    │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

- Content max-width: `max-w-2xl` — do not widen this
- All content areas use `px-4 sm:px-6` horizontal padding
- Cards are in reverse-chronological order (week 25 first)
- The most recently played week is expanded by default on load

---

## Utility functions (lib/utils.ts)

```ts
cn(...inputs)            // clsx + tailwind-merge
sortWeeks(weeks)         // sorts descending by week number
getPlayedWeeks(weeks)    // filters to status === 'played'
deriveSeason(weeks)      // returns e.g. '2025–26' from date strings
```

---

## Key decisions (do not relitigate)

- **No backend** — data is a static JSON import. No fetch, no SWR, no React Query.
- **No routing** — Phase 1 is a single `/` route. Do not add pages or nav links.
- **`next.config.js` not `.ts`** — Next.js 14.2.x does not support a TypeScript
  config file; using `.js` with a JSDoc `@type` annotation.
- **Accordion state in page.tsx** — `openWeek: number | null` lives in the page,
  not in a context or store. Keep it there unless the component tree grows
  significantly.
- **No player pages** — player names in team lists are plain text, not links.
  Player detail views are out of scope for Phase 1.

---

## Out of scope (Phase 1)

Do not build any of the following unless explicitly requested:

- Player profile pages or stats tables
- Game creation / score entry UI
- League table or standings
- Authentication or user accounts
- Any write operations to the data file
- Navigation beyond the single `/` route
