# Website Header Nav Updates — Design Spec

**Date:** 2026-03-19
**Status:** Approved
**File:** `components/ui/navbar.tsx`

---

## Overview

Three targeted changes to the `Navbar` component used across craft-football.com and m.craft-football.com. All changes are confined to `components/ui/navbar.tsx`.

---

## Change 1 — Account Settings in Desktop Dropdown

**Current state:** When a user is logged in and not on a league detail page (`!isLeagueDetail`), a standalone Settings gear icon button appears to the left of the user dropdown. It links to `settingsUrl` (which resolves to `/settings` on non-league pages).

**Desired state:** Remove the standalone Settings gear icon button. Add an "Account Settings" `DropdownMenuItem` inside the user `DropdownMenu`, positioned above the separator and "Log out" item, linking to `/settings` (always, regardless of current page — this is the account-level settings, not league settings).

**Implementation:**
- Delete the `{!isLeagueDetail && <Button ...><Settings /></Button>}` block
- Add a `DropdownMenuItem asChild` with a `<Link href="/settings">` before the `<DropdownMenuSeparator />`
- Use `<Settings className="size-4" />` icon and the label "Account Settings", matching the existing `<LogOut>` row style

---

## Change 2 — Mobile Unauthenticated: Login + Join Buttons Instead of Hamburger

**Current state:** On mobile (`sm:hidden`), the header always shows a hamburger button that opens a Sheet. Unauthenticated users must open the sheet to see the auth UI.

**Desired state:** When `!user` on mobile, display "Log in" and "Join" buttons directly in the header instead of the hamburger/Sheet trigger. These match the existing `Button size="xs"` pattern used in `WebsiteHeader.tsx` and `PublicHeader.tsx`. No sheet is needed for unauthenticated mobile users since the only nav action available to them is auth.

**Implementation:**
- In the mobile action bar `div`, split the sheet trigger into a conditional:
  - `!user`: render `<Button size="xs" asChild><a href="/sign-in">Log in</a></Button>` and `<Button size="xs" variant="secondary" asChild><a href="/sign-in?mode=signup">Join</a></Button>`
  - `user`: render the existing Sheet trigger (hamburger button)
- The `showNav` guard still applies; on `/sign-in` and `/reset-password`, render nothing on the right side

---

## Change 3 — Mobile Authenticated: User Icon Instead of Three Lines

**Current state:** The Sheet trigger shows `<Menu className="size-4" />` (three horizontal lines) for all users.

**Desired state:** When `user` is set, the Sheet trigger icon changes to `<User className="size-4" />`. The Sheet behaviour and contents are unchanged.

**Implementation:**
- Replace `<Menu className="size-4" />` inside the `SheetTrigger` with a conditional: `user ? <User className="size-4" /> : <Menu className="size-4" />` — though after Change 2, the sheet trigger only renders when `user` is truthy, so it can simply always use `<User className="size-4" />`.

---

## Constraints

- No new dependencies — `User`, `Settings`, `LogOut` icons already imported from `lucide-react`
- `Button`, `DropdownMenuItem`, `Link`, `Sheet` already used in the file
- `size="xs"` already defined on `Button` — matches `WebsiteHeader.tsx` and `PublicHeader.tsx` styling
- The `AuthDialog` currently used for mobile auth (in the Sheet) is replaced by direct links for the mobile unauthenticated case, matching the pattern already in `WebsiteHeader.tsx`
- Redirect params on mobile login/join links: use `leagueId ? `/${leagueId}/results` : '/'` as the redirect, matching existing desktop `AuthDialog` call
- League-level settings (`/${leagueId}/settings`) are accessible via `LeaguePageHeader` — not affected by these changes

---

## Files Changed

| File | Change |
|---|---|
| `components/ui/navbar.tsx` | All three changes above |

No migrations, API changes, or new files required.
