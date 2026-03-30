# Design: Fix new player confirmation flow

**Date:** 2026-03-30
**Branch:** awmloveland/fix-new-player-confirm-flow

---

## Problem

When recording a result with a new player in the lineup, the confirmation step throws an error and the new player's attributes (rating, mentality, goalkeeper) are never saved. The result itself is saved correctly.

### Root cause

In `ResultModal.tsx`, `promote_roster` is called with:

```ts
p_entries: JSON.stringify(entries)
```

`JSON.stringify` turns the array into a string. PostgreSQL receives a JSONB scalar string instead of a JSONB array, so `jsonb_array_elements(p_entries)` throws:

> `cannot extract elements from a scalar`

`record_result` runs first and commits the result before `promote_roster` is called, which is why the result appears on the site but the player attributes are not saved.

### Secondary issue: mentality is never stored

`AddPlayerModal` collects mentality (BAL/ATT/DEF/GK) but `NewPlayerEntry` only carries `goalkeeper: boolean`. By the time `promote_roster` runs, the mentality string is lost. The function also hardcodes `'balanced'` in the INSERT and does not update `mentality` on conflict, so new players always land with `mentality = 'balanced'` regardless of what was set.

---

## Scope

**In scope:**
- Fix the `JSON.stringify` crash
- Thread `mentality` through the full new player confirmation flow
- Update `promote_roster` to persist mentality on conflict

**Out of scope:**
- Public mode new player handling (separate, no auth context)
- Guest mentality (guests are not added to the roster permanently, different flow)

---

## Design

### 1. Bug fix — `ResultModal.tsx`

Remove `JSON.stringify()` from the `promote_roster` RPC call. The Supabase JS client serialises JSONB parameters automatically; passing a pre-stringified value is incorrect.

```ts
// before
p_entries: JSON.stringify(entries)

// after
p_entries: entries
```

### 2. Thread mentality through the new player flow

**`lib/types.ts`** — Add `mentality` to `NewPlayerEntry`. The `goalkeeper` boolean is derivable from `mentality === 'goalkeeper'` and can be kept for backwards compatibility with any stored lineup metadata.

```ts
export interface NewPlayerEntry {
  type: 'new_player'
  name: string
  rating: number
  mentality: Mentality      // ← add
  goalkeeper?: boolean      // derived: mentality === 'goalkeeper'
}
```

**`AddPlayerModal.tsx`** — Already sets `newMentality` correctly. Update the `onAdd` call to include `mentality: newMentality` in the `NewPlayerEntry`.

**`ResultModal.tsx`** — `NewPlayerReviewState` gains a `mentality` field. The review step for new players replaces the goalkeeper-only toggle with the same BAL/ATT/DEF/GK segmented picker used in `AddPlayerModal`. The `entries` array passed to `promote_roster` includes `mentality`.

```ts
interface NewPlayerReviewState {
  name: string
  rating: number
  mentality: Mentality   // replaces goalkeeper: boolean
}
```

The entries array:
```ts
newPlayerStates.map((p) => ({
  name: p.name,
  rating: p.rating,
  mentality: p.mentality,
  goalkeeper: p.mentality === 'goalkeeper',
}))
```

### 3. Migration — update `promote_roster`

`CREATE OR REPLACE FUNCTION promote_roster` — add `mentality` to the `ON CONFLICT DO UPDATE` clause. No schema changes; no data backfill required.

```sql
ON CONFLICT (game_id, name) DO UPDATE
  SET rating     = EXCLUDED.rating,
      goalkeeper = EXCLUDED.goalkeeper,
      mentality  = EXCLUDED.mentality
```

---

## Data impact

- Existing `player_attributes` rows are unaffected.
- New players confirmed via result after this fix will have the correct mentality stored.
- New players confirmed before this fix (if any) will remain at `mentality = 'balanced'`; admins can correct these via Settings → Players.

---

## Files changed

| File | Change |
|---|---|
| `lib/types.ts` | Add `mentality: Mentality` to `NewPlayerEntry` |
| `components/AddPlayerModal.tsx` | Pass `mentality` in `NewPlayerEntry` on add |
| `components/ResultModal.tsx` | Fix `JSON.stringify` bug; add mentality to review state and picker; pass mentality in entries |
| `supabase/migrations/20260330000003_fix_promote_roster_mentality.sql` | Update `promote_roster` ON CONFLICT clause |
