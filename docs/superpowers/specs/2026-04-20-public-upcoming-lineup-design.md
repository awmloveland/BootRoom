# Public Upcoming Lineup Display

## Summary

When an admin publishes a lineup for the next game week, public visitors to the league's results page should always see that lineup as a read-only card. Currently this is gated behind the `match_entry` feature flag (`public_enabled`), meaning public visitors only see it if an admin has explicitly turned on that flag.

The new behaviour: lineup visibility for the public is unconditional — if a scheduled week exists, everyone sees it. Editing and result entry remain admin-controlled.

---

## Access model

| Tier | Sees scheduled lineup | Can edit lineup | Can enter result |
|---|---|---|---|
| Public | Always (if one exists) | No | No |
| Member | Controlled by `match_entry` flag (unchanged) | Per `match_entry` flag | Per `match_entry` flag |
| Admin | Always | Yes | Yes |

---

## Changes

### `app/[slug]/results/page.tsx`

1. Remove the `if (canSeeMatchEntry)` guard around `nextWeek` derivation. Compute `nextWeek` unconditionally so it is available regardless of feature flag state.

2. In the **public tier** JSX branch, replace:
   ```tsx
   {canSeeMatchEntry && (
     <PublicMatchEntrySection ... initialScheduledWeek={nextWeek} />
   )}
   ```
   with:
   ```tsx
   {nextWeek && (
     <PublicMatchEntrySection
       canEdit={canSeeMatchEntry}
       ...
       initialScheduledWeek={nextWeek}
     />
   )}
   ```
   This means:
   - If a scheduled week exists → always render the card for public visitors.
   - `canEdit` is `true` only when the `match_entry` flag is public-enabled (preserving existing editable behaviour for leagues that have turned it on).
   - If no scheduled week exists → nothing renders (same as today).

### `components/PublicMatchEntrySection.tsx`

Add an optional `canEdit?: boolean` prop (default `true`) and pass it through to `NextMatchCard`:

```tsx
interface Props {
  gameId: string
  leagueSlug: string
  weeks: Week[]
  initialScheduledWeek: ScheduledWeek | null
  leagueName?: string
  canEdit?: boolean   // new — defaults to true
}

export function PublicMatchEntrySection({ ..., canEdit = true }: Props) {
  return (
    <NextMatchCard
      ...
      canEdit={canEdit}
    />
  )
}
```

---

## What does NOT change

- `NextMatchCard` — already renders correctly with `canEdit={false}`: shows the lineup body (Team A / Team B) and the "Upcoming" / "Awaiting Result" badge; omits edit, cancel-game, and enter-result buttons.
- Member and admin paths in `results/page.tsx` — `nextWeek` feeds `ResultsSection` only when `canSeeMatchEntry` is true, so the unconditional derivation is safe. The rendered JSX is unchanged for those tiers.
- All feature flags — no additions, no removals, no migrations.

---

## Out of scope

- Making cancelled upcoming games visible to public (the scheduled week filter already excludes cancelled weeks from `nextWeek`).
- Changing member permissions around match entry.
- Public visibility of the "idle" (no lineup yet) next-match card — only shows when a lineup has actually been built and saved.
