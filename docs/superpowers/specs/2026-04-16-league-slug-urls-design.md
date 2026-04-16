# League Slug URLs — Design Spec

**Date:** 2026-04-16
**Status:** Approved

## Problem

League URLs currently use raw UUIDs (e.g. `/3f2a1b4c-.../results`). These are ugly, hard to share, and impossible to remember. The goal is to replace the UUID in the URL with a human-readable slug derived from the league name (e.g. `/the-boot-room/results`).

---

## Decisions

- **Slug source:** Auto-derived from the league name. Admins do not set a separate slug field.
- **Slug format:** Lowercase, hyphens only. Non-alphanumeric characters become hyphens; runs of hyphens collapse to one; leading/trailing hyphens stripped. Example: `"The Boot Room FC!"` → `the-boot-room-fc`.
- **Collision handling:** App-layer suffix incrementing — if `the-boot-room` is taken, try `the-boot-room-2`, then `the-boot-room-3`, etc.
- **On rename:** Slug is recomputed from the new name. Old URLs break — no redirects. Accepted trade-off given renames are rare.
- **URL stability:** Not a requirement. Simplicity preferred over backwards compatibility.
- **UUID stays as primary key:** Foreign keys, RLS, and all API routes remain UUID-based. Slug is purely a frontend URL concern.

---

## Data Model

### Schema change

Add `slug` to the `games` table:

```sql
ALTER TABLE games ADD COLUMN slug text;
-- backfill (see Migration section)
ALTER TABLE games ALTER COLUMN slug SET NOT NULL;
ALTER TABLE games ADD CONSTRAINT games_slug_unique UNIQUE (slug);
CREATE INDEX idx_games_slug ON games(slug);
```

No other tables change. The UUID `id` remains the primary key and is used everywhere internally.

---

## Slug Utility

Add `generateSlug(name: string): string` to `lib/utils.ts`:

```ts
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
```

Add `resolveUniqueSlug(name: string, excludeId?: string): Promise<string>` to handle collision resolution. It queries the DB directly:

1. Generate candidate slug from name
2. Query `games` for a row with that slug (excluding the current league's own row when renaming, via `excludeId`)
3. If taken, append `-2`, `-3`, etc. and repeat until a free slug is found

---

## Routing

### Directory rename

`app/[leagueId]/` → `app/[slug]/`

All sub-routes (`results`, `lineup-lab`, `players`, `settings`, `honours`) are unchanged — only the parameter name updates.

### Slug → UUID resolution

In Next.js App Router, layouts cannot directly pass fetched data to page components. Instead, wrap the lookup in React's `cache()` so it deduplicates within a single request — the layout and any page that calls it share one DB round-trip:

```ts
// lib/data.ts
export const getGameBySlug = cache(async (slug: string) => {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('games')
    .select('id, name, slug')
    .eq('slug', slug)
    .single()
  return data ?? null
})
```

The layout calls `getGameBySlug(slug)` and calls `notFound()` if null. Each child page that needs the UUID calls the same cached function — no extra DB hits. All data-fetching functions in `lib/data.ts` continue to accept and use UUIDs unchanged.

### API routes

`app/api/league/[id]/...` routes are unchanged. They continue to receive and work with UUIDs. The slug never appears in API routes.

### Internal links

Anywhere the app constructs a URL using the UUID (e.g. the league list on the home page) switches to using `slug`. The league list query must return `slug` alongside existing fields.

---

## Rename & Create Flows

### On league creation (`app/add-game`)

1. Generate candidate slug from the submitted name
2. Check uniqueness against DB
3. Insert `games` row with both `name` and `slug`

### On league rename (settings page)

1. Recompute slug from new name
2. Check uniqueness (excluding the current league's own slug)
3. Update both `name` and `slug` columns atomically

### Settings UI

Beneath the league name input, show a read-only URL preview that updates live as the admin types:

```
craft-football.com/the-boot-room/results
```

No separate slug input — it is always derived from the name.

---

## Migration

The migration runs in three steps to safely add the constraint:

1. Add `slug` column as nullable
2. Backfill slugs for all existing rows using the same slugification rules
3. Apply `NOT NULL` and `UNIQUE` constraints

With one league in production, step 2 is trivial. The migration must handle the (unlikely) edge case where two existing leagues produce the same slug — apply the same suffix-increment logic used at the app layer.

---

## What Changes

| Area | Change |
|---|---|
| DB | Add `slug` column to `games`, unique index |
| `lib/utils.ts` | Add `generateSlug()` |
| App-layer slug resolution | New helper for uniqueness check + increment |
| `app/[leagueId]/` | Rename directory to `app/[slug]/` |
| `app/[slug]/layout.tsx` | Add slug → UUID lookup, `notFound()` on miss |
| League list query | Return `slug` alongside existing fields |
| Internal URL construction | Replace UUID with `slug` wherever URLs are built |
| `app/add-game` | Generate + store slug on creation |
| League rename API/handler | Recompute + store slug on rename |
| Settings UI | Add live URL preview beneath name input |
| DB migration | Backfill + constrain existing rows |

## What Does Not Change

- All `app/api/league/[id]/...` routes — UUID-based throughout
- All data-fetching functions in `lib/data.ts` — UUID-based throughout
- RLS policies — UUID-based throughout
- Foreign keys — UUID-based throughout
