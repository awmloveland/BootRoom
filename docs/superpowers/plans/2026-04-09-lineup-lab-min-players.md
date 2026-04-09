# Lineup Lab — Minimum Players Before Score Reveal

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide team scores and the balance bar in Lineup Lab until each team has at least 4 players, preventing individual-player rating comparisons.

**Architecture:** Single constant `MIN_PLAYERS = 4` drives two conditional changes in `LineupLab.tsx`: the score badge content (numeric vs. placeholder) and the balance bar render condition.

**Tech Stack:** React, TypeScript, Tailwind CSS

---

## File Map

| File | Change |
|---|---|
| `components/LineupLab.tsx` | Add `MIN_PLAYERS` constant; update score badge and balance bar conditions |

---

### Task 1: Add threshold constant and update score badges

**Files:**
- Modify: `components/LineupLab.tsx`

- [ ] **Step 1: Add `MIN_PLAYERS` constant**

At the top of `LineupLab.tsx`, after the imports, add:

```ts
const MIN_PLAYERS = 4
```

- [ ] **Step 2: Update each team's score badge**

Find the score badge inside the `(['A', 'B'] as const).map(...)` block (around line 131). Replace:

```tsx
<span className={cn(
  'px-1.5 py-0.5 rounded text-xs font-semibold tabular-nums',
  team === 'A'
    ? 'bg-sky-900/60 border border-sky-700 text-sky-300'
    : 'bg-violet-900/60 border border-violet-700 text-violet-300'
)}>
  {score.toFixed(3)}
</span>
```

With:

```tsx
<span className={cn(
  'px-1.5 py-0.5 rounded text-xs font-semibold tabular-nums',
  team === 'A'
    ? 'bg-sky-900/60 border border-sky-700 text-sky-300'
    : 'bg-violet-900/60 border border-violet-700 text-violet-300'
)}>
  {players.length >= MIN_PLAYERS ? score.toFixed(3) : '—'}
</span>
```

- [ ] **Step 3: Verify the score variable is still computed the same way**

Confirm `const score = ewptScore(players)` is still present immediately before the `return` in the map — the score is computed regardless, only the display changes. No change needed here, just verify.

- [ ] **Step 4: Commit**

```bash
git add components/LineupLab.tsx
git commit -m "feat: hide team score badge until 4 players per team"
```

---

### Task 2: Update balance bar condition

**Files:**
- Modify: `components/LineupLab.tsx`

- [ ] **Step 1: Tighten the balance bar render condition**

Find the balance bar section (around line 182). Replace:

```tsx
{teamA.length > 0 && teamB.length > 0 && (() => {
```

With:

```tsx
{teamA.length >= MIN_PLAYERS && teamB.length >= MIN_PLAYERS && (() => {
```

- [ ] **Step 2: Verify the dev server renders correctly**

Run the dev server and manually test three states:

1. **0 players per team** — both score badges show `—`, no balance bar
2. **3 players in Team A, 4 in Team B** — Team A badge shows `—`, Team B shows numeric score, no balance bar
3. **4+ players per team** — both badges show numeric scores, balance bar appears

```bash
npm run dev
```

Navigate to a league's Lineup Lab page and add players through each state above.

- [ ] **Step 3: Commit**

```bash
git add components/LineupLab.tsx
git commit -m "feat: hide balance bar until both teams have 4 players"
```
