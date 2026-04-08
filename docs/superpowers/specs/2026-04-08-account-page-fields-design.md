# Account Page Fields — Design Spec

**Date:** 2026-04-08
**Status:** Approved

---

## Overview

Redesign the player account settings page (`/settings`) to:

1. Add first name and last name as separate editable fields (requires DB migration)
2. Keep display name as an independent editable field
3. Surface email and member-since as read-only account info
4. Widen the page from `max-w-md` to `max-w-xl` to match league pages
5. Add a delete account action in a clearly separated danger zone

---

## Page layout

The page uses `max-w-xl mx-auto px-4 sm:px-6 py-8` — matching the width used on all league pages.

Sections in order (top to bottom):

```
Account                          ← h1 heading

┌─ Account info ──────────────────────────────────┐
│ Email          will@example.com                 │
│ (hint: To change your email, contact your       │
│  league admin.)                                 │
│ ─────────────────────────────────────────────── │
│ Member since   12 Jan 2025                      │
└─────────────────────────────────────────────────┘

┌─ Profile ───────────────────────────────────────┐
│ First name   [Will    ]  Last name [Loveland ]  │
│ Display name [Willo                           ] │
│ hint: How you appear in lineups and player lists│
│                              [ Save changes ]   │
└─────────────────────────────────────────────────┘

League identity                  ← h2 heading

┌─ The Boot Room ──────────────────────────────────┐
│ • Linked as Willo                                │
└──────────────────────────────────────────────────┘
┌─ Hackney 5s ─────────────── [ Cancel claim ] ───┐
│ ◕ Pending — claimed as Will L                   │
└──────────────────────────────────────────────────┘
┌─ Sunday League FC ────────── [ Claim profile ] ─┐
│ • No player profile linked                      │
└──────────────────────────────────────────────────┘

┌─ Danger zone ───────────────────────────────────┐  ← red border
│ Delete account          [ Delete account ]      │
│ Permanently removes your account and all        │
│ associated data. This cannot be undone.         │
└─────────────────────────────────────────────────┘
```

---

## Database changes

### Migration: add first_name and last_name to profiles

```sql
ALTER TABLE profiles
  ADD COLUMN first_name text,
  ADD COLUMN last_name  text;

-- Backfill: split existing display_name on first space
UPDATE profiles
SET
  first_name = split_part(display_name, ' ', 1),
  last_name  = nullif(
    trim(substring(display_name from position(' ' in display_name) + 1)),
    ''
  )
WHERE display_name IS NOT NULL AND display_name != '';
```

- `first_name` and `last_name` are nullable text. Existing users without a space in display_name get `last_name = null`.
- `display_name` remains its own column — it is not computed from first/last going forward. Users can set it independently.

---

## API changes

### `PATCH /api/auth/profile`

Accept and write all three name fields independently:

```ts
// Request body (all optional, any combination)
{ first_name?: string, last_name?: string, display_name?: string }

// Writes whichever fields are present to profiles table
// Returns { ok: true } on success
```

Validation: at least one field must be present. Each field is trimmed; if a field is present but empty after trimming, the API returns a 400 error for that field rather than saving an empty string.

### `GET /api/auth/me` (or load via Supabase client)

The account page loads profile data client-side from the `profiles` table, selecting: `email` (from auth user), `display_name`, `first_name`, `last_name`, `created_at`.

---

## Welcome page update

`/welcome` (`app/welcome/page.tsx`) currently submits `first_name` + `last_name` to `PATCH /api/auth/profile`, which concatenates them into `display_name`. After this change:

- `PATCH /api/auth/profile` writes `first_name` and `last_name` to their own columns
- It also writes `display_name` as `first_name + ' ' + last_name` (trimmed) — so the welcome flow pre-populates display name from the real name, which users can later override on the account page

---

## Account page component changes

### Width

Change `max-w-md` → `max-w-xl` on the `<main>` element.

### State

Add `firstName` and `lastName` state alongside existing `displayName`. All three are loaded on mount from the `profiles` row and submitted together via the profile form.

### Account info card

- Email: read-only, displayed right-aligned. Below it: muted hint text "To change your email, contact your league admin." (`text-xs text-slate-600`)
- Member since: `profiles.created_at` formatted as `d MMM YYYY` (e.g. "12 Jan 2025"), displayed right-aligned

### Profile card

- First name + last name: `grid grid-cols-2 gap-3` side-by-side inputs, same input style as existing display name field
- Display name: full-width input with hint text "How you appear in lineups and player lists"
- Save button: right-aligned, existing sky-600 style. Shows "Saving…" / "Saved" states as before
- Single `onSubmit` saves all three fields in one `PATCH` call

### League identity section

No changes — existing behaviour kept as-is.

### Danger zone

New section at the bottom of the page, visually separated with a red-bordered card (`border border-red-900/40`):

- Card header "Danger zone" in `text-red-400`
- Row: label "Delete account" + description "Permanently removes your account and all associated data. This cannot be undone." + button "Delete account" (`border border-red-900/60 text-red-400`)
- Clicking the button shows a **confirmation dialog** (native browser `confirm()` or an inline confirmation state — use inline to avoid dialog blocking): asks the user to confirm by re-displaying the warning text with a second "Yes, delete my account" button
- On confirmation: calls `DELETE /api/auth/account` which signs the user out and deletes the profile row (Supabase RLS cascade handles associated data via `ON DELETE CASCADE` on `profiles`)

---

## Delete account API

### `DELETE /api/auth/account`

New route. Steps:
1. Verify authenticated session
2. Delete the `profiles` row for `user.id` (cascades to `game_members`, `player_claims`, etc. via existing FK constraints)
3. Call `supabase.auth.admin.deleteUser(user.id)` using the service role client
4. Return `{ ok: true }` with status 200

The client signs out and redirects to `/sign-in` after receiving a successful response.

---

## Delete confirmation UX

No modal library. Use an inline two-step pattern within the danger zone card:

- **Step 1**: "Delete account" button visible
- **Step 2**: On click, replace the button with an inline confirmation: "Are you sure? This cannot be undone." + "Yes, delete" (red) + "Cancel" (slate outline)
- If the user clicks "Yes, delete": call the API, show "Deleting…" state, then redirect to `/sign-in`
- If the user clicks "Cancel": return to step 1

---

## Styling reference

Follows existing conventions from `CLAUDE.md`:

| Element | Classes |
|---|---|
| Card background | `bg-slate-800 border border-slate-700` |
| Card header | `px-4 py-3 border-b border-slate-700/60` |
| Read-only label | `text-xs text-slate-500` |
| Read-only value | `text-sm text-slate-300` |
| Hint text | `text-xs text-slate-600` |
| Input | `bg-slate-900 border border-slate-700 text-slate-100` (darker bg inside card) |
| Danger border | `border border-red-900/40` |
| Danger header text | `text-sm font-medium text-red-400` |
| Danger button | `border border-red-900/60 text-red-400 text-xs` |

---

## Files affected

| File | Change |
|---|---|
| `supabase/migrations/20260408000001_add_first_last_name.sql` | New migration |
| `app/api/auth/profile/route.ts` | Update PATCH to write first/last name columns |
| `app/api/auth/account/route.ts` | New DELETE route |
| `app/settings/page.tsx` | Full redesign per spec |
| `app/welcome/page.tsx` | Update submit to also write display_name |

---

## Out of scope

- Email change flow
- Avatar / profile photo
- Password change
- Notification preferences
