# Settings Page — Members & Features Redesign

**Date:** 2026-03-20
**Status:** Approved

---

## Overview

Restructure the league settings page from two sections (Links, Members) to two tabs (Members, Features). Consolidate invite link generation and member management into a single Members tab. Add a Features tab with function-grouped controls for Team Builder access and Player Stats visibility. The existing `AdminFeaturePanel.tsx` is deleted and replaced with new function-grouped components.

---

## Section 1 — Database

### Migration: add `role` to `game_invites` and update unique constraint

The existing `game_invites` table uses `email = '*'` as a sentinel value for open (anyone-can-accept) invite links. The current unique constraint is `UNIQUE(game_id, email)`. To support a member link and an admin link coexisting for the same league, `role` is included in the constraint. **Having one admin open-invite row and one member open-invite row simultaneously for the same league is the intended behaviour** — this is not a bug.

Full migration (single file):

```sql
-- 1. Add role column (defaults to 'admin' — existing rows are unaffected)
ALTER TABLE game_invites
  ADD COLUMN role text NOT NULL DEFAULT 'admin'
  CHECK (role IN ('admin', 'member'));

-- 2. Drop old unique constraint
ALTER TABLE game_invites
  DROP CONSTRAINT IF EXISTS game_invites_game_id_email_key;

-- 3. Add new constraint including role
ALTER TABLE game_invites
  ADD CONSTRAINT game_invites_game_id_email_role_key UNIQUE (game_id, email, role);
```

### Update `accept_game_invite` RPC

Replace the hardcoded `'admin'` with `inv.role`. Open invites use `email = '*'` and skip the email check. Open invite rows are deleted on accept (single-use, same as the existing behaviour). Full replacement function:

```sql
CREATE OR REPLACE FUNCTION public.accept_game_invite(invite_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv game_invites;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO inv FROM game_invites
  WHERE token = invite_token
    AND expires_at > now()
  LIMIT 1;

  IF inv IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invite';
  END IF;

  -- Open invites (email='*') or bootstrap invites (invited_by IS NULL): skip email check
  IF inv.email != '*' AND inv.invited_by IS NOT NULL AND lower(auth.email()) != lower(inv.email) THEN
    RAISE EXCEPTION 'Invite was sent to a different email';
  END IF;

  INSERT INTO game_members (game_id, user_id, role)
  VALUES (inv.game_id, auth.uid(), inv.role)
  ON CONFLICT (game_id, user_id) DO NOTHING;

  -- Delete on accept — open-invite tokens are single-use
  DELETE FROM game_invites WHERE id = inv.id;

  RETURN inv.game_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_game_invite(text) TO authenticated;
```

---

## Section 2 — Settings page restructure

**File:** `app/[leagueId]/settings/page.tsx`

- Change `Section` type from `'links' | 'members'` to `'members' | 'features'`
- Remove the entire Links tab: delete `inviteLink`, `inviteLoading`, `inviteError`, `copiedInvite` state variables and the `generateInviteLink` function
- Remove the `{section === 'links' && ...}` render block
- Update `NAV` array to two entries: Members (`Users` icon) and Features (`Settings2` icon from lucide-react)
- Default active tab: `'members'`
- Both tabs load data lazily on first activation via `useEffect` on `section` change (matching the existing pattern for `section === 'members'`)

### Features tab state

```ts
const [features, setFeatures] = useState<LeagueFeature[]>([])
const [featuresLoading, setFeaturesLoading] = useState(false)

const loadFeatures = useCallback(async () => {
  setFeaturesLoading(true)
  try {
    const res = await fetch(`/api/league/${leagueId}/features`, { credentials: 'include' })
    const data = await res.json()
    setFeatures(Array.isArray(data) ? data : [])
  } finally {
    setFeaturesLoading(false)
  }
}, [leagueId])

useEffect(() => {
  if (!isAdmin) return
  if (section === 'features') loadFeatures()
}, [section, isAdmin, loadFeatures])
```

---

## Section 3 — Members tab

### Invite links — auto-create on tab mount

On Members tab mount, fire two parallel `POST /api/invites` requests:
- `{ gameId, role: 'member' }` → member invite link
- `{ gameId, role: 'admin' }` → admin invite link

The POST handler upserts via `ON CONFLICT(game_id, email, role)` so re-mounting the tab returns the same link until it expires (no new token generated unless Regenerate is explicitly clicked). Both links are always present after mount — there is no empty/null state to handle.

Clicking **Regenerate** silently invalidates the prior token (the upsert overwrites it). No confirmation dialog is required.

**`/api/invites` route changes (POST handler only — three changes to `app/api/invites/route.ts`):**

