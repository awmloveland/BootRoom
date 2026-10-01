# Loading states and the sign-in transition — design

**Date:** 2026-10-01

## Summary

Several screens show a bare "Loading…" line while they fetch, one card pops
in and shoves content down, and signing in from the landing page is jarring:
the app navbar appears on top of the landing page, then a full reload swaps
everything at once. This spec replaces every text loader with a layout-shaped
skeleton or a spinner, and makes the sign-in hand-off one continuous state.

## Shared pieces

- `components/ui/skeleton.tsx`: `Skeleton` (a pulsing block, moved out of
  `LeagueTabSkeleton.tsx`), `SkeletonCard` (card with a header band and N
  rows, the shape most settings panels share) and `SKELETON_FADE_IN`, the
  `@starting-style` delayed fade the league tab skeletons already use, so
  fast loads never flash a placeholder.
- `components/ui/spinner.tsx`: `Spinner`, a sky `Loader2` with `animate-spin`
  and a screen-reader label. Used only for short waits inside an existing card
  or dialog where a skeleton has no shape to mirror.

Rule of thumb: whole pages and panels get skeletons; in-place waits (signing
in, joining a league) get the spinner.

## Sign-in transition

1. `AuthDialog`: after the code verifies, the dialog stays open and switches
   to a "Signing you in" state with the spinner until the browser unloads the
   page. It cannot be dismissed in that state. The `onSuccess` close and the
   `onSignedUp` callback go. `HonoursLoginPrompt` and `LineupLabLoginPrompt`
   used `onSignedUp` to open the join dialog a moment before the reload threw
   it away; they now redirect with `?open_join=1`, which `LeagueJoinArea`
   already handles.
2. `Navbar`: ignore the `SIGNED_IN` auth event on `/`. The landing page has
   its own header, and the reload that follows sign-in renders the right one.
3. `app/page.tsx`: link and redirect straight to the league's landing tab via
   `leagueLandingPath()`, skipping the `/[slug]` server redirect. Signing in
   from the landing page goes `/` → tab in one hop instead of two, and the
   "Your leagues" links prefetch the tab's existing `loading.tsx` skeleton, so
   a click shows the league shell immediately. An `app/[slug]/loading.tsx`
   was considered and rejected: it sits inside the `[slug]` layout, so it
   never covers that layout's own slug lookup, and it would flash the tabs
   shell when moving from a tab to league settings.

## Replacing text loaders

| Screen | Replacement |
|---|---|
| Account settings (`app/settings`) | Skeletons shaped like the account, profile and linked leagues cards |
| League settings (`app/[slug]/settings`) | Real back button, title and section tabs render immediately; league name and panel are skeletons. Section loading flags start `true` so forms never render once with empty data |
| League settings panels (details, requests, members, features, players) | `SkeletonCard` / skeleton rows |
| Experiments | Skeleton rows shaped like the toggle rows |
| Invite (`Loading invite…`, Suspense fallback, `Joining …`) | Skeleton lines in the invite card; spinner beside "Joining" |
| `PlayerClaimPicker`, `MemberLinkPicker` | Skeleton rows shaped like the list |
| `NextMatchCard` (Results) | Fixed-height placeholder card instead of `null` |
| `AuthGuard` | Deleted, nothing imports it |

## Testing

- Update `__tests__/league-tab-skeleton.test.tsx` for the moved primitive.
- New tests: `Skeleton`/`SkeletonCard`/`Spinner` render busy and labelled;
  pickers render skeleton rows while loading; `NextMatchCard` renders a
  placeholder rather than nothing on Results before its fetch resolves.
- Manual check in the browser, signed out only (local dev uses production
  data).
