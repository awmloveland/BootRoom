# Lineup Share Preview Image Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shared lineup links unfurl into a picture of both teams in WhatsApp, iMessage, Slack and Discord.

**Architecture:** The Share button sends a signed, week-specific link (`/{slug}?lineup=<token>`) that the card fetches ahead of the tap from a new `POST /api/league/[id]/lineup-share` endpoint. The token is the week ID plus an HMAC over the week and both team lists. The Overview and Results pages read `?lineup=` in `generateMetadata` and add Open Graph tags pointing at `GET /api/og/lineup?t=<token>`. That route verifies the token against the current teams and renders a 1200×630 PNG with `ImageResponse` from `next/og`, or a generic Craft Football card when anything fails. Everything is gated by a new `lineup_share_image` feature flag.

**Tech Stack:** Next.js 16 App Router, React 19, `next/og` (Satori, already bundled with Next), Node `crypto`, Supabase service client, Jest + ts-jest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-05-lineup-share-preview-image-design.md`

---

## Before you start

- Run `npx jest` once. **Baseline: 12 tests in `lib/__tests__/email.templates.test.ts` and `lib/__tests__/email.notifications.test.ts` already fail on `main`.** They are unrelated. "All tests pass" in this plan means "no failures beyond those 12".
- Local dev talks to the **production** Supabase project. Never run anything that writes. The only database access in this plan is a read-only `select` in Task 13.
- Copy is British English with no em dashes. App copy says "lineup"/"Lineups" (Edit Lineups, Lineup Lab); follow that.
- Commit after every task. End every commit message with:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  ```

## File map

| File | Status | Responsibility |
|---|---|---|
| `assets/fonts/*.ttf`, `assets/fonts/README.md` | Create | Static TTFs for `next/og` (it cannot read WOFF2) |
| `next.config.js` | Modify | Bundle the fonts with the image route on Vercel |
| `lib/types.ts` | Modify | `FeatureKey` gains `lineup_share_image`; new `SharedLineup` interface |
| `lib/defaults.ts` | Modify | Default row for the new feature |
| `app/experiments/page.tsx` | Modify | Label for the new feature (`Record<FeatureKey, string>`) |
| `components/FeatureToggleCard.tsx` | Create | Generic Members/Public toggle card (replaces `QuarterCelebrationCard`) |
| `components/QuarterCelebrationCard.tsx` | Delete | Superseded by `FeatureToggleCard` |
| `components/FeaturePanel.tsx` | Modify | Render both toggle cards |
| `supabase/migrations/20261005000001_seed_lineup_share_image.sql` | Create | Register and seed the flag |
| `lib/features.ts` | Modify | `canSeeNextLineup(features, tier)` |
| `lib/lineupShare.ts` | Create | Server-only token sign/parse/verify, share URL, Open Graph metadata |
| `lib/lineupShareServer.ts` | Create | `loadSharedLineup(token)`: DB lookup + verification |
| `lib/utils.ts` | Modify | `buildShareText` `shareUrl` param, `lineupImageFontSize`, `fetchLineupShareUrl` |
| `app/api/league/[id]/lineup-share/route.ts` | Create | Signs share links |
| `lib/ogFonts.ts` | Create | Loads the TTFs once per server instance |
| `components/og/LineupShareImage.tsx` | Create | Satori JSX for the lineup image and the generic card |
| `app/api/og/lineup/route.tsx` | Create | Renders the PNG |
| `lib/metadata.ts` | Modify | `leaguePageMetadata` takes an optional lineup token |
| `app/[slug]/(tabs)/results/page.tsx`, `app/[slug]/(tabs)/overview/page.tsx` | Modify | Pass `searchParams.lineup` to metadata |
| `app/[slug]/page.tsx` | Modify | Keep the query string on the landing redirect |
| `components/NextMatchCard.tsx` | Modify | Prefetch the signed URL; use it in Share |
| `CLAUDE.md` | Modify | Document the `components/og/` styling exception, new feature key, fonts dir |

---

### Task 1: Bundle fonts for `next/og`

**Files:**
- Create: `assets/fonts/SpaceGrotesk-Bold.ttf`, `assets/fonts/Inter-Bold.ttf`, `assets/fonts/IBMPlexMono-Bold.ttf`, `assets/fonts/README.md`
- Modify: `next.config.js`

- [ ] **Step 1: Download the static bold TTFs**

These URLs come from the Google Fonts CSS API, which serves static TrueType files to clients without a browser user agent. If a URL 404s, re-derive it with `curl -s "https://fonts.googleapis.com/css2?family=Inter:wght@700" | grep -o "https[^)]*"` (swap the family).

```bash
mkdir -p assets/fonts
curl -sfL -o assets/fonts/SpaceGrotesk-Bold.ttf "https://fonts.gstatic.com/s/spacegrotesk/v22/V8mQoQDjQSkFtoMM3T6r8E7mF71Q-gOoraIAEj4PVksj.ttf"
curl -sfL -o assets/fonts/Inter-Bold.ttf "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf"
curl -sfL -o assets/fonts/IBMPlexMono-Bold.ttf "https://fonts.gstatic.com/s/ibmplexmono/v20/-F6qfjptAgt5VM-kVkqdyU8n3pQP8lc.ttf"
file assets/fonts/*.ttf
```

Expected: three lines, each `TrueType Font data`.

- [ ] **Step 2: Add the licence note**

Create `assets/fonts/README.md`:

```markdown
# Fonts for generated images

Static bold TTFs used by `next/og` (Satori) in `app/api/og/lineup/route.tsx`.
Satori cannot read the WOFF2 files `next/font` serves to the site, so these
copies live here and are read at runtime by `lib/ogFonts.ts`.

| File | Family | Source |
|---|---|---|
| `SpaceGrotesk-Bold.ttf` | Space Grotesk 700 | Google Fonts |
| `Inter-Bold.ttf` | Inter 700 | Google Fonts |
| `IBMPlexMono-Bold.ttf` | IBM Plex Mono 700 | Google Fonts |

All three are licensed under the SIL Open Font License 1.1
(https://openfontlicense.org).
```

- [ ] **Step 3: Make Vercel bundle the fonts with the route**

Replace `next.config.js` with:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // The lineup preview image reads these TTFs from disk at runtime. File
  // tracing cannot see a path built from process.cwd(), so include them.
  outputFileTracingIncludes: {
    '/api/og/lineup': ['./assets/fonts/**/*'],
  },
}

module.exports = nextConfig
```

- [ ] **Step 4: Commit**

```bash
git add assets/fonts next.config.js
git commit -m "Add bold TTFs for generated preview images

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `lineup_share_image` feature flag

**Files:**
- Modify: `lib/types.ts:90-95`, `lib/defaults.ts:15`, `app/experiments/page.tsx:10-16`, `components/FeaturePanel.tsx`
- Create: `components/FeatureToggleCard.tsx`, `supabase/migrations/20261005000001_seed_lineup_share_image.sql`
- Delete: `components/QuarterCelebrationCard.tsx`
- Test: `components/__tests__/FeatureToggleCard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/FeatureToggleCard.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FeatureToggleCard } from '@/components/FeatureToggleCard'
import type { LeagueFeature } from '@/lib/types'

const FEATURE: LeagueFeature = {
  feature: 'lineup_share_image',
  available: true,
  enabled: false,
  config: null,
  public_enabled: false,
  public_config: null,
}

describe('FeatureToggleCard', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch
  })

  it('renders the title and description', () => {
    render(
      <FeatureToggleCard
        leagueId="game-1"
        feature={FEATURE}
        title="Lineup Share Image"
        description="Add a picture of both teams to shared lineup links."
        onChanged={jest.fn()}
      />
    )
    expect(screen.getByText('Lineup Share Image')).toBeInTheDocument()
    expect(screen.getByText('Add a picture of both teams to shared lineup links.')).toBeInTheDocument()
  })

  it('PATCHes the members toggle and reports the change', async () => {
    const onChanged = jest.fn()
    render(
      <FeatureToggleCard leagueId="game-1" feature={FEATURE} title="T" description="D" onChanged={onChanged} />
    )
    fireEvent.click(screen.getAllByRole('switch')[0])
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('/api/league/game-1/features')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ ...FEATURE, enabled: true })
  })

  it('PATCHes the public toggle', async () => {
    render(
      <FeatureToggleCard leagueId="game-1" feature={FEATURE} title="T" description="D" onChanged={jest.fn()} />
    )
    fireEvent.click(screen.getAllByRole('switch')[1])
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual({ ...FEATURE, public_enabled: true })
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx jest components/__tests__/FeatureToggleCard.test.tsx`
Expected: FAIL with `Cannot find module '@/components/FeatureToggleCard'`.

- [ ] **Step 3: Add the feature key**

In `lib/types.ts`, change the `FeatureKey` union to:

```ts
export type FeatureKey =
  | 'match_history'
  | 'match_entry'
  | 'player_stats'
  | 'player_comparison'
  | 'quarter_celebration'
  | 'lineup_share_image';
```

In `lib/defaults.ts`, add after the `quarter_celebration` entry:

```ts
  { feature: 'lineup_share_image', enabled: false, config: null, public_enabled: false, public_config: null },
```

In `app/experiments/page.tsx`, add to `FEATURE_LABELS` after `quarter_celebration`:

```ts
  lineup_share_image:  'Lineup Share Image',
```

- [ ] **Step 4: Create the generic toggle card**

Create `components/FeatureToggleCard.tsx`. It is `QuarterCelebrationCard` with the title and description lifted into props:

