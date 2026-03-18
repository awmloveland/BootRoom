# URL & Routing Redesign

**Date**: 2026-03-18
**Status**: Draft

## Problem Statement

BootRoom currently operates across two domains (`craft-football.com` and `m.craft-football.com`) with asymmetric URL patterns (`/results/[id]` for public, `/league/[id]` for members), a double-gated public access system (`public_results_enabled` + per-feature `public_enabled`), and complex host-based middleware. The `/settings` page duplicates functionality from league settings, and there is no concept of a developer/platform tier above league admin.

## Goals

- Single domain (`craft-football.com`) for everything
- One URL per league page, rendering appropriately based on auth state
- Remove the redundant `public_results_enabled` master toggle
- Introduce a global Experiments panel for developer-controlled feature availability
- Simplify league settings to members + invite links
- Repurpose `/settings` as a genuine user account page
- Simplify middleware to clear, single-domain auth rules

## Out of Scope

- Human-readable league slugs (deferred — slug-picker is a future feature)
- A proper "create league" UI (deferred — `/add-game` JSON import remains as developer-only scratchpad indefinitely until a proper creation flow is built)
- Per-league feature visibility control (deferred — all globally available features are on for all league members by default for now)

---

## URL Structure

### New URL Tree (single domain)

```
/                               → Home (league list if signed in, public directory if not)
/sign-in                        → Sign in
/reset-password                 → Reset password
/profile-required               → Profile setup gate
/invite                         → Accept invite flow (public, sign-in handled inline)
/add-game                       → JSON import tool (developer only, temporary)
/settings                       → User account — display name, email, password
/experiments                    → Global feature flag management (developer only)

/[uuid]                         → Redirect → /[uuid]/results
/[uuid]/results                 → Match history (auth-aware: member or public view)
/[uuid]/players                 → Player stats (auth-aware: member or public view)
/[uuid]/settings                → League admin panel — members + invite link (admin only)
```

### What Disappears

- `m.craft-football.com` — all traffic consolidates to `craft-football.com`. DNS for `m.craft-football.com` should be configured to redirect (301) to `craft-football.com` after deployment.
- `/league/[id]` — replaced by `/[uuid]/results`
- `/results/[id]` — replaced by `/[uuid]/results`
- Internal `/app/` path rewriting — gone

---

## File & Directory Structure

### New Structure

```
app/
├── layout.tsx                      # Root layout (navbar, auth-aware)
├── page.tsx                        # Home
├── sign-in/page.tsx
├── reset-password/page.tsx
├── profile-required/page.tsx
├── invite/page.tsx                 # Public; handles sign-in inline if needed
├── add-game/page.tsx               # Developer only (temporary)
├── settings/page.tsx               # User account page
├── experiments/page.tsx            # Global feature flags (developer only)
├── not-found.tsx                   # Default 404 for invalid routes/UUIDs
├── [leagueId]/
│   ├── page.tsx                    # Redirect → /[leagueId]/results
│   ├── results/page.tsx            # Auth-aware results page
│   ├── players/page.tsx            # Auth-aware player stats page
│   └── settings/page.tsx          # League admin panel
└── auth/
    └── callback/route.ts           # Unchanged — Supabase magic link handler
```

### Directories Deleted

```
app/app/          # Entire authenticated member route tree — gone
app/website/      # Merged into app/page.tsx
app/results/      # Replaced by app/[leagueId]/results/
```

### API Routes

Structurally unchanged. Internal path rewriting is removed so routes are called directly. One addition:

```
app/api/experiments/route.ts    # GET/PATCH global feature availability
```

---

## Middleware

### Rules

| Path | Requirement |
|---|---|
| `/add-game` | `profiles.role = 'developer'` |
| `/experiments` | `profiles.role = 'developer'` |
| `/settings` | authenticated |
| `/[uuid]/settings` | authenticated + league admin/creator role for that league (checked via `game_members` table) |
| `/invite` | public — no auth required at middleware level; the page handles sign-in inline |
| `/profile-required` | public — reached via redirect, no pre-auth needed |
| everything else | public (pages render based on auth state) |

### What Disappears

- All hostname detection and branching
- All internal path rewriting (`/league/[id]` → `/app/league/[id]`)
- The access key staging gate (replace with Vercel password protection or equivalent)
- The `/website` root rewrite

### Invalid League UUIDs

If a `[uuid]` segment does not correspond to a real league, the results/players pages call `notFound()`, which renders the root `not-found.tsx`. No special middleware handling needed.

---

## Data Model Changes

### 1. Add `role` to `profiles`

```sql
ALTER TABLE profiles
  ADD COLUMN role text NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'developer'));
```

**Bootstrapping**: After the migration runs, elevate the relevant user(s) directly in Supabase:
```sql
UPDATE profiles SET role = 'developer' WHERE email = 'your@email.com';
```
No UI is provided for this. Developer role assignment is a manual, intentional act via the Supabase dashboard.

### 2. Add `feature_experiments` table

