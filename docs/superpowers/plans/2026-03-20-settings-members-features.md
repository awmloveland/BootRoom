# Settings Members & Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the league settings page into two tabs — Members (combined invite links + member management) and Features (Team Builder and Player Stats controls) — with a new dual-role invite link system backed by a DB schema change.

**Architecture:** One DB migration adds a `role` column to `game_invites` and updates the unique constraint and RPC. The API invite route gains role-awareness. The settings page is rebuilt around two new tabs, and `AdminFeaturePanel` is replaced by focused function-grouped components (`TeamBuilderCard`, `PlayerStatsCard`, `FeaturePanel`).

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind CSS, Supabase (PostgreSQL + RLS), lucide-react

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `supabase/migrations/20260320000001_invite_role.sql` | Add `role` to `game_invites`, update constraint, replace RPC |
| Modify | `app/api/invites/route.ts` | Accept `role` in POST body, include in upsert, update `onConflict` |
| Create | `components/ui/toggle.tsx` | Shared toggle switch primitive |
| Create | `components/TeamBuilderCard.tsx` | Team Builder access card (Members + Public toggles) |
| Create | `components/PlayerStatsCard.tsx` | Player stats visibility card (stat columns + mentality badge) |
| Create | `components/FeaturePanel.tsx` | Assembles feature cards + info banner |
| Delete | `components/AdminFeaturePanel.tsx` | Replaced by above three components |
| Modify | `app/[leagueId]/settings/page.tsx` | Restructure to Members + Features tabs |

---

## Task 1: DB Migration — invite role

**Files:**
- Create: `supabase/migrations/20260320000001_invite_role.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/20260320000001_invite_role.sql

-- 1. Add role column with default 'admin' so existing rows are unaffected
ALTER TABLE game_invites
  ADD COLUMN role text NOT NULL DEFAULT 'admin'
  CHECK (role IN ('admin', 'member'));

-- 2. Drop old unique constraint (name reflects the original schema)
ALTER TABLE game_invites
  DROP CONSTRAINT IF EXISTS game_invites_game_id_email_key;

-- 3. New constraint includes role — allows one admin link and one member link per league
ALTER TABLE game_invites
  ADD CONSTRAINT game_invites_game_id_email_role_key UNIQUE (game_id, email, role);

-- 4. Replace accept_game_invite to use inv.role instead of hardcoded 'admin'
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

  -- Open invite tokens are single-use — delete on accept
  DELETE FROM game_invites WHERE id = inv.id;

  RETURN inv.game_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_game_invite(text) TO authenticated;
```

- [ ] **Step 2: Apply migration via Supabase SQL Editor**

Open your Supabase project → SQL Editor → paste and run the contents of the migration file. Verify no errors in the output.

- [ ] **Step 3: Verify the schema change**

In Supabase SQL Editor run:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'game_invites'
ORDER BY ordinal_position;
```
Expected: a `role` row with `data_type = 'text'` and `column_default = 'admin'`.

- [ ] **Step 4: Commit the migration file**

```bash
git add supabase/migrations/20260320000001_invite_role.sql
git commit -m "feat: add role to game_invites and update accept_game_invite RPC"
```

---

## Task 2: Update `/api/invites` POST route

**Files:**
- Modify: `app/api/invites/route.ts`

- [ ] **Step 1: Open the file and locate the three lines to change**

File is at `app/api/invites/route.ts`. The changes are:
1. After `const email = ...` line, add role extraction
2. Add `role` to the upsert object
3. Change the `onConflict` string

- [ ] **Step 2: Apply the three changes**

Find this block (around lines 20–44):
```ts
  const email = rawEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail : '*'
  if (!gameId) {
    return NextResponse.json({ error: 'gameId required' }, { status: 400 })
  }
```
Add role extraction immediately after the `email` line:
```ts
  const role = body?.role === 'member' ? 'member' : 'admin'
