# League address: name plus a short code — design

**Date:** 2026-11-13

## Summary

A new league's address is its name followed by a random three-character
code, for example `craft-football.com/thursday-fives-k7x`. Two leagues can
share a name without either becoming "2", and nothing is ever "taken".
Lands on branch `awmloveland/league-creation-step-saving`, before the
step-saving work (`2026-11-13-league-creation-step-saving-design.md`), which
builds on the draft shape defined here. No migration.

## Decisions (settled during brainstorming)

1. **Every new league gets a code**, not only on a clash. Rejected: an opaque
   ID alone (the link in the group chat should read as the league), a venue
   suffix on a clash, and a creator-edited address.
2. **Existing addresses are untouched.** `craft-football` and any other slug
   already stored keeps working; `games.slug` is still the unique key and is
   still fixed at creation.
3. **The code is chosen in the browser** so the Name step can show the final
   address without asking the server.

## Design

### The code

In `lib/utils.ts`, beside `generateSlug`:

- `SLUG_CODE = /^[bcdfghjkmnpqrstvwxyz2-9]{3}$/`
- `slugCode()` returns three characters drawn with `crypto.getRandomValues`
  from that alphabet: no vowels, so a code cannot spell a word, and no `0`,
  `1` or `l`, so it cannot be misread. About 22,000 codes per name.

### Name step

- `LeagueDraft` gains `code: string`, empty at first and set by the wizard's
  `update` the first time anything is typed (never during render, so
  hydration matches).
- The preview is `generateSlug(draft.name) + '-' + draft.code`, computed
  locally. The debounced lookup and its `server` state are deleted.
- The code stays the same while the name is edited.

### Server

- `POST /api/games` reads an optional `code`. The slug is
  `generateSlug(name) + '-' + code`, using the sent code when it matches
  `SLUG_CODE` and a fresh `slugCode()` otherwise.
- There is no look-up before the insert. If `create_game` fails on the unique
  constraint, the route tries once more with a fresh code, then answers 409.
  The response still carries `{ id, slug }` and the client follows that slug.
- The wizard's own 409 retry is deleted; the route now does it.

### Deleted

- `GET /api/games/slug` (`app/api/games/slug/route.ts`): nothing calls it.
- `lib/slug.ts` and `lib/__tests__/slug.reserved.test.ts`: `resolveUniqueSlug`
  has no callers, and the reserved-name list guarded bare names such as `new`
  or `settings`. A slug now always ends in a hyphen and three vowel-free
  characters, which no route in `app/` matches.

## Tests

- `slugCode`: 200 draws all match `SLUG_CODE`.
- `__tests__/api-games.test.ts`: a valid sent code is used; an invalid or
  missing one is replaced; a unique violation retries once with a different
  code; a second violation answers 409. The `resolveUniqueSlug` mock goes.

## Out of scope

Changing any existing league's address, and letting anyone edit an address.
