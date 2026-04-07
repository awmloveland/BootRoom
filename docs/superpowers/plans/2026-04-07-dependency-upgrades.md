# Dependency Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade all outdated dependencies across six sequential phases, eliminating build warnings and adopting current stable versions of ESLint, lucide-react, TypeScript, Tailwind, and Next.js.

**Architecture:** Each phase is a self-contained upgrade — install, migrate config if needed, fix errors, verify build, commit. Phases must run in order. Each phase ends with a passing build before the next begins.

**Tech Stack:** Next.js 15→16, TypeScript 5→6, Tailwind CSS 3→4, ESLint 8→9, lucide-react 0.x→1.x, tailwind-merge 2→3, Supabase JS SDK, ts-jest

**Spec:** `docs/superpowers/specs/2026-04-07-dependency-upgrades-design.md`

---

## Task 1: Phase 1 — Safe patches (Supabase + ts-jest)

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `package-lock.json` (via npm install)

- [ ] **Step 1: Install updated packages**

```bash
npm install @supabase/supabase-js@latest @supabase/ssr@latest
npm install --save-dev ts-jest@latest
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build
```

Expected: Build completes with no new errors. The same deprecation warnings as before may still appear (they are addressed in Phase 2).

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: upgrade supabase and ts-jest to latest patch versions"
```

---

## Task 2: Phase 2 — ESLint v8 → v9 (eliminates all build warnings)

**Files:**
- Delete: `.eslintrc.json`
- Create: `eslint.config.mjs`
- Modify: `package.json` (via npm install)
- Modify: `package-lock.json` (via npm install)

- [ ] **Step 1: Install ESLint v9 and the compat layer**

```bash
npm install --save-dev eslint@^9 @eslint/eslintrc
```

- [ ] **Step 2: Delete the old config file**

```bash
rm .eslintrc.json
```

- [ ] **Step 3: Create the flat config file**

Create `eslint.config.mjs` at the project root with this exact content:

```js
import { FlatCompat } from '@eslint/eslintrc'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
})

export default [...compat.extends('next/core-web-vitals')]
```

Note: `eslint-config-next@15` supports ESLint 9 via this compat layer. If at upgrade time the `eslint-config-next` package exports a native flat config (check its `exports` field in `node_modules/eslint-config-next/package.json`), prefer using that directly over FlatCompat.

- [ ] **Step 4: Run lint**

```bash
npm run lint
```

Expected: Exits 0 with no errors. If you see "Rule X not found" errors, the flat config is not resolving the extended config correctly — double-check the `baseDirectory` is set as shown above.

- [ ] **Step 5: Run build and verify warnings are gone**

```bash
npm run build 2>&1 | grep "npm warn deprecated"
```

Expected: No output. The `eslint@8`, `@humanwhocodes/object-schema`, `@humanwhocodes/config-array`, and `glob@7` warnings must all be absent.

- [ ] **Step 6: Commit**

```bash
git add eslint.config.mjs package.json package-lock.json
git commit -m "chore: upgrade ESLint v8 to v9 with flat config migration"
```

---

## Task 3: Phase 3 — lucide-react v0.x → v1.x

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `package-lock.json` (via npm install)
- Potentially modify any of these files if icon names changed:
  - `app/[leagueId]/settings/page.tsx`
  - `app/page.tsx`
  - `app/design-preview/page.tsx`
  - `components/ui/navbar.tsx`
  - `components/ui/sheet.tsx`
  - `components/ui/navigation-menu.tsx`
  - `components/ui/accordion.tsx`
  - `components/ui/dialog.tsx`
  - `components/MatchCard.tsx`
  - `components/LeagueInfoBar.tsx`
  - `components/PlayerCard.tsx`
  - `components/JoinRequestDialog.tsx`
  - `components/PublicPlayerList.tsx`
  - `components/HonoursSection.tsx`
  - `components/ClaimOnboardingBanner.tsx`
  - `components/EditWeekModal.tsx`
  - `components/NextMatchCard.tsx`
  - `components/PendingRequestsTable.tsx`
  - `components/MobileStatsFAB.tsx`
  - `components/LineupLabLoginPrompt.tsx`
  - `components/PlayerClaimsTable.tsx`
  - `components/HonoursLoginPrompt.tsx`
  - `components/PlayerRosterPanel.tsx`
  - `components/AdminMemberTable.tsx`
  - `components/LeaguePageHeader.tsx`
  - `components/LeagueJoinArea.tsx`

**Icons currently in use (audit these after upgrade):**

```
Activity, ArrowDown, ArrowLeft, ArrowUp, Calendar, Check, CheckCircle2,
ChevronDown, ChevronRight, ClipboardList, Copy, FlaskConical, Info, Link,
Lock, LogOut, MapPin, Pencil, RefreshCw, Search, Settings, Settings2,
SlidersHorizontal, Trash2, Trophy, User, UserCog, UserPlus, Users, X
```

- [ ] **Step 1: Install lucide-react v1**

```bash
npm install lucide-react@latest
```

- [ ] **Step 2: Run build to surface broken icon imports**

```bash
npm run build 2>&1 | grep -E "Module.*not found|not exported from"
```

TypeScript will error on any icon name that was renamed or removed in v1. Note every error.

- [ ] **Step 3: Check the v1 changelog for each broken icon**

Visit the lucide-react GitHub releases page and search for each broken icon name in the v1.0.0 release notes. Find the new name or replacement.

Common renames to check (verify against actual changelog):
- If `CheckCircle2` is broken: check for `CircleCheck` or `CheckCircle`
- If `Settings2` is broken: check for `SlidersHorizontal` or `SettingsIcon`

- [ ] **Step 4: Fix each broken import**

For each file with a broken icon, update the import. Example pattern:

```tsx
// Before (example — use actual broken name from Step 2)
import { CheckCircle2 } from 'lucide-react'

