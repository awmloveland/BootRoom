# Feature Flag Development Standard

All new features in BootRoom are built behind an admin-controlled feature flag. This lets us ship safely: admins test first, then roll out to members, then optionally open to the public — all without a code deploy.

---

## Why this pattern exists

- **Safe staging** — admins can use and validate a feature before members see it
- **Zero downtime rollouts** — promote a feature with a click, not a deployment
- **Per-league control** — each league controls its own feature set independently
- **Reversible** — a feature can be pulled back to `admin_only` at any time

---

## The three visibility tiers

```
admin_only  →  members  →  public
   (new)       (stable)    (open)
```

| Value | Who can access |
|---|---|
| `admin_only` | League creators and admins only. This is the default for every new feature. |
| `members` | All signed-in league members (plus admins). Enable when a feature is stable. |
| `public` | Anyone with the league link, including unauthenticated visitors *(routing coming soon)*. |

Admins always bypass the visibility check entirely — they see every feature in every state.

---

## Where flags are stored

Flags live in the `league_features` table in Supabase:

| Column | Type | Notes |
|---|---|---|
| `game_id` | uuid | The league this flag belongs to |
| `feature` | text | Matches a `FeatureKey` value |
| `enabled` | boolean | On/off toggle |
| `visibility` | text | `admin_only`, `members`, or `public` |
| `config` | jsonb | Optional per-feature config (e.g. `max_players`, `visible_stats`) |

Rows are upserted on conflict `(game_id, feature)`. Missing rows fall back to `DEFAULT_FEATURES` in the API route, so every league always sees a full feature list even before any row exists in the DB.

---

## How flags are read at runtime

1. Pages fetch `/api/league/[id]/features` — returns the full feature list for that league, merged with defaults.
2. Call `resolveVisibilityTier(userRole)` from `lib/roles.ts` to convert the user's `GameRole` (or `null` for unauthenticated) into a `VisibilityTier`.
3. Call `isFeatureEnabled(features, key, tier)` from `lib/features.ts` to gate UI.

```ts
import { isFeatureEnabled } from '@/lib/features'
import { resolveVisibilityTier } from '@/lib/roles'

const tier = resolveVisibilityTier(userRole)  // 'admin' | 'member' | 'public'
const canSeeTeamBuilder = isFeatureEnabled(features, 'team_builder', tier)
```

---

## How to add a new feature flag

### Step 1 — Add the key to `lib/types.ts`

```ts
export type FeatureKey =
  | 'match_entry'
  | 'team_builder'
  | 'player_stats'
  | 'player_comparison'
  | 'team_builder';  // ← add your new key here
```

### Step 2 — Add metadata to `AdminFeaturePanel.tsx`

```ts
const FEATURE_META: Record<FeatureKey, { label: string; description: string }> = {
  // existing entries…
  team_builder: {
    label: 'Team Builder',
    description: 'Members can use the team builder tool on the players page.',
  },
}
```

Also add the key to the rendered list inside the component.

### Step 3 — Add a default entry to `app/api/league/[id]/features/route.ts`

```ts
const DEFAULT_FEATURES = [
  // existing entries…
  {
    feature: 'team_builder' as FeatureKey,
    enabled: false,          // off by default
    visibility: 'admin_only' as const,  // always start here
    config: null,
  },
]
```

**Always use `enabled: false` and `visibility: 'admin_only'` for new features.**

### Step 4 — Gate your UI

In the page or component that renders the feature:

```ts
const tier = resolveVisibilityTier(userRole)
const teamBuilderEnabled = isFeatureEnabled(features, 'team_builder', tier)

{teamBuilderEnabled && <TeamBuilderPanel … />}
```

### Step 5 — Test as admin, then promote

1. Deploy. Only admins see the feature.
2. Test thoroughly in the real league environment.
3. When ready: open league Settings → Features → change visibility from `Admin only` to `Members`.
4. If appropriate: promote further to `Public` (once public routing is live).

---

## Example: adding a hypothetical "team_builder" feature end-to-end

**`lib/types.ts`**
```ts
export type FeatureKey =
  | 'match_entry'
  | 'team_builder'      // ← added
  | 'player_stats'
  | 'player_comparison';
```

**`app/api/league/[id]/features/route.ts`**
```ts
const DEFAULT_FEATURES = [
  { feature: 'match_entry',       enabled: true,  visibility: 'members',     config: null },
  { feature: 'team_builder',      enabled: false, visibility: 'admin_only',  config: null },  // ← new
  { feature: 'player_stats',      enabled: true,  visibility: 'members',     config: { … } },
  { feature: 'player_comparison', enabled: false, visibility: 'admin_only',  config: null },
]
```

**`components/AdminFeaturePanel.tsx`** — add to `FEATURE_META` and the render list.

**Usage in a page**
```ts
const tier = resolveVisibilityTier(game.role)
const showBuilder = isFeatureEnabled(features, 'team_builder', tier)
```

---

## Promotion flow (no code required)

Once a feature is deployed as `admin_only`, admins can promote it from the league settings UI:

```
League → Settings → Features tab
  [Team Builder]  [Admin only ▾]  [●  Enabled]
                  → change to Members
                  → change to Public
```

The change takes effect immediately for all users of that league. No deployment needed.

---

## Out of scope (follow-on task): public routing

The `public` visibility tier is fully typed and flaggable, but unauthenticated access to league routes requires:

1. Middleware changes — allow `/league/:id` through without a session
2. Supabase RLS — anonymous SELECT for leagues with public features
3. A public-facing page/layout using `resolveVisibilityTier(null)` + `isFeatureEnabled()`
4. Auto-join on sign-in (the `join_public_league` RPC already exists)

Until this is built, setting a feature to `public` has no visible effect for non-members.
