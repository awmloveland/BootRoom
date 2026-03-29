# Single-League Auto-Redirect

**Date:** 2026-03-29
**Status:** Approved

## Summary

When an authenticated user visits `/` and belongs to exactly one league, redirect them immediately to that league's results page (`/{leagueId}/results`) instead of showing the league list.

## Motivation

Most members belong to only one league. Showing them a list with one entry is unnecessary friction. Redirecting on every visit to `/` means the home page is never a dead-end for single-league users — regardless of how they arrive (post-login, direct URL, session refresh).

This behaviour may be revisited when multi-league membership or a player profile page is introduced.

## Change

**File:** `app/page.tsx`

After the `leagues` array is built from `game_members`, add:

```ts
if (leagues.length === 1) {
  redirect(`/${leagues[0].id}/results`)
}
```

`redirect` is imported from `next/navigation`.

## Behaviour by case

| State | Behaviour |
|---|---|
| Authenticated, 1 league | Redirect to `/{leagueId}/results` |
| Authenticated, 0 leagues | Show "not in any leagues yet" (unchanged) |
| Authenticated, 2+ leagues | Show league list (unchanged) |
| Unauthenticated | Show public league directory (unchanged) |

## Side effects

- The batch week-data queries (scheduled/played/cancelled) that follow the leagues build are skipped for single-league users, since the redirect fires before them.
- No new dependencies or imports beyond `redirect` from `next/navigation`, which is already used in `app/[leagueId]/page.tsx`.
