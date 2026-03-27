# Lineup Alternatives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins cycle through up to 3 balanced lineup alternatives in the Next Match Card, with a guarantee that no two alternatives are team-swaps of each other.

**Architecture:** Two isolated changes — (1) deduplication logic added inside `autoPick.ts` before suggestions are sampled, (2) `suggestionIndex` state + "Try another" button added to `NextMatchCard.tsx`. No interfaces change.

**Tech Stack:** TypeScript, React (useState), Jest

---

### Task 1: Deduplicate team-swap suggestions in `lib/autoPick.ts`

**Files:**
- Modify: `lib/autoPick.ts:142-144`
- Test: `lib/__tests__/autoPick.test.ts`

- [ ] **Step 1: Write the failing test**

Add this describe block at the bottom of `lib/__tests__/autoPick.test.ts`:

```ts
// ─── Swap deduplication ───────────────────────────────────────────────────────

describe('autoPick — swap deduplication', () => {
  it('does not return two suggestions that are team-swaps of each other', () => {
    // 10 identical-rated players → many valid exhaustive splits, so the pool
    // will be large enough to potentially surface swaps without deduplication.
    const players = Array.from({ length: 10 }, (_, i) =>
      makePlayer(`Player ${i + 1}`, { rating: 2 })
    )
    // Run many times to exercise the random sampling path
    for (let run = 0; run < 20; run++) {
      const result = autoPick(players)
      for (let i = 0; i < result.suggestions.length; i++) {
        for (let j = i + 1; j < result.suggestions.length; j++) {
          const a = result.suggestions[i]
          const b = result.suggestions[j]
          const namesA = (t: typeof a) =>
            [[...t.teamA].map((p) => p.name).sort(), [...t.teamB].map((p) => p.name).sort()]
              .sort()
              .join('|')
          expect(namesA(a)).not.toBe(namesA(b))
        }
      }
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails (or is flaky)**

```bash
npx jest lib/__tests__/autoPick.test.ts --testNamePattern="swap deduplication" --runInBand
```

With identical-rated players, the random sampler can surface swaps, so this should fail at least occasionally across the 20 runs.

- [ ] **Step 3: Add the deduplication helper and wire it in**

In `lib/autoPick.ts`, replace the existing sampling block (lines 142–144):

```ts
  // Randomly sample up to 3 from the pool, then sort by diff ascending
  const shuffledPool = [...pool].sort(() => Math.random() - 0.5)
  const suggestions = shuffledPool.slice(0, 3).sort((a, b) => a.diff - b.diff)
```

with:

```ts
  // Randomly sample up to 3 from the pool, deduplicating team-swaps, then sort by diff ascending
  const shuffledPool = [...pool].sort(() => Math.random() - 0.5)
  const seen = new Set<string>()
  const suggestions: typeof shuffledPool = []
  for (const candidate of shuffledPool) {
    const key = [
      [...candidate.teamA].map((p) => p.name).sort().join(','),
      [...candidate.teamB].map((p) => p.name).sort().join(','),
    ].sort().join('|')
    if (!seen.has(key)) {
      seen.add(key)
      suggestions.push(candidate)
    }
    if (suggestions.length === 3) break
  }
  suggestions.sort((a, b) => a.diff - b.diff)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest lib/__tests__/autoPick.test.ts --runInBand
```

Expected: all tests pass, including the new swap deduplication test.

- [ ] **Step 5: Commit**

```bash
git add lib/autoPick.ts lib/__tests__/autoPick.test.ts
git commit -m "fix: deduplicate team-swap suggestions in autoPick"
```

---

### Task 2: Add `suggestionIndex` state and "Try another" button to `NextMatchCard.tsx`

**Files:**
- Modify: `components/NextMatchCard.tsx`

- [ ] **Step 1: Add `suggestionIndex` state**

Near the existing `autoPickResult` state declaration (around line 130), add:

```ts
const [suggestionIndex, setSuggestionIndex] = useState(0)
```

- [ ] **Step 2: Reset `suggestionIndex` on auto-pick**

Find the `handleAutoPick` function. It ends with:

```ts
    setAutoPickResult(result)
    if (result.suggestions.length > 0) {
      setLocalTeamA(result.suggestions[0].teamA)
      setLocalTeamB(result.suggestions[0].teamB)
    }
```

Add `setSuggestionIndex(0)` so it becomes:

```ts
    setAutoPickResult(result)
    setSuggestionIndex(0)
    if (result.suggestions.length > 0) {
      setLocalTeamA(result.suggestions[0].teamA)
      setLocalTeamB(result.suggestions[0].teamB)
    }
```

- [ ] **Step 3: Fix the hardcoded `suggestions[0]` reference in the render**

Find this line (around line 632):

```ts
                {isAutoPickMode && autoPickResult.suggestions.length > 0 && (() => {
                  const suggestion = autoPickResult.suggestions[0]
```

The variable `suggestion` is declared but not actually used — the render uses `localTeamA` / `localTeamB` directly. Remove the unused variable:

```ts
                {isAutoPickMode && autoPickResult.suggestions.length > 0 && (() => {
```

- [ ] **Step 4: Add the "Try another" button**

Find the footer action button group (around line 740):

```tsx
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={isAutoPickMode ? handleSaveLineup : handleAutoPick}
                    disabled={saving || squadNames.length < 10 || squadNames.length % 2 !== 0}
                    className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold disabled:opacity-40"
                  >
                    {saving ? 'Saving…' : isAutoPickMode ? 'Confirm Lineup' : 'Build Lineup'}
                  </button>
                </div>
```

Replace with:

```tsx
                <div className="flex items-center gap-2">
                  {isAutoPickMode && autoPickResult && autoPickResult.suggestions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const next = (suggestionIndex + 1) % autoPickResult.suggestions.length
                        setSuggestionIndex(next)
                        setLocalTeamA(autoPickResult.suggestions[next].teamA)
                        setLocalTeamB(autoPickResult.suggestions[next].teamB)
                      }}
                      className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium"
                    >
                      Try another ({suggestionIndex + 1}/{autoPickResult.suggestions.length})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={isAutoPickMode ? handleSaveLineup : handleAutoPick}
                    disabled={saving || squadNames.length < 10 || squadNames.length % 2 !== 0}
                    className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold disabled:opacity-40"
                  >
                    {saving ? 'Saving…' : isAutoPickMode ? 'Confirm Lineup' : 'Build Lineup'}
                  </button>
                </div>
```

- [ ] **Step 5: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/NextMatchCard.tsx
git commit -m "feat: add Try another button to cycle lineup alternatives in Next Match Card"
```
