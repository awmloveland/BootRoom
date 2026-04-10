# Settings Tab URL Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the league settings page so that clicking a tab updates the URL's `?tab=` query param, enabling refresh-safety and direct linking to any tab.

**Architecture:** The tab `onClick` handler currently only calls `setSection(id)`. We add `router.replace(`?tab=${id}`)` alongside it so the URL stays in sync. `router.replace` (not `push`) is used so tab switches don't pollute browser history — Back exits Settings entirely. The existing `TabInitialiser` component already reads `?tab=` on mount, so no other changes are needed.

**Tech Stack:** Next.js 14 App Router (`useRouter`, `router.replace`), TypeScript

---

### Task 1: Sync tab clicks to URL

**Files:**
- Modify: `app/[leagueId]/settings/page.tsx` (line ~255)

- [ ] **Step 1: Update the tab `onClick` handler**

In `app/[leagueId]/settings/page.tsx`, find the tab button's `onClick` (currently around line 255):

```tsx
onClick={(e) => { setSection(id); e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' }) }}
```

Replace it with:

```tsx
onClick={(e) => {
  setSection(id)
  router.replace(`?tab=${id}`)
  e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
}}
```

No other changes. `router` is already imported and in scope (`const router = useRouter()`).

- [ ] **Step 2: Verify in the browser**

Start the dev server if not already running:
```bash
npm run dev
```

1. Navigate to any league's settings page (e.g. `/abc123/settings`)
2. Click the **Members** tab — URL should update to `?tab=members`
3. Click the **Features** tab — URL should update to `?tab=features`
4. While on Members, refresh the page — should land back on Members tab
5. Copy the URL with `?tab=players`, open in a new tab — should land on Players tab
6. Click any tab, then press the browser Back button — should exit Settings entirely, not return to a previous tab

- [ ] **Step 3: Commit**

```bash
git add app/[leagueId]/settings/page.tsx
git commit -m "feat: sync settings tab selection to URL query param"
```
