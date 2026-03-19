# Website Header Nav Updates — Design Spec

**Date:** 2026-03-19
**Status:** Approved
**File:** `components/ui/navbar.tsx`

---

## Overview

Three targeted changes to the `Navbar` component. All changes are confined to `components/ui/navbar.tsx`.

---

## Change 1 — Account Settings in Desktop Dropdown

**Current state:** When logged in and `!isLeagueDetail`, a standalone Settings gear icon button appears to the left of the user dropdown, linking to `settingsUrl`.

**Desired state:** Remove the standalone Settings gear icon button. Add an "Account Settings" `DropdownMenuItem` inside the user `DropdownMenu`, always linking to `/settings`.

**Implementation:**

1. Delete the `{!isLeagueDetail && <Button asChild variant="ghost" size="sm">...<Settings />...</Button>}` block.

2. Remove the `settingsUrl` variable — it is no longer referenced after the button is deleted. Keep `isSettingsPage`; it is still used in `isActive()` to both determine the Settings active state and prevent Results from showing as active on the settings page.

3. Inside `DropdownMenuContent`, insert a new item **before** the existing `<DropdownMenuSeparator />`. The final order is:

   ```
   name/role block
   → new DropdownMenuItem: Account Settings → /settings
   → existing <DropdownMenuSeparator />
   → existing Log out DropdownMenuItem
   ```

   The separator's role shifts from separating name/role from Log out to separating Account Settings from Log out.

4. The new item:
   ```tsx
   <DropdownMenuItem asChild>
     <Link href="/settings">
       <Settings className="size-4" />
       Account Settings
     </Link>
   </DropdownMenuItem>
   ```
   Uses `asChild` so `<Link>` handles navigation, matching the icon + label layout of the Log out row.

---

## Change 2 — Mobile Unauthenticated: AuthDialog Buttons Instead of Hamburger

**Current state:** On mobile (`sm:hidden`), the header always shows a Sheet trigger (hamburger). Unauthenticated users must open the sheet to access auth.

**Desired state:** When `!user` on mobile, render `<AuthDialog />` directly in the header (which renders its own "Log in" and "Join" buttons and opens a modal on click). When `user` is truthy, keep the existing Sheet trigger. On `/sign-in` and `/reset-password`, render nothing on the right side for both branches.

This approach keeps auth flow consistent with desktop (modal dialog, not page navigation), and removes the dependency on any `/sign-in` page route or query params.

**Note:** The current mobile bar has no `showNav` guard on the Sheet — it renders even on `/sign-in`. The new structure adds `showNav` to both branches, which is an intentional fix to this existing inconsistency.

**Implementation:**

Replace the single Sheet element wrapping both trigger and content with a conditional structure:

```tsx
{showNav && !user && (
  <AuthDialog redirect={leagueId ? `/${leagueId}/results` : '/'} size="xs" />
)}
{showNav && user && (
  <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
    <SheetTrigger asChild>
      <Button variant="outline" size="icon" className="shrink-0">
        <User className="size-4" />  {/* Change 3 applied here */}
      </Button>
    </SheetTrigger>
    <SheetContent className="overflow-y-auto bg-slate-900 border-slate-700">
      {/* existing sheet content unchanged */}
    </SheetContent>
  </Sheet>
)}
```

The `{!user && <div className="flex flex-col gap-3"><AuthDialog .../></div>}` block inside `SheetContent` becomes unreachable and should be removed along with the Sheet restructure.

---

## Change 3 — Mobile Authenticated: User Icon Instead of Three Lines

**Current state:** The Sheet trigger shows `<Menu className="size-4" />`.

**Desired state:** The Sheet trigger shows `<User className="size-4" />`. Sheet behaviour and contents are unchanged.

**Implementation:**

After Change 2, the Sheet only renders when `user` is truthy. Replace `<Menu className="size-4" />` with `<User className="size-4" />` inside the `SheetTrigger`. No conditional needed. (See Change 2 code snippet above — the icon replacement is applied there.)

---

## Constraints

- No new imports — `AuthDialog` is already imported; `User`, `Settings`, `LogOut` icons already imported from `lucide-react`; `Button`, `DropdownMenuItem`, `Link`, `Sheet` already in scope
- `size="xs"` on `AuthDialog` matches the button sizing used in `WebsiteHeader.tsx` and `PublicHeader.tsx`
- The `Menu` icon import can be removed after Change 3 if it is no longer referenced elsewhere in the file
- League-level settings (`/${leagueId}/settings`) remain accessible via `LeaguePageHeader` — not affected

---

## Files Changed

| File | Change |
|---|---|
| `components/ui/navbar.tsx` | All three changes above |

No migrations, API changes, or new files required.