```

Find the upsert object (around line 35):
```ts
  const { error } = await supabase.from('game_invites').upsert(
    {
      game_id: gameId,
      email,
      invited_by: user.id,
      token,
      expires_at: expiresAt.toISOString(),
    },
    { onConflict: 'game_id,email' }
  )
```
Replace with:
```ts
  const { error } = await supabase.from('game_invites').upsert(
    {
      game_id: gameId,
      email,
      invited_by: user.id,
      token,
      expires_at: expiresAt.toISOString(),
      role,
    },
    { onConflict: 'game_id,email,role' }
  )
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/willloveland/conductor/workspaces/bootroom/da-nang
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/invites/route.ts
git commit -m "feat: add role field to invite POST route"
```

---

## Task 3: Extract `Toggle` primitive

**Files:**
- Create: `components/ui/toggle.tsx`

- [ ] **Step 1: Create the file**

```tsx
// components/ui/toggle.tsx
'use client'

import { cn } from '@/lib/utils'

interface ToggleProps {
  enabled: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}

export function Toggle({ enabled, onChange, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled ? 'true' : 'false'}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        enabled ? 'bg-sky-600' : 'bg-slate-600',
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200',
          enabled ? 'translate-x-4' : 'translate-x-0',
        )}
      />
    </button>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/ui/toggle.tsx
git commit -m "feat: extract Toggle primitive to components/ui/toggle.tsx"
```

---

## Task 4: Build `TeamBuilderCard`

**Files:**
- Create: `components/TeamBuilderCard.tsx`

- [ ] **Step 1: Create the file**

```tsx
// components/TeamBuilderCard.tsx
'use client'

import { useState } from 'react'
import { Toggle } from '@/components/ui/toggle'
import { cn } from '@/lib/utils'
import type { LeagueFeature } from '@/lib/types'

interface TeamBuilderCardProps {
  leagueId: string
  feature: LeagueFeature
  onChanged: () => void
}

