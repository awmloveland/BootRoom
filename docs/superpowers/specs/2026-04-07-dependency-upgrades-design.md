# Dependency Upgrades — Phased Plan

**Date:** 2026-04-07
**Scope:** Full dependency audit and upgrade across all outdated packages
**Motivation:** Eliminate Vercel build warnings (ESLint v8 EOL, deprecated transitive deps), adopt current stable versions across the stack, and reduce future maintenance debt.

---

## Current state

| Package | Current | Target | Risk |
|---|---|---|---|
| `@supabase/supabase-js` | 2.99.1 | 2.102.1 | Low — patches |
| `@supabase/ssr` | 0.9.0 | 0.10.0 | Low — minor |
| `ts-jest` | 29.4.6 | 29.4.9 | Low — patch |
| `eslint` | 8.57.1 | 9.x | Medium — flat config migration |
| `eslint-config-next` | 15.5.14 | stays 15.x for now | n/a |
| `lucide-react` | 0.469.0 | 1.x | Medium — icon renames in v1.0 |
| `typescript` | 5.9.3 | 6.x | Medium — stricter types |
| `tailwindcss` | 3.4.19 | 4.x | High — new config format |
| `tailwind-merge` | 2.6.1 | 3.x | Medium — required for Tailwind v4 |
| `tailwindcss-animate` | current | v4-compatible | Medium — plugin API changed |
| `@tailwindcss/forms` | current | v4-compatible | Medium — plugin API changed |
| `next` | 15.5.14 | 16.x | High — major framework version |
| `eslint-config-next` | 15.5.14 | 16.x | Low — follows Next.js version |

---

## Architecture and approach

Each phase is fully independent and safe to run in isolation. Phases must be run in order — later phases may assume earlier ones are complete. Each phase ends with a build verification and test run before declaring done.

The codebase uses:
- **Tailwind** exclusively for styling — no CSS modules, no CSS-in-JS
- **ESLint** only via `next lint` with a single-line `.eslintrc.json` (`next/core-web-vitals`)
- **lucide-react** across 30+ component files
- **Supabase** for all auth and data

---

## Phase 1 — Safe patches

**Packages:** `@supabase/supabase-js`, `@supabase/ssr`, `ts-jest`
**Risk:** Low. All are patch or minor bumps with no breaking changes expected.

**Steps:**
1. `npm install @supabase/supabase-js@latest @supabase/ssr@latest ts-jest@latest`
2. Run `npm run build` — must pass with no new errors
3. Run `npm test` — all tests must pass

**Success criteria:** Build passes, tests pass, no type errors introduced.

---

## Phase 2 — ESLint v8 → v9 (fixes all build warnings)

**Packages:** `eslint` 8 → 9
**Risk:** Low-medium. The current config is a single line. ESLint v9 requires migrating from `.eslintrc.json` to a flat config file (`eslint.config.mjs`).

**Steps:**
1. `npm install eslint@^9 --save-dev`
2. Delete `.eslintrc.json`
3. Create `eslint.config.mjs` with the flat config equivalent of `next/core-web-vitals`:
   ```js
   import { FlatCompat } from '@eslint/eslintrc'
   const compat = new FlatCompat()
   export default [...compat.extends('next/core-web-vitals')]
   ```
   Note: `eslint-config-next@15` supports ESLint 9 via the compat layer. Check release notes at upgrade time — a native flat config export may be available.
4. Run `npm run lint` — must pass clean
5. Run `npm run build` — build warnings about ESLint deprecations must be gone

**Success criteria:** Zero `npm warn deprecated eslint` / `@humanwhocodes` / `glob@7` warnings in build output.

---

## Phase 3 — lucide-react v0.x → v1.x

**Packages:** `lucide-react` 0.469.0 → 1.x
**Risk:** Medium. lucide-react v1.0 was the first stable release and included icon renames and removals. 30+ files import from it.