1. Read and validate `role` from request body: `const role = body?.role === 'member' ? 'member' : 'admin'`
2. Include `role` in the upsert row: `{ game_id: gameId, email: '*', invited_by: user.id, token, expires_at, role }`
3. Change the `onConflict` string from `'game_id,email'` to `'game_id,email,role'`

### Invite links UI

```
┌─ Invite Links ────────────────────────────────────────────────────────┐
│ Member link  accepted user joins as member · Expires 27 Mar 2026  [Copy] [Regenerate] │
│ Admin link   accepted user joins as admin  · Expires 27 Mar 2026  [Copy] [Regenerate] │
└───────────────────────────────────────────────────────────────────────┘
```

Expiry is displayed as `Expires DD MMM YYYY` (formatted from the `expiresAt` ISO string returned by the API).

State shape:

```ts
const [memberLink, setMemberLink] = useState<string | null>(null)
const [adminLink,  setAdminLink]  = useState<string | null>(null)
const [memberExpiry, setMemberExpiry] = useState<string | null>(null)
const [adminExpiry,  setAdminExpiry]  = useState<string | null>(null)
const [loadingRole,  setLoadingRole]  = useState<'member' | 'admin' | null>(null)
const [copiedRole,   setCopiedRole]   = useState<'member' | 'admin' | null>(null)
const [inviteError,  setInviteError]  = useState<string | null>(null)
```

- **Copy** — writes link to clipboard, sets `copiedRole` to that role for 2s, then clears
- **Regenerate** — sets `loadingRole`, calls `POST /api/invites` for that role, updates the relevant link + expiry state, clears `loadingRole`. No confirmation required.

### Member list

`AdminMemberTable` is unchanged. Rendered below the invite links card with a section label ("League Members"). Loaded in the same `useEffect` that fires when `section === 'members'` becomes active.

---

## Section 4 — Features tab: new component architecture

### Intentional scope reduction

The existing `AdminFeaturePanel.tsx` includes a `ResultsPageCard` controlling `match_history` and `match_entry`. **These controls are intentionally not included in the new Features tab.** The feature keys remain in the DB and in `lib/types.ts` but have no admin UI in this redesign. This is a deliberate product decision.

### File changes

| Action | File |
|---|---|
| Delete | `components/AdminFeaturePanel.tsx` (confirmed dead code — no imports anywhere) |
| Create | `components/ui/toggle.tsx` — extracted from `AdminFeaturePanel.tsx` before deletion |
| Create | `components/TeamBuilderCard.tsx` |
| Create | `components/PlayerStatsCard.tsx` |
| Create | `components/FeaturePanel.tsx` |

### `Toggle` primitive (`components/ui/toggle.tsx`)

Extracted from the `Toggle` function in `AdminFeaturePanel.tsx`. One fix applied during extraction: change `aria-checked={enabled}` to `aria-checked={enabled ? 'true' : 'false'}` to satisfy React's string requirement for ARIA attributes.

Props interface:

```ts
interface ToggleProps {
  enabled: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}
```

Implemented as `<button role="switch" aria-checked={enabled ? 'true' : 'false'}>`. No Radix primitive.

### `FeaturePanel`

Props:

```ts
interface FeaturePanelProps {
  leagueId: string
  features: LeagueFeature[]
  onChanged: () => void
}
```

Internal `getFeature` helper. The safe default (`available: true`) is only reached when the server omits a feature key entirely — in practice all keys are seeded by `DEFAULT_FEATURES` in the API route, so this is a defensive fallback consistent with the existing `AdminFeaturePanel` pattern:

```ts
function getFeature(key: FeatureKey): LeagueFeature {
  return features.find(f => f.feature === key) ?? {
    feature: key,
    available: true,
    enabled: false,
    config: null,
    public_enabled: false,
    public_config: null,
  }
}
```

Renders in order:
1. Info banner — reuse the exact copy and styles from `AdminFeaturePanel.tsx`: sky-950/40 background, sky-400 heading "You always see everything", slate-400 body "As a league admin, your own view is never restricted by these settings. Changes here only affect members and public visitors — test with a member account to verify."
2. `<TeamBuilderCard leagueId={leagueId} feature={getFeature('team_builder')} onChanged={onChanged} />`
3. `<PlayerStatsCard leagueId={leagueId} feature={getFeature('player_stats')} onChanged={onChanged} />`

### `TeamBuilderCard`

Props: `leagueId: string`, `feature: LeagueFeature`, `onChanged: () => void`

Renders:
- Card header: "Team Builder" / "Smart auto-pick that generates balanced teams from the player list."
- Members row: `Toggle` bound to `feature.enabled`; on toggle → `PATCH` with `{ ...feature, enabled: val }`
- Public row: `Toggle` bound to `feature.public_enabled`; on toggle → `PATCH` with `{ ...feature, public_enabled: val }`

