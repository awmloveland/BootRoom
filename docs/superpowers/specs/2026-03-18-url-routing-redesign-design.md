# URL & Routing Redesign

**Date**: 2026-03-18
**Status**: Approved

## Problem Statement

BootRoom currently operates across two domains (`craft-football.com` and `m.craft-football.com`) with asymmetric URL patterns (`/results/[id]` for public, `/league/[id]` for members), a double-gated public access system (`public_results_enabled` + per-feature `public_enabled`), and a bloated middleware. The `/settings` page duplicates functionality from league settings, and there is no concept of a developer/platform tier above league admin.

## Goals

- Single domain (`craft-football.com`) for everything
- One URL per league page, rendering appropriately based on auth state
- Remove the redundant `public_results_enabled` master toggle
- Introduce a global Experiments panel for developer-controlled feature availability
- Simplify league settings to members + invite links
- Repurpose `/settings` as a genuine user account page
- Shrink middleware to ~40 lines with clear, simple rules

## Out of Scope

- Human-readable league slugs (deferred — slug-picker is a future feature)
- A proper "create league" UI (deferred — `/add-game` JSON import remains as developer-only tool)
- Per-league feature visibility control (deferred — all globally available features are on for all leagues by default for now)

---

## URL Structure

### New URL Tree (single domain)

```
/                               → Home (league list if signed in, public directory if not)
/sign-in                        → Sign in
/reset-password                 → Reset password
/profile-required               → Profile setup gate
/invite                         → Accept invite flow
/add-game                       → JSON import tool (developer only)
/settings                       → User account — display name, email, password
/experiments                    → Global feature flag management (developer only)

/[uuid]                         → Redirect → /[uuid]/results
/[uuid]/results                 → Match history (auth-aware: member or public view)
/[uuid]/players                 → Player stats (auth-aware: member or public view)
/[uuid]/settings                → League admin panel — members + invite link (admin only)
```

### What Disappears

- `m.craft-football.com` — all traffic consolidates to `craft-football.com`
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
├── invite/page.tsx
├── add-game/page.tsx               # Developer only
├── settings/page.tsx               # User account page
├── experiments/page.tsx            # Global feature flags (developer only)
├── [leagueId]/
│   ├── page.tsx                    # Redirect → /[leagueId]/results
│   ├── results/page.tsx            # Auth-aware results page
│   ├── players/page.tsx            # Auth-aware player stats page
│   └── settings/page.tsx          # League admin panel
└── auth/
    └── callback/route.ts
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
| `/[uuid]/settings` | authenticated + league admin/creator role |
| everything else | public (pages render based on auth state) |

### What Disappears

- All hostname detection and branching
- All internal path rewriting (`/league/[id]` → `/app/league/[id]`)
- The access key staging gate (replace with Vercel password protection)
- The `/website` root rewrite

Middleware shrinks from ~150 lines to ~40.

---

## Data Model Changes

### 1. Add `role` to `profiles`

```sql
ALTER TABLE profiles
  ADD COLUMN role text NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'developer'));
```

Set `developer` directly in Supabase for anyone needing Experiments access. No UI required.

### 2. Add `feature_experiments` table

```sql
CREATE TABLE feature_experiments (
  feature     text PRIMARY KEY,  -- matches FeatureKey
  available   boolean NOT NULL DEFAULT false,
  updated_by  uuid REFERENCES auth.users(id),
  updated_at  timestamptz DEFAULT now()
);
```

Seeded with one row per existing `FeatureKey`. Currently active features (`match_history`, `match_entry`, `team_builder`, `player_stats`) seeded as `available = true`. `player_comparison` seeded as `available = false`.

### 3. Remove `public_results_enabled` from `games`

```sql
ALTER TABLE games DROP COLUMN public_results_enabled;
```

Public discoverability is now derived: a league is publicly visible if any of its `league_features` rows have `public_enabled = true`.

### 4. `league_features` — no structural changes

Stays as-is. `enabled` and `public_enabled` per-feature columns continue to control per-league visibility, now gated upstream by `feature_experiments.available`.

---

## Feature Visibility Logic

```
Developer enables in Experiments   →  feature_experiments.available = true
League admin enables for members   →  league_features.enabled = true
League admin enables for public    →  league_features.public_enabled = true

Visible to member if:   available = true AND enabled = true
Visible to public if:   available = true AND public_enabled = true
Developer always sees:  all features regardless of flags
```

If `feature_experiments.available = false`, the feature is invisible app-wide. Existing `league_features` settings are preserved but dormant.

---

## Experiments Panel

**URL**: `/experiments`
**Access**: `profiles.role = 'developer'` only
**Entry point**: Icon button in navbar, only rendered for developer role

Displays one row per `FeatureKey` with a single on/off toggle controlling `feature_experiments.available`. Toggling off immediately hides the feature from all leagues app-wide.

---

## Settings Pages

### `/settings` — User Account (any authenticated user)

- Display name
- Email
- Password change

Invite creation and feature flag overview removed entirely.

### `/[uuid]/settings` — League Admin Panel (admin/creator only)

Two tabs:

- **Members**: view members, manage roles (unchanged)
- **Links**: generate admin invite link (unchanged, public results toggle removed)

Features tab removed. Per-league feature visibility is deferred — globally available features are on for all league members by default.

---

## Auth-Aware Page Rendering

`/[uuid]/results` and `/[uuid]/players` serve all visitors at the same URL. The page component resolves the viewer's role:

```
Unauthenticated          →  public tier  (public_enabled features only)
Authenticated, member    →  member tier  (enabled features)
Authenticated, admin     →  admin tier   (all features)
```

If the league has no public features enabled, unauthenticated visitors see a "nothing public here" state rather than a 404, preserving the URL for sharing once features are enabled.

---

## Navbar Changes

- Remove domain-switching logic
- Add Experiments icon button — visible only when `profiles.role = 'developer'`
- Settings icon links to `/[uuid]/settings` when on a league page, `/settings` otherwise
