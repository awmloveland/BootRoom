# BootRoom — Agent Context

This file is the source of truth for any AI agent working on this codebase.
Read it in full before writing or editing any code.

---

## Project overview

**BootRoom** is a private, invite-only league management platform for 5-a-side to 7-a-side football leagues called *The Boot Room*. It is a dark-mode-first web app built with Next.js 14 and Supabase. Members can view match history, player statistics, and league tables. Admins can manage invites, record game results, and control which features are visible to members and the public.

Deployed on two domains:
- `craft-football.com` — public marketing site
- `m.craft-football.com` — authenticated member app

---

## Tech stack — do not deviate from these

| Concern | Choice |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v3 |
| Components | shadcn/ui conventions + Radix UI primitives |
| Icons | `lucide-react` |
| Class utility | `clsx` + `tailwind-merge` via `cn()` in `lib/utils.ts` |
| Auth + DB | Supabase (Auth + PostgreSQL + RLS) |
| Package manager | npm |
| Node version | v20 |

No new UI libraries, CSS-in-JS, or state management libraries should be added
without discussion. Do not install Redux, Zustand, styled-components, Framer
Motion, or similar.

---

## Repository structure

```
BootRoom/
├── app/
│   ├── app/                  # Authenticated member routes
│   │   ├── layout.tsx        # App shell (navbar)
│   │   ├── page.tsx          # / — league list
│   │   ├── league/[id]/      # League home, players, settings
│   │   ├── settings/         # User settings + invite admin
│   │   ├── invite/           # Invite accept flow
│   │   └── add-game/         # Create a new league
│   ├── website/              # Public marketing pages (craft-football.com)
│   ├── api/                  # API routes
│   └── globals.css           # Tailwind base import only
├── components/
│   ├── ui/                   # Base UI primitives (button, input, navbar…)
│   ├── AdminFeaturePanel.tsx # Feature flag management UI (admin only)
│   ├── AdminMemberTable.tsx  # Member management UI (admin only)
│   ├── MatchCard.tsx         # Collapsible match result card
│   ├── TeamList.tsx          # Player name list for one team
│   └── WinnerBadge.tsx       # Result pill badge
├── lib/
│   ├── types.ts              # All shared TypeScript types (canonical)
│   ├── utils.ts              # cn(), sortWeeks(), getPlayedWeeks(), deriveSeason()
│   ├── roles.ts              # resolveVisibilityTier() — maps GameRole → VisibilityTier
│   ├── features.ts           # isFeatureEnabled() — checks feature against visibility tier
│   ├── data.ts               # fetchGames(), fetchWeeks(), fetchPlayers()
│   └── supabase/             # Supabase client helpers (client, server, service)
├── supabase/migrations/      # SQL migrations — run in order via Supabase SQL Editor
├── scripts/                  # Data migration and automation scripts
├── docs/
│   └── FEATURE_FLAGS.md      # Feature flag development standard
├── middleware.ts              # Auth + host-based routing
├── CLAUDE.md                 # This file
└── next.config.js            # Plain .js — Next.js 14.x does not support .ts config
```

New components go in `components/`. New utility functions go in `lib/utils.ts`.
New types go in `lib/types.ts`. Do not create `src/` directories.

---

## Feature Development Standard

**All new features must be built behind an admin-controlled feature flag.**

The three visibility tiers, in promotion order:

| Tier | Value | Who can see it |
|---|---|---|
| Admin only | `admin_only` | League creators and admins only |
| Members | `members` | All signed-in league members |
| Public | `public` | Anyone with the league link *(routing coming soon)* |

**Rules:**
1. Every new feature starts at `admin_only`. Build it, test it as an admin, then promote when stable.
2. Promote by changing the `visibility` field in league Settings → Features tab — no code change needed.
3. Admins always bypass feature flag checks — they see every feature regardless of visibility.
4. To add a new feature: add a `FeatureKey` value to `lib/types.ts`, add a `FEATURE_META` entry in `AdminFeaturePanel.tsx`, and add a `DEFAULT_FEATURES` entry in `app/api/league/[id]/features/route.ts` with `enabled: false, visibility: 'admin_only'`.
5. Use `isFeatureEnabled(features, key, resolveVisibilityTier(userRole))` from `lib/features.ts` to gate UI.