```tsx
'use client'

import { useState } from 'react'
import { Toggle } from '@/components/ui/toggle'
import type { LeagueFeature } from '@/lib/types'

interface FeatureToggleCardProps {
  leagueId: string
  feature: LeagueFeature
  title: string
  description: string
  onChanged: () => void
}

/** Members / Public on-off card for a feature with no extra config. */
export function FeatureToggleCard({ leagueId, feature, title, description, onChanged }: FeatureToggleCardProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function update(patch: { enabled?: boolean; public_enabled?: boolean }) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/league/${leagueId}/features`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...feature, ...patch }),
      })
      if (!res.ok) throw new Error('Failed to save')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-[#1b2c46] bg-[#0a1421] overflow-hidden mb-3">
      <div className="px-4 py-3 border-b border-[#1b2c46]">
        <div className="text-sm font-semibold text-[#f4f9ff]">{title}</div>
        <div className="text-xs text-[#6f88a8] mt-0.5">{description}</div>
      </div>
      <div className="rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#0c1728] border-b border-[#1b2c46]">
          <span className="text-sm text-[#cfe0f4]">Members</span>
          <Toggle enabled={feature.enabled} onChange={(v) => update({ enabled: v })} disabled={saving} />
        </div>
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#0c1728]">
          <span className="text-sm text-[#cfe0f4]">Public</span>
          <Toggle enabled={feature.public_enabled} onChange={(v) => update({ public_enabled: v })} disabled={saving} />
        </div>
      </div>
      {error && <div className="px-4 py-2 text-xs text-[#e2686f]">{error}</div>}
    </div>
  )
}
```

- [ ] **Step 5: Use it in `FeaturePanel` and delete the old card**

In `components/FeaturePanel.tsx`, replace the `QuarterCelebrationCard` import with:

```tsx
import { FeatureToggleCard } from '@/components/FeatureToggleCard'
```

and replace the `<QuarterCelebrationCard … />` element with:

```tsx
      <FeatureToggleCard
        leagueId={leagueId}
        feature={getFeature(features, 'quarter_celebration')}
        title="Quarter Celebration"
        description="Show the champion + awards card on the Results tab when a quarter wraps. Admins always see it; choose who else does."
        onChanged={onChanged}
      />
      <FeatureToggleCard
        leagueId={leagueId}
        feature={getFeature(features, 'lineup_share_image')}
        title="Lineup Share Image"
        description="Add a picture of both teams to shared lineup links in WhatsApp, iMessage, Slack and Discord. Admins always get it; choose who else does."
        onChanged={onChanged}
      />
```

Then delete the old file:

```bash
git rm components/QuarterCelebrationCard.tsx
```

- [ ] **Step 6: Write the seed migration**

Create `supabase/migrations/20261005000001_seed_lineup_share_image.sql`:

```sql
-- Register the lineup_share_image feature as globally available
INSERT INTO feature_experiments (feature, available) VALUES
  ('lineup_share_image', true)
ON CONFLICT (feature) DO NOTHING;

-- Seed per-league rows for all existing leagues (admin-only by default)
INSERT INTO league_features (game_id, feature, enabled, public_enabled)
SELECT g.id, 'lineup_share_image', false, false
FROM games g
ON CONFLICT (game_id, feature) DO NOTHING;
```

- [ ] **Step 7: Run the tests and typecheck**

Run: `npx jest components/__tests__/FeatureToggleCard.test.tsx && npx tsc --noEmit`
Expected: 3 tests PASS; `tsc` prints nothing.

- [ ] **Step 8: Commit**

```bash
git add lib/types.ts lib/defaults.ts app/experiments/page.tsx components/FeatureToggleCard.tsx components/FeaturePanel.tsx components/__tests__/FeatureToggleCard.test.tsx supabase/migrations/20261005000001_seed_lineup_share_image.sql
git commit -m "Add the lineup_share_image feature flag

Generalises QuarterCelebrationCard into FeatureToggleCard so both
on/off features share one card.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `canSeeNextLineup`

**Files:**
- Modify: `lib/features.ts` (append)
- Test: `lib/__tests__/features.nextLineup.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/features.nextLineup.test.ts`:

```ts
import { canSeeNextLineup } from '../features'
import type { FeatureKey, LeagueFeature } from '../types'

function feature(key: FeatureKey, enabled: boolean, publicEnabled: boolean): LeagueFeature {
  return { feature: key, available: true, enabled, config: null, public_enabled: publicEnabled, public_config: null }
}

const ALL_OFF = [
  feature('match_history', false, false),
  feature('match_entry', false, false),
  feature('player_stats', false, false),
]

describe('canSeeNextLineup', () => {
  it('always lets admins see it', () => {
    expect(canSeeNextLineup(ALL_OFF, 'admin')).toBe(true)
  })

  it('lets members see it with match entry or match history on', () => {
    expect(canSeeNextLineup([feature('match_entry', true, false)], 'member')).toBe(true)
    expect(canSeeNextLineup([feature('match_history', true, false)], 'member')).toBe(true)
  })

  it('hides it from members when both are off', () => {
    expect(canSeeNextLineup(ALL_OFF, 'member')).toBe(false)
  })

  it('shows it to the public whenever the league is not hidden', () => {
    expect(canSeeNextLineup([feature('player_stats', true, true)], 'public')).toBe(true)
  })

  it('hides it from the public when the league is hidden', () => {
    expect(canSeeNextLineup(ALL_OFF, 'public')).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx jest lib/__tests__/features.nextLineup.test.ts`
Expected: FAIL, `canSeeNextLineup is not a function`.

- [ ] **Step 3: Implement**

Append to `lib/features.ts`:

```ts
/**
 * Whether a viewer at this tier can see the next match lineup card on the
 * Results tab. Mirrors the page: the public see the read-only lineup unless
 * the league is hidden; members need match entry or match history.
 */
export function canSeeNextLineup(features: LeagueFeature[], tier: VisibilityTier): boolean {
  if (tier === 'admin') return true
  if (tier === 'public') return !isLeagueHidden(features, tier)
  return (
    isFeatureEnabled(features, 'match_entry', tier) ||
    isFeatureEnabled(features, 'match_history', tier)
  )
}
```

- [ ] **Step 4: Run the test**

Run: `npx jest lib/__tests__/features.nextLineup.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/features.ts lib/__tests__/features.nextLineup.test.ts
git commit -m "Add canSeeNextLineup visibility helper

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Signed lineup tokens and share metadata

**Files:**
- Modify: `lib/types.ts` (add `SharedLineup` after `LeagueFeature`)
- Create: `lib/lineupShare.ts`
- Test: `lib/__tests__/lineupShare.test.ts`

- [ ] **Step 1: Add the `SharedLineup` type**

In `lib/types.ts`, after the `LeagueFeature` interface, add:

```ts
/** A verified shared lineup, as drawn in its link-preview image. */
export interface SharedLineup {
  leagueName: string;
  slug: string;
  week: number;
  date: string;               // 'DD MMM YYYY'
  format: string | null;
  teamA: string[];
  teamB: string[];
  location: string | null;
  kickoffTime: string | null; // e.g. "19:00"
}
```

- [ ] **Step 2: Write the failing test**

Create `lib/__tests__/lineupShare.test.ts`:

```ts
import {
  buildLineupShareMetadata,
  getShareSecret,
  lineupShareUrl,
  parseLineupToken,
  signLineupToken,
  verifyLineupSignature,
} from '../lineupShare'
import type { SharedLineup } from '../types'

const SECRET = 'test-secret'
const WEEK = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b'
const TEAMS = { teamA: ['Marcus Reid', 'Rav Singh'], teamB: ['Callum Shaw', 'Sofia Marsh'] }

function verify(token: string, teams = TEAMS, secret = SECRET): boolean {
  const parsed = parseLineupToken(token)
  return parsed !== null && verifyLineupSignature(secret, parsed, teams)
}

describe('lineup share tokens', () => {
  it('is a 22-char week id and a 16-char signature', () => {
    expect(signLineupToken(SECRET, WEEK, TEAMS)).toMatch(/^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{16}$/)
  })

  it('round-trips the week id and verifies', () => {
    const token = signLineupToken(SECRET, WEEK, TEAMS)
    expect(parseLineupToken(token)?.weekId).toBe(WEEK)
    expect(verify(token)).toBe(true)
  })

  it('treats upper-case week ids the same as lower-case', () => {
    expect(signLineupToken(SECRET, WEEK.toUpperCase(), TEAMS)).toBe(signLineupToken(SECRET, WEEK, TEAMS))
  })

  it('rejects a tampered signature', () => {
    const [id, sig] = signLineupToken(SECRET, WEEK, TEAMS).split('.')
    const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1)
    expect(verify(`${id}.${flipped}`)).toBe(false)
  })

  it('rejects a signature moved onto another week', () => {
    const [otherId] = signLineupToken(SECRET, '00000000-0000-4000-8000-000000000000', TEAMS).split('.')
    const [, sig] = signLineupToken(SECRET, WEEK, TEAMS).split('.')
    expect(verify(`${otherId}.${sig}`)).toBe(false)
  })

  it.each([
    ['a player changes', { teamA: ['Marcus Reid', 'Leon Brooks'], teamB: TEAMS.teamB }],
    ['a player is added', { teamA: [...TEAMS.teamA, 'Leon Brooks'], teamB: TEAMS.teamB }],
    ['a player is removed', { teamA: ['Marcus Reid'], teamB: TEAMS.teamB }],
    ['players are reordered', { teamA: ['Rav Singh', 'Marcus Reid'], teamB: TEAMS.teamB }],
    ['the teams are swapped', { teamA: TEAMS.teamB, teamB: TEAMS.teamA }],
  ])('fails verification when %s', (_label, teams) => {
    expect(verify(signLineupToken(SECRET, WEEK, TEAMS), teams)).toBe(false)
  })

  it('fails verification with a different secret', () => {
    expect(verify(signLineupToken(SECRET, WEEK, TEAMS), TEAMS, 'other-secret')).toBe(false)
  })

  it.each([
    '',
    'nope',
    'a.b',
    'a.b.c',
    `${'A'.repeat(22)}.${'A'.repeat(15)}`,
    `${'!'.repeat(22)}.${'A'.repeat(16)}`,
  ])('returns null for malformed token %p', (token) => {
    expect(parseLineupToken(token)).toBeNull()
  })
})