// After (example — use actual new name from Step 3)
import { CircleCheck } from 'lucide-react'
```

Also update the JSX usage to match the new component name.

- [ ] **Step 5: Run build again — must pass clean**

```bash
npm run build
```

Expected: Zero errors. All 31 icons resolve without TypeScript complaints.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json components/ app/
git commit -m "chore: upgrade lucide-react v0.x to v1.x, fix renamed icons"
```

---

## Task 4: Phase 4 — TypeScript v5 → v6

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `package-lock.json` (via npm install)
- Potentially modify: any `.ts` / `.tsx` file that surfaces a type error under TS6 strict rules

- [ ] **Step 1: Install TypeScript v6**

```bash
npm install --save-dev typescript@^6
```

Keep `@types/node` on the v20.x line — do not upgrade it to v25. If npm auto-upgraded it, pin it back:

```bash
npm install --save-dev @types/node@^20
```

- [ ] **Step 2: Run the type checker and capture all errors**

```bash
npx tsc --noEmit 2>&1 | tee /tmp/ts-errors.txt
cat /tmp/ts-errors.txt | grep "error TS" | wc -l
```

Note the error count. If zero, skip to Step 4.

- [ ] **Step 3: Fix each type error**

Work through `/tmp/ts-errors.txt` top to bottom. Fix each error in the referenced file. Common TS6 changes to watch for:

- Stricter narrowing — `if (x)` no longer narrows `string | undefined` in some positions; use `if (x != null)` or explicit type guards
- Stricter return type inference — functions that returned `any` implicitly may now need explicit return types
- Do not use `as any` or `@ts-ignore` unless the error is a known bug in a third-party type definition (add a comment explaining why)

After fixing, re-run:

```bash
npx tsc --noEmit
```

Repeat until exit code is 0.

- [ ] **Step 4: Run the full build**

```bash
npm run build
```

