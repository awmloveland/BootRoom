# Feature Flag Development Standard

Some features in BootRoom can be built behind an admin-controlled feature flag.
This lets us ship safely: admins test first, then roll out to members, then
optionally open to the public, all without a code deploy.

Flags are optional. Most changes ship without one; see "Feature flags: ask,
don't assume" in `CLAUDE.md` for when a flag is worth suggesting.

**No features are flagged right now.** The flags that used to exist were
retired in October 2026 (`20261016000001_retire_feature_flags.sql`): results,
players, quarter champions and line-up share images are always on, and only
league admins enter results. The machinery below stays so the next flag is
quick to add. Once a flag's feature is fully rolled out, retire it the same
way rather than leaving it switched on forever.

---

## The three visibility tiers

| Tier | Who | From `GameRole` |
|---|---|---|
| `admin` | League creators and admins. Always sees every feature. | `creator` or `admin` |
| `member` | Signed-in league members. | `member` |
| `public` | Anyone with the league link, signed in or not. | no role |

`resolveVisibilityTier(role)` in `lib/roles.ts` does the mapping.

---

## Where flags are stored

The `league_features` table, one row per league and feature:

| Column | Type | Notes |
|---|---|---|
| `game_id` | uuid PK | The league |
| `feature` | text PK | A `FeatureKey` value |
| `enabled` | boolean | Members can see it |
| `config` | jsonb | Optional member-tier settings |
| `public_enabled` | boolean | The public can see it |
| `public_config` | jsonb | Optional public-tier settings |
| `updated_at` | timestamptz | |

A league with no row for a feature gets its `DEFAULT_FEATURES` entry
(`lib/defaults.ts`), so a new flag works for every league without seeding rows.

Always read with `.select('*')`: a PostgREST schema cache bug makes narrow
projections return `null` for the JSONB config columns.

---

## Adding a flag

1. **Key.** Add it to `FeatureKey` in `lib/types.ts` (replace `never` with the
   first key).
2. **Default.** Add an entry to `DEFAULT_FEATURES` in `lib/defaults.ts` with
   `enabled: false` and `public_enabled: false`, so only admins see it at
   first. The Settings → Features tab appears as soon as this list is not
   empty.
3. **Admin card.** Add its title and description to `FEATURE_COPY` in
   `components/FeaturePanel.tsx`. Each flag gets a `FeatureToggleCard` with
   Members and Public switches. A flag with per-tier config needs its own card.
4. **Gate the UI.** In the server page, fetch with `getFeatures(leagueId)`
   from `lib/fetchers.ts` (request-cached, shared with the layout) and check
   `isFeatureEnabled(features, 'my_feature', tier)` from `lib/features.ts`.
   Admins always pass. Gate any API route that serves the feature the same way.
5. **Promote.** Deploy, test as an admin, then switch it on for members and
   later the public in Settings → Features. No deploy needed.

## Retiring a flag

When the feature is on for everyone it should stop being a flag:

1. Remove the `isFeatureEnabled` checks and the code paths for "off".
2. Remove the key from `FeatureKey`, `DEFAULT_FEATURES` and `FEATURE_COPY`.
3. Write a migration that deletes its `league_features` rows.

---

## Key files

| File | Purpose |
|---|---|
| `lib/types.ts` | `FeatureKey`, `FeatureConfig`, `LeagueFeature` |
| `lib/defaults.ts` | `DEFAULT_FEATURES`, the starting state of each flag |
| `lib/features.ts` | `isFeatureEnabled(features, key, tier)` |
| `lib/roles.ts` | `resolveVisibilityTier(role)` |
| `lib/fetchers.ts` | `getFeatures(leagueId)` for server pages and routes |
| `app/api/league/[id]/features/route.ts` | GET for the settings page, PATCH (admins) to save |
| `components/FeaturePanel.tsx` | Settings → Features, one card per flag |
| `components/FeatureToggleCard.tsx` | Members / Public switches for a flag |
