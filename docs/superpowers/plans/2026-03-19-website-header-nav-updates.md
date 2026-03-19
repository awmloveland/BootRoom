# Website Header Nav Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update `components/ui/navbar.tsx` to move Account Settings into the user dropdown, show auth buttons directly on mobile when logged out, and use the user icon for the mobile menu trigger when logged in.

**Architecture:** All three changes are confined to a single file (`components/ui/navbar.tsx`). Change 1 modifies the desktop dropdown. Changes 2 and 3 restructure the mobile action bar, splitting the single Sheet into a conditional that renders `AuthDialog` for unauthenticated users and the Sheet (with updated icon) for authenticated users.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Radix UI (`Sheet`, `DropdownMenu`), lucide-react icons, shadcn/ui `Button`.

---

## Files

| Action | Path | What changes |
|---|---|---|
| Modify | `components/ui/navbar.tsx` | All three changes below |

---

### Task 1: Add "Account Settings" to the desktop dropdown and remove the standalone gear icon

**Files:**
- Modify: `components/ui/navbar.tsx`

- [ ] **Step 1: Open `components/ui/navbar.tsx` and locate the two blocks to change**

  The two targets are:
  1. Lines ~182: `const settingsUrl = leagueId ? ...` — delete this variable
  2. Lines ~229–235: `{!isLeagueDetail && <Button asChild variant="ghost" size="sm"><Link href={settingsUrl}><Settings ... /></Link></Button>}` — delete this block
  3. Inside `<DropdownMenuContent>` (~lines 242–258): the area between the name/role `<div>` and `<DropdownMenuSeparator />` — insert new item here