Expected: Passes with no errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
# Add any .ts/.tsx files you modified:
git add -p
git commit -m "chore: upgrade TypeScript v5 to v6, fix surfaced type errors"
```

---

## Task 5: Phase 5 — Tailwind v3 → v4 + tailwind-merge v2 → v3

**Files:**
- Delete: `tailwind.config.ts`
- Modify: `app/globals.css` (full rewrite of imports + add @theme block)
- Modify: `postcss.config.js`
- Modify: `package.json` (via npm install)
- Modify: `package-lock.json` (via npm install)

- [ ] **Step 1: Install Tailwind v4 packages**

```bash
npm install --save-dev tailwindcss@^4 @tailwindcss/postcss tailwind-merge@^3
```

- [ ] **Step 2: Check plugin compatibility and install v4-compatible versions**

```bash
# Check if tailwindcss-animate has v4 support
npm info tailwindcss-animate versions --json | tail -5

# Check if @tailwindcss/forms has v4 support
npm info @tailwindcss/forms versions --json | tail -5
```

Install the latest versions of both:

```bash
npm install --save-dev tailwindcss-animate@latest @tailwindcss/forms@latest
```

If either package does not yet support Tailwind v4 (check their README for v4 compatibility notes), note the issue and use the `@tailwindcss/vite` or CSS `@plugin` approach as a workaround — but do not block the upgrade. The build error will make it obvious.

- [ ] **Step 3: Update postcss.config.js**

Replace the entire content of `postcss.config.js` with:

```js
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
```

Note: Tailwind v4 handles vendor prefixes internally — autoprefixer is no longer needed and can be removed from this config.

- [ ] **Step 4: Rewrite globals.css for Tailwind v4**

Replace the entire content of `app/globals.css` with:

```css
@import "tailwindcss";

/* Class-based dark mode (equivalent to darkMode: ['class'] in v3) */
@custom-variant dark (&:is(.dark, .dark *));

/* Map Tailwind color tokens to the CSS variables defined in :root */
@theme {
  --color-background: hsl(var(--background));
  --color-foreground: hsl(var(--foreground));
  --color-card: hsl(var(--card));
  --color-card-foreground: hsl(var(--card-foreground));
  --color-popover: hsl(var(--popover));
  --color-popover-foreground: hsl(var(--popover-foreground));
  --color-primary: hsl(var(--primary));
  --color-primary-foreground: hsl(var(--primary-foreground));
  --color-secondary: hsl(var(--secondary));
  --color-secondary-foreground: hsl(var(--secondary-foreground));
  --color-muted: hsl(var(--muted));
  --color-muted-foreground: hsl(var(--muted-foreground));
  --color-accent: hsl(var(--accent));
  --color-accent-foreground: hsl(var(--accent-foreground));
  --color-destructive: hsl(var(--destructive));
  --color-destructive-foreground: hsl(var(--destructive-foreground));
  --color-border: hsl(var(--border));
  --color-input: hsl(var(--input));
  --color-ring: hsl(var(--ring));

  --radius-lg: var(--radius);
  --radius-md: calc(var(--radius) - 2px);
  --radius-sm: calc(var(--radius) - 4px);

  --animate-collapsible-down: collapsible-down 0.2s ease-out;
  --animate-collapsible-up: collapsible-up 0.2s ease-out;
  --animate-accordion-down: accordion-down 0.2s ease-out;
  --animate-accordion-up: accordion-up 0.2s ease-out;

  @keyframes collapsible-down {
    from { height: 0px; }
    to { height: var(--radix-collapsible-content-height); }
  }
  @keyframes collapsible-up {
    from { height: var(--radix-collapsible-content-height); }
    to { height: 0px; }
  }
  @keyframes accordion-down {
    from { height: 0; }
    to { height: var(--radix-accordion-content-height); }
  }
  @keyframes accordion-up {
    from { height: var(--radix-accordion-content-height); }
    to { height: 0; }
  }
}

/* Tailwind plugins */
@plugin "tailwindcss-animate";
@plugin "@tailwindcss/forms";

