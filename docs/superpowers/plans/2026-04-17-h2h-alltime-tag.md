# H2H "All Time" Tag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "All Time" badge to the Head to Head card header in `StatsSidebar.tsx`, matching the existing badge in the "Your Stats" card.

**Architecture:** Extend the `WidgetShell` component with an optional `headerRight` prop. When provided, the header renders as a flex row with the title on the left and the slot on the right. Pass the "All Time" badge from `TeamABWidget` via this prop. No other components are touched.

**Tech Stack:** TypeScript, React, Tailwind CSS

---

### Task 1: Extend `WidgetShell` and wire up the badge

**Files:**
- Modify: `components/StatsSidebar.tsx`

The existing `WidgetShell` in `components/StatsSidebar.tsx` (lines 17–26):

```tsx
function WidgetShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-transparent overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-700/40 text-xs font-semibold text-slate-500 uppercase tracking-widest">
        {title}
      </div>
      <div className="px-3 py-3">{children}</div>
    </div>
  )
}
```

The existing `TeamABWidget` call (line 236):

```tsx
<WidgetShell title="Head to Head">
```

- [ ] **Step 1: Update `WidgetShell` to accept an optional `headerRight` prop**

Replace the `WidgetShell` function (lines 17–26 of `components/StatsSidebar.tsx`) with:

```tsx
function WidgetShell({ title, headerRight, children }: { title: string; headerRight?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-transparent overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-700/40 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{title}</span>
        {headerRight}
      </div>
      <div className="px-3 py-3">{children}</div>
    </div>
  )
}
```

- [ ] **Step 2: Pass the "All Time" badge from `TeamABWidget`**

In `TeamABWidget`, replace:

```tsx
<WidgetShell title="Head to Head">
```

with:

```tsx
<WidgetShell
  title="Head to Head"
  headerRight={
    <span className="text-[8px] font-bold uppercase tracking-[0.08em] text-sky-400 bg-sky-400/[0.08] border border-sky-400/25 rounded px-[5px] py-px">
      All Time
    </span>
  }
>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/StatsSidebar.tsx
git commit -m "feat: add All Time tag to Head to Head card header"
```