describe('getShareSecret', () => {
  const original = process.env.SHARE_SIGNING_SECRET
  afterEach(() => {
    if (original === undefined) delete process.env.SHARE_SIGNING_SECRET
    else process.env.SHARE_SIGNING_SECRET = original
  })

  it('returns the secret when set', () => {
    process.env.SHARE_SIGNING_SECRET = 'abc'
    expect(getShareSecret()).toBe('abc')
  })

  it('returns null when missing or empty', () => {
    delete process.env.SHARE_SIGNING_SECRET
    expect(getShareSecret()).toBeNull()
    process.env.SHARE_SIGNING_SECRET = ''
    expect(getShareSecret()).toBeNull()
  })
})

describe('lineupShareUrl', () => {
  it('points at the league root with the token', () => {
    expect(lineupShareUrl('the-boot-room', 'abc.def')).toBe('https://craft-football.com/the-boot-room?lineup=abc.def')
  })
})

describe('buildLineupShareMetadata', () => {
  const LINEUP: SharedLineup = {
    leagueName: 'The Boot Room',
    slug: 'the-boot-room',
    week: 13,
    date: '06 Oct 2026', // a Tuesday
    format: '6-a-side',
    teamA: ['Marcus Reid'],
    teamB: ['Callum Shaw'],
    location: 'Powerleague Shoreditch',
    kickoffTime: '19:00',
  }

  it('builds the title, description and large image', () => {
    const meta = buildLineupShareMetadata(LINEUP, 'tok.sig')
    expect(meta.openGraph?.title).toBe('Week 13 lineups · The Boot Room')
    expect(meta.openGraph?.description).toBe('Tue 06 Oct · 19:00 · Powerleague Shoreditch')
    expect(meta.openGraph?.images).toEqual([
      { url: '/api/og/lineup?t=tok.sig', width: 1200, height: 630, alt: 'Week 13 lineups · The Boot Room' },
    ])
    expect(meta.twitter).toEqual(expect.objectContaining({ card: 'summary_large_image' }))
  })

  it('leaves out kick-off and venue when not set', () => {
    const meta = buildLineupShareMetadata({ ...LINEUP, kickoffTime: null, location: null }, 'tok.sig')
    expect(meta.openGraph?.description).toBe('Tue 06 Oct')
  })
})
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `npx jest lib/__tests__/lineupShare.test.ts`
Expected: FAIL with `Cannot find module '../lineupShare'`.

- [ ] **Step 4: Implement**

Create `lib/lineupShare.ts`:

```ts
// Signed lineup share links. Server-only: uses Node's crypto.
//
// Token: <week id as base64url (22 chars)>.<signature (16 chars)>
// The signature covers the week and both team lists, so editing the lineups
// produces a new link and an old link stops verifying.
import { createHmac, timingSafeEqual } from 'crypto'
import type { Metadata } from 'next'
import { formatFixtureDate } from '@/lib/utils'
import type { SharedLineup } from '@/lib/types'

const SIG_BYTES = 12
const ENCODED_ID_RE = /^[A-Za-z0-9_-]{22}$/
const ENCODED_SIG_RE = /^[A-Za-z0-9_-]{16}$/
const UUID_HEX_RE = /^[0-9a-f]{32}$/

export interface LineupTeams {
  teamA: string[]
  teamB: string[]
}

export interface ParsedLineupToken {
  weekId: string
  signature: Buffer
}

/** The signing key, or null when signing is not configured. */
export function getShareSecret(): string | null {
  return process.env.SHARE_SIGNING_SECRET || null
}

function encodeWeekId(weekId: string): string {
  return Buffer.from(weekId.replace(/-/g, '').toLowerCase(), 'hex').toString('base64url')
}

function decodeWeekId(encoded: string): string | null {
  if (!ENCODED_ID_RE.test(encoded)) return null
  const hex = Buffer.from(encoded, 'base64url').toString('hex')
  if (!UUID_HEX_RE.test(hex)) return null
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function sign(secret: string, weekId: string, { teamA, teamB }: LineupTeams): Buffer {
  return createHmac('sha256', secret)
    .update(JSON.stringify(['lineup:v1', weekId.toLowerCase(), teamA, teamB]))
    .digest()
    .subarray(0, SIG_BYTES)
}

export function signLineupToken(secret: string, weekId: string, teams: LineupTeams): string {
  return `${encodeWeekId(weekId)}.${sign(secret, weekId, teams).toString('base64url')}`
}

/** Splits a token into its week id and signature. Null when malformed. */
export function parseLineupToken(token: string): ParsedLineupToken | null {
  const parts = token.split('.')
  if (parts.length !== 2 || !ENCODED_SIG_RE.test(parts[1])) return null
  const weekId = decodeWeekId(parts[0])
  if (!weekId) return null
  return { weekId, signature: Buffer.from(parts[1], 'base64url') }
}

export function verifyLineupSignature(secret: string, parsed: ParsedLineupToken, teams: LineupTeams): boolean {
  const expected = sign(secret, parsed.weekId, teams)
  return parsed.signature.length === expected.length && timingSafeEqual(parsed.signature, expected)
}

export function lineupShareUrl(slug: string, token: string): string {
  return `https://craft-football.com/${slug}?lineup=${token}`
}

/** Open Graph and Twitter tags that make a shared lineup link unfurl. */
export function buildLineupShareMetadata(lineup: SharedLineup, token: string): Metadata {
  const title = `Week ${lineup.week} lineups · ${lineup.leagueName}`
  const description = [formatFixtureDate(lineup.date), lineup.kickoffTime, lineup.location]
    .filter(Boolean)
    .join(' · ')
  const image = { url: `/api/og/lineup?t=${token}`, width: 1200, height: 630, alt: title }
  return {
    openGraph: { title, description, images: [image], siteName: 'Craft Football', type: 'website' },
    twitter: { card: 'summary_large_image', title, description, images: [image.url] },
  }
}
```

- [ ] **Step 5: Run the test**

Run: `npx jest lib/__tests__/lineupShare.test.ts`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/lineupShare.ts lib/__tests__/lineupShare.test.ts
git commit -m "Add signed lineup share tokens and share metadata

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `loadSharedLineup`

**Files:**
- Create: `lib/lineupShareServer.ts`
- Test: `lib/__tests__/lineupShareServer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/lineupShareServer.test.ts`:

```ts
import { createServiceClient } from '@/lib/supabase/service'
import { signLineupToken } from '@/lib/lineupShare'

jest.mock('@/lib/supabase/service', () => ({ createServiceClient: jest.fn() }))

// Import after the mock is registered.
import { loadSharedLineup } from '@/lib/lineupShareServer'

const SECRET = 'test-secret'
const WEEK_ID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b'
const WEEK_ROW = {
  game_id: 'game-1',
  week: 13,
  date: '06 Oct 2026',
  format: '6-a-side',
  team_a: ['Marcus Reid', 'Rav Singh'],
  team_b: ['Callum Shaw', 'Sofia Marsh'],
}
const GAME_ROW = { name: 'The Boot Room', slug: 'the-boot-room', location: 'Powerleague Shoreditch', kickoff_time: '19:00' }
const TOKEN = signLineupToken(SECRET, WEEK_ID, { teamA: WEEK_ROW.team_a, teamB: WEEK_ROW.team_b })

/** Service client whose `from(table)…maybeSingle()` resolves to rows[table]. */
function mockTables(rows: Record<string, unknown>) {
  const from = jest.fn((table: string) => {
    const chain: Record<string, jest.Mock> = {}
    chain.select = jest.fn(() => chain)
    chain.eq = jest.fn(() => chain)
    chain.maybeSingle = jest.fn().mockResolvedValue({ data: rows[table] ?? null, error: null })
    return chain
  })
  ;(createServiceClient as jest.Mock).mockReturnValue({ from })
  return from
}

beforeEach(() => {
  jest.resetAllMocks()
  process.env.SHARE_SIGNING_SECRET = SECRET
})
afterAll(() => {
  delete process.env.SHARE_SIGNING_SECRET
})

