# Awaiting-result card data loss — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `MatchCard.AwaitingResultCard` from dropping the team-rating snapshot, `leagueName`, and `weeks` on its way into `ResultModal`. Fixes both the team-rating drift (Bug 1) and the empty-highlights-on-share (Bug 2) reported on this branch.

**Architecture:** Pure client-side plumbing — no DB migration, no helper changes. `WeekList` forwards `leagueName` / `leagueSlug` / `weeks` to every `MatchCard` and adds an explicit `isMostRecent` boolean. `MatchCard` threads `isMostRecent` into `PlayedCard` / `DnfCard` (which use it as the share-button gate) and into `AwaitingResultCard` (which now also forwards `team_a_rating` / `team_b_rating` and the real `leagueName` / `weeks` into `ResultModal`).

**Tech Stack:** Next.js 14, TypeScript, Tailwind, Radix UI. Jest + ts-jest for the existing unit tests (which stay green; no new automated tests — the codebase has no React component testing framework and the change is JSX-time prop plumbing).

---

## File Structure

**Modified:**
- `components/WeekList.tsx` — pass `leagueName`/`leagueSlug`/`weeks` unconditionally; add `isMostRecent` derivation.
- `components/MatchCard.tsx` — add `isMostRecent` prop on the top-level `MatchCard`, `PlayedCard`, `DnfCard`, `AwaitingResultCard`; switch share-button gates to `isMostRecent`; fix `AwaitingResultCard` to forward the rating snapshot, `leagueName`, and `weeks` into `ResultModal`.

No new files. No tests to add. No migrations.

---

## Task 1: Add `isMostRecent` plumbing to `WeekList`

**Files:**
- Modify: `components/WeekList.tsx:68-80`

- [ ] **Step 1: Stop using prop presence as the "most recent" signal**

In `components/WeekList.tsx`, replace the `MatchCard` invocation (lines 68–80) with:

```tsx
<MatchCard
  week={week}
  isOpen={openWeek === week.week}
  onToggle={() => handleToggle(week.week)}
  goalkeepers={goalkeepers}
  isAdmin={isAdmin}
  gameId={gameId}
  allPlayers={allPlayers}
  onResultSaved={onResultSaved}
  leagueName={leagueName}
  leagueSlug={leagueSlug}
  weeks={weeks}
  isMostRecent={week.week === mostRecent?.week}
/>
```

(Three props moved from conditional `week === mostRecent ? value : undefined` to unconditional; new `isMostRecent` boolean derived from the same `mostRecent` value.)

- [ ] **Step 2: Run the type check and existing unit tests**

