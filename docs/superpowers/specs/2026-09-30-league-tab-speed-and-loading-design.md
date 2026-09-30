# League tab speed and loading state — design

**Date:** 2026-09-30

## Summary

Switching between the Results, Players, Honours and Lineup Lab tabs under
`/[slug]/` takes 3–7 seconds in production with no visual feedback. Two
causes: every tab is a `force-dynamic` server render that makes roughly seven
sequential round trips to Supabase (each ~250 ms because the Vercel function
runs in US East while the database is in AWS Ireland), and there is no
`loading.tsx` anywhere, so Next.js leaves the old page frozen until the new
one is fully rendered.

This spec fixes both: move Vercel functions to Dublin, collapse the server
fetch chain from ~7 to ~4 round trips, and add a per-tab loading skeleton so
a click responds instantly.

## Measurements (2026-09-30, local production build, signed out)

| Measurement | Result |
|---|---|
| Any single Supabase query, from a US East vantage | 220–480 ms |
| TCP connect to the Supabase host | ~100 ms |
| Each tab, warm server, public tier | 0.45–1.2 s TTFB |
| Supabase project region | eu-west-1 (Ireland) |
| Vercel function region | default, iad1 (US East) |

The signed-in admin path was not measurable locally (no admin session). It
adds four separate Supabase Auth calls, two admin RPCs and a trailing claim
lookup on top of the public path, which accounts for the reported 3 s. The
7 s on Honours is most likely a cold start on a rarely visited route; this is
confirmed or ruled out after deploy via Vercel function duration logs.

## Decisions (settled during brainstorming)

1. **Approach:** loading skeleton plus fetch cleanup. The persistent-shell
   layout (header and sidebar move into the layout, only content swaps) is
   explicitly deferred as a possible follow-up. Client-side tab switching is
   rejected.
2. **Region fix first:** the `vercel.json` region change ships as its own
   commit so its effect can be observed in isolation.
3. **Skeleton placement:** one `loading.tsx` per tab directory, not one at
   the `[slug]` level. This lets the skeleton highlight the correct tab
   immediately and leaves the client-side Settings page alone.
4. **`force-dynamic` stays** on all four tab pages.
5. **Feature flags:** not applicable. This is infrastructure and loading UX,
   not a member-facing feature.

## Part 1 — Vercel region

Add `"regions": ["dub1"]` to `vercel.json`. Dublin is the Vercel region
co-located with AWS eu-west-1. Vercel allows a single function region on all
plans. Nothing else changes. The proxy (`proxy.ts`) runs at the edge
regardless and is unaffected.

## Part 2 — Collapse the server fetch chain

All changes are in `lib/fetchers.ts`, `app/[slug]/layout.tsx` and the four
tab pages (`results`, `players`, `honours`, `lineup-lab`).

### `lib/fetchers.ts`

- **`getAuthClient()`** — `cache()`-wrapped wrapper around
  `createClient()` from `lib/supabase/server`. One auth client per request.
- **`getUser()`** — `cache()`-wrapped; calls `getAuthClient()` then
  `auth.getUser()` once. Returns the user or `null`. Swallows errors to
  `null`, matching current behaviour.
- **`getAuthAndRole`**, **`getPendingJoinRequests`**,
  **`getPendingClaimCount`**, **`getMyClaimInfo`** — replace their own
  `createClient()` + `auth.getUser()` with `getAuthClient()` / `getUser()`.
  Their return shapes are unchanged.
- **`getPendingBadgeCount`** — first awaits `getAuthAndRole(leagueId)`
  (cached, shares the in-flight promise). If `userRole` is not `admin` or
  `creator`, return `0` without calling either RPC. Otherwise unchanged.
- **`getMyJoinRequestStatus(leagueId)`** — new `cache()`-wrapped fetcher.
  Awaits `getAuthAndRole(leagueId)`. Returns `null` if not authenticated,
  `'member'` if `userRole` is non-null, otherwise queries
  `game_join_requests` for the user and returns its status (or `'none'`).
  Return type is `JoinRequestStatus | 'member' | null`, i.e. exactly the
  `joinStatus` value pages compute today. The existing
  `getJoinRequestStatus(leagueId, userId)` stays for any other callers.