```sql
CREATE TABLE feature_experiments (
  feature     text PRIMARY KEY,  -- matches FeatureKey in lib/types.ts
  available   boolean NOT NULL DEFAULT false,
  updated_by  uuid REFERENCES auth.users(id),
  updated_at  timestamptz DEFAULT now()
);
```

**Seeded in the same migration** with one row per existing `FeatureKey`. Currently active features seeded as `available = true`; unreleased features as `available = false`:

```sql
INSERT INTO feature_experiments (feature, available) VALUES
  ('match_history',     true),
  ('match_entry',       true),
  ('team_builder',      true),
  ('player_stats',      true),
  ('player_comparison', false);
```

The list of valid features is defined in `lib/types.ts` as `FeatureKey`. The `feature_experiments` table is always kept in sync with that type — adding a new `FeatureKey` requires a migration to insert the corresponding row.

### 3. Remove `public_results_enabled` from `games`

```sql
ALTER TABLE games DROP COLUMN public_results_enabled;
```

**Migration path**: Before dropping the column, any league with `public_results_enabled = true` should retain its public visibility. This is preserved automatically because `league_features.public_enabled` per-feature flags are unchanged — leagues that were previously public had those flags set, and they continue to drive public visibility. No data migration of values is needed; dropping the column simply removes a now-redundant gate.

### 4. `league_features` — no structural changes

Stays as-is. The `enabled` column controls per-league member visibility; `public_enabled` controls per-league public visibility. Both are now gated upstream by `feature_experiments.available`. Importantly, `league_features` rows are **per-league** — each league independently controls whether a globally available feature is shown to their members and public visitors.

---

## Feature Visibility Logic

```
Developer enables in Experiments   →  feature_experiments.available = true  (global)
League admin enables for members   →  league_features.enabled = true         (per-league)
League admin enables for public    →  league_features.public_enabled = true  (per-league)

Visible to member if:   feature_experiments.available = true AND league_features.enabled = true
Visible to public if:   feature_experiments.available = true AND league_features.public_enabled = true
Developer always sees:  all features regardless of flags
```

**Power relationship**: `feature_experiments.available` is a global kill switch. If a developer turns it off, the feature disappears for all leagues immediately — regardless of what individual league admins have set. League admin settings are preserved in the database but dormant until the feature is re-enabled globally. This is intentional: Experiments represents the developer shipping/unshipping features, not league admins.

---

## Experiments Panel

**URL**: `/experiments`
**Access**: `profiles.role = 'developer'` only
**Entry point**: Icon button in navbar, rendered only for developer role

Displays one row per `FeatureKey` with a single on/off toggle controlling `feature_experiments.available`. Toggling off immediately hides the feature from all leagues app-wide.

**Relationship to roles**: A user can be both a developer (`profiles.role = 'developer'`) and a league admin (role in `game_members`). These are orthogonal — developer is a platform-level role, admin is a league-level role. A developer who is also a league admin sees both the Experiments icon in the navbar and the league settings link when on a league page.

---

## Settings Pages

### `/settings` — User Account (any authenticated user)

- Display name
- Email
- Password change

Invite creation and feature flag overview removed entirely from this page.

### `/[uuid]/settings` — League Admin Panel (admin/creator only)

**Access**: Determined by the `game_members` table — user must have `role IN ('creator', 'admin')` for the given `game_id`. Middleware performs this check by querying `game_members`.

Two tabs:

- **Members**: view members, manage roles (unchanged)
- **Links**: generate admin invite link (unchanged; public results toggle removed)

Features tab removed. Per-league feature visibility is deferred.

---

## Auth-Aware Page Rendering

`/[uuid]/results` and `/[uuid]/players` serve all visitors at the same URL. The page component resolves the viewer's role at render time using the existing `resolveVisibilityTier()` helper in `lib/roles.ts`:

```
Unauthenticated          →  public tier  (public_enabled features only)
Authenticated, member    →  member tier  (enabled features)
Authenticated, admin     →  admin tier   (all features)
```

**"Nothing public" state**: If the league exists but has no features with `public_enabled = true`, unauthenticated visitors see a consistent empty state: league name visible, a message such as "This league hasn't made any content public yet", and a sign-in prompt. This is a shared component (`<LeaguePrivateState />`) used by both `/[uuid]/results` and `/[uuid]/players`. It is not a 404 — the league exists, it just has no public content.

Invalid league UUIDs (league does not exist) render the default `not-found.tsx` via `notFound()`.

---

## Navbar Changes

- Remove domain-switching logic
- Add Experiments icon button — rendered only when `profiles.role = 'developer'`
- Settings icon behaviour:
  - On a league page (`/[uuid]/*`) → links to `/[uuid]/settings`
  - On all other pages (including `/experiments`, `/add-game`, `/invite`, etc.) → links to `/settings`
- Pages that do not render the full navbar (`/sign-in`, `/reset-password`, `/profile-required`, `/invite`) are unaffected by these changes
