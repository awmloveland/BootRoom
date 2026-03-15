# Feature Flag Development Standard

All new features in BootRoom are built behind an admin-controlled feature flag.
This lets us ship safely: admins test first, then roll out to members, then
optionally open to the public — all without a code deploy.

---

## Why this pattern exists

- **Safe staging** — admins can use and validate a feature before members see it
- **Zero-downtime rollouts** — promote a feature with a click, not a deployment
- **Per-league control** — each league controls its own feature set independently
- **Per-tier config** — members and public visitors can have different data views (e.g. different visible stat columns)
- **Reversible** — a feature can be pulled back instantly at any time

---

## The three visibility tiers

| Tier | Who can access | How it maps from GameRole |
|---|---|---|
| `admin` | League creators and admins only. Always sees everything. | `creator` or `admin` role |
| `member` | All signed-in league members (plus admins). | `member` role |
| `public` | Anyone with the league link, including unauthenticated visitors. | unauthenticated / no role |

Admins always bypass feature flag checks entirely — they see every feature in
every state regardless of `enabled` or `public_enabled`.

The member and public toggles are **independent** — you can enable match history
for members without making it public, or open player stats to the public while
keeping team builder members-only. The only rule is that giving public access to
something members can't see makes no sense, so the admin UI won't allow it.

---

## Where flags are stored

Flags live in the `league_features` table in Supabase:

| Column | Type | Notes |
|---|---|---|
| `game_id` | uuid PK | The league this flag belongs to |
| `feature` | text PK | Matches a `FeatureKey` value exactly |
| `enabled` | boolean | Whether **members** can access this feature |
| `config` | jsonb | Per-feature config for **members** (e.g. `max_players`, `visible_stats`, `show_mentality`) |
| `public_enabled` | boolean | Whether **public visitors** can access this feature |
| `public_config` | jsonb | Per-feature config for **public** — may differ from member config |
| `updated_at` | timestamptz | Auto-updated on write |

Rows are upserted on conflict `(game_id, feature)`. Missing rows fall back to
`DEFAULT_FEATURES` in the API route, so every league always sees a full
feature list even before any row exists in the DB.

### ⚠️ Critical: always use `select('*')` when reading `public_config`

A PostgREST schema cache bug means that **narrow column projections** (e.g.
`.select('public_enabled, public_config')`) silently return `null` for
newly-added JSONB columns. Always use `.select('*')` when you need
`public_config` — the extra columns are harmless:

```ts
// ✅ correct — public_config is returned
const { data } = await supabase
  .from('league_features')
  .select('*')
  .eq('game_id', id)
  .eq('feature', 'player_stats')
  .maybeSingle()

// ❌ wrong — public_config silently returns null
const { data } = await supabase
  .from('league_features')
  .select('public_enabled, public_config')
  .eq('game_id', id)
  .eq('feature', 'player_stats')
  .maybeSingle()
```

---

## How flags are read at runtime

### In authenticated pages (`app/app/league/[id]/...`)

1. Fetch features from the API: `GET /api/league/[id]/features`
2. Convert the user's role with `resolveVisibilityTier(role)` from `lib/roles.ts`
3. Gate UI with `isFeatureEnabled(features, key, tier)` from `lib/features.ts`

```ts
import { isFeatureEnabled } from '@/lib/features'
import { resolveVisibilityTier } from '@/lib/roles'

// userRole comes from the games list (fetchGames() in lib/data.ts)
const tier = resolveVisibilityTier(userRole)  // 'admin' | 'member' | 'public'
const showPlayerStats = isFeatureEnabled(features, 'player_stats', tier)
const playerStatsConfig = features.find(f => f.feature === 'player_stats')?.config
```

### In public pages (`app/results/[id]/...`)

Public pages use the **service role client** to bypass RLS, and read
`league_features` directly. Always check `public_results_enabled` on the
`games` table first, then check `public_enabled` on the feature row.

```ts
// 1. Gate: league must have public results enabled
const publicSupabase = createPublicClient()
const { data: game } = await publicSupabase
  .from('games')
  .select('id, name, public_results_enabled')
  .eq('id', id)
  .maybeSingle()
if (!game?.public_results_enabled) notFound()

// 2. Gate: feature must be public-enabled
const serviceSupabase = createServiceClient()
const { data: feat } = await serviceSupabase
  .from('league_features')
  .select('*')                    // ← must be '*', not a subset
  .eq('game_id', id)
  .eq('feature', 'my_feature')
  .maybeSingle()
if (!feat?.public_enabled) notFound()

// 3. Apply per-tier public config
const publicConfig = (feat.public_config ?? null) as FeatureConfig | null
const showMentality = publicConfig?.show_mentality ?? true
const visibleStats  = publicConfig?.visible_stats   // undefined = show all
```