- **`getMyClaimInfo`** — additionally short-circuits to
  `{ status: 'none', playerName: null }` when `getAuthAndRole` reports no
  role (public tier). Pages currently guard this call with
  `tier !== 'public'`; moving the guard inside lets the call join the
  parallel batch.

### `app/[slug]/layout.tsx`

Keep the slug resolution and UUID redirect exactly as is. Replace
`await Promise.all([getAuthAndRole(game.id), getFeatures(game.id)])` with
un-awaited calls to the same functions (`void getAuthAndRole(game.id)` etc.).
React `cache()` memoises the in-flight promise, so the page's later call
gets the same promise. The layout no longer blocks on them, so the loading
fallback can appear as soon as the slug resolves.

### Tab pages

Each page's `Promise.all` grows to include `getMyJoinRequestStatus(leagueId)`
and (except Lineup Lab, which doesn't use it) `getMyClaimInfo(leagueId)`. The
trailing `if (!isAuthenticated) … else … await getJoinRequestStatus(...)`
block and the trailing `if (tier !== 'public') { await getMyClaimInfo }`
block are deleted. `joinStatus`, `linkedPlayerName` and `showClaimBanner`
are derived from the batch results with the same logic as today:
`showClaimBanner = tier === 'member' && claim.status === 'none'`.

Rendered output of every page is unchanged.

### Expected round trips (admin path)

Before: slug → auth user → members → (stats ‖ weeks ‖ auth user → RPCs) →
auth user → claims. About 7 sequential hops.

After: slug → (auth user → members → RPCs ‖ features ‖ stats ‖ weeks ‖
auth user → claims ‖ auth user → members → join request). About 4 hops,
and the auth user call happens once.

## Part 3 — Loading skeleton

### `components/LeagueTabSkeleton.tsx`

Server component. Props: `tab: 'results' | 'players' | 'honours' | 'lineup-lab'`.

Mirrors the real page structure so nothing shifts when content arrives:

- Outer `<main className="px-4 sm:px-6 pt-4 pb-8">` and the same
  `flex justify-center gap-6 items-start` two-column wrapper.
- Content column (`w-full max-w-xl shrink-0`):
  - Header row: a title block (`h-8 w-48`) and subtitle block (`h-3 w-40`)
    on the left, a button-shaped block (`h-9 w-20 rounded-md`) on the right.
  - Info-bar block (`h-10 rounded-lg`) with the same `mt-3` spacing.
  - The tab nav, copied from `LeaguePageHeader` with real labels and icons
    and the same classes, rendered as non-interactive `<span>`s. The `tab`
    prop selects which one gets the active underline classes.
  - Three card blocks (`h-24 rounded-lg`) in a `flex flex-col gap-3`.
- Sidebar column: `hidden lg:block w-72 shrink-0` (same as `SidebarSticky`
  minus the sticky logic) containing two widget blocks (`h-40` and `h-56`,
  `rounded-lg`).
- No mobile stats FAB.
- Every placeholder block is `bg-slate-800 animate-pulse`. Nothing outside
  the slate palette.

### `loading.tsx` files

`app/[slug]/results/loading.tsx`, `app/[slug]/players/loading.tsx`,
`app/[slug]/honours/loading.tsx`, `app/[slug]/lineup-lab/loading.tsx`. Each
is one line: `export default function Loading() { return <LeagueTabSkeleton tab="…" /> }`.

Because each tab now has a loading boundary, the default `<Link>` prefetch
fetches the layout plus fallback when a tab link enters the viewport, so on
a warm session the skeleton appears with no server wait.

## Part 4 — Verification

- `npx tsc --noEmit`, `npm run lint`, `npm test`, `npx next build` all pass.
- Re-run the timing loop against the local production server, signed out,
  before and after Part 2, and record both in the PR description.
- Manually confirm in the browser that clicking a tab shows the skeleton
  with the correct tab highlighted, and that the page renders identically
  to before once loaded.
- After deploy: compare Vercel function durations for the Honours route. If
  the 7 s was a cold start, the fix is enabling Fluid compute in the Vercel
  dashboard; flag it, don't change it here.

## Out of scope

- Persistent header/sidebar layout (approach 2).
- Changing `force-dynamic`.
- Any change to the Settings tab or to the legacy `/app/league/[id]` and
  `/results/[id]` routes.
- Cold-start mitigation.
