# Settings Tab URL Sync — Design Spec

**Date:** 2026-04-10
**Status:** Approved

---

## Problem

The league settings page (`/[leagueId]/settings`) uses a tab UI with four sections: League Details, Members, Players, and Features. Switching tabs only updates local React state — the URL never changes. This means:

- Refreshing the page always lands on the League Details tab.
- You cannot link someone directly to a specific tab (e.g. Members or Features).

The page already reads `?tab=` from the URL via `TabInitialiser` on mount, so the reading half works. Only the writing half is missing.

---

## Solution

**Option A — Replace URL on tab click.**

When a tab is clicked, call `router.replace` with `?tab=<id>` in addition to updating local state. `router.replace` is used (not `router.push`) so that tab switches do not create browser history entries — pressing Back exits Settings entirely rather than cycling through previous tabs.

The default tab (`details`) requires no special handling: navigating to `/[leagueId]/settings` with no `?tab=` param continues to default to Details as before.

---

## Changes

**File:** `app/[leagueId]/settings/page.tsx`

**Change:** In the tab button `onClick`, add a `router.replace` call after `setSection(id)`:

```ts
onClick={(e) => {
  setSection(id)
  router.replace(`?tab=${id}`)
  e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
}}
```

No other files change. No new state, components, API routes, or migrations needed.

---

## Behaviour After Change

| Action | Result |
|---|---|
| Click Members tab | URL becomes `?tab=members`, state = `members` |
| Refresh on Members tab | `TabInitialiser` reads `?tab=members`, sets state to `members` |
| Share link with `?tab=features` | Recipient lands on Features tab |
| Navigate to `/[leagueId]/settings` (no param) | Defaults to Details tab |
| Press Back while on any tab | Returns to previous page (not previous tab) |

---

## Out of Scope

- Nested route segments per tab (`/settings/members`, etc.) — not warranted for current complexity.
- Persisting scroll position within a tab across navigation.
