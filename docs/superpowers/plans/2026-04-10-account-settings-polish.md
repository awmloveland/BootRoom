# Account Settings Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the account settings page — add a back button, rename "League identity" to "Linked Leagues", and fix the Danger Zone to use a section heading + standard card styling.

**Architecture:** All changes are confined to `app/settings/page.tsx`. No new components, no API changes. The back button reuses `useRouter` (needs importing) and `ArrowLeft` from `lucide-react`. The Danger Zone loses its red card border/header in favour of the standard `bg-slate-800 border-slate-700` card pattern used by "Account info" and "Profile".

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, lucide-react

---

### Task 1: Add back button and fix section headings/Danger Zone styling

**Files:**
- Modify: `app/settings/page.tsx`

- [ ] **Step 1: Add `useRouter` and `ArrowLeft` imports**

In `app/settings/page.tsx`, update the two existing import lines:

```tsx
// Before
import { useEffect, useState } from 'react'
// ...no router or ArrowLeft import
```

```tsx
// After — add useRouter to the react import, add ArrowLeft import
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
```

- [ ] **Step 2: Initialise the router inside the component**

Inside `AccountSettingsPage()`, after the existing state declarations, add:

```tsx
const router = useRouter()
```

- [ ] **Step 3: Replace the page heading with back button + heading**

Find (line ~192):
```tsx
      <h1 className="text-xl font-semibold text-slate-100 mb-6">Account</h1>
```

Replace with:
```tsx
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors mb-3"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>
        <h1 className="text-xl font-semibold text-slate-100">Account</h1>
      </div>
```

- [ ] **Step 4: Rename "League identity" heading to "Linked Leagues"**

Find (line ~269):
```tsx
          <h2 className="text-xl font-semibold text-slate-100 mb-4">League identity</h2>
```

Replace with:
```tsx
          <h2 className="text-xl font-semibold text-slate-100 mb-4">Linked Leagues</h2>
```

- [ ] **Step 5: Replace Danger Zone card with section heading + standard card**

Find (lines ~373–414):
```tsx
      {/* ── Danger zone ──────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-red-900/40 overflow-hidden mb-8">
        <div className="px-4 py-3 border-b border-red-900/30">
          <p className="text-sm font-medium text-red-400">Danger zone</p>
        </div>
        <div className="px-4 py-4 flex items-center justify-between gap-4">
```

Replace with:
```tsx
      {/* ── Danger zone ──────────────────────────────────────────────────── */}
      <h2 className="text-xl font-semibold text-slate-100 mb-4">Danger zone</h2>
      <div className="rounded-lg bg-slate-800 border border-slate-700 overflow-hidden mb-8">
        <div className="px-4 py-4 flex items-center justify-between gap-4">
```

Also remove the closing `</div>` that belonged to the old inner header row — the structure now goes directly from the outer card `div` into the content row. The full replacement block (replacing lines ~373–414) is:

```tsx
      {/* ── Danger zone ──────────────────────────────────────────────────── */}
      <h2 className="text-xl font-semibold text-slate-100 mb-4">Danger zone</h2>
      <div className="rounded-lg bg-slate-800 border border-slate-700 overflow-hidden mb-8">
        <div className="px-4 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-slate-300">Delete account</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Permanently removes your account and all associated data. This cannot be undone.
            </p>
          </div>
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="px-3 py-1.5 rounded-lg border border-red-900/60 text-red-400 text-xs font-medium hover:bg-red-950/40 transition-colors shrink-0"
            >
              Delete account
            </button>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="px-3 py-1.5 rounded-lg border border-slate-600 text-slate-400 text-xs hover:border-slate-500 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="px-3 py-1.5 rounded-lg bg-red-900/60 hover:bg-red-900/80 text-red-300 text-xs font-medium disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
            </div>
          )}
        </div>
      </div>
```

- [ ] **Step 6: Verify the page renders correctly**

Run the dev server and navigate to `/settings`. Check:
- Back button appears above "Account" heading, matches league settings style
- "Linked Leagues" heading appears above the league identity cards
- "Danger zone" appears as a `text-xl` section heading
- Danger Zone card uses standard slate background/border (no red border on the card)
- Delete account button still has red styling
- Confirm-delete flow (Cancel / Yes, delete) still works

```bash
npm run dev
```

- [ ] **Step 7: Commit**

```bash
git add app/settings/page.tsx
git commit -m "feat: account settings — back button, rename league identity, fix danger zone styling"
```