---

## How to add a new feature flag — step by step

### Step 1 — Add the `FeatureKey` to `lib/types.ts`

```ts
export type FeatureKey =
  | 'match_history'
  | 'match_entry'
  | 'team_builder'
  | 'player_stats'
  | 'player_comparison'
  | 'my_new_feature';    // ← add here
```

If the feature has custom per-tier config fields, add them to `FeatureConfig`:

```ts
export interface FeatureConfig {
  max_players?: number | null;
  visible_stats?: string[];
  show_mentality?: boolean;
  my_new_setting?: boolean;   // ← add if needed
}
```

### Step 2 — Add a default entry to `app/api/league/[id]/features/route.ts`

```ts
const DEFAULT_FEATURES = [
  // existing entries …
  {
    feature: 'my_new_feature' as FeatureKey,
    enabled: false,       // always start disabled
    config: null,
    public_enabled: false,
    public_config: null,
  },
]
```

**Always start with `enabled: false` and `public_enabled: false`.** The
feature is admin-only until explicitly promoted.

### Step 3 — Wire the feature into the Admin Panel (`components/AdminFeaturePanel.tsx`)

Features live inside **page cards** (`ResultsPageCard` or `PlayersPageCard`)
with a `Members` / `Public` tab each. Find the card that owns your feature
and add a `SubFeatureRow` toggle inside it:

```tsx
// Inside ResultsPageCard or PlayersPageCard, in the sub-features section:
const myFeature = getFeature('my_new_feature')
const myEnabled = tab === 'members' ? myFeature.enabled : myFeature.public_enabled
const isSavingMy = saving === 'my_new_feature'

function toggleMyFeature(val: boolean) {
  if (tab === 'members') updateFeature({ ...myFeature, enabled: val })
  else                   updateFeature({ ...myFeature, public_enabled: val })
}

// In JSX:
<SubFeatureRow
  label="My New Feature"
  description="What this feature does for the user."
  enabled={myEnabled}
  disabled={isSavingMy}
  onToggle={toggleMyFeature}
/>
```

Also update the `getFeature()` fallback at the bottom of the same file to include
the new key with `enabled: false` so the panel renders correctly before the first
DB row is created:

```ts
features.find((f) => f.feature === key) ?? {
  feature: key,
  enabled: false,   // ← add your feature here, always false
  config: null,
  public_enabled: false,
  public_config: null,
}
```

If the feature needs **per-tier config** (like stat column visibility), extend
`StatsConfig` or add a new config component inside the page card.

### Step 4 — Gate the feature in authenticated pages

```ts
// app/app/league/[id]/page.tsx or similar
const tier = resolveVisibilityTier(game.role)
const myFeatureEnabled = isFeatureEnabled(features, 'my_new_feature', tier)

// In JSX:
{myFeatureEnabled && <MyNewFeatureComponent />}
```

### Step 5 — Gate the feature in public pages (if applicable)

In `app/results/[id]/page.tsx` or a new route under `app/results/[id]/`:

```ts
const serviceSupabase = createServiceClient()
const { data: feat } = await serviceSupabase
  .from('league_features')
  .select('*')                      // ← always select('*')
  .eq('game_id', id)
  .eq('feature', 'my_new_feature')
  .maybeSingle()

if (!feat?.public_enabled) {
  // Don't 404 — just don't render the section
  return null
}

const publicConfig = (feat.public_config ?? null) as FeatureConfig | null
```

If the feature requires **unauthenticated writes** (like Match Entry on the
public page), create API routes under `app/api/public/league/[id]/` that:
1. Verify `public_results_enabled` on `games`
2. Verify the feature's `public_enabled` flag
3. Use `createServiceClient()` for the write (service role bypasses RLS)
4. Perform your own authorization checks before writing

### Step 6 — Seed rows for existing leagues (required)