describe('loadSharedLineup', () => {
  it('returns the lineup for a valid token', async () => {
    mockTables({ weeks: WEEK_ROW, games: GAME_ROW })
    await expect(loadSharedLineup(TOKEN)).resolves.toEqual({
      leagueName: 'The Boot Room',
      slug: 'the-boot-room',
      week: 13,
      date: '06 Oct 2026',
      format: '6-a-side',
      teamA: ['Marcus Reid', 'Rav Singh'],
      teamB: ['Callum Shaw', 'Sofia Marsh'],
      location: 'Powerleague Shoreditch',
      kickoffTime: '19:00',
    })
  })

  it('returns null once the lineups have changed', async () => {
    mockTables({ weeks: { ...WEEK_ROW, team_a: ['Marcus Reid', 'Leon Brooks'] }, games: GAME_ROW })
    await expect(loadSharedLineup(TOKEN)).resolves.toBeNull()
  })

  it('returns null without touching the database when signing is not configured', async () => {
    delete process.env.SHARE_SIGNING_SECRET
    const from = mockTables({ weeks: WEEK_ROW, games: GAME_ROW })
    await expect(loadSharedLineup(TOKEN)).resolves.toBeNull()
    expect(from).not.toHaveBeenCalled()
  })

  it.each([null, undefined, '', 'garbage'])('returns null for token %p', async (token) => {
    const from = mockTables({ weeks: WEEK_ROW, games: GAME_ROW })
    await expect(loadSharedLineup(token)).resolves.toBeNull()
    expect(from).not.toHaveBeenCalled()
  })

  it('returns null when the week no longer exists', async () => {
    mockTables({ games: GAME_ROW })
    await expect(loadSharedLineup(TOKEN)).resolves.toBeNull()
  })

  it('returns null when the database throws', async () => {
    ;(createServiceClient as jest.Mock).mockImplementation(() => { throw new Error('boom') })
    await expect(loadSharedLineup(TOKEN)).resolves.toBeNull()
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx jest lib/__tests__/lineupShareServer.test.ts`
Expected: FAIL with `Cannot find module '@/lib/lineupShareServer'`.

- [ ] **Step 3: Implement**

Create `lib/lineupShareServer.ts`:

```ts
import { createServiceClient } from '@/lib/supabase/service'
import { getShareSecret, parseLineupToken, verifyLineupSignature } from '@/lib/lineupShare'
import type { SharedLineup } from '@/lib/types'

/**
 * Resolves a share token to the lineup it was signed for. Null when the token
 * is malformed, signing is not configured, the week is gone, or the lineups
 * have changed since the link was made. Never throws.
 *
 * Uses the service client: the token itself is the authorisation.
 */
export async function loadSharedLineup(token: string | null | undefined): Promise<SharedLineup | null> {
  const secret = getShareSecret()
  const parsed = token ? parseLineupToken(token) : null
  if (!secret || !parsed) return null

  try {
    const service = createServiceClient()
    const { data: week } = await service
      .from('weeks')
      .select('game_id, week, date, format, team_a, team_b')
      .eq('id', parsed.weekId)
      .maybeSingle()
    if (!week) return null

    const teamA: string[] = week.team_a ?? []
    const teamB: string[] = week.team_b ?? []
    if (!verifyLineupSignature(secret, parsed, { teamA, teamB })) return null

    const { data: game } = await service
      .from('games')
      .select('name, slug, location, kickoff_time')
      .eq('id', week.game_id)
      .maybeSingle()
    if (!game) return null

    return {
      leagueName: game.name,
      slug: game.slug,
      week: week.week,
      date: week.date,
      format: week.format ?? null,
      teamA,
      teamB,
      location: game.location ?? null,
      kickoffTime: game.kickoff_time ?? null,
    }
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run the test**

Run: `npx jest lib/__tests__/lineupShareServer.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/lineupShareServer.ts lib/__tests__/lineupShareServer.test.ts
git commit -m "Add loadSharedLineup to resolve share tokens

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Share-link endpoint

**Files:**
- Create: `app/api/league/[id]/lineup-share/route.ts`
- Test: `__tests__/lineup-share-route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lineup-share-route.test.ts`:

```ts
import { getAuthAndRole, getFeatures, getGame } from '@/lib/fetchers'
import { createServiceClient } from '@/lib/supabase/service'
import { parseLineupToken, verifyLineupSignature } from '@/lib/lineupShare'
import type { FeatureKey, GameRole, LeagueFeature } from '@/lib/types'

jest.mock('@/lib/fetchers', () => ({ getAuthAndRole: jest.fn(), getFeatures: jest.fn(), getGame: jest.fn() }))
jest.mock('@/lib/supabase/service', () => ({ createServiceClient: jest.fn() }))

import { POST } from '@/app/api/league/[id]/lineup-share/route'

const SECRET = 'test-secret'
const GAME_ID = 'game-1'
const WEEK_ID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b'
const WEEK = { id: WEEK_ID, status: 'scheduled', team_a: ['Marcus Reid'], team_b: ['Callum Shaw'] }

function feature(key: FeatureKey, enabled: boolean, publicEnabled = false): LeagueFeature {
  return { feature: key, available: true, enabled, config: null, public_enabled: publicEnabled, public_config: null }
}

function setup({
  role = 'member' as GameRole | null,
  features = [feature('lineup_share_image', true), feature('match_entry', true)],
  week = WEEK as unknown,
} = {}) {
  ;(getGame as jest.Mock).mockResolvedValue({ id: GAME_ID, slug: 'the-boot-room', name: 'The Boot Room' })
  ;(getAuthAndRole as jest.Mock).mockResolvedValue({ user: null, userRole: role, isAuthenticated: role !== null })
  ;(getFeatures as jest.Mock).mockResolvedValue(features)
  const chain: Record<string, jest.Mock> = {}
  chain.select = jest.fn(() => chain)
  chain.eq = jest.fn(() => chain)
  chain.maybeSingle = jest.fn().mockResolvedValue({ data: week, error: null })
  ;(createServiceClient as jest.Mock).mockReturnValue({ from: jest.fn(() => chain) })
  return chain
}

function call(body: unknown) {
  return POST(
    new Request(`http://localhost/api/league/${GAME_ID}/lineup-share`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: GAME_ID }) }
  )
}

beforeEach(() => {
  jest.resetAllMocks()
  process.env.SHARE_SIGNING_SECRET = SECRET
})
afterAll(() => {
  delete process.env.SHARE_SIGNING_SECRET
})

describe('POST /api/league/[id]/lineup-share', () => {
  it('returns a signed link that verifies against the lineups', async () => {
    const chain = setup()
    const res = await call({ weekId: WEEK_ID })
    expect(res.status).toBe(200)
    const { url } = await res.json()
    expect(url).toMatch(/^https:\/\/craft-football\.com\/the-boot-room\?lineup=[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{16}$/)
    const parsed = parseLineupToken(url.split('?lineup=')[1])!
    expect(parsed.weekId).toBe(WEEK_ID)
    expect(verifyLineupSignature(SECRET, parsed, { teamA: WEEK.team_a, teamB: WEEK.team_b })).toBe(true)
    // Scoped to this league.
    expect(chain.eq).toHaveBeenCalledWith('game_id', GAME_ID)
  })

  it('signs for admins even with every feature off', async () => {
    setup({ role: 'admin', features: [feature('lineup_share_image', false)] })
    expect((await (await call({ weekId: WEEK_ID })).json()).url).not.toBeNull()
  })

  it('signs for the public when the feature is public and the league is visible', async () => {
    setup({ role: null, features: [feature('lineup_share_image', false, true), feature('match_history', false, true)] })
    expect((await (await call({ weekId: WEEK_ID })).json()).url).not.toBeNull()
  })

  it.each([
    ['the feature is off for members', { features: [feature('lineup_share_image', false), feature('match_entry', true)] }],
    ['the member cannot see the lineup', { features: [feature('lineup_share_image', true)] }],
    ['the league is hidden from the public', { role: null, features: [feature('lineup_share_image', true, true)] }],
    ['the week is not scheduled', { week: { ...WEEK, status: 'played' } }],
    ['the week has no lineups', { week: { ...WEEK, team_b: [] } }],
    ['the week is not in this league', { week: null }],
  ])('returns url null when %s', async (_label, opts) => {
    setup(opts as Parameters<typeof setup>[0])
    const res = await call({ weekId: WEEK_ID })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ url: null })
  })

  it('returns url null when signing is not configured', async () => {
    delete process.env.SHARE_SIGNING_SECRET
    setup()
    await expect((await call({ weekId: WEEK_ID })).json()).resolves.toEqual({ url: null })
  })

  it('rejects a missing weekId with 400', async () => {
    setup()
    expect((await call({})).status).toBe(400)
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx jest __tests__/lineup-share-route.test.ts`
Expected: FAIL with `Cannot find module '@/app/api/league/[id]/lineup-share/route'`.

- [ ] **Step 3: Implement**

Create `app/api/league/[id]/lineup-share/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { getAuthAndRole, getFeatures, getGame } from '@/lib/fetchers'
import { createServiceClient } from '@/lib/supabase/service'
import { resolveVisibilityTier } from '@/lib/roles'
import { canSeeNextLineup, isFeatureEnabled } from '@/lib/features'
import { getShareSecret, lineupShareUrl, signLineupToken } from '@/lib/lineupShare'

function noLink() {
  return NextResponse.json({ url: null })
}

/**
 * POST — signs a share link for one of the league's scheduled lineups so its
 * link preview can show the teams. Returns { url: null } when the viewer
 * can't see the lineup, the feature is off for them, or signing isn't
 * configured; the card then shares the plain league link.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = (await request.json().catch(() => null)) as { weekId?: unknown } | null
  const weekId = typeof body?.weekId === 'string' ? body.weekId : ''
  if (!weekId) return NextResponse.json({ error: 'weekId is required' }, { status: 400 })

  const secret = getShareSecret()
  if (!secret) return noLink()

  const [game, { userRole }, features] = await Promise.all([
    getGame(id),
    getAuthAndRole(id),
    getFeatures(id),
  ])
  if (!game?.slug) return noLink()

  const tier = resolveVisibilityTier(userRole)
  if (!isFeatureEnabled(features, 'lineup_share_image', tier) || !canSeeNextLineup(features, tier)) {
    return noLink()
  }

  const { data: week } = await createServiceClient()
    .from('weeks')
    .select('id, status, team_a, team_b')
    .eq('id', weekId)
    .eq('game_id', id)
    .maybeSingle()
  const teamA: string[] = week?.team_a ?? []
  const teamB: string[] = week?.team_b ?? []
  if (!week || week.status !== 'scheduled' || teamA.length === 0 || teamB.length === 0) return noLink()

  const token = signLineupToken(secret, week.id, { teamA, teamB })
  return NextResponse.json({ url: lineupShareUrl(game.slug, token) })
}
```

- [ ] **Step 4: Run the test**

Run: `npx jest __tests__/lineup-share-route.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/api/league/[id]/lineup-share/route.ts" __tests__/lineup-share-route.test.ts
git commit -m "Add endpoint that signs lineup share links

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Share text, name sizing and the client fetch helper

**Files:**
- Modify: `lib/utils.ts` (`buildShareText` at ~line 384; append the new helpers after `shareOrCopy` at ~line 1127)
- Test: `lib/__tests__/utils.lineupShare.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/utils.lineupShare.test.ts`:

```ts
import { buildShareText, fetchLineupShareUrl, lineupImageFontSize } from '../utils'

describe('buildShareText shareUrl', () => {
  const base = {
    leagueName: 'The Boot Room',
    leagueSlug: 'the-boot-room',
    week: 13,
    date: '06 Oct 2026',
    format: '6-a-side',
    teamA: ['Marcus Reid'],
    teamB: ['Callum Shaw'],
    teamARating: 1,
    teamBRating: 1,
  }

  it('ends with the plain league link by default', () => {
    expect(buildShareText(base)).toMatch(/\n🔗 https:\/\/craft-football\.com\/the-boot-room$/)
  })

  it('ends with the signed link when given, leaving every other line alone', () => {
    const plain = buildShareText(base).split('\n')
    const signed = buildShareText({ ...base, shareUrl: 'https://craft-football.com/the-boot-room?lineup=a.b' }).split('\n')
    expect(signed.at(-1)).toBe('🔗 https://craft-football.com/the-boot-room?lineup=a.b')
    expect(signed.slice(0, -1)).toEqual(plain.slice(0, -1))
  })
})

describe('lineupImageFontSize', () => {
  it.each([
    [7, 14, 40], // 7-a-side, normal names: full size
    [0, 0, 40],  // degenerate input stays at full size
    [9, 12, 38], // more rows shrink to fit the height
    [11, 12, 31],
    [6, 30, 27], // a long name shrinks to fit the column
    [20, 10, 24], // never below the floor
    [6, 60, 24],
  ])('%i rows, longest name %i chars → %ipx', (rows, longest, expected) => {
    expect(lineupImageFontSize(rows, longest)).toBe(expected)
  })
})

describe('fetchLineupShareUrl', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  it('POSTs the week and returns the url', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ url: 'https://x/y?lineup=a.b' }) }) as unknown as typeof fetch
    await expect(fetchLineupShareUrl('game-1', 'week-1')).resolves.toBe('https://x/y?lineup=a.b')
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('/api/league/game-1/lineup-share')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ weekId: 'week-1' })
  })

  it.each([
    ['url is null', { ok: true, json: async () => ({ url: null }) }],
    ['the response fails', { ok: false, json: async () => ({}) }],
  ])('returns null when %s', async (_label, response) => {
    global.fetch = jest.fn().mockResolvedValue(response) as unknown as typeof fetch
    await expect(fetchLineupShareUrl('game-1', 'week-1')).resolves.toBeNull()
  })

  it('returns null when the request throws', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch
    await expect(fetchLineupShareUrl('game-1', 'week-1')).resolves.toBeNull()
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx jest lib/__tests__/utils.lineupShare.test.ts`
Expected: FAIL, `lineupImageFontSize is not a function` / `fetchLineupShareUrl is not a function`, and the signed-link case fails.

- [ ] **Step 3: Add `shareUrl` to `buildShareText`**

In `lib/utils.ts`, change `buildShareText`'s params and its last line. The params type gains:

```ts
  teamBRating: number
  /** Signed lineup link from the share endpoint; falls back to the league link. */
  shareUrl?: string
}): string {
  const { leagueName, leagueSlug, week, date, format, teamA, teamB, teamARating, teamBRating, shareUrl } = params
```

and the final array entry becomes:

```ts
    `🔗 ${shareUrl ?? `https://craft-football.com/${leagueSlug}`}`,
```

- [ ] **Step 4: Add the two helpers**

Append to `lib/utils.ts`, directly after the `shareOrCopy` function:

```ts
/**
 * Layout numbers for the lineup preview image (components/og). Names sit in
 * two 480px columns with ~440px of height between the team heading and the
 * wordmark; charWidth approximates Inter Bold's average glyph width in em.
 */
export const LINEUP_IMAGE = {
  maxFont: 40,
  minFont: 24,
  namesHeight: 440,
  columnWidth: 480,
  lineHeight: 1.28,
  charWidth: 0.58,
} as const

/**
 * Name size for the lineup preview image: as large as fits both the row count
 * and the longest name, between minFont and maxFont. Names that still don't
 * fit at minFont are cut off with an ellipsis by the image itself.
 */
export function lineupImageFontSize(rowCount: number, longestNameLength: number): number {
  const byHeight = LINEUP_IMAGE.namesHeight / (LINEUP_IMAGE.lineHeight * Math.max(rowCount, 1))
  const byWidth = LINEUP_IMAGE.columnWidth / (LINEUP_IMAGE.charWidth * Math.max(longestNameLength, 1))
  return Math.max(
    LINEUP_IMAGE.minFont,
    Math.min(LINEUP_IMAGE.maxFont, Math.floor(byHeight), Math.floor(byWidth))
  )
}

/**
 * Asks the server for a signed share link for a scheduled lineup. Null when
 * the server declines (feature off, not visible, not configured) or the
 * request fails; callers fall back to the plain league link.
 */
export async function fetchLineupShareUrl(leagueId: string, weekId: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/league/${leagueId}/lineup-share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ weekId }),
    })
    if (!res.ok) return null
    const body = (await res.json()) as { url?: unknown }
    return typeof body.url === 'string' ? body.url : null
  } catch {
    return null
  }
}
```

- [ ] **Step 5: Run the new and existing share tests**

Run: `npx jest lib/__tests__/utils.lineupShare.test.ts lib/__tests__/utils.winCopy.test.ts`
Expected: all PASS (the existing `buildShareText` tests in `utils.winCopy.test.ts` are unchanged and still pass).

- [ ] **Step 6: Commit**

```bash
git add lib/utils.ts lib/__tests__/utils.lineupShare.test.ts
git commit -m "Add share URL override, image name sizing and share-link fetch helper

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Preview image components

**Files:**
- Create: `components/og/LineupShareImage.tsx`
- Test: `components/__tests__/LineupShareImage.test.tsx`

Satori (inside `next/og`) only understands inline `style` objects, not Tailwind classes, and every element with more than one child needs `display: 'flex'`. This file is the one sanctioned use of `style` props in the app (documented in CLAUDE.md in Task 12).

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/LineupShareImage.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { GenericShareImage, LineupImage, OG_SIZE } from '@/components/og/LineupShareImage'
import type { SharedLineup } from '@/lib/types'

const LINEUP: SharedLineup = {
  leagueName: 'The Boot Room',
  slug: 'the-boot-room',
  week: 13,
  date: '06 Oct 2026',
  format: '6-a-side',
  teamA: ['Marcus Reid', 'Rav Singh'],
  teamB: ['Callum Shaw', 'Sofia Marsh'],
  location: 'Powerleague Shoreditch',
  kickoffTime: '19:00',
}

describe('LineupImage', () => {
  it('shows the league, week, date, kick-off and both teams', () => {
    render(<LineupImage lineup={LINEUP} />)
    expect(screen.getByText('The Boot Room · Week 13')).toBeInTheDocument()
    expect(screen.getByText('Tue 06 Oct · 19:00')).toBeInTheDocument()
    expect(screen.getByText('Team A')).toBeInTheDocument()
    expect(screen.getByText('Team B')).toBeInTheDocument()
    for (const name of [...LINEUP.teamA, ...LINEUP.teamB]) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }
    expect(screen.getByText('Craft Football')).toBeInTheDocument()
  })

  it('leaves out the kick-off when not set', () => {
    render(<LineupImage lineup={{ ...LINEUP, kickoffTime: null }} />)
    expect(screen.getByText('Tue 06 Oct')).toBeInTheDocument()
  })

  it('sizes names with lineupImageFontSize', () => {
    render(<LineupImage lineup={LINEUP} />)
    expect(screen.getByText('Marcus Reid').parentElement).toHaveStyle({ fontSize: '40px' })
  })
})