**Files to audit** (all must be checked for broken imports):
```
app/[leagueId]/settings/page.tsx
app/page.tsx
app/design-preview/page.tsx
components/ui/navbar.tsx
components/ui/sheet.tsx
components/ui/navigation-menu.tsx
components/ui/accordion.tsx
components/ui/dialog.tsx
components/MatchCard.tsx
components/LeagueInfoBar.tsx
components/PlayerCard.tsx
components/JoinRequestDialog.tsx
components/PublicPlayerList.tsx
components/HonoursSection.tsx
components/ClaimOnboardingBanner.tsx
components/EditWeekModal.tsx
components/NextMatchCard.tsx
components/PendingRequestsTable.tsx
components/MobileStatsFAB.tsx
components/LineupLabLoginPrompt.tsx
components/PlayerClaimsTable.tsx
components/HonoursLoginPrompt.tsx
components/PlayerRosterPanel.tsx
components/AdminMemberTable.tsx
components/LeaguePageHeader.tsx
components/LeagueJoinArea.tsx
```

**Steps:**
1. Record all icon names currently imported across all files above
2. `npm install lucide-react@latest`
3. Check the lucide-react v1.0 migration guide / changelog for renamed or removed icons
4. Fix any broken icon imports
5. Run `npm run build` — TypeScript will surface any unknown icon names as errors
6. Visual spot-check: verify icons render correctly in dev

**Success criteria:** `npm run build` passes with no missing icon errors. All icons visible in dev.

---

## Phase 4 — TypeScript v5 → v6

**Packages:** `typescript` 5.x → 6.x
**Risk:** Medium. TypeScript major versions typically tighten inference and strictness, which can surface latent type errors in the codebase.

**Steps:**
1. `npm install typescript@^6 --save-dev`
2. Run `npx tsc --noEmit` and capture all errors
3. Fix each type error — do not suppress with `any` or `@ts-ignore` unless genuinely necessary
4. Run `npm run build` — must pass

**Note:** If `@types/node` needs updating to align with TS 6 requirements, update it. Keep `@types/node` on the v20.x line (matches Node 20 runtime). Do not upgrade to `@types/node@25`.

**Success criteria:** `tsc --noEmit` exits 0. Build passes.

---

## Phase 5 — Tailwind v3 → v4 + tailwind-merge v2 → v3

**Packages:** `tailwindcss` 3.x → 4.x, `tailwind-merge` 2.x → 3.x, `tailwindcss-animate`, `@tailwindcss/forms`
**Risk:** High. Tailwind v4 is a ground-up rewrite with a fundamentally different config format.

**Key changes in Tailwind v4:**
- `tailwind.config.ts` is replaced by CSS-native `@theme` blocks in `globals.css`
- The `darkMode: ['class']` strategy has a new syntax
- Custom colors, border-radius tokens, and keyframes move into CSS
- Plugins (`tailwindcss-animate`, `@tailwindcss/forms`) must be v4-compatible versions
- `tailwind-merge` v3 is required for correct class deduplication with v4 utilities

**Current config to migrate** (`tailwind.config.ts`):
- Custom color tokens (HSL CSS variables — should port cleanly)
- Custom border-radius tokens
- Custom keyframes: `collapsible-down/up`, `accordion-down/up`
- Custom animations referencing those keyframes
- Plugins: `tailwindcss-animate`, `@tailwindcss/forms`

**Steps:**
1. `npm install tailwindcss@^4 tailwind-merge@^3 --save-dev`
2. Check if v4-compatible versions of `tailwindcss-animate` and `@tailwindcss/forms` are available; install them
3. Remove `tailwind.config.ts`
4. Migrate all theme config into `globals.css` using `@theme` syntax
5. Update `postcss.config.js` if needed (Tailwind v4 uses a different PostCSS plugin)
6. Run `npm run build` and fix any utility class errors (some class names changed in v4)
7. Visual spot-check all major pages and components in dev

**Success criteria:** Build passes, no visual regressions on major pages (home, league, settings, match card).

---

## Phase 6 — Next.js v15 → v16