The public results page queries `league_features` directly from the DB. If no
row exists for a feature, it can never appear publicly — the `DEFAULT_FEATURES`
merge only happens in the API layer, not the public page. **Always write a
migration** so existing leagues get the row immediately:

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_seed_my_new_feature.sql
INSERT INTO league_features (game_id, feature, enabled, config, public_enabled, public_config)
SELECT id, 'my_new_feature', false, null, false, null
FROM games
ON CONFLICT (game_id, feature) DO NOTHING;
```

**Also update `create_game`** in the same migration so new leagues get the row too:

```sql
CREATE OR REPLACE FUNCTION public.create_game(game_name text)
...
-- add to the INSERT inside the function:
(game_uuid, 'my_new_feature', false, NULL, false, NULL),
```

Run the migration in the Supabase SQL Editor after deploying the code changes.

### Step 7 — Test as admin, then promote

1. **Deploy + run migration.** Only you (admin) see the feature.
2. **Test** thoroughly in the real league environment.
3. **Promote to members:** Settings → Features → Members tab → toggle on.
4. **Promote to public:** Settings → Features → Public tab → toggle on.
   Configure `public_config` if the feature has per-tier settings (visible columns, etc.)
5. The change takes effect immediately — **no deployment needed**.

---

## The `public_config` seeding pattern

When an admin first enables **Page visible** for the public tier, the
`AdminFeaturePanel` seeds a default `public_config` so individual sub-settings
have a non-null base to build on. Without this seed, unchecking a checkbox
would save `{ show_mentality: false }` but a subsequent "Page visible" toggle
would overwrite it with `null`.

The seeding happens in `toggleMaster` inside `PlayersPageCard`:

```ts
const DEFAULT_PUBLIC_CONFIG: FeatureConfig = {
  max_players: null,
  visible_stats: ['played', 'won', 'drew', 'lost', 'winRate', 'recentForm', 'points', 'timesTeamA', 'timesTeamB'],
  show_mentality: true,
}

function toggleMaster(val: boolean) {
  if (tab === 'members') {
    updateFeature({ ...stats, enabled: val })
  } else {
    const publicConfig = val && !stats.public_config
      ? DEFAULT_PUBLIC_CONFIG
      : (stats.public_config ?? null)
    updateFeature({ ...stats, public_enabled: val, public_config: publicConfig })
  }
}
```

Apply the same pattern to any new page card that has per-tier config.

---

## Current feature registry

| Feature key | Page card | Members tab | Public tab | Notes |
|---|---|---|---|---|
| `match_history` | Results | Toggle | Toggle | Controls the match history feed |
| `match_entry` | Results | Toggle | Toggle | Public writes use `/api/public/` routes |
| `player_stats` | Players | Toggle + config | Toggle + config | Config: columns, mentality badge, max players |
| `team_builder` | Players | Toggle | Members only | Cannot be made public (requires auth) |
| `player_comparison` | Players | — | — | Coming soon |

---

## Admin panel UI structure

The admin panel (`components/AdminFeaturePanel.tsx`) uses a **page-centric,
tabbed layout**:

```
┌─────────────────────────────────────────────────────────┐
│  Results page          [Members] [Public]   Saved ✓     │
├─────────────────────────────────────────────────────────┤
│  Page visible                            ●──────        │
│                                                         │
│  Features (shown when Page visible is ON):              │
│    Match Entry                           ○              │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│  Players page          [Members] [Public]   Saved ✓     │
├─────────────────────────────────────────────────────────┤
│  Page visible                            ●──────        │
│                                                         │
│  Data visible on the players page:                      │
│    Max players shown  [ Unlimited ]                     │
│    Player card badges [ ] Show mentality badge          │
│    Visible stat columns  [✓ Played] [✓ Won] …          │
│                                                         │
│  Features:                                              │
│    Team Builder  (Requires sign in — public tab only)   │
│    Player Comparison  [Coming soon]                     │
└─────────────────────────────────────────────────────────┘
```

Each save triggers an auto-save PATCH to `/api/league/[id]/features` and
shows a brief **"Saved ✓"** indicator next to the tier tabs.

---

## Key files

| File | Purpose |
|---|---|
| `lib/types.ts` | `FeatureKey`, `FeatureConfig`, `LeagueFeature` types |
| `lib/features.ts` | `isFeatureEnabled(features, key, tier)` helper |
| `lib/roles.ts` | `resolveVisibilityTier(role)` helper, `VisibilityTier` type |
| `app/api/league/[id]/features/route.ts` | GET (read features) + PATCH (save features) |
| `components/AdminFeaturePanel.tsx` | Admin UI — page cards with Members/Public tabs |
| `app/app/league/[id]/page.tsx` | Member results page — gated by `isFeatureEnabled` |
| `app/app/league/[id]/players/page.tsx` | Member players page — gated by `isFeatureEnabled` |
| `app/results/[id]/page.tsx` | Public results page — reads `public_enabled` directly |
| `app/results/[id]/players/page.tsx` | Public players page — reads `public_config` via `select('*')` |
| `app/api/public/league/[id]/lineup/route.ts` | Public write: save/cancel match lineup |
| `app/api/public/league/[id]/result/route.ts` | Public write: record match result |
