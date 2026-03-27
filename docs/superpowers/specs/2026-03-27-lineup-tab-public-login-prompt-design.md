# Lineup Lab — Public Login Prompt

**Date:** 2026-03-27
**Status:** Approved

## Summary

The Lineup Lab tab is currently hidden from logged-out (public) users via the `team_builder` feature flag. This design makes the tab always visible and replaces the hidden state with a login prompt for unauthenticated users. The `team_builder` feature flag is removed from the codebase entirely.

---

## What Changes

### Feature flag removal

The `team_builder` feature flag is removed from every layer of the stack:

- `lib/types.ts` — remove `'team_builder'` from the `FeatureKey` union type
- `lib/defaults.ts` — remove the `team_builder` entry from `DEFAULT_FEATURES`
- `app/api/league/[id]/features/route.ts` — remove it from the default feature seeding logic
- `components/TeamBuilderCard.tsx` — delete this component
- `components/FeaturePanel.tsx` — remove the `team_builder` row from the admin panel
- SQL migration — delete any `league_features` rows where `feature = 'team_builder'`

### Tab visibility

The `showLineupLabTab` prop on `LeaguePageHeader` is removed. The Lineup Lab tab renders unconditionally for all users. The three pages that previously passed this prop (`results/page.tsx`, `players/page.tsx`, `lineup-lab/page.tsx`) are simplified accordingly. The `canSeeTeamBuilder` variable and related `isFeatureEnabled` calls are removed from all three pages.

---

## Auth Handling in lineup-lab/page.tsx

The page currently redirects away if the user cannot see the feature. This is replaced with a conditional render:

- **Not authenticated** → render `<LineupLabLoginPrompt leagueId={leagueId} />`
- **Authenticated** → render the lineup UI as normal

The page already fetches the user via `supabase.auth.getUser()`. We use the result to set an `isAuthenticated` boolean and branch on it. No redirect for unauthenticated users.

---

## New Component: LineupLabLoginPrompt

**File:** `components/LineupLabLoginPrompt.tsx`

**Props:** `{ leagueId: string }`

**Behaviour:** Purely presentational. Renders a centred login prompt inside the tab content area.

**Visual spec:**
- Outer wrapper: `flex flex-col items-center justify-center gap-4 py-20 text-center`
- Icon container: `w-14 h-14 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center`
- Icon: `<Lock />` from `lucide-react`, `size={22}`, `className="text-slate-500"`
- Heading: `"Sign in to use Lineup Lab"` — `text-slate-100 font-semibold text-sm`
- Subtext: `"Build and save lineups for your league matches."` — `text-slate-500 text-sm max-w-xs`
- CTA: `<Link href={/sign-in?redirect=/${leagueId}/lineup-lab}>` styled as a blue button — `bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-5 py-2 rounded-md`

All styling via Tailwind utility classes using `cn()` where needed. No new dependencies.

---

## Redirect Behaviour

The Sign in CTA links to `/sign-in?redirect=/<leagueId>/lineup-lab`. After successful login, the user is returned directly to the Lineup Lab page for their league.

---

## Out of Scope

- Player profile pages
- Any changes to how the lineup-lab UI itself works for authenticated users
- Feature flag infrastructure for other features (only `team_builder` is removed)