**Packages:** `next` 15.x → 16.x, `eslint-config-next` 15.x → 16.x
**Risk:** High. Major framework version — check Next.js 16 migration guide at upgrade time.

**Known areas to check:**
- App Router API changes (layouts, metadata, route handlers)
- `next/image` and `next/font` API changes
- Middleware API changes (auth flow in `middleware.ts` must still work)
- React version compatibility (currently React 19 — verify v16 supports it)
- `next.config.js` option renames or removals

**Steps:**
1. Read the official Next.js 16 upgrade guide before touching any code
2. `npm install next@^16 eslint-config-next@^16`
3. Apply any breaking change fixes identified in the upgrade guide
4. Run `npm run build`
5. Run `npm run lint`
6. Full smoke test: auth flow, league pages, public pages, admin features

**Success criteria:** Build passes, lint passes, auth and core flows work end-to-end.

---

## Prompts for each phase

Use these verbatim in a new Conductor workspace to execute each phase:

### Phase 1
```
Execute Phase 1 of the dependency upgrade plan at docs/superpowers/specs/2026-04-07-dependency-upgrades-design.md.

Upgrade @supabase/supabase-js, @supabase/ssr, and ts-jest to their latest versions using npm install. Then run `npm run build` and `npm test`. Report the results. Do not proceed past this phase.
```

### Phase 2
```
Execute Phase 2 of the dependency upgrade plan at docs/superpowers/specs/2026-04-07-dependency-upgrades-design.md.

Upgrade ESLint from v8 to v9. Delete .eslintrc.json and create eslint.config.mjs using the flat config format with the @eslint/eslintrc compat layer to extend next/core-web-vitals. Run `npm run lint` and `npm run build`. Confirm that all eslint/glob/@humanwhocodes deprecation warnings are gone from the build output. Do not proceed past this phase.
```

### Phase 3
```
Execute Phase 3 of the dependency upgrade plan at docs/superpowers/specs/2026-04-07-dependency-upgrades-design.md.

First, record all icon names currently imported from lucide-react across the codebase. Then upgrade lucide-react to v1.x latest. Check the v1.0 changelog for renamed or removed icons, fix any broken imports, and run `npm run build` to confirm no TypeScript errors on icon names. Do not proceed past this phase.
```

### Phase 4
```
Execute Phase 4 of the dependency upgrade plan at docs/superpowers/specs/2026-04-07-dependency-upgrades-design.md.

Upgrade TypeScript to v6. Run `npx tsc --noEmit` to surface all type errors, fix each one (do not use `any` or `@ts-ignore` unless genuinely necessary), then run `npm run build`. Keep @types/node on the v20.x line — do not upgrade it to v25. Do not proceed past this phase.
```

### Phase 5
```
Execute Phase 5 of the dependency upgrade plan at docs/superpowers/specs/2026-04-07-dependency-upgrades-design.md.

Upgrade Tailwind CSS from v3 to v4 and tailwind-merge from v2 to v3. Also upgrade tailwindcss-animate and @tailwindcss/forms to v4-compatible versions. Remove tailwind.config.ts and migrate all theme config (colors, border-radius, keyframes, animations) into globals.css using @theme syntax. Update postcss config if needed. Run `npm run build` and fix any utility class errors. Do not proceed past this phase.
```

### Phase 6
```
Execute Phase 6 of the dependency upgrade plan at docs/superpowers/specs/2026-04-07-dependency-upgrades-design.md.

Read the official Next.js 16 migration guide first, then upgrade next and eslint-config-next from v15 to v16. Apply any breaking changes from the migration guide. Run `npm run build` and `npm run lint`. Verify the auth flow (middleware.ts), public league pages, and admin routes still work correctly. Do not proceed past this phase.
```

---

## Non-goals

- Upgrading `@types/node` beyond the v20.x line (project targets Node 20)
- Adding new dependencies
- Changing application behaviour or features during any upgrade phase
- Skipping phases or combining them