Run: `npx tsc --noEmit`
Expected: PASS (after Task 2 lands the matching `isMostRecent` prop on `MatchCard`, this stays green; before Task 2 it will fail with "Property 'isMostRecent' does not exist on type 'MatchCardProps'" — that's expected and gets resolved in Task 2).

Run: `npm test`
Expected: PASS — no test exercises `WeekList`/`MatchCard` props directly, and the unit tests (`utils.*`, `match-card-ratings`, etc.) are unaffected.

- [ ] **Step 3: Commit**

```bash
git add components/WeekList.tsx
git commit -m "WeekList: pass league context to every MatchCard + add isMostRecent flag"
```

---

## Task 2: Accept `isMostRecent` on `MatchCard` and thread it to children

**Files:**
- Modify: `components/MatchCard.tsx` — top-level `MatchCard` props interface and forwarding (around `MatchCardProps`, `PlayedCardProps`, `DnfCardProps`, `AwaitingResultCardProps`, and the `MatchCard` function body that selects which card to render).

- [ ] **Step 1: Add `isMostRecent` to `MatchCardProps`**

In the `MatchCardProps` interface (currently at `components/MatchCard.tsx:14`):

```ts
interface MatchCardProps {
  week: Week
  isOpen: boolean
  onToggle: () => void
  goalkeepers?: string[]
  isAdmin?: boolean
  gameId?: string
  allPlayers?: Player[]
  onResultSaved?: () => void
  leagueName?: string
  leagueSlug?: string
  weeks?: Week[]
  isMostRecent?: boolean
}
```

- [ ] **Step 2: Destructure `isMostRecent` in the `MatchCard` function**

Update the function signature at `components/MatchCard.tsx:635`:

```tsx
export function MatchCard({
  week,
  isOpen,
  onToggle,
  goalkeepers,
  isAdmin = false,
  gameId = '',
  allPlayers = [],
  onResultSaved = () => {},
  leagueName,
  leagueSlug,
  weeks,
  isMostRecent = false,
}: MatchCardProps) {
```

- [ ] **Step 3: Add `isMostRecent` to `PlayedCardProps`, `DnfCardProps`, `AwaitingResultCardProps`**

```ts
interface PlayedCardProps {
  week: Week
  isOpen: boolean
  onToggle: () => void
  goalkeepers?: string[]
  isAdmin: boolean
  gameId: string
  allPlayers: Player[]
  onResultSaved: () => void
  leagueName?: string
  leagueSlug?: string
  weeks?: Week[]
  isMostRecent: boolean
}

interface DnfCardProps {
  week: Week
  isOpen: boolean
  onToggle: () => void
  isAdmin: boolean
  gameId: string
  allPlayers: Player[]
  onResultSaved: () => void
  leagueName?: string
  leagueSlug?: string
  isMostRecent: boolean
}

interface AwaitingResultCardProps {
  week: Week
  isOpen: boolean
  onToggle: () => void
  isAdmin: boolean
  gameId: string
  leagueSlug?: string
  allPlayers: Player[]
  onResultSaved: () => void
  leagueName?: string
  weeks?: Week[]
  isMostRecent: boolean
}
```

(Two new props added to `AwaitingResultCardProps` — `leagueName` and `weeks` — which will be used in Task 4.)

- [ ] **Step 4: Forward `isMostRecent` from `MatchCard` to each child**

In the `MatchCard` function body (the four `return` branches starting at line 648):

```tsx
if (week.status === 'cancelled') {
  return (
    <CancelledCard
      week={week}
      isAdmin={isAdmin}
      gameId={gameId}
      allPlayers={allPlayers}
      onResultSaved={onResultSaved}
    />
  )
}
if (week.status === 'unrecorded') {
  return (
    <UnrecordedCard
      week={week}
      isAdmin={isAdmin}
      gameId={gameId}
      allPlayers={allPlayers}
      onResultSaved={onResultSaved}
    />
  )
}
if (week.status === 'dnf') {
  return (
    <DnfCard
      week={week}
      isOpen={isOpen}
      onToggle={onToggle}
      isAdmin={isAdmin}
      gameId={gameId}
      allPlayers={allPlayers}
      onResultSaved={onResultSaved}
      leagueName={leagueName}
      leagueSlug={leagueSlug}
      isMostRecent={isMostRecent}
    />
  )
}
if (week.status === 'scheduled' && !isPastDeadline(week.date)) return null
if (week.status === 'scheduled' && isPastDeadline(week.date)) {
  return (
    <AwaitingResultCard
      week={week}
      isOpen={isOpen}
      onToggle={onToggle}
      isAdmin={isAdmin}
      gameId={gameId}
      leagueSlug={leagueSlug}
      allPlayers={allPlayers}
      onResultSaved={onResultSaved}
      leagueName={leagueName}
      weeks={weeks}
      isMostRecent={isMostRecent}
    />
  )
}
return (
  <PlayedCard
    week={week}
    isOpen={isOpen}
    onToggle={onToggle}
    goalkeepers={goalkeepers}
    isAdmin={isAdmin}
    gameId={gameId}
    allPlayers={allPlayers}
    onResultSaved={onResultSaved}
    leagueName={leagueName}
    leagueSlug={leagueSlug}
    weeks={weeks}
    isMostRecent={isMostRecent}
  />
)
```

(`CancelledCard` and `UnrecordedCard` don't need `isMostRecent` — neither has a share button or modal.)

- [ ] **Step 5: Destructure `isMostRecent` in `PlayedCard`, `DnfCard`, and `AwaitingResultCard`**

```tsx
function PlayedCard({
  week,
  isOpen,
  onToggle,
  goalkeepers,
  isAdmin,
  gameId,
  allPlayers,
  onResultSaved,
  leagueName,
  leagueSlug,
  weeks,
  isMostRecent,
}: PlayedCardProps) {
```

```tsx
function DnfCard({
  week,
  isOpen,
  onToggle,
  isAdmin,
  gameId,
  allPlayers,
  onResultSaved,
  leagueName,
  leagueSlug,
  isMostRecent,
}: DnfCardProps) {
```

```tsx
function AwaitingResultCard({
  week,
  isOpen,
  onToggle,
  isAdmin,
  gameId,
  leagueSlug,
  allPlayers,
  onResultSaved,
  leagueName,
  weeks,
  isMostRecent,
}: AwaitingResultCardProps) {
```

(`isMostRecent` will be wired into the share-button gates in Task 3 and the `AwaitingResultCard` modal call in Task 4 — for now it's just unused, which TypeScript permits.)

- [ ] **Step 6: Verify type check and existing tests pass**

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `npm test`
Expected: PASS — same suite as before, no new tests, no behavior change yet.

- [ ] **Step 7: Commit**

```bash
git add components/MatchCard.tsx
git commit -m "MatchCard: thread isMostRecent + leagueName/weeks props down to subcards"
```

---

## Task 3: Switch `PlayedCard` and `DnfCard` share-button gates to `isMostRecent`

**Files:**
- Modify: `components/MatchCard.tsx` — share-button conditional in `PlayedCard` (currently around line 601) and `DnfCard` (currently around line 311).

- [ ] **Step 1: Update `PlayedCard` share-button gate**

Replace:

```tsx
{leagueName && leagueSlug && weeks && (
  <button
    type="button"
    onClick={handleShare}
    className="px-3 py-1.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold transition-colors"
  >
    {copied ? 'Copied!' : 'Share'}
  </button>
)}
```

with:

```tsx
{isMostRecent && leagueName && leagueSlug && weeks && (
  <button
    type="button"
    onClick={handleShare}
    className="px-3 py-1.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold transition-colors"
  >
    {copied ? 'Copied!' : 'Share'}
  </button>
)}
```

Also update the surrounding wrapper conditional on the meta row, currently:

```tsx
{(shouldShowMeta(week.goal_difference, week.notes) || isAdmin || (leagueName && leagueSlug && !!weeks)) && (
```

to:

```tsx
{(shouldShowMeta(week.goal_difference, week.notes) || isAdmin || (isMostRecent && leagueName && leagueSlug && !!weeks)) && (
```

(So the meta row only renders for "share-button reasons" on the most recent card, preserving today's behavior.)

- [ ] **Step 2: Update `DnfCard` share-button gate**

In `DnfCard` (around `components/MatchCard.tsx:306`), update:

```tsx
const canShare = !!(leagueName && leagueSlug)
```

to:

```tsx
const canShare = isMostRecent && !!(leagueName && leagueSlug)
```

The two existing `canShare` consumers (the wrapper conditional and the share button itself) need no further change — they already read from `canShare`.

- [ ] **Step 3: Run type check + existing tests**

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `npm test`
Expected: PASS — unit tests don't exercise share-button rendering.

- [ ] **Step 4: Commit**

```bash
git add components/MatchCard.tsx
git commit -m "MatchCard: gate share buttons on isMostRecent instead of prop presence"
```

---

## Task 4: Forward ratings + `leagueName` + `weeks` from `AwaitingResultCard` into `ResultModal`

**Files:**
- Modify: `components/MatchCard.tsx` — `AwaitingResultCard` local `ScheduledWeek` literal (currently around line 354) and the `ResultModal` invocation (currently around line 440).

- [ ] **Step 1: Add ratings to the local `ScheduledWeek` literal**

Replace the `scheduledWeek` literal in `AwaitingResultCard` (around line 354):

```ts
const scheduledWeek: ScheduledWeek = {
  id: week.id ?? '',
  season: week.season,
  week: week.week,
  date: week.date,
  format: week.format ?? null,
  teamA: week.teamA,
  teamB: week.teamB,
  status: 'scheduled',
  lineupMetadata: week.lineupMetadata ?? null,
}
```

with:

```ts
const scheduledWeek: ScheduledWeek = {
  id: week.id ?? '',
  season: week.season,
  week: week.week,
  date: week.date,
  format: week.format ?? null,
  teamA: week.teamA,
  teamB: week.teamB,
  status: 'scheduled',
  lineupMetadata: week.lineupMetadata ?? null,
  team_a_rating: week.team_a_rating ?? null,
  team_b_rating: week.team_b_rating ?? null,
}
```

This is the Bug 1 fix — `ResultModal` will now receive the snapshot and `resolveTeamRatingForResult` will take the snapshot branch instead of recomputing.

- [ ] **Step 2: Forward `leagueName` and `weeks` to `ResultModal`**

Replace the `ResultModal` invocation in `AwaitingResultCard` (around line 440):

```tsx
{showResultModal && (
  <ResultModal
    scheduledWeek={scheduledWeek}
    lineupMetadata={week.lineupMetadata ?? null}
    allPlayers={allPlayers}
    gameId={gameId}
    leagueSlug={leagueSlug ?? ''}
    leagueName=""
    weeks={[]}
    publicMode={false}
    onSaved={() => {
      setShowResultModal(false)
      onResultSaved()
    }}
    onClose={() => setShowResultModal(false)}
  />
)}
```

with:

```tsx
{showResultModal && (
  <ResultModal
    scheduledWeek={scheduledWeek}
    lineupMetadata={week.lineupMetadata ?? null}
    allPlayers={allPlayers}
    gameId={gameId}
    leagueSlug={leagueSlug ?? ''}
    leagueName={leagueName ?? ''}
    weeks={weeks ?? []}
    publicMode={false}
    onSaved={() => {
      setShowResultModal(false)
      onResultSaved()
    }}
    onClose={() => setShowResultModal(false)}
  />
)}
```

This is the Bug 2 fix — `buildResultShareText` will now see the real weeks list and produce history-aware highlights. `isMostRecent` is intentionally not consulted here: the modal must always receive real data regardless of whether the awaiting card is also the most-recent one.

- [ ] **Step 3: Run type check + existing tests**

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/MatchCard.tsx
git commit -m "MatchCard: forward rating snapshot + leagueName + weeks from awaiting-result card into ResultModal"
```

---

## Task 5: Manual verification on the dev server

**Files:**
- None to modify — this is a verification task. Per the project guideline ("For UI or frontend changes, start the dev server and use the feature in a browser before reporting the task as complete"), no PR should ship without this.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: Next.js dev server up on `localhost:3000`.

- [ ] **Step 2: Reproduce Bug 1 path (team rating snapshot preserved)**

1. Sign in as an admin of a test league.
2. Build a lineup for the next match that includes **at least one guest with the "average" strength hint** (so the ewpt recompute would visibly differ from the snapshot under PR #113's discount). The `Lloyd +1` guest in the reported bug is an example.
3. Save the lineup. Note Team A's rating in the lineup card (e.g. 41.856).
4. Edit the database (Supabase SQL editor) to set the scheduled week's `date` to yesterday, OR wait past the kickoff deadline. The next-match card disappears and an *Awaiting Result* card appears in the results list.
5. Expand the *Awaiting Result* card and click **Record Result**.
6. Pick a winner, save.
7. Confirm: the resulting played `MatchCard` shows the **same** Team A rating as step 3 (no drift).

- [ ] **Step 3: Reproduce Bug 2 path (full highlights in share modal)**

Continue from Step 2 — the share modal opens after saving.

1. Confirm the Highlights section in the share modal contains the expected history-derived content (streaks, milestones, quarter standings, in-form) — i.e. **not** blank or limited to tonight.
2. Close the share modal. Click **Share** on the resulted `PlayedCard`.
3. Paste the clipboard contents somewhere and compare against the Highlights in the modal. They should match (modulo whitespace).

- [ ] **Step 4: Sanity-check the unchanged paths**

1. The *live* `NextMatchCard` → **Result Game** flow still records correctly (ratings preserved, highlights complete). This is the path that worked before this fix; confirm it still works.
2. The Share button on `PlayedCard` / `DnfCard` still appears **only** on the most-recent played/DNF card, not on older ones.
3. `CancelledCard` and `UnrecordedCard` still render without errors.

- [ ] **Step 5: If everything passes, the branch is ready for review.**

This task does not produce a commit on its own.

---

## Self-review

- **Spec coverage:** Bug 1 fix → Task 4 Step 1 (ratings on the local `ScheduledWeek`). Bug 2 fix → Task 4 Step 2 (`leagueName` / `weeks` forwarded). Most-recent gating preserved → Tasks 1–3 (`isMostRecent` plumbing). Testing strategy (manual verification) → Task 5.
- **Placeholders:** none — every step has the exact code.
- **Type consistency:** `isMostRecent: boolean` introduced uniformly across `MatchCardProps`, `PlayedCardProps`, `DnfCardProps`, `AwaitingResultCardProps`. New `AwaitingResultCardProps.leagueName` / `weeks` match the existing optional types on `MatchCardProps`.
