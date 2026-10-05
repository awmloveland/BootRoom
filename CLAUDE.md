# BootRoom — Agent Context

This file is the source of truth for any AI agent working on this codebase.
Read it in full before writing or editing any code.

---

## Project overview

**BootRoom** is a private, invite-only league management platform for 5-a-side to 7-a-side football leagues called *The Boot Room*. It is a dark-mode-first web app built with Next.js 16 and Supabase. Members can view match history, player statistics, and league tables. Admins can manage invites, record game results, and control which features are visible to members and the public.

Deployed on a single domain: `craft-football.com` — public marketing pages, public league pages, and the authenticated member app all live here. `m.craft-football.com` redirects to `craft-football.com`.

---

## Tech stack — do not deviate from these

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router), React 19 |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 (CSS-first config in `app/globals.css`, no `tailwind.config`) |
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
│   │   └── add-game/         # Create a new league
│   ├── invite/               # Invite accept page (consumes ?token=)
│   ├── api/                  # API routes
│   └── globals.css           # Tailwind import, theme tokens, font utilities
├── components/
│   ├── ui/                   # Base UI primitives (button, input, navbar…)
│   ├── FeaturePanel.tsx      # Feature flag management UI (admin only)
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
├── proxy.ts                  # Auth + routing (Next 16's renamed middleware)
├── CLAUDE.md                 # This file
└── next.config.js            # Plain .js config (see Key decisions)
```

New components go in `components/`. New utility functions go in `lib/utils.ts`.
New types go in `lib/types.ts`. Do not create `src/` directories.

---

## Feature Development Standard

**All new features must be built behind an admin-controlled feature flag.**

Each feature has two independent toggles controlled by the admin:

| Toggle | Column | Who it affects |
|---|---|---|
| Members enabled | `enabled` | All signed-in league members |
| Public enabled | `public_enabled` | Anyone with the public league link |

Admins always bypass feature flag checks — they see every feature regardless of either toggle.

**Rules:**
1. Every new feature starts with `enabled: false, public_enabled: false`. Admins see it immediately; members and public do not.
2. Promote to members by toggling **enabled** on in Settings → Features → Members tab.
3. Promote to public by toggling **public_enabled** on in Settings → Features → Public tab.
4. Each tier can have independent config (e.g. different visible stat columns for public vs members).
5. To add a new feature: add a `FeatureKey` to `lib/types.ts`, add a `DEFAULT_FEATURES` entry in `app/api/league/[id]/features/route.ts`, wire it into `FeaturePanel.tsx`, and write a migration to seed the row.
6. Use `isFeatureEnabled(features, key, resolveVisibilityTier(userRole))` from `lib/features.ts` to gate UI.

See **`docs/FEATURE_FLAGS.md`** for the full step-by-step guide.

---

## Styling approach — Tailwind utility classes only

**All styling is done exclusively with Tailwind CSS utility classes.**

- Do not create `.css` or `.module.css` files (beyond the existing `globals.css`,
  which holds the Tailwind import, `@theme` tokens and the font utilities)
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
export type FeatureKey =
  | 'match_history'
  | 'match_entry'
  | 'player_stats'
  | 'player_comparison'
  | 'quarter_celebration';

export interface LeagueFeature {
  feature: FeatureKey;
  enabled: boolean;               // whether members can access this feature
  config?: FeatureConfig | null;  // member-tier config (columns, limits, etc.)
  public_enabled: boolean;        // whether public visitors can access this feature
  public_config?: FeatureConfig | null; // public-tier config (may differ from member config)
  // Admins always have full access regardless of these settings
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

- **Proxy** (`proxy.ts`, Next 16's name for middleware) handles routing and session/profile checks
- All `/app/*` routes require a valid Supabase session with a `profiles` row
- Unauthenticated → redirect to `/sign-in?redirect=...`
- Authenticated but no profile → redirect to `/profile-required`
- Per-league roles are stored in `game_members` (columns: `game_id`, `user_id`, `role`)
- `GameRole`: `creator | admin | member`
  - `creator` and `admin` → admin visibility tier
  - `member` → member visibility tier
  - Not a member / unauthenticated → public visibility tier

---

## Environment variables

Set in `.env.local` for local dev (which points at the production Supabase
project) and in Vercel → Project → Settings → Environment Variables for
deploys. `.env.example` lists them with placeholders. Never commit real values.

| Variable | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public | Supabase client key (either name works) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Service-role client (`lib/supabase/service`) and data scripts |
| `RESEND_API_KEY` | Server only | Transactional email |
| `APP_ACCESS_KEY` / `NEXT_PUBLIC_ACCESS_KEY_MODE` | Mixed | Optional production lock behind a secret URL key |
| `SHARE_SIGNING_SECRET` | Server only | HMAC key for signed line-up share links and their preview images (see `docs/superpowers/specs/2026-10-05-lineup-share-preview-image-design.md`). Missing → Share falls back to the plain league link and previews render the generic card. Rotating it invalidates every previously shared preview. |

Server-only variables must never be prefixed `NEXT_PUBLIC_` or read in client
components.

---

## Colour palette — dark-mode first

The app shares the landing page's look: a deep navy base with sky, violet and
lime accents. Colours are written as Tailwind arbitrary hex values
(`bg-[#0a1421]`), matching `components/landing/`. Never use light backgrounds.

| Role | Value |
|---|---|
| Page background | `#060b14` |
| Card background | `#0a1421` |
| Card header band / input background | `#0c1728` |
| Card border (default) | `#1b2c46` |
| Card border (open) | `#2c4a72` |
| Hairline divider | `#17263c` |
| Button / control border | `#223a5c` |
| Primary text | `#f4f9ff` |
| Secondary text | `#8ba4c4` |
| Muted text | `#6f88a8` / `#4f688a` |
| Primary accent (CTAs, Team A, wins) | `#38bdf8` (hover `#7dd3fc`, text on it `#05101d`) |
| Team B accent | `#a78bfa` (text `#c4b5fd`) |
| Champion / positive status | `#bef264` |
| Destructive / losses | `#e2686f` |

Cards are `rounded-xl` with `shadow-[0_18px_44px_rgba(0,0,0,.42)]` when open or
featured; buttons and inputs use `rounded` (4px).

### Typography

Three font utilities are defined in `app/globals.css`:

| Utility | Font | Used for |
|---|---|---|
| `font-grotesk` (body default) | Space Grotesk | Headings, card titles, buttons |
| `font-plex` | IBM Plex Mono | Uppercase labels, badges, meta lines, numbers |
| `font-inter-body` | Inter | Player names, body copy, inputs |

Labels are written in normal case in JSX and uppercased with the `uppercase`
class, so tests and screen readers keep the original text.

### Winner badge colours

| Result | Background | Text | Border |
|---|---|---|---|
| Team A | `bg-[#38bdf8]/12` | `text-[#7dd3fc]` | `border-[#38bdf8]/40` |
| Team B | `bg-[#a78bfa]/12` | `text-[#c4b5fd]` | `border-[#a78bfa]/40` |
| Draw | transparent | `text-[#8ba4c4]` | `border-[#223a5c]` |
| Cancelled | `bg-[#e2686f]/12` | `text-[#e2686f]` | `border-[#e2686f]/40` |

**Do not use green, yellow, or orange** for result badges. Lime (`#bef264`) is
reserved for champion treatments and positive status (e.g. a linked player).

### Copy

All copy in British English. Never use em dashes in UI copy; use commas,
colons, full stops, or the `·` dot separator.

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

### FeaturePanel

- Renders per-feature rows with an enabled toggle and a visibility selector
- Visibility selector lets admins promote a feature: `admin_only` → `members` → `public`
- Calls `PATCH /api/league/[id]/features` on any change
- Admins always bypass feature checks — the panel shows all features regardless

---

## Key decisions (do not relitigate)

- **Supabase** for auth and data. No alternative auth providers. No ORMs.
- **`next.config.js` not `.ts`** — chosen when the app was on Next.js 14.2.x,
  which did not support a TypeScript config file. Next 16 does, but keep the
  `.js` file with its JSDoc `@type` annotation; there is no need to convert it.
- **Feature flags** — all new features start at `admin_only`. Promote via the UI, not code.
- **No player profile pages** — player detail views are not in scope yet.
- **Max-width `max-w-2xl`** — do not widen the content column.
- **Single domain** — everything runs on `craft-football.com`. `m.craft-football.com` permanently redirects there via `vercel.json`.
- **Public routing** — public league pages live at `/results/[id]`. Feature-level access is controlled per-feature via `public_enabled` on `league_features`.