describe('GenericShareImage', () => {
  it('shows the wordmark and tagline and no league data', () => {
    const { container } = render(<GenericShareImage />)
    expect(screen.getByText('Craft Football')).toBeInTheDocument()
    expect(screen.getByText('Results, stats and fair teams for your weekly game.')).toBeInTheDocument()
    expect(container.textContent).not.toContain('Week')
  })
})

it('is 1200 × 630', () => {
  expect(OG_SIZE).toEqual({ width: 1200, height: 630 })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx jest components/__tests__/LineupShareImage.test.tsx`
Expected: FAIL with `Cannot find module '@/components/og/LineupShareImage'`.

- [ ] **Step 3: Implement**

Create `components/og/LineupShareImage.tsx`:

```tsx
// Link-preview images for shared lineups, rendered to PNG by next/og (Satori)
// in app/api/og/lineup/route.tsx. Satori only understands inline style
// objects, so this is the one place in the app that styles with `style`.
// Every element with more than one child needs display: 'flex'.
import type { CSSProperties } from 'react'
import { formatFixtureDate, lineupImageFontSize, LINEUP_IMAGE } from '@/lib/utils'
import type { SharedLineup } from '@/lib/types'

export const OG_SIZE = { width: 1200, height: 630 }

// The ball from app/icon.svg (viewBox 4 4 72 72).
const BALL_PATH =
  'M40.15 31.00L40.15 23.50L49.26 17.64L58.40 24.28L55.65 34.76L48.51 37.08ZM48.61 37.36L55.74 35.04L64.13 41.90L60.63 52.64L49.82 53.26L45.41 47.19ZM45.17 47.37L49.58 53.44L45.65 63.53L34.35 63.53L30.42 53.44L34.83 47.37ZM34.59 47.19L30.18 53.26L19.37 52.64L15.87 41.90L24.26 35.04L31.39 37.36ZM31.49 37.08L24.35 34.76L21.60 24.28L30.74 17.64L39.85 23.50L39.85 31.00Z'

const ROOT: CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  position: 'relative',
  backgroundColor: '#060b14',
  color: '#f4f9ff',
  fontFamily: 'Space Grotesk',
}

function Wordmark({ ballSize, fontSize }: { ballSize: number; fontSize: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: Math.round(ballSize * 0.35) }}>
      <svg width={ballSize} height={ballSize} viewBox="4 4 72 72">
        <circle cx="40" cy="40" r="33" fill="none" stroke="#d8d8d8" strokeWidth="4" />
        <path fill="#d8d8d8" d={BALL_PATH} />
      </svg>
      <div style={{ fontSize, fontWeight: 700, letterSpacing: -0.02 * fontSize, color: '#f4f9ff' }}>
        Craft Football
      </div>
    </div>
  )
}