Manages own `saving: boolean`, `error: string | null`, `saved: boolean` state. Calls `onChanged()` after successful save.

### `PlayerStatsCard`

Props: `leagueId: string`, `feature: LeagueFeature`, `onChanged: () => void`

**Available stats constant** (defined in `PlayerStatsCard.tsx`; same values as `ALL_STATS` in the deleted `AdminFeaturePanel.tsx`):

```ts
const ALL_STATS = [
  { key: 'played',     label: 'Played' },
  { key: 'won',        label: 'Won' },
  { key: 'drew',       label: 'Drew' },
  { key: 'lost',       label: 'Lost' },
  { key: 'winRate',    label: 'Win Rate' },
  { key: 'recentForm', label: 'Recent Form' },
  { key: 'points',     label: 'Points' },
  { key: 'timesTeamA', label: 'Times Team A' },
  { key: 'timesTeamB', label: 'Times Team B' },
]
```

**Local state** (prevents race conditions on rapid checkbox changes):

```ts
const [localMembersConfig, setLocalMembersConfig] = useState<FeatureConfig | null>(null)
const [localPublicConfig,  setLocalPublicConfig]  = useState<FeatureConfig | null>(null)
const saveMembersTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
const savePublicTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

// featureRef always points to the latest feature prop so debounced callbacks
// don't capture a stale snapshot (e.g. a badge toggle firing onChanged → loadFeatures
// between a checkbox change and its 600ms debounce completing).
const featureRef = useRef(feature)
useEffect(() => { featureRef.current = feature }, [feature])

// Only sync from server when no debounce save is pending — prevents a completed
// save triggering onChanged → loadFeatures → prop update from clobbering changes
// the user made after the last debounced save fired.
useEffect(() => {
  if (!saveMembersTimerRef.current) setLocalMembersConfig(feature.config ?? null)
}, [feature.config])
useEffect(() => {
  if (!savePublicTimerRef.current) setLocalPublicConfig(feature.public_config ?? null)
}, [feature.public_config])
```

Two separate timer refs prevent a public-config change from cancelling an in-flight members-config debounce. All debounced save callbacks use `featureRef.current` (not the closed-over `feature`) when constructing the PATCH payload:

```ts
// debounced members save
saveTimerRef.current = setTimeout(() => {
  updateFeature({ ...featureRef.current, config: nextMembersConfig })
}, 600)

// debounced public save
saveTimerRef.current = setTimeout(() => {
  updateFeature({ ...featureRef.current, public_config: nextPublicConfig })
}, 600)
```

**Three sections:**

**1. Members stat columns** — checkbox grid over `ALL_STATS`, bound to `localMembersConfig?.visible_stats ?? ALL_STATS.map(s => s.key)`. On change: update `localMembersConfig`, clear + reset `saveMembersTimerRef` (600ms debounce), then `PATCH` with `{ ...feature, config: nextMembersConfig }`.

**2. Public stat columns** — identical grid bound to `localPublicConfig?.visible_stats ?? ALL_STATS.map(s => s.key)`. On change: update `localPublicConfig`, clear + reset `savePublicTimerRef` (600ms debounce), then `PATCH` with `{ ...feature, public_config: nextPublicConfig }`.

**3. Player card badges** — label "Mentality badge (ATT / BAL / DEF / GK)" with two independent toggles:
- **Members toggle**: bound to `localMembersConfig?.show_mentality ?? true`. On change: update `localMembersConfig`, immediate (no debounce) `PATCH` with `{ ...feature, config: { ...(localMembersConfig ?? {}), show_mentality: val } }`.
- **Public toggle**: bound to `localPublicConfig?.show_mentality ?? true`. On change: update `localPublicConfig`, immediate `PATCH` with `{ ...feature, public_config: { ...(localPublicConfig ?? {}), show_mentality: val } }`.

All PATCHes send the full `LeagueFeature` object. Manages own `saving: boolean`, `error: string | null`, `saved: boolean` state. Calls `onChanged()` after each successful save.

### What is NOT changed

- `lib/types.ts` — all types unchanged
- `PATCH /api/league/[id]/features` route — unchanged
- `AdminMemberTable` — unchanged
- `match_history`, `match_entry`, `player_comparison` keys — remain in types and DB, no UI controls in this redesign

---

## Out of scope

- Player comparison feature (marked "coming soon")
- Match Entry / match history controls in the Features tab
- Public league link sharing (craft-football.com public results page)
- CLAUDE.md update (separate task)