export function TeamBuilderCard({ leagueId, feature, onChanged }: TeamBuilderCardProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function update(patch: Partial<Pick<LeagueFeature, 'enabled' | 'public_enabled'>>) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/league/${leagueId}/features`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...feature, ...patch }),
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl bg-slate-800 border border-slate-700 overflow-hidden">
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-4 border-b border-slate-700/60">
        <div>
          <p className="text-sm font-semibold text-slate-200">Team Builder</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Smart auto-pick that generates balanced teams from the player list.
          </p>
        </div>
        {saved && <span className="text-xs text-emerald-400 font-medium shrink-0">Saved ✓</span>}
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-950/40 border-b border-red-900 px-4 py-2">
          {error}
        </p>
      )}

      <div className="px-4 divide-y divide-slate-700/40">
        <div className="flex items-center justify-between py-3 gap-4">
          <div>
            <p className="text-sm text-slate-300">Members</p>
            <p className="text-xs text-slate-600 mt-0.5">Visible to signed-in members.</p>
          </div>
          <Toggle
            enabled={feature.enabled}
            disabled={saving}
            onChange={(val) => update({ enabled: val })}
          />
        </div>
        <div className="flex items-center justify-between py-3 gap-4">
          <div>
            <p className="text-sm text-slate-300">Public</p>
            <p className="text-xs text-slate-600 mt-0.5">Visible to anyone with the league link.</p>
          </div>
          <Toggle
            enabled={feature.public_enabled}
            disabled={saving}
            onChange={(val) => update({ public_enabled: val })}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/TeamBuilderCard.tsx
git commit -m "feat: add TeamBuilderCard component"
```

---

## Task 5: Build `PlayerStatsCard`

**Files:**
- Create: `components/PlayerStatsCard.tsx`

- [ ] **Step 1: Create the file**

```tsx
// components/PlayerStatsCard.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { Toggle } from '@/components/ui/toggle'
import { cn } from '@/lib/utils'
import type { LeagueFeature, FeatureConfig } from '@/lib/types'

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

interface PlayerStatsCardProps {
  leagueId: string
  feature: LeagueFeature
  onChanged: () => void
}

export function PlayerStatsCard({ leagueId, feature, onChanged }: PlayerStatsCardProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [localMembersConfig, setLocalMembersConfig] = useState<FeatureConfig | null>(null)
  const [localPublicConfig,  setLocalPublicConfig]  = useState<FeatureConfig | null>(null)
  const saveMembersTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savePublicTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Always track latest feature prop so debounced callbacks don't use a stale snapshot
  const featureRef = useRef(feature)
  useEffect(() => { featureRef.current = feature }, [feature])

  // Only sync from server when no debounce is pending to avoid clobbering local changes
  useEffect(() => {
    if (!saveMembersTimerRef.current) setLocalMembersConfig(feature.config ?? null)
  }, [feature.config])
  useEffect(() => {
    if (!savePublicTimerRef.current) setLocalPublicConfig(feature.public_config ?? null)
  }, [feature.public_config])

  async function patchFeature(update: LeagueFeature) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/league/${leagueId}/features`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  function updateMembersStats(key: string, checked: boolean) {
    const current = localMembersConfig?.visible_stats ?? ALL_STATS.map((s) => s.key)
    const next = checked ? [...current, key] : current.filter((s) => s !== key)
    const nextConfig = { ...(localMembersConfig ?? {}), visible_stats: next } as FeatureConfig
    setLocalMembersConfig(nextConfig)
    if (saveMembersTimerRef.current) clearTimeout(saveMembersTimerRef.current)
    saveMembersTimerRef.current = setTimeout(() => {
      saveMembersTimerRef.current = null
      patchFeature({ ...featureRef.current, config: nextConfig })
    }, 600)
  }

  function updatePublicStats(key: string, checked: boolean) {
    const current = localPublicConfig?.visible_stats ?? ALL_STATS.map((s) => s.key)
    const next = checked ? [...current, key] : current.filter((s) => s !== key)
    const nextConfig = { ...(localPublicConfig ?? {}), visible_stats: next } as FeatureConfig
    setLocalPublicConfig(nextConfig)
    if (savePublicTimerRef.current) clearTimeout(savePublicTimerRef.current)
    savePublicTimerRef.current = setTimeout(() => {
      savePublicTimerRef.current = null
      patchFeature({ ...featureRef.current, public_config: nextConfig })
    }, 600)
  }

  function updateMentalityMembers(val: boolean) {
    const nextConfig = { ...(localMembersConfig ?? {}), show_mentality: val } as FeatureConfig
    setLocalMembersConfig(nextConfig)
    patchFeature({ ...featureRef.current, config: nextConfig })
  }

  function updateMentalityPublic(val: boolean) {
    const nextConfig = { ...(localPublicConfig ?? {}), show_mentality: val } as FeatureConfig
    setLocalPublicConfig(nextConfig)
    patchFeature({ ...featureRef.current, public_config: nextConfig })
  }

  const membersVisible = localMembersConfig?.visible_stats ?? ALL_STATS.map((s) => s.key)
  const publicVisible  = localPublicConfig?.visible_stats  ?? ALL_STATS.map((s) => s.key)
  const membersMentality = localMembersConfig?.show_mentality ?? true
  const publicMentality  = localPublicConfig?.show_mentality  ?? true

  return (
    <div className="rounded-xl bg-slate-800 border border-slate-700 overflow-hidden">
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-4 border-b border-slate-700/60">
        <div>
          <p className="text-sm font-semibold text-slate-200">Player Stats</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Choose which stat columns and badges are visible on the players page for each audience.
          </p>
        </div>
        {saved && <span className="text-xs text-emerald-400 font-medium shrink-0">Saved ✓</span>}
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-950/40 border-b border-red-900 px-4 py-2">
          {error}
        </p>
      )}

      <div className="px-4 py-4 space-y-6">

        {/* Members stat columns */}
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">Members</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-2 gap-x-3">
            {ALL_STATS.map((stat) => {
              const checked = membersVisible.includes(stat.key)
              return (
                <label key={stat.key} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={saving}
                    onChange={() => updateMembersStats(stat.key, !checked)}
                    className="rounded border-slate-600 bg-slate-700 text-sky-500 focus:ring-sky-400 disabled:opacity-40"
                  />
                  <span className="text-xs text-slate-400 group-hover:text-slate-300 transition-colors">
                    {stat.label}
                  </span>
                </label>
              )
            })}
          </div>
        </div>

        {/* Public stat columns */}
        <div className="border-t border-slate-700/40 pt-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">Public</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-2 gap-x-3">
            {ALL_STATS.map((stat) => {
              const checked = publicVisible.includes(stat.key)
              return (
                <label key={stat.key} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={saving}
                    onChange={() => updatePublicStats(stat.key, !checked)}
                    className="rounded border-slate-600 bg-slate-700 text-sky-500 focus:ring-sky-400 disabled:opacity-40"
                  />
                  <span className="text-xs text-slate-400 group-hover:text-slate-300 transition-colors">
                    {stat.label}
                  </span>
                </label>
              )
            })}
          </div>
        </div>

        {/* Mentality badge — Members + Public */}
        <div className="border-t border-slate-700/40 pt-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">Player card badges</p>
          <p className="text-xs text-slate-300 mb-3">
            Mentality badge{' '}
            <span className="text-slate-500">(ATT / BAL / DEF / GK)</span>
          </p>
          <div className="rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2.5 bg-slate-900/60 border-b border-slate-700/40">
              <span className="text-sm text-slate-300">Members</span>
              <Toggle enabled={membersMentality} disabled={saving} onChange={updateMentalityMembers} />
            </div>
            <div className="flex items-center justify-between px-3 py-2.5 bg-slate-900/60">
              <span className="text-sm text-slate-300">Public</span>
              <Toggle enabled={publicMentality} disabled={saving} onChange={updateMentalityPublic} />
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/PlayerStatsCard.tsx
git commit -m "feat: add PlayerStatsCard component"
```

---

## Task 6: Build `FeaturePanel`

**Files:**
- Create: `components/FeaturePanel.tsx`

- [ ] **Step 1: Create the file**

```tsx
// components/FeaturePanel.tsx
'use client'

