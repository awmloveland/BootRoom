# League creation: keep answers between steps — design

**Date:** 2026-11-13

## Summary

The `/new` wizard holds each step's answers in component memory and writes
them at three points only: Create league, the end of Strength, and Import.
A refresh or the Back button in between loses work, and Back from Who plays
restarts the flow and creates a second league. This change keeps answers in
the browser tab as they are typed, and makes going back edit the league that
already exists. Branch `awmloveland/league-creation-step-saving` stacks on
slice 5 (PR #198). No migration, no new API route.

## Problems being fixed

1. **Back from Who plays restarts the flow.** `NewLeagueWizard` remounts with
   an empty draft, bounces to Name, and finishing again creates a second
   league with a `-2` address.
2. **Refresh on Where or When** returns to an empty Name step.
3. **Refresh on a roster step** loses unsaved names, mentality and strength.
4. **Removing or renaming a saved player on a second pass does not stick.**
   `PUT /api/league/[id]/roster` only upserts by name, so a removed player
   stays and a renamed one leaves its old row behind.
5. **Refresh on Results** loses games not yet imported.

## Decisions (settled during brainstorming)

1. **Answers are mirrored to the tab's `sessionStorage`**, not saved to the
   database step by step. Creating the league at the Name step was rejected:
   league pages are public, so it would need a hidden draft state and a
   clean-up of abandoned leagues.
2. **Once the league exists, Name, Where and When edit it.** They never
   create a second one.
3. **Known limit:** closing the tab before Create league loses the first three
   answers. Everything after creation is in the database.

## Design

### One hook: `useSessionState`

`components/new-league/useSessionState.ts`:

```ts
function useSessionState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>, { loaded: boolean; clear: () => void }]
```

- Renders `initial` on the server and on first client render, so hydration
  matches. An effect then reads `sessionStorage[key]`; a stored value replaces
  `initial`, and `loaded` turns true either way.
- After `loaded`, every change is written back as JSON.
- `clear()` removes the key. It does not reset the in-memory value.
- Storage that throws (private mode, quota) or holds unparseable JSON is
  ignored: the hook behaves as plain `useState`.

Keys, exported from `StepShell.tsx` beside `NEW_VISITOR_COOKIE`:

| Key | Holds | Cleared when |
|---|---|---|
| `new-league:draft` | `LeagueDraft` | the Live screen mounts |
| `new-league:roster:{slug}` | `RosterPlayer[]` | the roster save succeeds |
| `new-league:results:{slug}` | `DraftGame[]` | the import succeeds |

### Pre-creation wizard (`NewLeagueWizard`, `NameStep`, `WhenStep`)

- `LeagueDraft` gains `created?: { id: string; slug: string }`. The draft
  moves from `useState` to `useSessionState('new-league:draft', EMPTY)`.
- The hard-load guard (no name → `/new/name`) waits for `loaded`, so a refresh
  on Where or When stays put with the answers in place.
- After `POST /api/games` succeeds, `created` is stored before routing to
  Who plays.
- With `created` set:
  - When's button reads **Continue**. It sends the five fields to the existing
    `PATCH /api/league/[id]/details`, then routes to
    `/new/{created.slug}/players`. It never posts to `/api/games`.
  - Name shows `created.slug` as the address and skips the slug lookup, which
    would otherwise report the league's own address as taken. The sub copy
    already says the link stays put on rename.
  - A 403 or 404 from the PATCH (league deleted, or a different user in the
    same tab) drops `created` and the button returns to **Create league**.
- A small client component on the Live screen clears `new-league:draft` on
  mount, so the next visit to `/new` starts empty.
- Known limit: abandoning a created league mid-flow and pressing Create a
  league again in the same tab resumes that league. Reaching Live, or a new
  tab, starts fresh.

### Roster steps (`RosterWizard`)

- `players` moves to `useSessionState('new-league:roster:{slug}', [...initial, blank])`.
  A stored list wins over the server's `initial`. The "fewer than two named
  players → Who plays" guard waits for `loaded`.
- Saving applies edits to players the league already holds before the upsert.
  Server-seeded rows use the saved name as their `id`, so a pure helper
  `rosterChanges(saved: string[], current: RosterPlayer[])` in
  `lib/playerUtils.ts` returns:
  - `renames`: rows whose `id` is a saved name and whose `name` now differs.
  - `removed`: saved names with no row carrying that `id`.
- `save()` then runs, in order: each rename through
  `PATCH /api/league/[id]/players/[name]/rename`, each removal through
  `DELETE /api/league/[id]/players/[name]`, then the existing `PUT …/roster`.
- **Retry safety.** After a rename succeeds, that row's `id` is set to the new
  name. A delete that answers "not found" counts as done. If any call fails,
  the error shows, the stored list is kept, and `router.refresh()` reloads
  `initial` so a retry applies only what is left.
- A 409 from rename shows "{name} is already on the list".
- On success: `clear()`, then the existing `router.refresh()` and push to
  Results.
- The creator's row stays fixed: not removable, not renamable here.

### Results step (`ResultsStep`)

- `games` moves to `useSessionState('new-league:results:{slug}', [])`.
- On a successful import: `clear()`, then the existing refresh and push.
  "Skip for now" leaves the stored drafts alone, so Back from Live shows them.
- Edits inside an open game modal are not mirrored; only saved drafts are.

### Out of scope

- Saving any step to the database earlier than today.
- A "start over" control.
- The league address behaviour (separate decision, still open).

## Error handling

All existing messages stay. Two new cases: a failed details PATCH on When
shows "Could not save the league. Try again.", and a failed rename or delete
shows the existing "Could not save the roster. Try again."

## Tests

- `useSessionState`: restores a stored value, writes on change, `clear`
  removes the key, corrupt JSON falls back to `initial`.
- `rosterChanges`: rename, removal, both, untouched roster, new rows ignored.
- `NewLeagueWizard` with a `created` draft in storage: Continue on When calls
  the details PATCH and never `POST /api/games`; a 404 drops `created`.
- No browser tests. The manual pass: refresh on every step, Back from Who
  plays through to Name and forward again (one league only), remove and
  rename a saved player after coming back from Results, refresh Results with
  two unimported games.