- [ ] **Step 2: Delete the `settingsUrl` variable**

  Remove this line (keep `isSettingsPage` — it's still used in `isActive()`):
  ```ts
  const settingsUrl = leagueId ? `/${leagueId}/settings` : '/settings'
  ```

- [ ] **Step 3: Delete the standalone Settings gear button**

  Remove this block entirely from the desktop right section:
  ```tsx
  {!isLeagueDetail && (
    <Button asChild variant="ghost" size="sm">
      <Link href={settingsUrl}>
        <Settings className="size-4" />
      </Link>
    </Button>
  )}
  ```

- [ ] **Step 4: Insert "Account Settings" into the dropdown**

  Inside `<DropdownMenuContent align="end">`, add a new `DropdownMenuItem` between the name/role `<div>` block and the existing `<DropdownMenuSeparator />`. Final order:

  ```tsx
  <DropdownMenuContent align="end">
    <div className="px-2 py-1.5">
      {displayName && (
        <p className="text-sm font-medium text-slate-100">{displayName}</p>
      )}
      {leagueId && (
        <p className="text-xs text-slate-400 mt-0.5">
          {isLeagueAdmin ? 'Admin' : 'Member'}
        </p>
      )}
    </div>
    <DropdownMenuItem asChild>
      <Link href="/settings">
        <Settings className="size-4" />
        Account Settings
      </Link>
    </DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem onClick={handleSignOut}>
      <LogOut className="size-4" />
      Log out
    </DropdownMenuItem>
  </DropdownMenuContent>
  ```

- [ ] **Step 5: Verify TypeScript compiles with no errors**

  ```bash
  cd /Users/willloveland/conductor/workspaces/bootroom/surat
  npx tsc --noEmit
  ```

  Expected: no errors related to `settingsUrl` or the removed button.

- [ ] **Step 6: Commit**

  ```bash
  git add components/ui/navbar.tsx
  git commit -m "feat: move account settings into user dropdown, remove standalone gear icon"
  ```

---

### Task 2: Restructure mobile bar — AuthDialog for logged-out, Sheet for logged-in

**Files:**
- Modify: `components/ui/navbar.tsx`

- [ ] **Step 1: Locate the mobile bar section**

  Find the `<div className="flex sm:hidden h-14 ...">` block (around lines 266–322). It currently contains a single `<Sheet>` that wraps both the trigger and sheet content, and the sheet content has a `{!user && <AuthDialog />}` branch.

- [ ] **Step 2: Replace the mobile bar right side**

  Replace the entire `<Sheet>` element (from `<Sheet open={sheetOpen}...>` to its closing `</Sheet>`) with this conditional structure:

  ```tsx
  {showNav && !user && (
    <AuthDialog redirect={leagueId ? `/${leagueId}/results` : '/'} size="xs" />
  )}
  {showNav && user && (
    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="shrink-0">
          <User className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto bg-slate-900 border-slate-700">
        <SheetHeader>
          <SheetTitle className="text-slate-100">Menu</SheetTitle>
        </SheetHeader>
        <div className="my-6 flex flex-col gap-6">
          {showNav && (
            <Accordion
              type="single"
              collapsible
              className="flex w-full flex-col gap-4"
            >
              {resolvedMenu.map((item) => renderMobileMenuItem(item, isActive(item)))}
            </Accordion>
          )}
          {mobileExtraLinks.length > 0 && (
            <div className="border-t border-slate-700 py-4">
              <div className="grid grid-cols-2 justify-start">
                {mobileExtraLinks.map((link, idx) => (
                  <Link
                    key={idx}
                    className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
                    href={link.url}
                  >
                    {link.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 font-semibold text-slate-100"
          >
            <LogOut className="size-4" />
            Log out
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )}
  ```

  Note: the `{!user && <AuthDialog />}` branch inside the old `SheetContent` is removed — it is now handled by the outer conditional. The `{user && ...log out button}` branch in `SheetContent` becomes unconditional (the whole block only renders when `user` is truthy).

- [ ] **Step 3: Remove the `Menu` icon import if unused**

  Check the imports at the top of the file for `Menu` from `lucide-react`. Since the `<Menu>` icon is no longer used anywhere after this change, remove it from the import:

  ```ts
  // Before
  import { Menu, Settings, User, LogOut, FlaskConical } from 'lucide-react'

  // After
  import { Settings, User, LogOut, FlaskConical } from 'lucide-react'
  ```

- [ ] **Step 4: Verify TypeScript compiles with no errors**

  ```bash
  npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add components/ui/navbar.tsx
  git commit -m "feat: show auth dialog buttons in mobile header when logged out, user icon when logged in"
  ```

---

### Task 3: Manual verification

- [ ] **Step 1: Start the dev server**

  ```bash
  npm run dev
  ```

- [ ] **Step 2: Verify desktop — Account Settings dropdown (logged in)**

  - Sign in at `http://localhost:3000`
  - Open the user dropdown (top-right button with user icon)
  - Confirm: "Account Settings" row appears with gear icon, above the separator and "Log out"
  - Click "Account Settings" — confirm it navigates to `/settings`
  - Confirm: no standalone Settings gear icon appears anywhere in the header

- [ ] **Step 3: Verify desktop — dropdown on league detail page**

  - Navigate to any league detail route (e.g. `/[leagueId]/results`)
  - Open the user dropdown
  - Confirm: "Account Settings" still appears (it always links to `/settings`)
  - Confirm: no standalone gear icon (it was removed globally)

- [ ] **Step 4: Verify mobile — logged out (resize browser to < 640px width)**

  - Sign out, resize browser to mobile width
  - Confirm: "Log in" and "Join" buttons appear directly in the header — no hamburger icon
  - Click "Log in" — confirm the auth modal opens
  - Click "Join" — confirm the auth modal opens in sign-up mode

- [ ] **Step 5: Verify mobile — logged in**

  - Sign in, keep mobile width
  - Confirm: a button with the user icon (👤) appears in the header, not three lines (☰)
  - Click the user icon — confirm the side sheet opens with nav items and "Log out"
  - Tap "Log out" — confirm it signs out

- [ ] **Step 6: Verify mobile — sign-in page**

  - Navigate to `/sign-in` at mobile width
  - Confirm: no button appears on the right side of the header (showNav guards applied)

- [ ] **Step 7: Commit verification note**

  ```bash
  git add -p  # stage any leftover changes
  git commit -m "chore: manual verification complete for header nav updates" --allow-empty
  ```