import { TeamBuilderCard } from '@/components/TeamBuilderCard'
import { PlayerStatsCard } from '@/components/PlayerStatsCard'
import type { LeagueFeature, FeatureKey } from '@/lib/types'

interface FeaturePanelProps {
  leagueId: string
  features: LeagueFeature[]
  onChanged: () => void
}

function getFeature(features: LeagueFeature[], key: FeatureKey): LeagueFeature {
  return (
    features.find((f) => f.feature === key) ?? {
      feature: key,
      available: true,
      enabled: false,
      config: null,
      public_enabled: false,
      public_config: null,
    }
  )
}

export function FeaturePanel({ leagueId, features, onChanged }: FeaturePanelProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-sky-950/40 border border-sky-900/60 px-4 py-3">
        <p className="text-xs font-medium text-sky-400 mb-0.5">You always see everything</p>
        <p className="text-xs text-slate-400">
          As a league admin, your own view is never restricted by these settings.
          Changes here only affect{' '}
          <span className="text-slate-300">members</span> and{' '}
          <span className="text-slate-300">public visitors</span> — test with a member account to verify.
        </p>
      </div>

      <TeamBuilderCard
        leagueId={leagueId}
        feature={getFeature(features, 'team_builder')}
        onChanged={onChanged}
      />

      <PlayerStatsCard
        leagueId={leagueId}
        feature={getFeature(features, 'player_stats')}
        onChanged={onChanged}
      />
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/FeaturePanel.tsx
git commit -m "feat: add FeaturePanel component"
```

---

## Task 7: Delete `AdminFeaturePanel`

**Files:**
- Delete: `components/AdminFeaturePanel.tsx`

- [ ] **Step 1: Confirm no imports remain**

```bash
grep -r "AdminFeaturePanel" /Users/willloveland/conductor/workspaces/bootroom/da-nang --include="*.ts" --include="*.tsx" --exclude-dir=".git"
```
Expected output: only `components/AdminFeaturePanel.tsx` itself (no imports in other files).

- [ ] **Step 2: Delete the file**

```bash
rm /Users/willloveland/conductor/workspaces/bootroom/da-nang/components/AdminFeaturePanel.tsx
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add -A components/AdminFeaturePanel.tsx
git commit -m "refactor: delete AdminFeaturePanel (replaced by FeaturePanel)"
```

---

## Task 8: Restructure settings page

**Files:**
- Modify: `app/[leagueId]/settings/page.tsx`

- [ ] **Step 1: Replace the entire file contents**

```tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Check, Copy, Settings2, Users } from 'lucide-react'
import { fetchGames } from '@/lib/data'
import { AdminMemberTable } from '@/components/AdminMemberTable'
import { FeaturePanel } from '@/components/FeaturePanel'
import { cn } from '@/lib/utils'
import type { LeagueMember, LeagueFeature } from '@/lib/types'