function TeamColumn({ label, names, fontSize, accent, text }: {
  label: string
  names: string[]
  fontSize: number
  accent: string
  text: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: LINEUP_IMAGE.columnWidth }}>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', color: accent }}>
        {label}
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: 6,
          fontFamily: 'Inter',
          fontWeight: 700,
          fontSize,
          lineHeight: LINEUP_IMAGE.lineHeight,
          color: text,
        }}
      >
        {names.map((name, i) => (
          <div key={`${i}-${name}`} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {name}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Layout C: shaded team halves, big names, wordmark along the bottom. */
export function LineupImage({ lineup }: { lineup: SharedLineup }) {
  const rows = Math.max(lineup.teamA.length, lineup.teamB.length)
  const longest = Math.max(1, ...lineup.teamA.map((n) => n.length), ...lineup.teamB.map((n) => n.length))
  const fontSize = lineupImageFontSize(rows, longest)
  const when = [formatFixtureDate(lineup.date), lineup.kickoffTime].filter(Boolean).join(' · ')

  return (
    <div style={ROOT}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 600, height: 630, backgroundImage: 'linear-gradient(180deg, rgba(8,47,73,0.7), rgba(8,47,73,0.25))' }} />
      <div style={{ position: 'absolute', left: 600, top: 0, width: 600, height: 630, backgroundImage: 'linear-gradient(180deg, rgba(46,16,101,0.6), rgba(46,16,101,0.2))' }} />
      <div style={{ position: 'absolute', left: 0, top: 0, width: 8, height: 630, backgroundColor: '#38bdf8' }} />
      <div style={{ position: 'absolute', left: 1192, top: 0, width: 8, height: 630, backgroundColor: '#a78bfa' }} />
      <div style={{ position: 'absolute', left: 599, top: 0, width: 2, height: 630, backgroundImage: 'linear-gradient(180deg, rgba(44,74,114,0), #2c4a72 30%, #2c4a72 70%, rgba(44,74,114,0))' }} />

      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', padding: '30px 60px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'IBM Plex Mono',
            fontSize: 19,
            fontWeight: 700,
            letterSpacing: 2.85,
            textTransform: 'uppercase',
            color: '#8ba4c4',
          }}
        >
          <div style={{ maxWidth: 680, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {`${lineup.leagueName} · Week ${lineup.week}`}
          </div>
          <div>{when}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
          <TeamColumn label="Team A" names={lineup.teamA} fontSize={fontSize} accent="#7dd3fc" text="#dff1ff" />
          <TeamColumn label="Team B" names={lineup.teamB} fontSize={fontSize} accent="#c4b5fd" text="#efeaff" />
        </div>
      </div>

      <div style={{ position: 'absolute', left: 0, bottom: 24, width: 1200, display: 'flex', justifyContent: 'center', opacity: 0.9 }}>
        <Wordmark ballSize={28} fontSize={21} />
      </div>
    </div>
  )
}

/** Shown for missing, malformed or stale tokens. Reveals no league data. */
export function GenericShareImage() {
  return (
    <div style={{ ...ROOT, flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <Wordmark ballSize={88} fontSize={64} />
      <div style={{ marginTop: 28, fontFamily: 'Inter', fontWeight: 700, fontSize: 28, color: '#8ba4c4' }}>
        Results, stats and fair teams for your weekly game.
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the test**

Run: `npx jest components/__tests__/LineupShareImage.test.tsx`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add components/og/LineupShareImage.tsx components/__tests__/LineupShareImage.test.tsx
git commit -m "Add lineup preview image and generic card components

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Image route

**Files:**
- Create: `lib/ogFonts.ts`, `app/api/og/lineup/route.tsx`
- Test: `__tests__/og-lineup-route.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/og-lineup-route.test.tsx`:

```tsx
import { ImageResponse } from 'next/og'
import { loadSharedLineup } from '@/lib/lineupShareServer'
import { loadOgFonts } from '@/lib/ogFonts'
import { GenericShareImage, LineupImage } from '@/components/og/LineupShareImage'
import type { SharedLineup } from '@/lib/types'

jest.mock('next/og', () => ({ ImageResponse: jest.fn() }))
jest.mock('@/lib/lineupShareServer', () => ({ loadSharedLineup: jest.fn() }))
jest.mock('@/lib/ogFonts', () => ({ loadOgFonts: jest.fn() }))

import { GET } from '@/app/api/og/lineup/route'

const FONTS = [{ name: 'Inter', data: new ArrayBuffer(1), weight: 700, style: 'normal' }]
const LINEUP = { leagueName: 'The Boot Room', week: 13 } as SharedLineup

beforeEach(() => {
  jest.resetAllMocks()
  ;(loadOgFonts as jest.Mock).mockResolvedValue(FONTS)
})

function lastRender() {
  const [element, options] = (ImageResponse as unknown as jest.Mock).mock.calls[0]
  return { element, options }
}

describe('GET /api/og/lineup', () => {
  it('renders the lineup for a valid token', async () => {
    ;(loadSharedLineup as jest.Mock).mockResolvedValue(LINEUP)
    await GET(new Request('http://localhost/api/og/lineup?t=abc.def'))
    expect(loadSharedLineup).toHaveBeenCalledWith('abc.def')
    const { element, options } = lastRender()
    expect(element.type).toBe(LineupImage)
    expect(element.props.lineup).toBe(LINEUP)
    expect(options).toEqual(expect.objectContaining({
      width: 1200,
      height: 630,
      fonts: FONTS,
      headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600' },
    }))
  })

  it('renders the generic card when the token does not resolve', async () => {
    ;(loadSharedLineup as jest.Mock).mockResolvedValue(null)
    await GET(new Request('http://localhost/api/og/lineup?t=bad'))
    expect(lastRender().element.type).toBe(GenericShareImage)
  })

  it('renders the generic card with no token', async () => {
    ;(loadSharedLineup as jest.Mock).mockResolvedValue(null)
    await GET(new Request('http://localhost/api/og/lineup'))
    expect(loadSharedLineup).toHaveBeenCalledWith(null)
    expect(lastRender().element.type).toBe(GenericShareImage)
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx jest __tests__/og-lineup-route.test.tsx`
Expected: FAIL with `Cannot find module '@/lib/ogFonts'` (or the route).

- [ ] **Step 3: Implement the font loader**

Create `lib/ogFonts.ts`:

```ts
import { readFile } from 'fs/promises'
import path from 'path'

export interface OgFont {
  name: string
  data: ArrayBuffer
  weight: 700
  style: 'normal'
}

const FONT_FILES = [
  ['Space Grotesk', 'SpaceGrotesk-Bold.ttf'],
  ['Inter', 'Inter-Bold.ttf'],
  ['IBM Plex Mono', 'IBMPlexMono-Bold.ttf'],
] as const

let loaded: Promise<OgFont[]> | null = null

/**
 * The TTFs in assets/fonts, read once per server instance. next/og can't use
 * the WOFF2 files next/font serves. next.config.js traces them into the
 * /api/og/lineup bundle.
 */
export function loadOgFonts(): Promise<OgFont[]> {
  loaded ??= Promise.all(
    FONT_FILES.map(async ([name, file]) => {
      const buf = await readFile(path.join(process.cwd(), 'assets/fonts', file))
      const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
      return { name, data, weight: 700 as const, style: 'normal' as const }
    })
  ).catch((err) => {
    loaded = null // retry on the next request
    throw err
  })
  return loaded
}
```

- [ ] **Step 4: Implement the route**

Create `app/api/og/lineup/route.tsx`:

```tsx
import { ImageResponse } from 'next/og'
import { loadSharedLineup } from '@/lib/lineupShareServer'
import { loadOgFonts } from '@/lib/ogFonts'
import { GenericShareImage, LineupImage, OG_SIZE } from '@/components/og/LineupShareImage'

export const runtime = 'nodejs'

/**
 * GET ?t=<token> — the link-preview image for a shared lineup. Always a PNG:
 * a missing, malformed or stale token gets the generic card. The token
 * changes whenever the lineups do, so the CDN can cache by URL.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('t')
  const [lineup, fonts] = await Promise.all([loadSharedLineup(token), loadOgFonts()])

  return new ImageResponse(lineup ? <LineupImage lineup={lineup} /> : <GenericShareImage />, {
    ...OG_SIZE,
    fonts,
    headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600' },
  })
}
```

- [ ] **Step 5: Run the test and typecheck**

Run: `npx jest __tests__/og-lineup-route.test.tsx && npx tsc --noEmit`
Expected: 3 tests PASS; `tsc` prints nothing. If `tsc` rejects the `headers` object, wrap it: `headers: new Headers({ 'Cache-Control': '…' })` and update the test's expectation to `headers: expect.any(Headers)` plus `expect(options.headers.get('Cache-Control')).toBe('public, max-age=300, s-maxage=3600')`.

- [ ] **Step 6: Render it for real**

Run `npm run dev` in another terminal, then:

```bash
curl -s -o .context/og-generic.png -w "%{http_code} %{content_type}\n" http://localhost:3000/api/og/lineup
```

Expected: `200 image/png`. Open `.context/og-generic.png` and check the wordmark and tagline render in the right fonts. The lineup render is checked in Task 13.

- [ ] **Step 7: Commit**

```bash
git add lib/ogFonts.ts app/api/og/lineup/route.tsx __tests__/og-lineup-route.test.tsx
git commit -m "Add the lineup preview image route

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Page metadata and the landing redirect

**Files:**
- Modify: `lib/metadata.ts`, `app/[slug]/(tabs)/results/page.tsx:19-25`, `app/[slug]/(tabs)/overview/page.tsx:22-28`, `app/[slug]/page.tsx`
- Test: `lib/__tests__/metadata.lineupShare.test.ts`, `__tests__/league-root-redirect.test.ts`

- [ ] **Step 1: Write the failing metadata test**

Create `lib/__tests__/metadata.lineupShare.test.ts`:

```ts
import { getAuthAndRole, getFeatures, getGameBySlug, getPendingBadgeCount, getWeeks } from '@/lib/fetchers'
import { loadSharedLineup } from '@/lib/lineupShareServer'
import type { SharedLineup } from '@/lib/types'

jest.mock('@/lib/fetchers', () => ({
  getGameBySlug: jest.fn(),
  getAuthAndRole: jest.fn(),
  getFeatures: jest.fn(),
  getWeeks: jest.fn(),
  getPendingBadgeCount: jest.fn(),
}))
jest.mock('@/lib/lineupShareServer', () => ({ loadSharedLineup: jest.fn() }))

import { leaguePageMetadata } from '@/lib/metadata'

const LINEUP: SharedLineup = {
  leagueName: 'The Boot Room',
  slug: 'the-boot-room',
  week: 13,
  date: '06 Oct 2026',
  format: '6-a-side',
  teamA: ['Marcus Reid'],
  teamB: ['Callum Shaw'],
  location: null,
  kickoffTime: '19:00',
}

beforeEach(() => {
  jest.resetAllMocks()
  ;(getGameBySlug as jest.Mock).mockResolvedValue({ id: 'game-1', name: 'The Boot Room', slug: 'the-boot-room', day: null })
  ;(getAuthAndRole as jest.Mock).mockResolvedValue({ user: null, userRole: null, isAuthenticated: false })
  ;(getFeatures as jest.Mock).mockResolvedValue([])
  ;(getWeeks as jest.Mock).mockResolvedValue([])
  ;(getPendingBadgeCount as jest.Mock).mockResolvedValue(0)
})

describe('leaguePageMetadata with a lineup token', () => {
  it('is unchanged without a token', async () => {
    const meta = await leaguePageMetadata('the-boot-room', 'results')
    expect(meta.openGraph).toBeUndefined()
    expect(meta.title).toBeDefined()
    expect(loadSharedLineup).not.toHaveBeenCalled()
  })

  it('adds the preview tags for a valid token', async () => {
    ;(loadSharedLineup as jest.Mock).mockResolvedValue(LINEUP)
    const meta = await leaguePageMetadata('the-boot-room', 'results', 'tok.sig')
    expect(loadSharedLineup).toHaveBeenCalledWith('tok.sig')
    expect(meta.title).toBeDefined()
    expect(meta.openGraph?.title).toBe('Week 13 lineups · The Boot Room')
    expect(meta.openGraph?.images).toEqual([expect.objectContaining({ url: '/api/og/lineup?t=tok.sig' })])
    expect(meta.twitter).toEqual(expect.objectContaining({ card: 'summary_large_image' }))
  })

  it('works on the Overview tab too', async () => {
    ;(loadSharedLineup as jest.Mock).mockResolvedValue(LINEUP)
    const meta = await leaguePageMetadata('the-boot-room', 'overview', 'tok.sig')
    expect(meta.openGraph?.title).toBe('Week 13 lineups · The Boot Room')
  })

  it('ignores a token that does not resolve', async () => {
    ;(loadSharedLineup as jest.Mock).mockResolvedValue(null)
    const meta = await leaguePageMetadata('the-boot-room', 'results', 'bad')
    expect(meta.openGraph).toBeUndefined()
  })

  it('ignores a token for another league', async () => {
    ;(loadSharedLineup as jest.Mock).mockResolvedValue({ ...LINEUP, slug: 'other-league' })
    const meta = await leaguePageMetadata('the-boot-room', 'results', 'tok.sig')
    expect(meta.openGraph).toBeUndefined()
  })

  it('ignores tokens on other tabs', async () => {
    const meta = await leaguePageMetadata('the-boot-room', 'players', 'tok.sig')
    expect(meta.openGraph).toBeUndefined()
    expect(loadSharedLineup).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Write the failing redirect test**

Create `__tests__/league-root-redirect.test.ts`:

```ts
import { redirect } from 'next/navigation'
import { cookies, headers } from 'next/headers'

jest.mock('next/navigation', () => ({ redirect: jest.fn() }))
jest.mock('next/headers', () => ({ headers: jest.fn(), cookies: jest.fn() }))

import LeagueRootPage from '@/app/[slug]/page'

function run(searchParams: Record<string, string | string[] | undefined>) {
  return LeagueRootPage({
    params: Promise.resolve({ slug: 'the-boot-room' }),
    searchParams: Promise.resolve(searchParams),
  })
}

beforeEach(() => {
  jest.resetAllMocks()
  ;(headers as jest.Mock).mockResolvedValue(new Headers({ 'user-agent': 'WhatsApp/2.23.20.0' }))
  ;(cookies as jest.Mock).mockResolvedValue({ get: () => undefined })
})

describe('league root redirect', () => {
  it('redirects to the landing tab with no query', async () => {
    await run({})
    expect(redirect).toHaveBeenCalledWith('/the-boot-room/results')
  })

  it('keeps ?lineup= so the landing tab can build the preview', async () => {
    await run({ lineup: 'Pyt4HppNTm-LehwtPk9aaw.abcdefghijklmnop' })
    expect(redirect).toHaveBeenCalledWith('/the-boot-room/results?lineup=Pyt4HppNTm-LehwtPk9aaw.abcdefghijklmnop')
  })

  it('drops repeated (array) params', async () => {
    await run({ a: ['1', '2'] })
    expect(redirect).toHaveBeenCalledWith('/the-boot-room/results')
  })
})
```

- [ ] **Step 3: Run both to make sure they fail**

Run: `npx jest lib/__tests__/metadata.lineupShare.test.ts __tests__/league-root-redirect.test.ts`
Expected: metadata tests with a token FAIL (`openGraph` undefined); the `?lineup=` redirect test FAILS (query dropped).

- [ ] **Step 4: Update `leaguePageMetadata`**

In `lib/metadata.ts`, add imports:

```ts
import { buildLineupShareMetadata } from '@/lib/lineupShare'
import { loadSharedLineup } from '@/lib/lineupShareServer'
```

Replace the doc comment's final paragraph and the function with:

```ts
 * Shares the request-cached fetchers with the page and tabs layout, so it adds
 * no queries. With a `lineupToken` (from a shared lineup link) on Overview or
 * Results, it also adds the Open Graph tags that make the link unfurl.
 */
export async function leaguePageMetadata(
  slug: string,
  page: LeaguePage,
  lineupToken?: string
): Promise<Metadata> {
  const game = await getGameBySlug(slug)
  if (!game) return {}

  const wantsLineup = Boolean(lineupToken) && (page === 'overview' || page === 'results')
  const [{ userRole }, features, weeks, pendingCount, sharedLineup] = await Promise.all([
    getAuthAndRole(game.id),
    getFeatures(game.id),
    getWeeks(game.id),
    getPendingBadgeCount(game.id), // 0 for non-admins
    wantsLineup ? loadSharedLineup(lineupToken) : Promise.resolve(null),
  ])

  const tier = resolveVisibilityTier(userRole)
  const showStatus =
    (page === 'overview' || page === 'results') &&
    !isLeagueHidden(features, tier) &&
    (tier === 'admin' || isFeatureEnabled(features, 'match_history', tier))
  const status = showStatus
    ? getLeagueTitleStatus(weeks, new Date(), dayNameToIndex(game.day ?? null) ?? undefined)
    : null

  const title = {
    absolute: buildLeagueTitle({ page: status ?? PAGE_LABELS[page], leagueName: game.name, pendingCount }),
  }

  if (lineupToken && sharedLineup?.slug === slug) {
    return { title, ...buildLineupShareMetadata(sharedLineup, lineupToken) }
  }
  return { title }
}
```

- [ ] **Step 5: Pass the token from Results and Overview**

In `app/[slug]/(tabs)/results/page.tsx`, change `Props` and `generateMetadata`:

```ts
interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { lineup } = await searchParams
  return leaguePageMetadata((await params).slug, 'results', typeof lineup === 'string' ? lineup : undefined)
}
```

Make the same change in `app/[slug]/(tabs)/overview/page.tsx`, with `'overview'` in place of `'results'`. The page components keep destructuring only `params`.

- [ ] **Step 6: Keep the query on the root redirect**

Replace `app/[slug]/page.tsx` with:

```ts
import { redirect } from 'next/navigation'
import { cookies, headers } from 'next/headers'
import { leagueLandingPath, VIEWPORT_COOKIE } from '@/lib/utils'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

// Small screens land on Overview, large screens on Results. The server cannot
// see the viewport, so it reads the width the browser last reported in a
// cookie, falling back to the user agent on a first visit. /overview itself
// redirects large screens to Results on the client.
//
// The query string is kept so a shared lineup link (?lineup=) reaches the
// landing tab, whose metadata builds the link preview.
export default async function LeagueRootPage({ params, searchParams }: Props) {
  const { slug } = await params
  const userAgent = (await headers()).get('user-agent')
  const viewport = (await cookies()).get(VIEWPORT_COOKIE)?.value

  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string') query.set(key, value)
  }
  const target = leagueLandingPath(slug, userAgent, viewport)
  const qs = query.toString()
  redirect(qs ? `${target}?${qs}` : target)
}
```

- [ ] **Step 7: Run the tests and typecheck**

Run: `npx jest lib/__tests__/metadata.lineupShare.test.ts __tests__/league-root-redirect.test.ts lib/__tests__/utils.tabTitle.test.ts && npx tsc --noEmit`
Expected: all PASS; `tsc` prints nothing.

- [ ] **Step 8: Commit**

```bash
git add lib/metadata.ts "app/[slug]/(tabs)/results/page.tsx" "app/[slug]/(tabs)/overview/page.tsx" "app/[slug]/page.tsx" lib/__tests__/metadata.lineupShare.test.ts __tests__/league-root-redirect.test.ts
git commit -m "Add lineup preview tags to shared links

Overview and Results read ?lineup= in generateMetadata, and the league
root redirect now keeps the query string so the token survives.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Share the signed link from `NextMatchCard`

**Files:**
- Modify: `components/NextMatchCard.tsx` (imports line 6; state near line 186; `handleShare` near line 459)
- Test: `__tests__/next-match-card-share.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/next-match-card-share.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextMatchCard } from '@/components/NextMatchCard'
import type { ScheduledWeek } from '@/lib/types'

jest.mock('@/lib/supabase/client', () => ({ createClient: jest.fn() }))

const SCHEDULED: ScheduledWeek = {
  id: 'week-1', season: '2099', week: 13, date: '05 Jan 2099', format: '6-a-side',
  teamA: ['Marcus Reid', 'Rav Singh'], teamB: ['Callum Shaw', 'Sofia Marsh'], status: 'scheduled',
  team_a_rating: 1, team_b_rating: 1,
}

const PROPS = {
  gameId: 'game-1',
  leagueSlug: 'the-boot-room',
  leagueName: 'The Boot Room',
  weeks: [],
  onResultSaved: jest.fn(),
  publicMode: true,
  canEdit: false,
  initialScheduledWeek: SCHEDULED,
}

function mockShareEndpoint(url: string | null) {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ url }) }) as unknown as typeof fetch
}

const SHARE_ENDPOINT = '/api/league/game-1/lineup-share'

function shareEndpointCalls() {
  return (global.fetch as jest.Mock).mock.calls.filter(([url]) => url === SHARE_ENDPOINT)
}

/** Lets the mocked fetch and json() promises settle and their setState land. */
async function flushPromises() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
}

function mockNavigatorShare() {
  const share = jest.fn().mockResolvedValue(undefined)
  Object.defineProperty(window.navigator, 'share', { value: share, configurable: true })
  return share
}

afterEach(() => {
  Object.defineProperty(window.navigator, 'share', { value: undefined, configurable: true })
})

describe('NextMatchCard share', () => {
  it('fetches a signed link for the lineup and shares it', async () => {
    mockShareEndpoint('https://craft-football.com/the-boot-room?lineup=tok.sig')
    const share = mockNavigatorShare()
    render(<NextMatchCard {...PROPS} />)

    await waitFor(() => expect(shareEndpointCalls()).toHaveLength(1))
    const [, init] = shareEndpointCalls()[0]
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ weekId: 'week-1' })
    await flushPromises()

    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    await waitFor(() => expect(share).toHaveBeenCalled())
    expect(share.mock.calls[0][0].text).toMatch(/🔗 https:\/\/craft-football\.com\/the-boot-room\?lineup=tok\.sig$/)
  })

  it('falls back to the plain league link when the server declines', async () => {
    mockShareEndpoint(null)
    const share = mockNavigatorShare()
    render(<NextMatchCard {...PROPS} />)
    await waitFor(() => expect(shareEndpointCalls()).toHaveLength(1))
    await flushPromises()

    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    await waitFor(() => expect(share).toHaveBeenCalled())
    expect(share.mock.calls[0][0].text).toMatch(/🔗 https:\/\/craft-football\.com\/the-boot-room$/)
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx jest __tests__/next-match-card-share.test.tsx`
Expected: FAIL. The share endpoint is never called (`shareEndpointCalls()` has length 0).

- [ ] **Step 3: Import the helper**

In `components/NextMatchCard.tsx`, add `fetchLineupShareUrl` to the existing `@/lib/utils` import on line 6:

```ts
import { getNextMatchDate, getNextWeekNumber, deriveSeason, ewptScore, winProbability, winCopy, isPastDeadline, buildShareText, fetchLineupShareUrl, wprScore, leagueWprPercentiles, parseWeekDate, hintToWpr } from '@/lib/utils'
```

- [ ] **Step 4: Prefetch the signed link**

Directly after `const [copied, setCopied] = useState(false)` (~line 186), add:

```tsx
  // Signed share link for the saved lineup, fetched before the tap: iOS
  // Safari drops navigator.share if it awaits a request after the click.
  // Keyed on the week and teams so an edit fetches a fresh link and a stale
  // one is never used.
  const [shareLink, setShareLink] = useState<{ key: string; url: string | null } | null>(null)
  const shareWeekId = scheduledWeek?.id ?? null
  const shareKey =
    !isOverview && cardState === 'lineup' && scheduledWeek &&
    scheduledWeek.teamA.length > 0 && scheduledWeek.teamB.length > 0
      ? JSON.stringify([scheduledWeek.id, scheduledWeek.teamA, scheduledWeek.teamB])
      : null
  useEffect(() => {
    if (!shareKey || !shareWeekId) return
    let cancelled = false
    fetchLineupShareUrl(gameId, shareWeekId).then((url) => {
      if (!cancelled) setShareLink({ key: shareKey, url })
    })
    return () => { cancelled = true }
  }, [gameId, shareKey, shareWeekId])
  const signedShareUrl = shareLink?.key === shareKey ? shareLink.url : null
```

- [ ] **Step 5: Use it in `handleShare`**

In `handleShare`, add the `shareUrl` line to the `buildShareText` call:

```tsx
    const text = buildShareText({
      leagueName,
      leagueSlug,
      week: scheduledWeek.week,
      date: scheduledWeek.date,
      format: scheduledWeek.format ?? '',
      teamA: scheduledWeek.teamA,
      teamB: scheduledWeek.teamB,
      teamARating: scheduledWeek.team_a_rating ?? 0,
      teamBRating: scheduledWeek.team_b_rating ?? 0,
      shareUrl: signedShareUrl ?? undefined,
    })
```

- [ ] **Step 6: Run the new and existing card tests**

Run: `npx jest __tests__/next-match-card-share.test.tsx __tests__/next-match-card-overview.test.tsx __tests__/loading-states.test.tsx components/__tests__/ResultsSection.yearTabs.test.tsx`
Expected: all PASS. The overview tests must not call `fetch` (the effect is skipped for `isOverview`).

- [ ] **Step 7: Commit**

```bash
git add components/NextMatchCard.tsx __tests__/next-match-card-share.test.tsx
git commit -m "Share the signed lineup link from the next match card

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Document it in CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the docs**

Make these edits to `CLAUDE.md`:

1. In **Repository structure**, add under the top-level entries (after `├── scripts/`):
   ```
   ├── assets/fonts/             # TTFs for next/og generated images (see its README)
   ```
   and under `components/`, add:
   ```
   │   ├── og/                   # next/og (Satori) image JSX, inline styles only
   ```

2. In **Styling approach**, after the bullet list, add:
   ```markdown
   **Exception: `components/og/`.** Those components are rendered to PNG by
   `next/og` (Satori), which only understands inline `style` objects, so they
   use `style` props with the palette's hex values. Keep `style` out of every
   other component.
   ```

3. In **TypeScript types**, add `| 'lineup_share_image'` to the `FeatureKey` union so it matches `lib/types.ts`.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "Document the og components styling exception and new feature key

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Full verification

- [ ] **Step 1: Full test suite, typecheck, lint, build**

```bash
npx jest
npx tsc --noEmit
npm run lint
npm run build
```

Expected:
- `jest`: only the 12 known email failures (see "Before you start").
- `tsc`: no output.
- `lint`: no new errors in files this plan touched. Fix any that appear.
- `build`: succeeds, and the route list includes `ƒ /api/og/lineup` and `ƒ /api/league/[id]/lineup-share`.

- [ ] **Step 2: Render a real lineup locally (read-only)**

Make sure `.env.local` has `SHARE_SIGNING_SECRET` (generate one with `openssl rand -base64 32`; it need not match production). Start `npm run dev`, then mint a token for an existing played week with a read-only query. This prints a path; it writes nothing:

```bash
node --env-file=.env.local -e '
const { createClient } = require("@supabase/supabase-js");
const { createHmac } = require("crypto");
(async () => {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: g } = await db.from("games").select("id, slug").eq("slug", "craft-football").single();
  const { data: w } = await db.from("weeks").select("id, team_a, team_b").eq("game_id", g.id).eq("status", "played").limit(1).single();
  const sig = createHmac("sha256", process.env.SHARE_SIGNING_SECRET)
    .update(JSON.stringify(["lineup:v1", w.id, w.team_a, w.team_b])).digest().subarray(0, 12).toString("base64url");
  const id = Buffer.from(w.id.replace(/-/g, ""), "hex").toString("base64url");
  console.log(`${g.slug}?lineup=${id}.${sig}`);
})();'
```

With the printed `<slug>?lineup=<token>`:

```bash
curl -s -o .context/og-lineup.png -w "%{http_code} %{content_type}\n" "http://localhost:3000/api/og/lineup?t=<token>"
curl -sL -A "WhatsApp/2.23.20.0" "http://localhost:3000/<slug>?lineup=<token>" | grep -oE '<meta (property|name)="(og|twitter):[^>]*>'
```

Expected:
- `200 image/png`. Open `.context/og-lineup.png`: layout C with real names, fonts correct, nothing clipped.
- The `curl -L` output lists `og:title` ("Week N lineups · …"), `og:description`, `og:image` (`…/api/og/lineup?t=<token>`, 1200×630) and `twitter:card` = `summary_large_image`.
- Changing one character of the token makes the image the generic card and removes the `og:` tags.

This shows real player names on your machine only. Don't commit or share the PNG.

- [ ] **Step 3: Push and open a PR**

```bash
git push -u origin HEAD
gh pr create --base main --title "Add a lineup picture to shared lineup links" --body "$(cat <<'EOF'
Shared lineup links now unfurl into a picture of both teams in WhatsApp, iMessage, Slack and Discord.

- Share fetches a signed, week-specific link ahead of the tap (`POST /api/league/[id]/lineup-share`)
- Overview and Results add Open Graph tags for `?lineup=`; the league root redirect keeps the query
- `GET /api/og/lineup` renders the 1200×630 image with `next/og`, or a generic card for bad or stale tokens
- Behind the new `lineup_share_image` flag (off for members and public)

Spec: docs/superpowers/specs/2026-10-05-lineup-share-preview-image-design.md

Before merging: `SHARE_SIGNING_SECRET` must be set in Vercel (Production and Preview).
After deploying: apply `supabase/migrations/20261005000001_seed_lineup_share_image.sql` in the Supabase SQL editor.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Rollout (after merge, done by Will)

1. Confirm `SHARE_SIGNING_SECRET` is set in Vercel for Production and Preview.
2. Apply `supabase/migrations/20261005000001_seed_lineup_share_image.sql` in the Supabase SQL editor. Production migrations can lag behind `main`, so check `select * from feature_experiments where feature = 'lineup_share_image'` returns a row with `available = true`.
3. As an admin, share a real lineup from a phone and from desktop (paste) into WhatsApp (iOS, Android, Web), iMessage, Slack and Discord. Note for each: large preview shown, text intact, link appears once.
4. Decision rule from the spec: if `navigator.share({ text, url })` (link removed from `text`) gives iMessage a rich link **and** WhatsApp still gets exactly one link with full text, switch to it in a follow-up. Otherwise keep text-only.
5. Edit a lineup, re-share into Slack, and check the preview updates.
6. Promote in Settings → Features → Lineup Share Image: Members, then Public.
