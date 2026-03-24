# Editable League Name Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow league admins to edit the league name from the League Details tab in Settings, using the same Save button as all other detail fields.

**Architecture:** Extend the existing `LeagueDetailsForm` component with two new props (`leagueName`, `onNameSaved`), add a name text input above location, and update `PATCH /api/league/[id]/details` to accept and persist the name field. The settings page already holds `leagueName` in state from `fetchGames()` and just needs to pass it down. No migration, no new routes, no feature flags.

**Tech Stack:** Next.js 14 App Router, TypeScript (strict), Supabase, Tailwind CSS, Jest (test runner)

---

## File Map

| File | Change |
|---|---|
| `app/api/league/[id]/details/route.ts` | Accept + validate `name` in PATCH body; include in Supabase update |
| `components/LeagueDetailsForm.tsx` | Add `leagueName`/`onNameSaved` props; add name input above location; send name in payload; call callback on success |
| `app/[leagueId]/settings/page.tsx` | Pass `leagueName` and `onNameSaved` props to `<LeagueDetailsForm>` |

---

## Task 1: Update the PATCH handler to accept `name`

**Files:**
- Modify: `app/api/league/[id]/details/route.ts:49-62`

The existing handler already extracts `location`, `day`, `kickoff_time`, and `bio` from the request body using a nullable coercion pattern (`|| null`). `name` must NOT use this pattern — it is required and NOT NULL in the DB. Extract it separately, return 400 if blank, then include it in the update.

- [ ] **Step 1: Add `name` extraction and validation to the PATCH handler**

Open `app/api/league/[id]/details/route.ts`. After line 53 (the `bio` extraction), add the `name` extraction and early return:

```ts
// existing lines 50-53:
const location    = typeof b.location     === 'string' ? b.location.trim()     || null : null
const day         = typeof b.day          === 'string' && VALID_DAYS.includes(b.day) ? b.day : null
const kickoff_time = typeof b.kickoff_time === 'string' ? b.kickoff_time.trim() || null : null
const bio         = typeof b.bio          === 'string' ? b.bio.trim()          || null : null

// add after bio:
const name = typeof b.name === 'string' ? b.name.trim() : ''
if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
```

- [ ] **Step 2: Include `name` in the Supabase update call**

Change line 58 from:
```ts
    .update({ location, day, kickoff_time, bio })
```
to:
```ts
    .update({ name, location, day, kickoff_time, bio })
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add app/api/league/\[id\]/details/route.ts
git commit -m "feat: accept and persist name in PATCH /api/league/[id]/details"
```

---

## Task 2: Update `LeagueDetailsForm` with the name field

**Files:**
- Modify: `components/LeagueDetailsForm.tsx`

Add `leagueName: string` and `onNameSaved: (name: string) => void` props. Add `name` to controlled state. Render a text input above the location field. Include `name` in the save payload. Call `onNameSaved` on successful save. Note: the `LeagueInfoBar` preview inside the form does NOT need to show the name — the info bar only shows location, day/time, player count, and bio.

- [ ] **Step 1: Add the two new props to the interface and destructure them**

Change the `LeagueDetailsFormProps` interface (lines 15–19) from:

```ts
interface LeagueDetailsFormProps {
  leagueId: string
  initialDetails: LeagueDetails
  playerCount: number
}
```

to:

```ts
interface LeagueDetailsFormProps {
  leagueId: string
  initialDetails: LeagueDetails
  playerCount: number
  leagueName: string
  onNameSaved: (name: string) => void
}
```

Update the destructured params (lines 21–25) from:

```ts
export function LeagueDetailsForm({
  leagueId,
  initialDetails,
  playerCount,
}: LeagueDetailsFormProps) {
```

to:

```ts
export function LeagueDetailsForm({
  leagueId,
  initialDetails,
  playerCount,
  leagueName,
  onNameSaved,
}: LeagueDetailsFormProps) {
```

- [ ] **Step 2: Add `name` to component state**

After line 29 (`const [bio, setBio] = useState(...)`), add:

```ts
const [name, setName] = useState(leagueName)
```

- [ ] **Step 3: Add the name input to the JSX above the location field**

The location field starts at line 89 with `{/* Location */}`. Insert the name field block immediately before it, inside the `<div className="space-y-4 p-4">`:

```tsx
{/* League name */}
<div className="space-y-1.5">
  <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
    League name
  </label>
  <input
    type="text"
    value={name}
    onChange={(e) => { setName(e.target.value); markDirty() }}
    placeholder="e.g. Craft Football"
    maxLength={80}
    required
    className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-slate-400"
  />
</div>
```

- [ ] **Step 4: Add client-side validation and send `name` in the save payload**

In `handleSave`, add a guard at the top of the function (before `setSaving(true)`):

```ts
async function handleSave() {
  if (!name.trim()) {
    setError('League name is required')
    return
  }
  setSaving(true)
  // ...
```

Update the `JSON.stringify` body (lines 54–59) to include `name`:

```ts
body: JSON.stringify({
  name: name.trim(),
  location: location || null,
  day: day || null,
  kickoff_time: kickoffTime || null,
  bio: bio || null,
}),
```

- [ ] **Step 5: Call `onNameSaved` on successful save**

In the `else` branch after `setSaved(true)` (line 65):

```ts
} else {
  setSaved(true)
  onNameSaved(name.trim())
}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add components/LeagueDetailsForm.tsx
git commit -m "feat: add league name field to LeagueDetailsForm"
```

---

## Task 3: Wire up the new props in the settings page

**Files:**
- Modify: `app/[leagueId]/settings/page.tsx:232-236`

The settings page already has `leagueName` state (line 38) populated from `fetchGames()` (line 70). Pass it to `<LeagueDetailsForm>` along with a handler that calls `setLeagueName` to keep the header subtitle in sync after a save.

- [ ] **Step 1: Update the `<LeagueDetailsForm>` usage**

Find the `<LeagueDetailsForm>` render (lines 232–236):

```tsx
<LeagueDetailsForm
  leagueId={leagueId}
  initialDetails={leagueDetails ?? { location: null, day: null, kickoff_time: null, bio: null }}
  playerCount={playerCount}
/>
```

Replace with:

```tsx
<LeagueDetailsForm
  leagueId={leagueId}
  initialDetails={leagueDetails ?? { location: null, day: null, kickoff_time: null, bio: null }}
  playerCount={playerCount}
  leagueName={leagueName}
  onNameSaved={setLeagueName}
/>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Run the test suite to confirm no regressions**

```bash
npm test
```
Expected: all existing tests pass

- [ ] **Step 4: Manually verify the feature**

Start the dev server:
```bash
npm run dev
```

1. Navigate to Settings → League Details for any league
2. Confirm a "League name" text input appears above the Location field, pre-populated with the current name
3. Change the name to "Craft Football" and click "Save details"
4. Confirm the subtitle below "Settings" heading updates immediately to "Craft Football"
5. Reload the page — confirm the name persists

- [ ] **Step 5: Commit**

```bash
git add "app/[leagueId]/settings/page.tsx"
git commit -m "feat: wire leagueName and onNameSaved props into settings page"
```