type Section = 'members' | 'features'

const NAV: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: 'members',  label: 'Members',  icon: <Users className="size-4" /> },
  { id: 'features', label: 'Features', icon: <Settings2 className="size-4" /> },
]

function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function LeagueSettingsPage() {
  const params = useParams()
  const router = useRouter()
  const leagueId = (params?.leagueId as string) ?? ''

  const [section, setSection] = useState<Section>('members')
  const [leagueName, setLeagueName] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  // ── Members tab state ──────────────────────────────────────────────────────
  const [members, setMembers] = useState<LeagueMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)

  const [memberLink,   setMemberLink]   = useState<string | null>(null)
  const [adminLink,    setAdminLink]    = useState<string | null>(null)
  const [memberExpiry, setMemberExpiry] = useState<string | null>(null)
  const [adminExpiry,  setAdminExpiry]  = useState<string | null>(null)
  const [loadingRole,  setLoadingRole]  = useState<'member' | 'admin' | null>(null)
  const [copiedRole,   setCopiedRole]   = useState<'member' | 'admin' | null>(null)
  const [inviteError,  setInviteError]  = useState<string | null>(null)

  // ── Features tab state ─────────────────────────────────────────────────────
  const [features, setFeatures] = useState<LeagueFeature[]>([])
  const [featuresLoading, setFeaturesLoading] = useState(false)

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        const games = await fetchGames()
        const game = games.find((g) => g.id === leagueId)
        if (!game) { router.replace('/'); return }
        setLeagueName(game.name)
        if (!['creator', 'admin'].includes(game.role)) {
          router.replace(`/${leagueId}/results`)
          return
        }
        setIsAdmin(true)
      } catch {
        router.replace('/')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [leagueId, router])

  // ── Data loaders ───────────────────────────────────────────────────────────
  async function generateLink(role: 'member' | 'admin') {
    setLoadingRole(role)
    setInviteError(null)
    try {
      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: leagueId, role }),
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create invite')
      if (role === 'member') {
        setMemberLink(data.link)
        setMemberExpiry(data.expiresAt)
      } else {
        setAdminLink(data.link)
        setAdminExpiry(data.expiresAt)
      }
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoadingRole(null)
    }
  }

  const loadMembers = useCallback(async () => {
    setMembersLoading(true)
    try {
      const res = await fetch(`/api/league/${leagueId}/members`, { credentials: 'include' })
      const data = await res.json()
      setMembers(Array.isArray(data) ? data : [])
    } catch {
      setMembers([])
    } finally {
      setMembersLoading(false)
    }
  }, [leagueId])

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
    if (section === 'members') {
      loadMembers()
      generateLink('member')
      generateLink('admin')
    }
    if (section === 'features') loadFeatures()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, isAdmin])

  async function copyLink(link: string, role: 'member' | 'admin') {
    await navigator.clipboard.writeText(link)
    setCopiedRole(role)
    setTimeout(() => setCopiedRole(null), 2000)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <p className="text-slate-400">Loading…</p>
      </div>
    )
  }

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-100">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">{leagueName}</p>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-700">
        {NAV.map((nav) => (
          <button
            key={nav.id}
            onClick={() => setSection(nav.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              section === nav.id
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            )}
          >
            {nav.icon}
            {nav.label}
          </button>
        ))}
      </div>

      {/* ── MEMBERS ── */}
      {section === 'members' && (
        <div className="space-y-6">

          {/* Invite links */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Invite Links
            </p>
            <div className="rounded-lg bg-slate-800 border border-slate-700 overflow-hidden">
              {inviteError && (
                <p className="text-sm text-red-400 px-4 py-2 border-b border-slate-700">{inviteError}</p>
              )}
              {(
                [
                  { role: 'member' as const, link: memberLink, expiry: memberExpiry, label: 'Member link', desc: 'accepted user joins as member' },
                  { role: 'admin'  as const, link: adminLink,  expiry: adminExpiry,  label: 'Admin link',  desc: 'accepted user joins as admin' },
                ] as const
              ).map(({ role, link, expiry, label, desc }, i) => (
                <div
                  key={role}
                  className={cn('flex items-center justify-between gap-3 px-4 py-3', i > 0 && 'border-t border-slate-700/60')}
                >
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-slate-200">{label}</span>
                    <span className="text-xs text-slate-500 ml-2">{desc}</span>
                    {expiry && (
                      <span className="text-xs text-slate-600 ml-2">· Expires {formatExpiry(expiry)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {link ? (
                      <>
                        <button
                          onClick={() => copyLink(link, role)}
                          className="flex items-center gap-1 text-xs font-medium text-sky-400 hover:text-sky-300 transition-colors"
                        >
                          {copiedRole === role ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                          {copiedRole === role ? 'Copied' : 'Copy'}
                        </button>
                        <button
                          onClick={() => generateLink(role)}
                          disabled={loadingRole === role}
                          className="text-xs text-slate-500 hover:text-slate-300 disabled:opacity-50 transition-colors"
                        >
                          {loadingRole === role ? '…' : 'Regenerate'}
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-slate-600">
                        {loadingRole === role ? 'Generating…' : '—'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Member list */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              League Members
            </p>
            {membersLoading ? (
              <p className="text-slate-400 text-sm">Loading members…</p>
            ) : (
              <AdminMemberTable leagueId={leagueId} members={members} onChanged={loadMembers} />
            )}
          </div>
        </div>
      )}

      {/* ── FEATURES ── */}
      {section === 'features' && (
        <div>
          {featuresLoading ? (
            <p className="text-slate-400 text-sm">Loading…</p>
          ) : (
            <FeaturePanel
              leagueId={leagueId}
              features={features}
              onChanged={loadFeatures}
            />
          )}
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Manual verification checklist**

Start the dev server (`npm run dev`) and navigate to a league's settings page as an admin. Verify:

- [ ] Page loads on the Members tab by default
- [ ] Two invite link rows appear (Member link, Admin link) — both generate automatically
- [ ] Copy button copies the link and shows "Copied" for 2 seconds
- [ ] Regenerate button fetches a new token and updates the displayed link
- [ ] Expiry date renders correctly (e.g. "Expires 27 Mar 2026")
- [ ] Member list renders below the invite links with correct role badges and actions
- [ ] Switching to Features tab loads the FeaturePanel with Team Builder and Player Stats cards
- [ ] Team Builder Members/Public toggles save and show "Saved ✓"
- [ ] Stat column checkboxes debounce and save after 600ms
- [ ] Mentality badge Members/Public toggles save immediately

- [ ] **Step 4: Verify invite acceptance still works**

Using a test account, accept one of the generated member invite links. Confirm the accepted user appears in the Members list with `Member` role (not `Admin`).

- [ ] **Step 5: Commit**

```bash
git add app/[leagueId]/settings/page.tsx
git commit -m "feat: restructure settings page with Members and Features tabs"
```