See **`docs/FEATURE_FLAGS.md`** for the full step-by-step guide.

---

## Styling approach — Tailwind utility classes only

**All styling is done exclusively with Tailwind CSS utility classes.**

- Do not create `.css` or `.module.css` files (beyond the existing `globals.css`
  which contains only the three Tailwind base directives)
- Do not use CSS-in-JS (no `style` props for layout/colour, no styled-components)
- Do not add any third-party component libraries (no MUI, Chakra, Ant Design, etc.)
- Conditional or merged classes must use the `cn()` helper from `lib/utils.ts`,
  which combines `clsx` and `tailwind-merge` to handle conflicts correctly:

```ts
import { cn } from '@/lib/utils'

// good
<div className={cn('rounded-lg border', isOpen && 'border-slate-600')} />

// bad — string concatenation breaks tailwind-merge deduplication
<div className={`rounded-lg border ${isOpen ? 'border-slate-600' : ''}`} />
```

shadcn/ui is the reference for component patterns and Radix UI primitive
usage, but components are written by hand using Tailwind classes rather than
copied wholesale from the shadcn registry. Follow the same patterns already
established in `components/` when adding new components.

---

## TypeScript types — use these exactly

Defined in `lib/types.ts`. Never redefine or shadow them locally.

```ts
export type FeatureVisibility = 'admin_only' | 'members' | 'public';

export type FeatureKey =
  | 'match_entry'
  | 'team_builder'
  | 'player_stats'
  | 'player_comparison';

export interface LeagueFeature {
  feature: FeatureKey;
  enabled: boolean;
  visibility: FeatureVisibility;
  config?: FeatureConfig | null;
}

export type GameRole = 'creator' | 'admin' | 'member';

export interface LeagueMember {
  user_id: string;
  email: string;
  display_name: string | null;
  role: GameRole;
  joined_at: string;
}
```

---

## Auth and access model

- **Middleware** (`middleware.ts`) handles host-based routing and session/profile checks
- All `/app/*` routes require a valid Supabase session with a `profiles` row
- Unauthenticated → redirect to `/sign-in?redirect=...`
- Authenticated but no profile → redirect to `/profile-required`
- Per-league roles are stored in `game_members` (columns: `game_id`, `user_id`, `role`)
- `GameRole`: `creator | admin | member`
  - `creator` and `admin` → admin visibility tier
  - `member` → member visibility tier
  - Not a member / unauthenticated → public visibility tier

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
  `openWeek` state in the page, not inside the card itself

### WinnerBadge

- Accepts `winner: Winner` and optional `cancelled?: boolean`
- Returns `null` when `winner` is `null` and `cancelled` is false
- All styling via the `BADGE_CLASSES` / `BADGE_LABELS` lookup objects — add
  new variants there, not inline

### TeamList

- Purely presentational — receives `label: string` and `players: string[]`
- Team B label is always **"Team B"** throughout the UI

### AdminFeaturePanel

- Renders per-feature rows with an enabled toggle and a visibility selector
- Visibility selector lets admins promote a feature: `admin_only` → `members` → `public`
- Calls `PATCH /api/league/[id]/features` on any change
- Admins always bypass feature checks — the panel shows all features regardless

---

## Key decisions (do not relitigate)

- **Supabase** for auth and data. No alternative auth providers. No ORMs.
- **`next.config.js` not `.ts`** — Next.js 14.2.x does not support a TypeScript
  config file; using `.js` with a JSDoc `@type` annotation.
- **Feature flags** — all new features start at `admin_only`. Promote via the UI, not code.
- **No player profile pages** — player detail views are not in scope yet.
- **Max-width `max-w-2xl`** — do not widen the content column.
- **Public routing** — middleware currently requires auth for all app routes. Public-tier
  routing (unauthenticated league views) is a planned follow-on task; the type system is ready.