/* CSS variable values — these do not change from v3 */
@layer base {
  :root {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
    --radius: 0.5rem;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}

@layer utilities {
  .scrollbar-hide {
    scrollbar-width: none;
  }
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
}
```

- [ ] **Step 5: Delete tailwind.config.ts**

```bash
rm tailwind.config.ts
```

- [ ] **Step 6: Run build and triage errors**

```bash
npm run build 2>&1 | tee /tmp/tw-errors.txt
```

Tailwind v4 renamed some utilities. Common changes to watch for if errors appear:
- `bg-opacity-*` → use `bg-black/50` opacity modifier syntax instead
- `text-opacity-*` → use `text-black/50` opacity modifier syntax instead
- `border-opacity-*` → use `border-black/50` opacity modifier syntax instead
- `decoration-slice` / `decoration-clone` → renamed `box-decoration-slice` / `box-decoration-clone`
- If a custom color class (e.g. `bg-border`) reports "unknown utility", the `@theme` token name may differ — check the `--color-border` mapping in globals.css

Fix each error in the relevant component file. After each fix, re-run `npm run build`.

- [ ] **Step 7: Run dev server and visually verify**

```bash
npm run dev
```

Open the app and spot-check these pages:
- Home / league list
- League page (match history)
- Settings page (features panel, members)
- A match card (expand/collapse animation)
- Public league page

Confirm no visual regressions — layout, colours, animations, and dark mode must all look correct.

- [ ] **Step 8: Commit**

```bash
git rm tailwind.config.ts
git add app/globals.css postcss.config.js package.json package-lock.json
# Add any component files fixed in Step 6:
git add -p
git commit -m "chore: upgrade Tailwind v3 to v4, migrate config to CSS @theme"
```

---

## Task 6: Phase 6 — Next.js v15 → v16

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `package-lock.json` (via npm install)
- Potentially modify: `next.config.js`, `middleware.ts`, `app/layout.tsx`, and any route using changed APIs

- [ ] **Step 1: Read the official Next.js 16 upgrade guide**

Before touching any code, read the upgrade guide. Find it at:
`https://nextjs.org/docs/app/building-your-application/upgrading/version-16`

Note every breaking change that applies to this codebase. The areas most likely to require changes:
- App Router metadata API (`generateMetadata`, `<Head>`)
- Middleware (`NextResponse`, request/response shape)
- Route handlers (`NextRequest`, `NextResponse`)
- `next/image` props
- `next.config.js` option names

- [ ] **Step 2: Install Next.js v16 and updated eslint-config-next**

```bash
npm install next@^16 eslint-config-next@^16
```

- [ ] **Step 3: Apply breaking changes from the upgrade guide**

Work through your notes from Step 1. For each breaking change that applies:

- Open the affected file
- Make the minimal change required (do not refactor surrounding code)
- Confirm the change matches the upgrade guide's recommended pattern

- [ ] **Step 4: Run build**

```bash
npm run build
```

Expected: Passes. If there are errors not covered by the upgrade guide, read the error message carefully — Next.js 16 error messages are descriptive and usually point directly to the fix.

- [ ] **Step 5: Run lint**

```bash
npm run lint
```

Expected: Passes. `eslint-config-next@16` may introduce new rules — fix any new lint errors (do not disable rules).

- [ ] **Step 6: Smoke test the critical paths**

```bash
npm run dev
```

Manually verify each path:

1. **Auth flow:** Visit `/sign-in`, sign in with a valid account, confirm redirect to `/app`
2. **League page:** Open a league, confirm match history loads, expand a match card
3. **Settings:** Open Settings → Features and Settings → Members, confirm both render
4. **Public page:** Visit `/results/[id]` without being signed in, confirm public data shows
5. **Admin flow:** As an admin, toggle a feature flag on/off, confirm it updates

If any path is broken, check the browser console and Next.js server logs for the error, trace it to the relevant file, and fix.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json
# Add any files changed in Step 3:
git add -p
git commit -m "chore: upgrade Next.js v15 to v16 and eslint-config-next"
```

---

## Verification checklist (run after all 6 phases)

After all phases are complete, run this full verification before declaring done:

```bash
# Build must pass clean
npm run build

# Lint must pass clean
npm run lint

# Tests must pass
npm test

# No deprecated package warnings
npm run build 2>&1 | grep "npm warn deprecated" | grep -v "node_modules"
```

Expected: All four commands exit 0. The final grep must produce no output.
